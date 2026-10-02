# 反模式册 — mutation-safety

收录"看起来在做 preview 实则埋雷"的形态。每条挂实证锚点。

## AP-1 平行 preview 路径

**形态**：`--dry-run` 分支里重写一遍遍历/计算逻辑，与真实执行路径并行存在。

**为什么坏**：两份代码必漂移——preview 报告的变更集与真实执行不一致，
用户据此放心执行的是另一套行为。**preview 撒谎比没有更坏**（modular_cli_sdk
ADR-0002 实证：三种自造预览——线程 dryRun bool/抄写循环/重复计算——全部
不受约束地与真实路径漂移）。

**正路**：preview 走同一代码路径，在叶子写操作处分流
（`ctx.dryRun` 传入写操作回调；或 plan-compute/execute 共享 planner）。

## AP-2 手写 WhatIf 绕过原生协议

**形态**：PS 里手写 `[switch]$WhatIf` 参数而非 `[CmdletBinding(SupportsShouldProcess)]`。

**为什么坏**：手写版只仿 `-WhatIf` 不送 `-Confirm`；生态工具（编辑器、
检查器、agent）不认识你的私有参数名——语义识别面断裂。

**正路**：`SupportsShouldProcess` 一次拿 `-WhatIf`+`-Confirm`+`$WhatIfPreference`
三档，零成本且协议标准。Node/Go/Rust 对应惯例=`ctx.dryRun` 传入参数，
不用全局 flag。

## AP-3 dry-run 仍写"无害"副作用

**形态**：preview 模式回写缓存、touch mtime、改 git config、"顺手"记一行日志。

**为什么坏**：L1 的契约是**零副作用**——任何写入都意味着 preview 本身
不可重放、可能污染后续 preview 的输入（缓存陈旧即此）。审计日志落盘
属 L4 义务——在 L1 档做它是层级错位。

**实证**：本仓 `update.ps1 -DryRun` 显式跳过 registry 回写——正确形态。

## AP-4 给一次性历史脚本补 flag

**形态**：把 `fix-pins.ps1` 这类内容硬编码、已完成其历史操作的存档脚本
加上 -WhatIf。

**为什么坏**：噪音不是安全——补 flag 暗示它还会被再跑，反而增大误调概率；
真需要复跑时环境已变，preview 也救不了。

**正路**：只补活着的可重复工具；历史存档的正确处置是**归档标记或删除**，
不是 flag。

## AP-5 孤儿命令不设 preview

**形态**：命令活着、会被调度，但没有任何 preview/confirm 面——事故案例：
`install-hooks.ps1 -Target` 静默重指 `core.hooksPath` 顶掉目标仓既有
门禁配置（blog-tui 采纳演练实证事故）。

**正路**：变更共享状态/被多处依赖的配置项前，preview + 冲突检测
（检测目标已有同类配置→无 -Force 拒绝静默覆盖）——install-hooks 修复
形态即"hooksPath 在位检测"先例。

## AP-6 变更类不声明

**形态**：命令文档不写 read_only/idempotent/non_idempotent，消费方只能
猜——agent 场景下"能不能重试"无解。

**正路**：变更类声明进命令文档/help 面（CLI Spec v0.3 三轴）；
自称 read-only 须可证——review 抓到一次写路径即破契约。
