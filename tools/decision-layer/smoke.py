"""决策层 spike 烟测 — kev 服务端点 + laya 本地对照。

用法（两个后端均可独立跑）：
    .venv/Scripts/python.exe smoke.py --backend laya [--mode noul|choice]
    .venv/Scripts/python.exe smoke.py --backend kev --base-url http://127.0.0.1:8009 [--mode noul|choice]

样本形态 = 路由候选判断：state=用户 hint，criteria=技能名->description。
实测结论（2026-09-23）：laya-multilingual 的 choice 形态对本任务双侧失效
（无弃权项→越界假阳性；有弃权项→明确命中也弃权），noul-per-candidate
（每候选一个是非题并行）显著更稳，故默认 mode=noul。
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.request

# 路由形态烟测例：中文 hint + 共词干扰（渗透测试 vs 测试 式陷阱）
CASES = [
    {
        "state": "帮我把这个 pytest 的 fixture 作用域改成 module 级，顺便审一下参数化测试有没有漏边界",
        "expect": {"testing-python-idiom"},
    },
    {
        "state": "目标是授权渗透测试一个站点，先过 WAF/风控指纹对抗",
        "expect": {"antibot-fingerprint-paradigm", "reverse-skill-router"},
    },
    {
        "state": "这个 APK 要脱壳，帮我看看用了哪家加固",
        "expect": {"android-reverse"},
    },
    {
        "state": "今天中午吃什么好",
        "expect": set(),  # 越界：应全部低分
    },
]

CRITERIA = {
    "testing-python-idiom": "pytest fixture/parametrize 等 Python 单元测试规范",
    "testing-go-idiom": "Go 单元测试规范：表驱动测试、Fuzzing",
    "android-reverse": "APK 反编译、脱壳与 Frida hook 分析、渗透测试移动分析",
    "antibot-fingerprint-paradigm": "反爬指纹对抗：TLS 指纹、风控识别、渗透测试站点评测",
    "reverse-skill-router": "逆向/渗透任务的技能路由与规划",
    "ctf-crypto": "CTF 密码学题目求解",
}

INS_CHOICE = "用户这个请求最适合交给哪个技能包？只凭描述实质匹配，碰巧共词（比如“测试”）不算匹配。"
INS_NOUL = "该请求是否需要这个技能来处理？只凭描述实质匹配，碰巧共词不算。"

TAU = 0.5  # noul 判定阈值


def _noul_questions():
    return {
        f"fit_{k}": {"type": "noul", "instructions": f"{INS_NOUL}技能：{k} — {v}"}
        for k, v in CRITERIA.items()
    }


def _score_noul(answers):
    """-> (picked:set, scores:dict)"""
    scores = {k[4:]: v["noul"] for k, v in answers.items()}
    return {k for k, s in scores.items() if s >= TAU}, scores


def _verdict(picked, expect):
    if not expect:
        return "OK(abstain)" if not picked else f"FP:{picked}"
    if not picked:
        return "MISS(abstain)"
    return "OK" if picked & expect else f"WRONG:{picked}"


def run_laya(mode: str):
    import laya

    agent = laya.load("convaiinnovations/laya", subfolder="multilingual")
    ok = 0
    for c in CASES:
        t0 = time.time()
        if mode == "choice":
            r = agent.predict(c["state"], {"skill": {"type": "choice", "instructions": INS_CHOICE, "criteria": CRITERIA}})
            a = r["answers"]["skill"]
            picked, top, prob = {a["choice"]}, a["choice"], a["probabilities"][a["choice"]]
        else:
            r = agent.predict(c["state"], _noul_questions())
            picked, _ = _score_noul(r["answers"])
            top = max((v for v in r["answers"].values()), key=lambda v: v["noul"])
            prob = top["noul"]
        hit = _verdict(picked, c["expect"])
        ok += hit.startswith("OK")
        print(f"[laya:{mode}] picked={sorted(picked)} top_p={prob:.3f} expect={sorted(c['expect'])} {hit} {time.time()-t0:.2f}s")
    print(f"laya/{mode}: {ok}/{len(CASES)}")


def run_kev(base_url: str, mode: str):
    ok = 0
    for c in CASES:
        if mode == "choice":
            questions = {"skill": {"type": "choice", "instructions": INS_CHOICE, "criteria": CRITERIA}}
        else:
            questions = _noul_questions()
        body = {"model": "kev-latest", "state": c["state"], "questions": questions}
        t0 = time.time()
        req = urllib.request.Request(
            f"{base_url}/v1/systemone",
            data=json.dumps(body).encode(),
            headers={"content-type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=300) as resp:
            answers = json.loads(resp.read())["answers"]
        if mode == "choice":
            a = answers["skill"]
            picked, prob = {a["choice"]}, a["probabilities"][a["choice"]]
        else:
            picked, _ = _score_noul(answers)
            prob = max(v["noul"] for v in answers.values())
        hit = _verdict(picked, c["expect"])
        ok += hit.startswith("OK")
        print(f"[kev:{mode}] picked={sorted(picked)} top_p={prob:.3f} expect={sorted(c['expect'])} {hit} {time.time()-t0:.1f}s")
    print(f"kev/{mode}: {ok}/{len(CASES)}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--backend", choices=["laya", "kev"], required=True)
    ap.add_argument("--mode", choices=["noul", "choice"], default="noul")
    ap.add_argument("--base-url", default="http://127.0.0.1:8009")
    args = ap.parse_args()
    if args.backend == "laya":
        run_laya(args.mode)
    else:
        run_kev(args.base_url, args.mode)
