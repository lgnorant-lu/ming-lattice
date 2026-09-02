---
name: sec-core-paradigm
description: Cross-scene security meta-rules for untrusted input, least privilege, credential hygiene, and agent-skill supply chain. Use when reviewing authz, path traversal, injection, skill install trust, registry pinning, or sandbox side effects. Triggers include application-security, OWASP, ASVS, AST10, agentic-skills, supply-chain, 安全, 最小权限, 供应链, 不可信输入.
metadata:
  layer: security
  compose: overlay-on-testing
---

# Sec Core Paradigm — 跨场景安全元规则

分两层，不要混成百科：产品运行时安全，以及 Agent Skill 供应链。场景硬边界（ToS、靶场、反作弊、Isolate 物理）只在场景差页，不进下列禁令正文。

## 1. 产品运行时

- 划分信任边界。不可信数据先规范化再校验；**允许名单优于拒绝名单**。
- 数据与命令分离：能参数化就不拼解释器；能不调 OS 命令就不调。
- 校验在可信侧。路径规范化，拒绝 `..` 逃出允许根。
- 错误对外结构化，不泄漏内部路径与堆栈当默认 API。
- 凭据不进仓库、日志、Golden、prompt、宽事件。

## 2. Agent Skill 供应链（AST 官方编号，禁止串义）

| ID | 官方名称 | 本层要求 |
|---|---|---|
| AST01 | Malicious Skills | 来源可盘点，不执行未知包副作用 |
| AST02 | Supply Chain Compromise | 版本/提交钉死，单一 registry 事实源 |
| AST03 | Over-Privileged Skills | 最小工具权限；副作用白名单 |
| AST04 | Insecure Metadata | frontmatter 可校验，不信未签名搜索文案 |
| AST05 | Untrusted External Instructions | 外部说明书钉版本或内联，禁止运行时拉取可变远程正文当指令 |
| AST06 | Weak Isolation | 决策内核零写盘；非授权域不建工单 |
| AST07 | Update Drift | 同步以仓库事实源为准，检测漂移 |
| AST08 | Poor Scanning | 有门禁（结构/密钥/测试），扫描不是替代威胁列表 |
| AST09 | No Governance | 谁能启用包、谁能改 registry 可回答 |
| AST10 | Cross-Platform Reuse | 核心纯函数，壳只翻译；不假设某一 Harness 的 slash |

ASVS 5.0 当产品需求索引，不把条款抄进正文。Web Top 10 只做意识。

## 3. 跨场景禁令

1. **[禁止] 把用户字节拼进 shell / SQL / eval**
2. **[禁止] Agent 默认全盘或全网权限**
3. **[禁止] 未钉死的远程说明书当 Skill 正文**
4. **[禁止] 用「跑过扫描」代替威胁列表与负向测试**
5. **[禁止] 把 ToS、靶场授权、反外挂、UAF 物理写进本元包** — 那些是场景包

安全在契约之前：未知 **字段** 可忽略；未知 **命令** 不可执行。

## 4. Oracle

- 畸形输入 → 结构化拒绝或安全失败，不崩溃、不写到允许路径之外。
- 无授权场景下网络与样本不可达（由场景包落实）。
- Skill 安装物可列出 name、版本、来源。
- 测试：fuzz / 路径穿越负例 / 注入负例；不断言内部私有 helper。

## 5. Compose

```
sec-core-paradigm
+ 场景差页（硬边界）
+ testing-core-oracle（fuzz、不可信输入失败可见）
+ obs-core-paradigm（脱敏；事件不含密钥）
```
