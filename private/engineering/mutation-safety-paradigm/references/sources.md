# sources — mutation-safety-paradigm 外部参照索引

## 已纳入参照（机制萃取源）

| 参照 | 萃取点 | 出处 |
|---|---|---|
| kubectl `--dry-run=client\|server\|none`（KEP-576） | 保真度分档——preview 不是布尔是"走多深"的枚举 | kubernetes/enhancements KEP-576 |
| Ansible `--check`+`--diff`+per-task `check_mode:` | 检查与 diff 正交旋钮；步骤粒度覆盖 | docs.ansible.com check_mode |
| Terraform `plan -out` → `apply planfile` | plan 产物化——preview 可序列化成可审阅/可传递凭证 | terraform.io plan |
| modular_cli_sdk ADR-0002 preview_executor | preview 是独立方法非 dryRun 旗标——命令=步骤序列每步先声明，executor 对声明问责；手搓 preview 三形态全漂移 | 项目内 ADR（提案 §1 实证） |
| CLI Spec v0.3 变更类三轴 | `read_only`/`idempotent`/`non_idempotent` 自我声明——agent 消费面可重试性契约 | CLI Spec v0.3 |

## 本仓落地形态表（L0-L5 在位件）

| 档 | 在位件 | 形态 |
|---|---|---|
| L0 | 门禁引擎 check/ci、lint.ps1 | 纯扫描 |
| L0.5 | `build-router-manifest --check`、supply-chain `--check` | 只校验不写 |
| L1 | `sync.ps1 -WhatIf`、`update.ps1 -DryRun`、`run fix --dry-run`（ctx.dryRun 惯例）、`baseline --dry-run`、`install-hooks.ps1 -WhatIf`（SupportsShouldProcess+hooksPath 防顶）、`build-deployable.ps1`/`patch-deployable.ps1` ShouldProcess | 同路径 preview |
| L1 架构级 | chores 族（post-merge suggest-only 恒驻） | 物理无执行路径 |
| L4 | sync.ps1 `is_dry_run` 事件字段 | 变更留痕 |

## 明确不纳入

- **L2 plan-artifact 预建**：无真实 CI/跨人审阅消费方——本仓 sync -WhatIf
  文本已满足预览需求（提案 §6 裁决为过度设计）
- **diff 级 dry-run 输出**：文件清单级够用，Ansible --diff 逐行等显式需求
- **一次性历史脚本补 flag**：`fix-pins.ps1`/`register-*.ps1` 是已完成操作
  的存档，补 flag 是噪音——只补活着的可重复工具
- **宿主既有确认机制重复造**：git push --force 类等宿主已有 guard 的面
  不再加层

## 晋升谱系

- 提案：`distill/_proposals/2026-09-20-mutation-safety-paradigm.md`
  （L0-L5 阶梯 + 三戒律 + 三正交轴 + 本仓审计表——升格判据①②达成后转正）
