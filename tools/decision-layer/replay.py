"""决策层离线 replay — 在语料上评估本地决策模型。

对照语义与 tests/evals/eval-recall.mjs 对齐：
  - in-scope 用例：expect.skills/anySkills 命中 picked/top-k（召回语义）
  - OOS 用例（expect.domain=none/action=handoff）：应弃权
    - noul 模式：picked 全 <tau 即弃权正确
    - choice 模式：criteria 含 NONE 伪选项，choice==NONE 即弃权正确
  - noul 模式为每候选一个是非题（并行）；choice 模式为单次多选一（softmax 预算强制区分）

用法：
    python replay.py --backend laya --mode noul --tau 0.5
    python replay.py --backend kev --mode choice --base-url http://127.0.0.1:8009
    python replay.py --backend kev --mode noul --corpus adversarial-corpus.jsonl

产出：stdout 指标 + --out JSONL 明细（逐行 flush，含每条 per-skill 分数，供消融）。
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "config" / "router-manifest.json"
CORPUS_DIR = ROOT / "tests" / "evals" / "recall-corpus"

INS_NOUL = "该请求是否需要这个技能来处理？只凭描述实质匹配，碰巧共用词汇不算匹配。"
INS_CHOICE = "哪个技能最适合处理这条用户请求？只看选项实质范围，碰巧共词不算；都不适合就选 NONE。"
NONE_KEY = "NONE"
NONE_DESC = "以上都不适合：请求与这些技能无关，或信息不足以判断"


def load_criteria(budget, with_none=False):
    docs = json.loads(MANIFEST.read_text(encoding="utf-8"))["skillDocs"]
    out = {}
    for name, d in docs.items():
        desc = (d.get("description") or "").strip().replace("\n", " ")
        out[name] = desc[:budget]
    if with_none:
        out[NONE_KEY] = NONE_DESC
    return out


def load_cases(tiers, corpus=None):
    if corpus:
        return [json.loads(l) for l in Path(corpus).read_text(encoding="utf-8").splitlines() if l.strip()]
    cases = []
    for f in sorted(CORPUS_DIR.glob("*.jsonl")):
        tier = f.stem.split("-")[0]
        if tiers and tier not in tiers:
            continue
        for line in f.read_text(encoding="utf-8").splitlines():
            if line.strip():
                cases.append(json.loads(line))
    return cases


class LayaBackend:
    def __init__(self, subfolder="multilingual"):
        import laya
        self.agent = laya.load("convaiinnovations/laya", subfolder=subfolder)

    def predict_noul(self, state, questions):
        r = self.agent.predict(state, questions)
        return {k[4:]: v["noul"] for k, v in r["answers"].items()}

    def predict_choice(self, state, criteria):
        r = self.agent.predict(state, {"skill": {"type": "choice", "instructions": INS_CHOICE, "criteria": criteria}})
        return r["answers"]["skill"]["probabilities"]


class KevBackend:
    def __init__(self, base_url):
        self.base_url = base_url.rstrip("/")

    def _post(self, state, questions):
        body = {"model": "kev-latest", "state": state, "questions": questions}
        req = urllib.request.Request(
            f"{self.base_url}/v1/systemone",
            data=json.dumps(body).encode(),
            headers={"content-type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=600) as resp:
            r = json.loads(resp.read())
        self.last_server_ms = r.get("latency_ms")
        return r["answers"]

    def predict_noul(self, state, questions):
        answers = self._post(state, questions)
        return {k[4:]: v["noul"] for k, v in answers.items()}

    def predict_choice(self, state, criteria):
        answers = self._post(state, {"skill": {"type": "choice", "instructions": INS_CHOICE, "criteria": criteria}})
        return answers["skill"]["probabilities"]


def expected_skills(case):
    e = case.get("expect", {})
    return set(e.get("skills") or []) | set(e.get("anySkills") or [])


def is_oos(case):
    e = case.get("expect", {})
    return e.get("domain") == "none" or e.get("action") == "handoff"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--backend", choices=["laya", "kev"], required=True)
    ap.add_argument("--mode", choices=["noul", "choice"], default="noul")
    ap.add_argument("--base-url", default="http://127.0.0.1:8009")
    ap.add_argument("--laya-subfolder", default="multilingual")
    ap.add_argument("--tau", type=float, default=0.5)
    ap.add_argument("--desc-budget", type=int, default=120)
    ap.add_argument("--tiers", default="abc")
    ap.add_argument("--corpus", default="")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--out", default="")
    args = ap.parse_args()

    criteria = load_criteria(args.desc_budget, with_none=(args.mode == "choice"))
    cases = load_cases(set(args.tiers), args.corpus or None)[: args.limit or None]
    backend = LayaBackend(args.laya_subfolder) if args.backend == "laya" else KevBackend(args.base_url)
    qs = None
    if args.mode == "noul":
        qs = {f"fit_{k}": {"type": "noul", "instructions": f"{INS_NOUL}技能：{k} — {v}"}
              for k, v in criteria.items()}

    print(f"# replay: backend={args.backend} mode={args.mode} tau={args.tau} skills={len(criteria)} cases={len(cases)}", file=sys.stderr)

    rows, t_all = [], time.time()
    out_f = open(args.out, "w", encoding="utf-8") if args.out else None
    for i, c in enumerate(cases):
        t0 = time.time()
        try:
            if args.mode == "choice":
                scores = backend.predict_choice(c["query"], criteria)
            else:
                scores = backend.predict_noul(c["query"], qs)
        except Exception as e:  # 单条失败不中断——记 error 行，对齐 fail-silent 纪律
            erow = {"id": c["id"], "error": repr(e)}
            rows.append(erow)
            if out_f:
                out_f.write(json.dumps(erow, ensure_ascii=False) + "\n")
                out_f.flush()
            print(f"[{i+1}/{len(cases)}] {c['id']} ERROR {e!r}", file=sys.stderr)
            continue
        dt = time.time() - t0
        ranked = sorted(scores.items(), key=lambda x: -x[1])
        exp = expected_skills(c)
        oos = is_oos(c)
        if args.mode == "choice":
            picked = {ranked[0][0]} if ranked else set()
            topk = {k for k, _ in ranked[:3]}
            abstain_ok = (ranked[0][0] == NONE_KEY) if oos else None
        else:
            picked = {k for k, s in scores.items() if s >= args.tau}
            topk = picked
            abstain_ok = (not picked) if oos else None
        top1 = ranked[0][0] if ranked else None
        row = {
            "id": c["id"], "tier": c.get("tier"), "lang": c.get("lang"),
            "oos": oos, "expect": sorted(exp), "picked": sorted(picked),
            "top1": top1, "top1_p": round(ranked[0][1], 4) if ranked else None,
            "hit_all": exp <= picked if (exp and args.mode == "noul") else None,
            "hit_any": bool(exp & (picked if args.mode == "noul" else topk)) if exp else None,
            "top1_hit": top1 in exp if exp else None,
            "abstain_ok": abstain_ok,
            "n_picked": len(picked), "ms": round(dt * 1000),
            "scores": {k: round(v, 4) for k, v in scores.items()},
        }
        rows.append(row)
        if out_f:
            out_f.write(json.dumps(row, ensure_ascii=False) + "\n")
            out_f.flush()
        mark = "OOS" if oos else ("OK" if (row["hit_all"] or row["top1_hit"]) else "miss")
        print(f"[{i+1}/{len(cases)}] {c['id']} {mark} picked={len(picked)} top1={top1}({row['top1_p']:.2f}) {dt*1000:.0f}ms", file=sys.stderr)

    ins = [r for r in rows if "error" not in r and not r["oos"]]
    oos = [r for r in rows if "error" not in r and r["oos"]]
    lat = sorted(r["ms"] for r in rows if "ms" in r)
    summary = {
        "backend": args.backend, "mode": args.mode, "tau": args.tau, "n_cases": len(rows),
        "n_errors": sum(1 for r in rows if "error" in r),
        "in_scope": len(ins), "oos": len(oos),
        "hit_any": f"{sum(1 for r in ins if r['hit_any'])}/{len(ins)}",
        "top1_hit": f"{sum(1 for r in ins if r['top1_hit'])}/{len(ins)}",
        "abstain_ok": f"{sum(1 for r in oos if r['abstain_ok'])}/{len(oos)}",
        "avg_picked_in": round(sum(r["n_picked"] for r in ins) / max(len(ins), 1), 2),
        "avg_picked_oos": round(sum(r["n_picked"] for r in oos) / max(len(oos), 1), 2),
        "ms_p50": lat[len(lat) // 2] if lat else None,
        "ms_p95": lat[int(len(lat) * 0.95)] if lat else None,
        "wall_s": round(time.time() - t_all, 1),
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    if out_f:
        out_f.close()
        print(f"# wrote {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
