"""transcript_replay.py — observer Stage-1：历史会话回放对账

三阶段：
  extract  抽 {hint, actual_skill} —— Claude .jsonl + Devin ATIF transcripts
  decide   逐 hint 跑确定性 Decide()（node 批量）
  score    RR-0.6B GPU 全库评分 + 三方分歧分类 → 对账报告

用法：
  python transcript_replay.py extract
  node   transcript_decide.mjs          （由 score 前的 decide 阶段内部调用）
  python transcript_replay.py score [--limit N]

分歧分类（对账轴 = 模型建议 vs 确定性决策 vs 实际激活）：
  agree            Decide dispatch 且 RR top1 ∈ dispatch 集
  model-diverges   Decide dispatch 但 RR top1 是另一技能（高置信才计）
  model-finds-gap  Decide ask/handoff 而 RR top1 强分（>0.5）——潜在覆盖缺口
  router-overfires Decide dispatch 而 RR 弃权带（<0.05）——疑似假阳性
  gray             RR top1 落灰区 [0.05,0.45]——D2 语料来源
"""
import argparse, json, re, subprocess, sys, time
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE.parents[1]
CLAUDE_DIR = Path.home() / ".claude" / "projects"
DEVIN_DIR = Path.home() / "AppData/Roaming/devin/cli/transcripts"
HINTS = HERE / "replay-hints.jsonl"
DECISIONS = HERE / "replay-decisions.jsonl"
SCORES = HERE / "replay-scores.jsonl"
REPORT = HERE / "replay-report.md"

SKIP_PREFIX = ("This session is being continued", "Caveat:", "<command-", "<local-command",
               "<system-reminder", "SessionStart:", "Continue", "<claude-mem")
SKIP_EXACT = {"ok", "继续", "好", "嗯", "做", "是", "对", "行", "可以", "y", "yes", "go", "next"}
# 非用户路由事件噪声（Phase B 首跑实测：占全量 33%，会骗出高置信假阳性）
NOISE_PATTERNS = (
    re.compile(r"^<task-notification>"),                          # 子代理回执
    re.compile(r"Another Claude session sent a message|<agent-message"),
    re.compile(r"^Skill /\S+ is already loaded|^Base directory for this skill:"),
    re.compile(r"Background agent .+ was (stopped|started)|^Stop hook feedback|tool-use-id|^\[Request interrupted by user"),
    re.compile(r"^Exit code: \d+"),
)
SKILL_NAMES = None  # lazy: set of 48 manifest names


def manifest_names():
    global SKILL_NAMES
    if SKILL_NAMES is None:
        m = json.loads((ROOT / "config/router-manifest.json").read_text(encoding="utf-8"))
        SKILL_NAMES = set(m["skillDocs"].keys())
    return SKILL_NAMES


def clean_hint(text):
    t = text.strip()
    if not t or t in SKIP_EXACT or any(t.startswith(p) for p in SKIP_PREFIX):
        return None
    if len(t) < 10 or len(t) > 4000:
        return None
    # 排除纯文件路径/命令行/纯英文代码块粘贴
    if re.fullmatch(r"[\w\-\./\\: ]+", t):
        return None
    # 排除非用户路由事件（系统噪声，首跑实测占 33% 且会骗高置信）
    if any(p.search(t[:400]) for p in NOISE_PATTERNS):
        return None
    return t


def extract_claude():
    out = []
    for f in sorted(CLAUDE_DIR.glob("*/*.jsonl")):
        first_done = False
        msgs = []
        for line in f.read_text(encoding="utf-8", errors="replace").splitlines():
            try:
                d = json.loads(line)
            except Exception:
                continue
            msgs.append(d)
        for i, d in enumerate(msgs):
            if d.get("type") != "user":
                continue
            c = d.get("message", {}).get("content")
            text = c if isinstance(c, str) else " ".join(
                p.get("text", "") for p in c if isinstance(p, dict) and p.get("type") == "text")
            hint = clean_hint(text or "")
            if not hint:
                continue
            # 实际激活：后续 4 条 assistant 里的 Skill 调用
            actual = None
            for j in range(i + 1, min(i + 12, len(msgs))):
                m = msgs[j]
                if m.get("type") == "user":
                    break
                if m.get("type") != "assistant":
                    continue
                for p in (m.get("message", {}).get("content") or []):
                    if isinstance(p, dict) and p.get("type") == "tool_use" and p.get("name") == "Skill":
                        s = (p.get("input") or {}).get("skill")
                        if s:
                            actual = s
                            break
                if actual:
                    break
            out.append({"src": "claude", "session": f.parent.name + "/" + f.stem[:8],
                        "ts": d.get("timestamp"), "hint": hint, "actual_skill": actual,
                        "first": not first_done})
            first_done = True
    return out


