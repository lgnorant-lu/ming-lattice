"""多 reranker 对照矩阵——同一 101 条语料跑四种接口形态各异的打分器。

模型/接口映射：
  qwen3-4b   AutoModelForCausalLM + <Instruct>/<Query>/<Document> 手拼模板，yes/no softmax
  mxbai      sentence-transformers CrossEncoder，predict(pairs) 原始 logit（无界）
  kalm-nano  CrossEncoder + trust_remote_code（t5gemma2 编码器-解码器 FBNL），P(yes)
  kalm-small 同上
  querit     QueritModel(Qwen3ForCausalLM) 自定义二元头，score = probs·[-1,1]

用法：python reranker_matrix.py --model qwen3-4b [--corpus all|FILE] [--limit N] [--out X.jsonl]
"""
import argparse, json, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INSTRUCT = "Judge whether the skill described in the Document is the right professional skill pack to handle the user's request in the Query."
SYSTEM = 'Judge whether the Document meets the requirements based on the Query and the Instruct provided. Note that the answer can only be "Yes" or "No".'

MODELS = {
    "qwen3-4b": "Qwen/Qwen3-Reranker-4B",
    "mxbai": "mixedbread-ai/mxbai-rerank-large-v2",
    "kalm-nano": "KaLM-Embedding/KaLM-Reranker-V1-Nano",
    "kalm-small": "KaLM-Embedding/KaLM-Reranker-V1-Small",
    "querit": "Querit/Querit-4B",
}


def load_cases(corpus):
    if corpus == "c-tier":
        files = [ROOT / "tests/evals/recall-corpus/c-tier.jsonl"]
    elif corpus == "all":
        files = [Path("adversarial-corpus.jsonl")] + sorted((ROOT / "tests/evals/recall-corpus").glob("*.jsonl"))
    else:
        files = [Path(corpus)]
    return [json.loads(l) for f in files for l in f.read_text(encoding="utf-8").splitlines() if l.strip()]


