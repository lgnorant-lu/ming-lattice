---
name: overlay-core-paradigm
description: Cross-scene quality overlays for performance, privacy, resilience, cost/context, portability, and accessibility. Use when a feature is correct but slow, leaky, brittle, expensive to load, or unusable across OS/harness. Triggers include performance-overlay, privacy, resilience, idempotence, context-economy, portability, accessibility, 性能横切, 隐私, 韧性, 上下文成本, 可移植.
metadata:
  layer: quality-overlay
  compose: overlay-on-testing
---

# Overlay Core Paradigm — B 级横切不变量

这些不是第二套测试族。功能对了仍可能慢、漏、脆、贵、绑死一端。本包把六条 Overlay 收在一处。出现第二种物理失败（真帧超时、真账不平）再场景加厚，不要在这里开独立 11 包。

始终叠在已有测试组合上，不替换 Oracle。

## 0. 何时立项就带 vs 以后再加

| Overlay | 标准形态（立项默认） | 加厚条件 |
|---|---|---|
| 性能 | 禁功能测试墙钟；锁阶数/分配/热路径同步扫盘 | 实时帧预算、计费热路径、容量规划 |
| 隐私 | Golden/日志/prompt 无密钥无 PII | 真实用户数据、删除权、分区 |
| 韧性 | 超时上限、幂等、半成品不落盘 | 错误预算、多活、混沌 |
| 成本 | 默认只加载 recipe 正文；名单廉价 | Skill 很多且上下文爆、Token 门禁 |
| 兼容 | 纯核心 + 薄壳 | 多 OS/多 Harness 矩阵 CI |
| 无障碍 | CLI 错误可读；Skill description 能被匹配 | 面向终端用户的 UI a11y |

## 1. 性能

- 功能测试 **禁止** `elapsed < N ms`。
- 锁算法阶数、分配是否随 N 无界、热路径是否同步扫全仓/全网。
- 墙钟只进独立基准任务，要能说出限制因素（CPU/IO/锁），高方差不当红绿。
- **场景改写：** 游戏/实时里帧预算可以是产品 Oracle；那是场景包，不是把「禁绝对值」从元层删掉。

## 2. 隐私

- 最小必要。fixture、宽事件、ADR 附件、prompt 默认无密钥、无完整用户句、无证件号。
- 能哈希或截断就不要原文。生产 fixture 进仓库前过一遍脱敏。
- 与安全重叠但禁令不同：安全说别路径穿越；隐私说别把用户内容提交进 git。

## 3. 韧性

- 超时有上限；重试有上限与抖动，禁止测试里真 `sleep` 等网。
- 写盘幂等：先临时文件再原子改名；中断不留半成品。
- 降级显式：失败返回结构化错误或 `handoff`，不假装成功。
- 崩溃免疫：任意畸形输入不未捕获崩溃（与测试 crash-free 重叠，此处强调 IO/杀进程）。

## 4. 成本 / 上下文

- `candidates` 是名字清单；默认 `load` 的正文 ⊆ `active_recipe`。
- 禁止为召回把 11 份 SKILL 全文灌进一轮会话。
- CI 默认套件必须秒级；重基准与全仓 lint 放门禁而非每次保存。

## 5. 兼容 / 可移植

- 行为在纯函数核心；壳只透传参数与退出码。
- 禁止第三套脆弱运行时（如 Cmd/GBK）复制业务逻辑。
- 路径、换行、时钟、locale 必须可注入或与墙钟/本机路径脱钩。

## 6. 无障碍 / 可操作

- 对人：错误码 + 短原因；help 与契约同源。
- 对 Agent：description 含何时用与何时不用（负向）；名称稳定。
- 终端 UI 产品：焦点、对比度、触控目标 — 只在真有 UI 场景加厚。

## 7. 禁令（横切总表）

1. **[禁止]** 功能测试断言绝对墙钟或绝对 RSS。
2. **[禁止]** 把密钥、完整 prompt、未脱敏 PII 写入仓库或事件。
3. **[禁止]** 无限重试、无超时、失败却留下半截文件。
4. **[禁止]** 默认加载整族 Skill 正文。
5. **[禁止]** 在壳脚本里复制核心逻辑。
6. **[禁止]** 用本包替代测试 Oracle 或场景物理事实。

## 8. Oracle

- 性能：N 增大时分配/次数符合声称阶数，或基准相对基线回归可解释。
- 隐私：夹具与事件样本可扫描无密钥模式。
- 韧性：杀进程/插错后目标路径无半成品；重入结果幂等。
- 成本：适配器 `loadedSkillBodies ⊆ recipe.skills`。
- 兼容：同一核心在 POSIX 与 pwsh 退出码一致。

## 9. Compose

```
testing-core-oracle + 1 场景 + 1 语言 + 1 工作流
+ 按需 A 列（docs | obs | sec | contract）
+ overlay-core-paradigm（本包，整份或只读相关节）
+ 本包 scenes/<scene>.md
```

C 级（逆向授权、爬虫 ToS、游戏锁步、FFI Isolate 物理、账务守恒）**不要**从本包长出来，只在场景测试包。
