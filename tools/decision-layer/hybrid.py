"""混合臂 spike——Qwen3-Reranker 召回截断 + kev noul 终裁。

阶段 score（GPU，kev server 须停）：Qwen3-RR 评全库 48 → top-k 短名单落盘。
阶段 decide（kev server 在跑）：短名单每技能一条 noul → >=tau_pick 入选，全低于阈 = 弃权。

用法：
  python hybrid.py score  --corpus adversarial-corpus.jsonl [--k 8] --out hybrid-scores.jsonl
  python hybrid.py decide --scores hybrid-scores.jsonl [--tau-pick 0.5] --out hybrid-out.jsonl
"""
import argparse, json, sys, time, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RR_MODEL = "Qwen/Qwen3-Reranker-0.6B"
SYSTEM = 'Judge whether the Document meets the requirements based on the Query and the Instruct provided. Note that the answer can only be "Yes" or "No".'
INSTRUCT = "Judge whether the skill described in the Document is the right professional skill pack to handle the user's request in the Query."
NONE_KEY = "__NONE__"


def load_docs():
    return json.loads((ROOT / "config/router-manifest.json").read_text(encoding="utf-8"))["skillDocs"]


def load_cases(corpus):
    if corpus == "c-tier":
        files = [ROOT / "tests/evals/recall-corpus/c-tier.jsonl"]
    elif corpus == "all":
        files = [Path("adversarial-corpus.jsonl")] + sorted((ROOT / "tests/evals/recall-corpus").glob("*.jsonl"))
    else:
        files = [Path(corpus)]
    return [json.loads(l) for f in files for l in f.read_text(encoding="utf-8").splitlines() if l.strip()]


def phase_score(args):
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    docs = load_docs()
    names = list(docs)
    cases = load_cases(args.corpus)[: args.limit or None]
    tok = AutoTokenizer.from_pretrained(RR_MODEL, padding_side="left")
    model = AutoModelForCausalLM.from_pretrained(
        RR_MODEL, dtype=torch.bfloat16 if args.device != "cpu" else torch.float32).to(args.device).eval()
    yes_id = tok.convert_tokens_to_ids("yes")
    no_id = tok.convert_tokens_to_ids("no")

    def score(query, doc_texts):
        msgs = [
            f"<|im_start|>system\n{SYSTEM}<|im_end|>\n"
            f"<|im_start|>user\n<Instruct>: {INSTRUCT}\n<Query>: {query}\n<Document>: {d}<|im_end|>\n"
            f"<|im_start|>assistant\n<think>\n\n</think>\n\n"
            for d in doc_texts]
        out = []
        for i in range(0, len(msgs), 8):
            inp = tok(msgs[i:i + 8], padding=True, truncation=True, max_length=512, return_tensors="pt").to(args.device)
            with torch.no_grad():
                logits = model(**inp, logits_to_keep=1).logits[:, -1, :]
            out += torch.softmax(logits[:, [no_id, yes_id]].float(), -1)[:, 1].tolist()
        return out

    with open(args.out, "w", encoding="utf-8") as f:
        for i, c in enumerate(cases):
            t0 = time.time()
            texts = [f"{k}: {(docs[k].get('description') or '')[:160]}" for k in names]
            scores = dict(zip(names, score(c["query"], texts)))
            short = sorted(scores, key=scores.get, reverse=True)[: args.k]
            exp = c.get("expect", {})
            row = {
                "id": c["id"], "query": c["query"], "expect": exp,
                "oos": exp.get("domain") == "none" or exp.get("action") == "handoff",
                "shortlist": short, "scores": {k: round(scores[k], 4) for k in short},
                "rr_top1": max(scores, key=scores.get), "rr_max": round(max(scores.values()), 4),
                "ms": round((time.time() - t0) * 1000),
            }
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
            f.flush()
            print(f"[{i+1}/{len(cases)}] {c['id']} short={short[:3]} max={row['rr_max']} {row['ms']}ms", file=sys.stderr, flush=True)
    print(f"# wrote {args.out}", file=sys.stderr)


