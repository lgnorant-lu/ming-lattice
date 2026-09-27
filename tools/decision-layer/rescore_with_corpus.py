"""按新语料口径重算历史 JSONL（零模型调用）——top1/top3 名字重映射到新 anySkills"""
import json, sys, glob
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CORPUS = ROOT / "tests/evals/recall-corpus"

def load_want():
    want = {}
    for f in list(CORPUS.glob("*.jsonl")) + [Path("adversarial-corpus.jsonl")]:
        for l in f.read_text(encoding="utf-8").splitlines():
            if not l.strip(): continue
            c = json.loads(l); e = c.get("expect", {})
            want[c["id"]] = set(e.get("skills", [])) | set(e.get("anySkills", []))
    return want

def rescore(path):
    want = load_want()
    rows = [json.loads(l) for l in open(path, encoding="utf-8")]
    ins = [r for r in rows if not r["oos"]]
    t1 = sum(1 for r in ins if r["top1"] in want.get(r["id"], set()))
    t3 = sum(1 for r in ins if set(r["top3"]) & want.get(r["id"], set()))
    print(f"{path}: top1 {t1}/{len(ins)}  top3 {t3}/{len(ins)}")

if __name__ == "__main__":
    for p in sys.argv[1:]:
        rescore(p)
