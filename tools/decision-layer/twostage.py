"""两段式决策 spike——生产形态：域级 noul 收敛 → 域内 choice。

Stage1: 一次请求 5 个域 noul + in_scope 门。域 noul >= tau_dom 的域并集其 skills
        作为短名单；无域过阈 → 直接弃权（NONE）。
Stage2: 短名单 + NONE 跑一次 choice。选中 NONE 视为弃权。

对应生产管线：BM25F/域提示召回 → 短名单 → 决策层精排。
语料：adversarial-corpus.jsonl + c-tier（难例层）。

用法：python twostage.py [--tau-dom 0.5] [--corpus adversarial-corpus.jsonl] [--limit N] [--out X.jsonl]
"""
import argparse, json, sys, time, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NONE_KEY = "__NONE__"
NONE_DESC = "以上技能均不匹配该请求"


def load():
    m = json.loads((ROOT / "config/router-manifest.json").read_text(encoding="utf-8"))
    domains = {k: v["skills"] for k, v in m["domains"].items()}
    dom_desc = {k: v["description"] for k, v in m["domains"].items()}
    docs = m["skillDocs"]
    return domains, dom_desc, docs


def post(base_url, state, questions):
    body = json.dumps({"model": "kev-latest", "state": state, "questions": questions}).encode()
    req = urllib.request.Request(f"{base_url}/v1/systemone", data=body, headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as resp:
        r = json.loads(resp.read())
    post.last_server_ms = r.get("latency_ms")
    return r["answers"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default="http://127.0.0.1:8009")
    ap.add_argument("--tau-dom", type=float, default=0.5)
    ap.add_argument("--tau-scope", type=float, default=0.5)
    ap.add_argument("--corpus", default="adversarial-corpus.jsonl")
    ap.add_argument("--stage2", choices=["choice", "noul"], default="choice")
    ap.add_argument("--tau-pick", type=float, default=0.5, help="stage2=noul 时的入选阈值")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--out", default="")
    args = ap.parse_args()

    domains, dom_desc, docs = load()
    if args.corpus == "c-tier":
        files = [ROOT / "tests/evals/recall-corpus/c-tier.jsonl"]
    elif args.corpus == "all":
        files = [Path("adversarial-corpus.jsonl")] + sorted((ROOT / "tests/evals/recall-corpus").glob("*.jsonl"))
    else:
        files = [Path(args.corpus)]
    cases = [json.loads(l) for f in files for l in f.read_text(encoding="utf-8").splitlines() if l.strip()]
    cases = cases[: args.limit or None]

    out_f = open(args.out, "w", encoding="utf-8") if args.out else None
    rows = []
    for i, c in enumerate(cases):
        t0 = time.time()
        srv_ms = 0.0
        # ---- stage 1: domain noul + scope gate ----
        qs = {f"d_{k}": {"type": "noul", "instructions": f"该请求是否属于「{dom_desc[k]}」领域？"} for k in domains}
        qs["in_scope"] = {"type": "noul", "instructions": "该请求是否需要调用某个专业技术技能包来处理？（vs 闲聊/通用问答/超出技能库覆盖）"}
        a1 = post(args.base_url, c["query"], qs)
        srv_ms += post.last_server_ms or 0
        scope = a1["in_scope"]["noul"]
        hit_doms = [k[2:] for k, v in a1.items() if k.startswith("d_") and v["noul"] >= args.tau_dom]
        short = sorted({s for d in hit_doms for s in domains[d]})

        # ---- stage 2: choice / noul within shortlist ----
        picked = NONE_KEY
        top1_prob = 0.0
        if scope >= args.tau_scope and short:
            if args.stage2 == "choice":
                opts = {s: (docs[s].get("description") or s)[:160] for s in short}
                opts[NONE_KEY] = NONE_DESC
                a2 = post(args.base_url, c["query"], {
                    "pick": {"type": "choice", "instructions": "选择最适合处理该请求的技能；若无合适选 __NONE__", "criteria": opts}
                })
                srv_ms += post.last_server_ms or 0
                ch = a2["pick"]["probabilities"]
                picked = max(ch, key=ch.get)
                top1_prob = ch[picked]
            else:
                a2 = post(args.base_url, c["query"], {
                    f"s_{s}": {"type": "noul", "instructions": f"技能 {s}（{(docs[s].get('description') or '')[:120]}）是否适合处理该请求？"}
                    for s in short
                })
                srv_ms += post.last_server_ms or 0
                over = {k[2:]: v["noul"] for k, v in a2.items() if v["noul"] >= args.tau_pick}
                if over:
                    picked = max(over, key=over.get)
                    top1_prob = over[picked]

        exp = c.get("expect", {})
        want = set(exp.get("skills", [])) | set(exp.get("anySkills", []))
        want_dom = exp.get("domain")
        oos = want_dom == "none" or exp.get("action") == "handoff"
        row = {
            "id": c["id"], "oos": oos, "expect": sorted(want), "expect_domain": want_dom,
            "scope": round(scope, 3), "doms": {k: round(a1[f"d_{k}"]["noul"], 3) for k in domains},
            "hit_doms": hit_doms, "short_n": len(short), "picked": picked,
            "top1_prob": round(top1_prob, 3),
            "hit": (picked in want) if want else None,
            "abstain_ok": (picked == NONE_KEY) if oos else None,
            "dom_hit": (want_dom in hit_doms) if (want_dom and want_dom != "none") else None,
            "ms": round((time.time() - t0) * 1000), "srv_ms": round(srv_ms),
        }
        rows.append(row)
        mark = "OOS" if oos else ("OK" if row["hit"] else ("DOM~" if row["dom_hit"] else "MISS"))
        print(f"[{i+1}/{len(cases)}] {c['id']} {mark} doms={hit_doms} short={len(short)} pick={picked}({row['top1_prob']}) {row['ms']}ms", file=sys.stderr, flush=True)
        if out_f:
            out_f.write(json.dumps(row, ensure_ascii=False) + "\n")
            out_f.flush()

    ins = [r for r in rows if not r["oos"]]
    oos = [r for r in rows if r["oos"]]
    lat = sorted(r["ms"] for r in rows)
    summary = {
        "backend": "kev-twostage", "tau_dom": args.tau_dom, "tau_scope": args.tau_scope,
        "n": len(rows), "in_scope": len(ins), "oos": len(oos),
        "dom_hit": f"{sum(1 for r in ins if r['dom_hit'])}/{sum(1 for r in ins if r['dom_hit'] is not None)}",
        "skill_hit": f"{sum(1 for r in ins if r['hit'])}/{len(ins)}",
        "abstain_ok": f"{sum(1 for r in oos if r['abstain_ok'])}/{len(oos)}",
        "short_mean": round(sum(r["short_n"] for r in ins) / max(len(ins), 1), 1),
        "ms_p50": lat[len(lat) // 2], "ms_p95": lat[int(len(lat) * 0.95) - 1],
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    if out_f:
        out_f.close()
        print(f"# wrote {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
