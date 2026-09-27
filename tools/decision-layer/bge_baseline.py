"""bge-reranker 对照臂——无指令槽经典 cross-encoder。

模型：BAAI/bge-reranker-base（本地缓存已有）。对每个 (query, "name: desc") 对打分，
取 top-k 看 expect 是否命中。无指令槽 = 检验"指令条件判别"相对纯相关性的增益。

用法：python bge_baseline.py [--corpus adversarial-corpus.jsonl] [--limit N]
"""
import argparse, json, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", default="")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--out", default="")
    args = ap.parse_args()

    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    docs = json.loads((ROOT / "config/router-manifest.json").read_text(encoding="utf-8"))["skillDocs"]
    names = list(docs)
    texts = [f"{k}: {(docs[k].get('description') or '')[:120]}" for k in names]

    if args.corpus:
        cases = [json.loads(l) for l in Path(args.corpus).read_text(encoding="utf-8").splitlines() if l.strip()]
    else:
        cases = []
        for f in sorted((ROOT / "tests/evals/recall-corpus").glob("*.jsonl")):
            cases += [json.loads(l) for l in f.read_text(encoding="utf-8").splitlines() if l.strip()]
    cases = cases[: args.limit or None]

    tok = AutoTokenizer.from_pretrained("BAAI/bge-reranker-base")
    model = AutoModelForSequenceClassification.from_pretrained("BAAI/bge-reranker-base").eval()

    rows = []
    for i, c in enumerate(cases):
        t0 = time.time()
        pairs = [[c["query"], t] for t in texts]
        with torch.no_grad():
            inp = tok(pairs, padding=True, truncation=True, max_length=256, return_tensors="pt")
            logits = model(**inp).logits[:, -1] if model.config.num_labels > 1 else model(**inp).logits[:, 0]
        scores = dict(zip(names, logits.float().tolist()))
        ranked = sorted(scores.items(), key=lambda x: -x[1])
        exp = c.get("expect", {})
        want = set(exp.get("skills", [])) | set(exp.get("anySkills", []))
        oos = exp.get("domain") == "none" or exp.get("action") == "handoff"
        top1 = ranked[0][0]
        rows.append({
            "id": c["id"], "oos": oos, "expect": sorted(want),
            "top1": top1, "top1_hit": top1 in want if want else None,
            "top3": [k for k, _ in ranked[:3]],
            "hit3": bool(set(k for k, _ in ranked[:3]) & want) if want else None,
            "top1_score": round(ranked[0][1], 3), "oos_max": round(ranked[0][1], 3) if oos else None,
            "ms": round((time.time() - t0) * 1000),
        })
        mark = "OOS" if oos else ("OK1" if rows[-1]["top1_hit"] else ("OK3" if rows[-1]["hit3"] else "MISS"))
        print(f"[{i+1}/{len(cases)}] {c['id']} {mark} top3={[k for k,_ in ranked[:3]]} {rows[-1]['ms']}ms", file=sys.stderr)

    ins = [r for r in rows if not r["oos"]]
    oos = [r for r in rows if r["oos"]]
    print(json.dumps({
        "backend": "bge-reranker-base", "n": len(rows),
        "in_top1": f"{sum(1 for r in ins if r['top1_hit'])}/{len(ins)}",
        "in_top3": f"{sum(1 for r in ins if r['hit3'])}/{len(ins)}",
        "oos_max_mean": round(sum(r["oos_max"] for r in oos) / max(len(oos), 1), 3),
        "ms_p50": sorted(r["ms"] for r in rows)[len(rows) // 2],
    }, ensure_ascii=False, indent=2))
    if args.out:
        Path(args.out).write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
