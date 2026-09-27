# embed_recall.py — 向量召回臂实测：Karmit 同构（描述离线编码 → hint 编码 → 余弦 top-k）
# 对照维度：top1/top3/top5 召回（anySkills 语义）+ OOS 可分性（c-tier 最大余弦）
# 用法：.venv-kev python embed_recall.py --model BAAI/bge-base-zh-v1.5 [--out embed-bgezh.jsonl]
import argparse, json, sys
from pathlib import Path

import numpy as np
import torch
from sentence_transformers import SentenceTransformer

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
CORPUS_FILES = [
    ("adv", HERE / "adversarial-corpus.jsonl"),
    ("a", ROOT / "tests/evals/recall-corpus/a-tier.jsonl"),
    ("b", ROOT / "tests/evals/recall-corpus/b-tier.jsonl"),
    ("c", ROOT / "tests/evals/recall-corpus/c-tier.jsonl"),
    ("c2", ROOT / "tests/evals/recall-corpus/c2-tier.jsonl"),
]


def load_cases():
    cases = []
    for tier, fp in CORPUS_FILES:
        if not fp.exists():
            continue
        for line in fp.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            c = json.loads(line)
            c["tier_group"] = tier
            cases.append(c)
    return cases


def expected_set(case):
    e = case.get("expect", {})
    return set(e.get("skills") or []) | set(e.get("anySkills") or [])


def is_oos(case):
    e = case.get("expect", {})
    return e.get("domain") == "none" or e.get("action") == "handoff"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--out", default="")
    ap.add_argument("--prompt", default="", help="bge 查询指令前缀（bge 系查询端约定）")
    args = ap.parse_args()

    dev = "cuda" if torch.cuda.is_available() else "cpu"
    model = SentenceTransformer(args.model, device=dev)
    docs = json.loads((ROOT / "config/router-manifest.json").read_text(encoding="utf-8"))["skillDocs"]
    names = sorted(docs)
    texts = [f"{k}: {(docs[k].get('description') or '')[:160]}" for k in names]

    doc_emb = model.encode(texts, normalize_embeddings=True, convert_to_numpy=True,
                           batch_size=32, show_progress_bar=False)
    cases = load_cases()
    queries = [c["query"] for c in cases]
    q_in = [args.prompt + q for q in queries] if args.prompt else queries
    q_emb = model.encode(q_in, normalize_embeddings=True, convert_to_numpy=True,
                         batch_size=32, show_progress_bar=False)
    sims = q_emb @ doc_emb.T  # normalized → cosine

    rows, oos_max = [], 0.0
    in_top1 = in_top3 = in_top5 = in_n = 0
    for i, c in enumerate(cases):
        order = np.argsort(-sims[i])
        top = [(names[j], round(float(sims[i, j]), 4)) for j in order[:5]]
        exp = expected_set(c)
        oos = is_oos(c)
        rows.append({"id": c["id"], "tier": c["tier_group"], "oos": oos,
                     "top5": top, "top1": top[0][0], "s1": top[0][1],
                     "hit1": bool(exp) and top[0][0] in exp,
                     "hit3": any(n in exp for n, _ in top[:3]),
                     "hit5": any(n in exp for n, _ in top[:5]),
                     "expect": sorted(exp)})
        if oos:
            oos_max = max(oos_max, top[0][1])
        else:
            in_n += 1
            in_top1 += rows[-1]["hit1"]
            in_top3 += rows[-1]["hit3"]
            in_top5 += rows[-1]["hit5"]

    if args.out:
        with open(args.out, "w", encoding="utf-8", newline="\n") as f:
            for r in rows:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")

    oos_rows = [r for r in rows if r["oos"]]
    in_s1 = sorted(r["s1"] for r in rows if not r["oos"])
    oos_s1 = sorted(r["s1"] for r in oos_rows)
    print(json.dumps({
        "model": args.model, "device": dev, "n": len(rows), "in_domain": in_n,
        "top1": f"{in_top1}/{in_n}", "top3": f"{in_top3}/{in_n}", "top5": f"{in_top5}/{in_n}",
        "oos_n": len(oos_rows), "oos_max_cos": round(oos_max, 4),
        "in_s1_p05": round(in_s1[len(in_s1) // 20], 4) if in_s1 else None,
        "in_s1_mean": round(sum(in_s1) / len(in_s1), 4) if in_s1 else None,
        "oos_s1_p95": round(oos_s1[int(len(oos_s1) * 0.95) - 1], 4) if oos_s1 else None,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
