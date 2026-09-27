"""Qwen3-Reranker 对照臂——带指令槽的 causal-LM 打分器（yes/no logits softmax）。

官方用法：<Instruct>/<Query>/<Document> 模板 + "只答 Yes/No" system，
score = softmax(logit[yes_id], logit[no_id])[yes]。指令槽 = 与 kev noul 同构的条件。

用法：python qwen3_reranker.py [--corpus X.jsonl] [--limit N] [--out X.jsonl]
"""
import argparse, json, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MODEL_ID = "Qwen/Qwen3-Reranker-0.6B"
INSTRUCT = "Judge whether the skill described in the Document is the right professional skill pack to handle the user's request in the Query."
SYSTEM = 'Judge whether the Document meets the requirements based on the Query and the Instruct provided. Note that the answer can only be "Yes" or "No".'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", default="adversarial-corpus.jsonl")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--out", default="")
    ap.add_argument("--device", default="cpu")
    args = ap.parse_args()

    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    docs = json.loads((ROOT / "config/router-manifest.json").read_text(encoding="utf-8"))["skillDocs"]
    names = list(docs)

    if args.corpus == "c-tier":
        files = [ROOT / "tests/evals/recall-corpus/c-tier.jsonl"]
    elif args.corpus == "all":
        files = [Path("adversarial-corpus.jsonl")] + sorted((ROOT / "tests/evals/recall-corpus").glob("*.jsonl"))
    else:
        files = [Path(args.corpus)]
    cases = [json.loads(l) for f in files for l in f.read_text(encoding="utf-8").splitlines() if l.strip()]
    cases = cases[: args.limit or None]

    tok = AutoTokenizer.from_pretrained(MODEL_ID, padding_side="left")
    dtype = torch.float32 if args.device == "cpu" else torch.bfloat16
    model = AutoModelForCausalLM.from_pretrained(MODEL_ID, dtype=dtype).to(args.device).eval()
    yes_id = tok("yes", add_special_tokens=False)["input_ids"][0]
    no_id = tok("no", add_special_tokens=False)["input_ids"][0]

    def score_batch(query, doc_texts):
        # apply_chat_template 会把 <Instruct>/<Query>/<Document> 当变量吃掉——官方用法就是手拼
        msgs = [
            f"<|im_start|>system\n{SYSTEM}<|im_end|>\n"
            f"<|im_start|>user\n<Instruct>: {INSTRUCT}\n<Query>: {query}\n<Document>: {d}<|im_end|>\n"
            f"<|im_start|>assistant\n<think>\n\n</think>\n\n"
            for d in doc_texts]
        out = []
        for i in range(0, len(msgs), 8):   # torch2.14+cpu SDPA 在 bs>=16 segfault，分块规避
            inp = tok(msgs[i:i + 8], padding=True, truncation=True, max_length=512, return_tensors="pt").to(args.device)
            with torch.no_grad():
                logits = model(**inp, logits_to_keep=1).logits[:, -1, :]
            yes = logits[:, yes_id].float()
            no = logits[:, no_id].float()
            out += torch.softmax(torch.stack([no, yes], -1), -1)[:, 1].tolist()
        return out

    rows = []
    for i, c in enumerate(cases):
        t0 = time.time()
        texts = [f"{k}: {(docs[k].get('description') or '')[:160]}" for k in names]
        scores = dict(zip(names, score_batch(c["query"], texts)))
        ranked = sorted(scores.items(), key=lambda x: -x[1])
        exp = c.get("expect", {})
        want = set(exp.get("skills", [])) | set(exp.get("anySkills", []))
        oos = exp.get("domain") == "none" or exp.get("action") == "handoff"
        row = {
            "id": c["id"], "oos": oos, "expect": sorted(want),
            "top1": ranked[0][0], "top1_hit": (ranked[0][0] in want) if want else None,
            "top3": [k for k, _ in ranked[:3]],
            "hit3": bool(set(k for k, _ in ranked[:3]) & want) if want else None,
            "top1_score": round(ranked[0][1], 4), "max_score": round(ranked[0][1], 4),
            "ms": round((time.time() - t0) * 1000),
        }
        rows.append(row)
        mark = "OOS" if oos else ("OK1" if row["top1_hit"] else ("OK3" if row["hit3"] else "MISS"))
        print(f"[{i+1}/{len(cases)}] {c['id']} {mark} top1={row['top1']}({row['top1_score']}) {row['ms']}ms", file=sys.stderr, flush=True)
        if args.out:
            with open(args.out, "a", encoding="utf-8") as f:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")

    ins = [r for r in rows if not r["oos"]]
    oos = [r for r in rows if r["oos"]]
    lat = sorted(r["ms"] for r in rows)
    print(json.dumps({
        "backend": MODEL_ID, "n": len(rows),
        "in_top1": f"{sum(1 for r in ins if r['top1_hit'])}/{len(ins)}",
        "in_top3": f"{sum(1 for r in ins if r['hit3'])}/{len(ins)}",
        "in_score_mean": round(sum(r["top1_score"] for r in ins) / max(len(ins), 1), 3),
        "oos_score_mean": round(sum(r["top1_score"] for r in oos) / max(len(oos), 1), 3),
        "ms_p50": lat[len(lat) // 2] if lat else 0,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
