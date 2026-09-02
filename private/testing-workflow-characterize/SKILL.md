---
name: testing-workflow-characterize
description: 表征测试与黄金样例工作流（Testing Workflow Characterization & Golden Master）：专用于棕场开发、遗留代码重构、JS 行为补丁迭代与跨语言重写。定义先抓取系统当前运行现状作为安全防护网（kind: characterize）、精确控制 Golden 边界、在防护网下重构并进行差异审计的标准工作流。触发词：characterization-test, golden-master, regression-lock, legacy-refactor, brownfield-testing.
---

# Testing Workflow: Characterization — 表征测试与现状锁定

> **核心哲学**：在面对没有文档或缺少测试的遗留代码、行为复杂的 JS 补丁或准备用新语言重写的老系统时，**代码现在的实际行为就是唯一的真实基线**。
> 表征测试（Characterization Test）的目的不是定义「系统应该怎么做」，而是给「系统现在在怎么做」装上安全护栏，防止在重构或迭代过程中破坏既有行为。

---

## 1. 适用场景与阶段划分

- **适用场景**：
  - 遗留老仓库使用 Rust/Go 进行语言层重写；
  - 复杂的 JS AST 反混淆/行为补丁进行逻辑重构或升级；
  - 缺少规范文档但已经在生产环境运行的老模块。
- **核心警告**：表征测试记录的是**现状（As-Is）**，而不是规范（To-Be）。若老代码本身存在历史 Bug，表征测试也会将其如实记录。重构完成后，必须显式区分「哪些是预期修复，哪些是意外回归」。

---

## 2. 标准工作流（4 步护栏法）

```
1. 捕获基线现状 (Capture) -> 2. 划定 Golden 边界 -> 3. 护栏下安全重构 -> 4. 差异审计与意图确认
```

### 步骤一：捕获基线现状（Capture Current Baseline）
- 准备覆盖典型、极端及边缘输入的输入测试集（Test Fixtures）。
- 对未修改的原始系统执行输入，完整记录其所有对外可观察的输出、副作用与状态变化。

### 步骤二：划定 Golden 边界（Precise Golden Scoping）
- **[禁止] 禁止全量盲目快照**：严禁无脑快照包含易变时间戳、临时文件路径、随机 UUID 或全量 1000 行源码文本。
- **提取稳定契约字段**：将输出提炼为结构化的 Golden JSON/YAML 文件，标记 `kind: "characterize"`，仅断言关心的核心计算结果、关键 AST 节点或协议字段。
- **命名规范**：测试函数必须显式标注 `test_characterization_*`，并在文件头部注释「此测试为现状锁定，变更时请核对 diff」。

### 步骤三：在护栏下执行重构（Refactor Under the Net）
- 无论重构内部数据结构、拆分函数还是用 Rust 重写，**在行为不应改变的重构阶段，现有表征测试必须 100% 保持绿色**。
- 一旦测试变红，立即停下排查是重构引起了非预期行为改变，还是接口发生了偏移。

### 步骤四：差异审计与意图确认（Intentional Diff Audit）
- 当重构的最终目标包括「修复老代码中的某个特定 Bug」时：
  1. 确认该失败正是由于 Bug 修复引起的；
  2. 显式更新该特定 Golden 样例，并在提交信息中记录「变更经过审查，系预期行为修正」。
