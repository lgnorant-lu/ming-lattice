---
name: mutation-safety-paradigm
description: 变更安全范式——凡会写状态的命令按 L0-L5 阶梯声明变更类（read_only/idempotent/non_idempotent）并提供保真 preview。当新增/改造 CLI 或脚本、设计 dry-run/WhatIf、评审"会不会静默改坏东西"、为 AI agent 消费面声明可重试性、审计存量无预览写命令时使用。触发词：dry-run、WhatIf、预览、变更安全、mutation safety、idempotent、幂等、confirm、回滚、plan artifact、SupportsShouldProcess、check_mode。不适用：纯查询命令设计（本来 read-only）、运行时业务代码异常处理。
metadata:
  layer: methodology
  compose: none
---

# mutation-safety-paradigm — 变更安全范式

## 1. 何时用 / 何时不用

- 适用：新增会写文件系统/registry/git 状态/远端资源的命令；给存量写命令补预览；
  设计支持 dry-run 的 CLI；评审某操作"执行前能否看见将发生什么"；
  为 agent/CI 消费面声明可重试性与安全边界；审计一批脚本里哪些裸奔
- 不适用：纯读命令（声明即 L0，无需本范式）；应用业务层的错误恢复
  （那是 obs/retry 域）；git push 等宿主既有确认机制的操作

## 2. 核心规程

### 2.1 变更安全阶梯 L0-L5——dry-run 只是其中一档

```
L0 read-only     永不写（verify/lint/check/plan）         —— 声明即保证
L1 preview       dry-run/WhatIf——同路径算变更集，不落盘    —— 主战场
L2 plan-artifact plan 序列化为文件，apply 消费（terraform）—— 审阅/审计/CI 传递
L3 confirm-gated 执行前显式确认（交互或 --yes）
L4 mutate+audit  执行 + 结构化事件日志（变更留痕可回溯）
L5 reversible    备份/回滚兜底
```

### 2.2 三条正交轴（设计 preview 时各自独立裁决）

| 轴 | 问什么 | 参照 |
|---|---|---|
| **保真度** | preview 与真实路径共享多少代码——client/server 分档（kubectl KEP-576），手搓平行 preview 必漂移是原罪 | KEP-576、modular_cli_sdk preview_executor |
| **变更类别** | 命令自我声明 `read_only`/`idempotent`/`non_idempotent`——消费方（含 AI agent）据此知能否安全重试 | CLI Spec v0.3 |
| **作用域覆盖** | 哪些步骤可 dry、哪些永不——per-task `check_mode` 粒度 | Ansible |

### 2.3 dry-run 三戒律（L1 档的硬契约）

1. **同路径**——preview 必须走与执行相同的遍历/计算代码（`ctx.dryRun`
   传入叶子写操作，或 plan-compute 与 execute 共享 planner）。
   禁止平行抄写第二遍逻辑——平行 preview 与真实路径必漂移
2. **输出同构**——dry-run 报告与真实执行格式一致（前缀标记区分），
   消费方同一 parser 可读
3. **零副作用**——连"看似无害"的写（缓存回写、mtime 触碰、git config
   改动）也不做；预览就是预览，回写状态=L4 的 audit 义务未履行

### 2.4 进阶档（按需进，不预建）

- **L2 plan-artifact**：真实 CI/跨人审阅消费方出现再建——文本预览已满足
  人读需求时，序列化计划文件是过度设计（本仓 sync -WhatIf 实证裁定）
- **per-step check_mode**：步骤粒度差异出现（有的恒可 dry、有的永不）再分层
- **-Confirm 交互档**：破坏性操作默认配——PS 原生 `SupportsShouldProcess`
  免费获得 `-WhatIf`+`-Confirm` 双档，优于手写 switch（手写只仿其一）

### 2.5 反向豁免——恒 L1 架构

suggest-only 模式（chores 族）证明"物理上无执行路径"比加 flag 更安全——
把 mutate 面从代码里移除，preview 即全部行为。**豁免件同理**：
存量不可达的孤儿命令/一次性历史脚本不补 flag（噪音非安全）。

## 3. 红线 / 边界

- [禁止] 平行 preview 路径——两套遍历逻辑必然漂移，preview 撒谎比没有更坏
- [禁止] dry-run 下任何写入——含缓存、mtime、git config、日志落盘
  （审计日志属 L4 义务，L1 只准读）
- [禁止] 手写 WhatIf 绕过原生协议——PowerShell 用 `SupportsShouldProcess`
  （免费 -Confirm + 生态认识），Node/Go/Rust 用 ctx.dryRun 惯例传参
- [警告] L0 声明须可证——自称 read-only 的命令被 review 抓到一次写路径
  即破契约；不确定就声明 idempotent 起步
- [警告] "孤儿命令"与一次性脚本不补 flag——补的是活着的可重复工具，
  历史存档加 preview 是噪音不是安全

## 4. Compose

- 与 `contract-core-paradigm` 的装配关系：变更类声明是命令面契约的
  演进轴（只加不收回——声明过 read_only 的命令不得静默变 mutable）
- 与 `review-core-paradigm` 的装配关系：变更安全是消融审计的标准切面
  （"砍掉 preview 会失去什么"=可证伪判据）
- 与 `obs-core-paradigm` 的装配关系：L4 变更事件走结构化遥测通道
  （`is_dry_run` 字段先例），preview 输出不进遥测

## 参考

- `references/sources.md` —— 外部参照系索引（kubectl KEP-576 / Ansible
  check_mode / Terraform plan / modular_cli_sdk preview_executor /
  CLI Spec v0.3 变更类三轴）
- `references/antipatterns.md` —— 反模式册（平行 preview/手写
  WhatIf/dry-run 写缓存）+ 本仓落地形态表（L0-L5 各档在位件清单）