def extract_devin():
    out = []
    for f in sorted(DEVIN_DIR.glob("*.json")):
        first_done = False
        try:
            d = json.loads(f.read_text(encoding="utf-8", errors="replace"))
        except Exception:
            continue
        steps = d.get("steps", [])
        for i, s in enumerate(steps):
            if s.get("source") != "user":
                continue
            hint = clean_hint(s.get("message") or "")
            if not hint:
                continue
            actual = None
            for j in range(i + 1, min(i + 8, len(steps))):
                m = steps[j]
                if m.get("source") == "user":
                    break
                ex = m.get("extra") or {}
                if ex.get("tool_name") == "skill" or '"skill"' in str(m.get("message", ""))[:200]:
                    sk = ex.get("tool_args", {}).get("skill") or ex.get("skill")
                    if sk:
                        actual = sk
                        break
            out.append({"src": "devin", "session": f.stem, "ts": s.get("timestamp"),
                        "hint": hint, "actual_skill": actual, "first": not first_done})
            first_done = True
    return out


def cmd_extract():
    hints = extract_claude() + extract_devin()
    # 归一化去重：同 hint 多会话重复只留首个
    seen, rows = set(), []
    # 增量重放：旧条目保留原 id，新条目续编号——score --reuse 按 id 复用依赖 id 稳定
    if HINTS.exists():
        for l in HINTS.read_text(encoding="utf-8").splitlines():
            if not l.strip():
                continue
            r = json.loads(l)
            key = re.sub(r"\s+", "", r["hint"])[:200]
            if key not in seen:
                seen.add(key)
                rows.append(r)
    n_old = len(rows)
    next_id = max((int(r["id"].split("-")[1]) for r in rows), default=-1) + 1
    for h in hints:
        key = re.sub(r"\s+", "", h["hint"])[:200]
        if key in seen:
            continue
        seen.add(key)
        h["id"] = f"r-{next_id:04d}"
        next_id += 1
        rows.append(h)
    with open(HINTS, "w", encoding="utf-8", newline="\n") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"extracted {len(rows)} unique hints -> {HINTS}  (kept {n_old}, +{len(rows)-n_old} new)")
    with_skill = sum(1 for r in rows if r["actual_skill"])
    print(f"  with actual_skill label: {with_skill}")


def cmd_decide():
    hints = [json.loads(l) for l in HINTS.read_text(encoding="utf-8").splitlines() if l.strip()]
    inp = HERE / "_hints_in.json"
    inp.write_text(json.dumps([h["hint"] for h in hints], ensure_ascii=False), encoding="utf-8")
    r = subprocess.run(["node", str(HERE / "transcript_decide.mjs"), str(inp)],
                       capture_output=True, text=True, cwd=str(ROOT), timeout=300)
    if r.returncode != 0:
        print(r.stderr[:2000]); sys.exit(1)
    Path(DECISIONS).write_text(r.stdout, encoding="utf-8")
    print(f"decided {len(hints)} -> {DECISIONS}")


