---
name: xbs-ast-deobfuscation
description: AST 反混淆流水线（可运行脚本 + 站点混淆家族专档: reese84/顶象/极验4/网易易盾/同花顺/小红书等）。适用于混淆 JS 还原。
---

# AST 反混淆

优先使用分层入口，而不是继续把站点特有逻辑堆进通用脚本。

## 工作流

1. 先运行 `scripts/detect-patterns.js <input.js> [hint]` 做模式检测。
2. 只读取命中的站点或混淆家族规则文档。
3. 运行 `scripts/run-pipeline.js <input.js> <output-dir> [hint]` 执行选中的流水线。
4. 对照参考产物或原始混淆症状，判断是否还需要新增专用适配脚本。

## 设计规则

- 通用脚本只保留低风险、可复用的改写，例如结构标准化、虚假分支清理、dispatcher 内联、控制流拍平和 `if -> switch`。
- 一旦某个模式明显是站点特有的，就同时补齐四部分：规则文档、检测器命中项、专用适配脚本、流水线配置项。
- 对于高开销步骤，优先按家族跳过或重排，不要强行要求所有样本走同一套顺序。像 `reese84` 这种大样本，如果太晚执行 `inline-literals`，很容易卡住。
- 专用适配脚本应当保持窄而准。如果某条规则没有在多个无关样本中复用，不要急着回灌到通用脚本。
- 结构性改写后要重新 parse，并保证每一阶段都可以独立运行和排查。

## 入口脚本

- `scripts/detect-patterns.js`
  根据文件路径、可选 hint 和源码症状判断最可能命中的站点或混淆家族。
- `scripts/run-pipeline.js`
  把样本复制到测试目录，执行选中的步骤，记录耗时并输出流水线报告。
- `scripts/collect-residue-metrics.js`
  统计仍未解开的症状，例如 `split('|')`、直接 `loop/switch` 平坦化、opcode `if` 链、dispatcher wrapper 和 `_0x` 标识符。
- `scripts/compare-with-reference.js`
  将最新流水线输出与 `decode.js` 对比，汇总剩余差距。

## 参考文档

- 新增或调整适配器时，先读 `references/pattern-layering.md`。
- 任何逻辑想放进通用脚本前，先读 `references/safe-rewrite-rules.md`。
- 处理字符串表、解码 stub、最小运行时求值时，读 `references/string-array-and-minimal-eval.md`。
- 处理控制流平坦化、opcode 分发器和 VM 类 handler 时，读 `references/control-flow-and-opcode-patterns.md`。
- 处理逗号表达式、IIFE、语句提升时，读 `references/sequence-normalization.md`。
- 检测器命中后，只读取对应的一份站点规则文档：
  - `references/patterns/reese84.md`
  - `references/patterns/dingxiang.md`
  - `references/patterns/geetest4.md`
  - `references/patterns/tonghuashun.md`
  - `references/patterns/yidun.md`
  - `references/patterns/xiaohongshu.md`
  - `references/patterns/cn-bidding-ob.md`
  - `references/patterns/mps-ob.md`

## 校验

- 每个新增或改过的 JavaScript 辅助脚本，在接入流水线前都要至少过一次 `node --check` 或等价的加载校验。
- 修改 skill 后，运行 `%USERPROFILE%\\.codex\\skills.codex\skills\.system\skill-creator\scripts\quick_validate.py %USERPROFILE%\\.codex\\skills.codex\skills\ast-deobfuscation`。
- 测试案例时，把中间产物、检测结果、对比结果和流水线耗时都保留在案例目录里，方便定位慢步骤和失败步骤。