def build_scorer(model_key, device):
    import torch
    model_id = MODELS[model_key]

    if model_key == "qwen3-4b":
        from transformers import AutoModelForCausalLM, AutoTokenizer
        tok = AutoTokenizer.from_pretrained(model_id, padding_side="left")
        if device == "cuda":
            from transformers import BitsAndBytesConfig
            bnb = BitsAndBytesConfig(load_in_8bit=True)
            model = AutoModelForCausalLM.from_pretrained(model_id, quantization_config=bnb).eval()
        else:
            model = AutoModelForCausalLM.from_pretrained(model_id, dtype=torch.float32).to(device).eval()
        yes_id = tok("yes", add_special_tokens=False)["input_ids"][0]
        no_id = tok("no", add_special_tokens=False)["input_ids"][0]

        def score(query, doc_texts):
            msgs = [
                f"<|im_start|>system\n{SYSTEM}<|im_end|>\n"
                f"<|im_start|>user\n<Instruct>: {INSTRUCT}\n<Query>: {query}\n<Document>: {d}<|im_end|>\n"
                f"<|im_start|>assistant\n<think>\n\n</think>\n\n"
                for d in doc_texts]
            out = []
            for i in range(0, len(msgs), 8):
                inp = tok(msgs[i:i + 8], padding=True, truncation=True, max_length=512, return_tensors="pt").to(device)
                with torch.no_grad():
                    logits = model(**inp, logits_to_keep=1).logits[:, -1, :]
                out += torch.softmax(torch.stack([logits[:, no_id], logits[:, yes_id]], -1).float(), -1)[:, 1].tolist()
            return out

    elif model_key == "mxbai":
        from sentence_transformers import CrossEncoder
        model = CrossEncoder(model_id, device=device,
                             model_kwargs={"dtype": torch.bfloat16})

        def score(query, doc_texts):
            pairs = [(query, d) for d in doc_texts]
            out = []
            for i in range(0, len(pairs), 8):
                out += [float(s) for s in model.predict(pairs[i:i + 8], batch_size=8)]
            return out

    elif model_key.startswith("kalm"):
        from sentence_transformers import CrossEncoder
        model = CrossEncoder(model_id, trust_remote_code=True, device=device,
                             model_kwargs={"dtype": torch.bfloat16})

        def score(query, doc_texts):
            pairs = [(query, d) for d in doc_texts]
            out = []
            for i in range(0, len(pairs), 8):
                out += [float(s) for s in model.predict(pairs[i:i + 8], prompt=INSTRUCT)]
            return out

    elif model_key == "querit":
        from transformers import AutoTokenizer
        from huggingface_hub import hf_hub_download
        import importlib.util, torch.nn as nn
        tok = AutoTokenizer.from_pretrained(model_id, padding_side="left")
        # config 无 auto_map：手动加载仓内 modeling 文件
        mf = hf_hub_download(model_id, "modeling_querit_4b.py")
        spec = importlib.util.spec_from_file_location("modeling_querit_4b", mf)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        # lm_head=None 会炸 transformers 的 tie-weights 检查——保留 lm_head 绕过
        class QueritLM(mod.QueritModel):
            def __init__(self, config):
                super().__init__(config, use_lm_head=True)

        # bnb/torchao 量化路径在 Windows 均不可用；手写 int8 分流加载：
        # meta 初始化 → safe_open(pread) 逐 tensor 流读（commit 峰值≈单 tensor）
        # → Linear 权重按行 absmax 量化为 int8+scale → QLin 前向时反量化
        import glob as _glob
        from safetensors import safe_open
        from transformers import AutoConfig
        import torch.nn.functional as F

        class QLin(nn.Linear):
            """int8 权重 + bf16 反量化前向（VRAM≈int8 大小）"""
            def forward(self, x):
                w = self.weight.to(x.dtype) * self.scale
                return F.linear(x, w, self.bias)

        cfg = AutoConfig.from_pretrained(model_id)
        with torch.device("meta"):
            model = QueritLM(cfg)

        snap = hf_hub_download(model_id, "model.safetensors.index.json")
        snap_dir = str(Path(snap).parent)
        idx = json.loads(Path(snap).read_text(encoding="utf-8"))["weight_map"]
        shards = {}
        for k, f in idx.items():
            shards.setdefault(f, []).append(k)

        SKIP_Q = ("lm_head", "head.", "embed_tokens", "norm")  # 小头/嵌入保持 bf16
        for fname, keys in shards.items():
            with safe_open(str(Path(snap_dir) / fname), framework="pt", device="cpu", backend="pread") as h:
                for k in keys:
                    t = h.get_tensor(k)
                    owner = model
                    parts = k.split(".")
                    for p in parts[:-1]:
                        owner = owner[int(p)] if p.isdigit() else getattr(owner, p)
                    attr = parts[-1]
                    cur = getattr(owner, attr)
                    is_lin_w = (isinstance(cur, torch.nn.Parameter) and cur.ndim == 2
                                and attr == "weight" and isinstance(owner, nn.Linear)
                                and not any(s in k for s in SKIP_Q))
                    if is_lin_w:
                        w = t.float()
                        scale = (w.abs().amax(dim=-1, keepdim=True) / 127).clamp_min(1e-8)
                        q = (w / scale).round().clamp(-127, 127).to(torch.int8)
                        del w
                        owner.__class__ = QLin
                        owner.weight = nn.Parameter(q.to(device), requires_grad=False)
                        owner.register_buffer("scale", scale.to(device, torch.bfloat16))
                    else:
                        dt = torch.bfloat16 if t.is_floating_point() else t.dtype
                        real = t.to(device, dt)
                        if isinstance(cur, nn.Parameter):
                            setattr(owner, attr, nn.Parameter(real, requires_grad=False))
                        else:
                            owner.register_buffer(attr, real)
                    del t
        # rotary_emb.inv_freq/original_inv_freq 是 init 计算的非 checkpoint buffer，meta 重建
        rot = type(model.model.rotary_emb)(cfg)
        model.model.rotary_emb.inv_freq = rot.inv_freq.to(device)
        model.model.rotary_emb.original_inv_freq = rot.original_inv_freq.to(device)
        # lm_head 不在 checkpoint（tie_word_embeddings），tie 到 embed
        if model.lm_head.weight.is_meta:
            model.lm_head.weight = model.model.embed_tokens.weight
        leftover = [n for n, p in model.named_parameters() if p.is_meta]
        leftover += [n for n, b in model.named_buffers() if b.is_meta]
        assert not leftover, f"meta leftovers: {leftover[:5]}"
        model = model.eval()

        def score(query, doc_texts):
            msgs = [
                f"<|im_start|>system\n{SYSTEM}<|im_end|>\n"
                f"<|im_start|>user\n<Instruct>: {INSTRUCT}\n<Query>: {query}\n<Document>: {d}<|im_end|>\n"
                f"<|im_start|>assistant\n<think>\n\n</think>\n\n"
                for d in doc_texts]
            out = []
            for i in range(0, len(msgs), 8):
                inp = tok(msgs[i:i + 8], padding=True, truncation=True, max_length=512, return_tensors="pt").to(device)
                with torch.no_grad():
                    r = model(input_ids=inp["input_ids"], attention_mask=inp["attention_mask"])
                out += [float(s) for s in r["score"].squeeze(-1).tolist()]
            return out

    return score


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True, choices=list(MODELS))
    ap.add_argument("--corpus", default="adversarial-corpus.jsonl")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--out", default="")
    ap.add_argument("--device", default="cuda")
    args = ap.parse_args()

    docs = json.loads((ROOT / "config/router-manifest.json").read_text(encoding="utf-8"))["skillDocs"]
    names = list(docs)
    cases = load_cases(args.corpus)[: args.limit or None]
    score = build_scorer(args.model, args.device)

    rows = []
    for i, c in enumerate(cases):
        t0 = time.time()
        texts = [f"{k}: {(docs[k].get('description') or '')[:160]}" for k in names]
        scores = dict(zip(names, score(c["query"], texts)))
        ranked = sorted(scores.items(), key=lambda x: -x[1])
        exp = c.get("expect", {})
        want = set(exp.get("skills", [])) | set(exp.get("anySkills", []))
        oos = exp.get("domain") == "none" or exp.get("action") == "handoff"
        band = exp.get("band")
        row = {
            "id": c["id"], "oos": oos, "expect": sorted(want),
            "top1": ranked[0][0], "top1_hit": (ranked[0][0] in want) if want else None,
            "top3": [k for k, _ in ranked[:3]],
            "hit3": bool(set(k for k, _ in ranked[:3]) & want) if want else None,
            "top1_score": round(ranked[0][1], 4), "max_score": round(ranked[0][1], 4),
            "ms": round((time.time() - t0) * 1000),
        }
        if band:
            row["band"] = band
            row["band_hit"] = band[0] <= row["top1_score"] <= band[1]
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
        "backend": MODELS[args.model], "n": len(rows),
        "in_top1": f"{sum(1 for r in ins if r['top1_hit'])}/{len(ins)}",
        "in_top3": f"{sum(1 for r in ins if r['hit3'])}/{len(ins)}",
        "in_score_mean": round(sum(r["top1_score"] for r in ins) / max(len(ins), 1), 3),
        "oos_score_mean": round(sum(r["top1_score"] for r in oos) / max(len(oos), 1), 3),
        "band": f"{sum(1 for r in rows if r.get('band_hit'))}/{sum(1 for r in rows if 'band' in r)}",
        "ms_p50": lat[len(lat) // 2] if lat else 0,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