def cmd_score(limit=0, reuse=None):
    hints = [json.loads(l) for l in HINTS.read_text(encoding="utf-8").splitlines() if l.strip()]
    prior = {}
    prior_by_hint = {}
    if reuse and Path(reuse).exists():
        for l in Path(reuse).read_text(encoding="utf-8").splitlines():
            r = json.loads(l)
            if r.get("id"):
                prior[r["id"]] = r
            prior_by_hint[re.sub(r"\s+", "", r["hint"])[:200]] = r
        n_prior = len({id(r) for r in list(prior.values()) + list(prior_by_hint.values())})
        print(f"reuse: {n_prior} prior rows loaded", file=sys.stderr)

    # 模型懒加载：--reuse 全覆盖时零 GPU 依赖（纯重分类场景）
    _lazy = {}
    def _ensure_model():
        if "model" in _lazy:
            return
        import torch
        from transformers import AutoTokenizer, AutoModelForCausalLM
        MODEL = "Qwen/Qwen3-Reranker-0.6B"
        _lazy["dev"] = "cuda" if torch.cuda.is_available() else "cpu"
        _lazy["tok"] = AutoTokenizer.from_pretrained(MODEL, padding_side="left")
        _lazy["model"] = AutoModelForCausalLM.from_pretrained(MODEL, dtype=torch.bfloat16).to(_lazy["dev"]).eval()
        _lazy["yes"] = _lazy["tok"]("yes", add_special_tokens=False)["input_ids"][0]
        _lazy["no"] = _lazy["tok"]("no", add_special_tokens=False)["input_ids"][0]
        _lazy["torch"] = torch
    SYS = 'Judge whether the Document meets the requirements based on the Query and the Instruct provided. Note that the answer can only be "Yes" or "No".'
    INS = "Judge whether the skill described in the Document is the right professional skill pack to handle the user's request in the Query."
    docs = json.loads((ROOT / "config/router-manifest.json").read_text(encoding="utf-8"))["skillDocs"]
    names = sorted(docs)
    texts = [f"{k}: {(docs[k].get('description') or '')[:160]}" for k in names]

    def score(q):
        _ensure_model()
        torch = _lazy["torch"]; tok = _lazy["tok"]; model = _lazy["model"]
        yes = _lazy["yes"]; no = _lazy["no"]
        msgs = [f"<|im_start|>system\n{SYS}<|im_end|>\n<|im_start|>user\n<Instruct>: {INS}\n"
                f"<Query>: {q}\n<Document>: {t}<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n"
                for t in texts]
        out = []
        for i in range(0, len(msgs), 8):
            inp = tok(msgs[i:i + 8], padding=True, truncation=True, max_length=512,
                      return_tensors="pt").to(_lazy["dev"])
            with torch.no_grad():
                lg = model(**inp, logits_to_keep=1).logits[:, -1, :]
            out += torch.softmax(torch.stack([lg[:, no].float(), lg[:, yes].float()], -1), -1)[:, 1].tolist()
        return dict(zip(names, out))

    decs = {d["i"]: d for d in
            (json.loads(l) for l in DECISIONS.read_text(encoding="utf-8").splitlines() if l.strip())}
    rows = []
    n = len(hints) if not limit else min(limit, len(hints))
    n_reused = 0
    for i in range(n):
        h = hints[i]; t0 = time.time()
        old = prior.get(h.get("id")) or prior_by_hint.get(re.sub(r"\s+", "", h["hint"])[:200])
        if old is not None:
            sc = {k: v for k, v in old["rr_top3"]}
            sc[old["rr_top1"]] = old["rr_s"]
            n_reused += 1
        else:
            sc = score(h["hint"])
        ranked = sorted(sc.items(), key=lambda x: -x[1])
        dec = decs.get(i, {}).get("decision", {})
        s = ranked[0][1]
        disp = set((dec.get("active_recipe") or {}).get("skills") or []) | set(dec.get("candidates") or [])
        if s >= 0.5 and ranked[0][0] in disp:
            cls = "agree"
        elif dec.get("action") == "dispatch" and ranked[0][0] not in disp and s >= 0.5:
            cls = "model-diverges"
        elif dec.get("action") in ("ask", "handoff") and s >= 0.5:
            cls = "model-finds-gap"
        elif dec.get("action") == "dispatch" and s < 0.05:
            cls = "router-overfires"
        elif 0.05 <= s <= 0.45:
            cls = "gray"
        else:
            cls = "agree" if ranked[0][0] in disp else "low-agree"
        row = {"id": h["id"], "src": h["src"], "hint": h["hint"][:200],
               "first": h.get("first", False),
               "actual_skill": h.get("actual_skill"),
               "dec_action": dec.get("action"), "dec_domain": dec.get("domain"),
               "dec_skills": sorted(disp)[:6],
               "rr_top1": ranked[0][0], "rr_s": round(ranked[0][1], 4),
               "rr_top3": [(k, round(v, 3)) for k, v in ranked[:3]],
               "cls": cls, "ms": round((time.time() - t0) * 1000)}
        rows.append(row)
        print(f"[{i+1}/{n}] {h['id']} {cls} rr={row['rr_top1']}({row['rr_s']}) "
              f"dec={row['dec_action']}:{row['dec_domain']} act={row['actual_skill']}",
              file=sys.stderr, flush=True)
    with open(SCORES, "w", encoding="utf-8", newline="\n") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    from collections import Counter
    cnt = Counter(r["cls"] for r in rows)
    print(json.dumps({"n": len(rows), "reused": n_reused, "cls": dict(cnt),
                      "ms_p50": sorted(r["ms"] for r in rows)[len(rows) // 2]}, indent=2))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["extract", "decide", "score"])
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--reuse", default=None, help="旧 scores.jsonl 路径：同 hint 复用 top1/top3")
    a = ap.parse_args()
    if a.cmd == "score":
        cmd_score(a.limit, a.reuse)
    else:
        {"extract": cmd_extract, "decide": cmd_decide}[a.cmd]()