def phase_decide(args):
    docs = load_docs()
    rows = [json.loads(l) for l in Path(args.scores).read_text(encoding="utf-8").splitlines() if l.strip()]
    rows = rows[: args.limit or None]

    def post(state, questions):
        body = json.dumps({"model": "kev-latest", "state": state, "questions": questions}).encode()
        req = urllib.request.Request(f"{args.base_url}/v1/systemone", data=body, headers={"content-type": "application/json"})
        with urllib.request.urlopen(req, timeout=600) as resp:
            r = json.loads(resp.read())
        post.last_server_ms = r.get("latency_ms")
        return r["answers"]

    out_rows = []
    out_f = open(args.out, "w", encoding="utf-8") if args.out else None
    for i, r in enumerate(rows):
        t0 = time.time()
        qs = {
            f"s_{s}": {"type": "noul", "instructions": f"技能 {s}（{(docs[s].get('description') or '')[:120]}）是否适合处理该请求？"}
            for s in r["shortlist"]}
        a = post(r["query"], qs)
        over = {k[2:]: v["noul"] for k, v in a.items() if v["noul"] >= args.tau_pick}
        picked = max(over, key=over.get) if over else NONE_KEY
        exp = r["expect"]
        want = set(exp.get("skills", [])) | set(exp.get("anySkills", []))
        oos = r["oos"]
        row = {
            "id": r["id"], "oos": oos, "expect": sorted(want),
            "shortlist": r["shortlist"], "rr_max": r["rr_max"],
            "nouls": {k[2:]: round(v["noul"], 3) for k, v in a.items()},
            "picked": picked, "hit": (picked in want) if want else None,
            "abstain_ok": (picked == NONE_KEY) if oos else None,
            "rr_hit": bool(set(r["shortlist"]) & want) if want else None,
            "ms": round((time.time() - t0) * 1000), "srv_ms": post.last_server_ms,
        }
        out_rows.append(row)
        mark = "OOS" if oos else ("OK" if row["hit"] else ("RR~" if row["rr_hit"] else "MISS"))
        print(f"[{i+1}/{len(rows)}] {r['id']} {mark} pick={picked} rr_max={r['rr_max']} {row['ms']}ms", file=sys.stderr, flush=True)
        if out_f:
            out_f.write(json.dumps(row, ensure_ascii=False) + "\n")
            out_f.flush()

    ins = [x for x in out_rows if not x["oos"]]
    oos = [x for x in out_rows if x["oos"]]
    print(json.dumps({
        "backend": "hybrid rr+kev-noul", "k": len(rows[0]["shortlist"]) if rows else 0,
        "tau_pick": args.tau_pick, "n": len(out_rows),
        "rr_shortlist_hit": f"{sum(1 for x in ins if x['rr_hit'])}/{len(ins)}",
        "final_hit": f"{sum(1 for x in ins if x['hit'])}/{len(ins)}",
        "abstain_ok": f"{sum(1 for x in oos if x['abstain_ok'])}/{len(oos)}",
        "ms_p50": sorted(x["ms"] for x in out_rows)[len(out_rows) // 2] if out_rows else 0,
    }, ensure_ascii=False, indent=2))
    if out_f:
        out_f.close()


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="phase", required=True)
    for name in ("score", "decide"):
        p = sub.add_parser(name)
        p.add_argument("--corpus", default="adversarial-corpus.jsonl")
        p.add_argument("--limit", type=int, default=0)
        p.add_argument("--out", default="")
        p.add_argument("--k", type=int, default=8)
        p.add_argument("--device", default="cuda")
        p.add_argument("--scores", default="hybrid-scores.jsonl")
        p.add_argument("--base-url", default="http://127.0.0.1:8009")
        p.add_argument("--tau-pick", type=float, default=0.5)
    args = ap.parse_args()
    (phase_score if args.phase == "score" else phase_decide)(args)


if __name__ == "__main__":
    main()
