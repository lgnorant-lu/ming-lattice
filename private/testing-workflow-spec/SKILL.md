---
name: testing-workflow-spec
description: 规格驱动开发工作流（Testing Workflow Spec-Driven & BDD）：适用于绿场开发、含糊需求与新接口契约设计。定义从业务意图提炼可判定行为清单（Given/When/Then）、先写失败验收用例（kind: spec）再写实现的门禁流程，以及与外部 TDD 驱动司机（Matt Pocock tdd vs Obra test-driven-development）的互斥协同协议。触发词：spec-driven, bdd-workflow, acceptance-test, test-first, given-when-then, spec-test.
---

# Testing Workflow: Spec-Driven & BDD — 意图驱动与验收先行

> **核心哲学**：模型与开发者不会读心。规格（Spec）是可执行的意图契约。
> 绿场开发中，必须在编写生产代码之前，先将需求固化为可运行、可判定的失败验收用例（Acceptance Tests，标记为 `kind: "spec"`），以验收用例作为实现的唯一真理源。

---

## 1. 适用场景与阶段划分

- **适用场景**：新功能开发（0 到 1）、含糊需求澄清、跨语言/跨模块公共接口契约设计。
- **与棕场/重构的区别**：本工作流用于**无既有实现或需求即将发生质变**的绿场；遗留代码重构请使用 `testing-workflow-characterize`。

---

## 2. 标准工作流（5 步闭环）

```
1. 提取意图规格 (Spec) -> 2. 编写失败验收 (BDD) -> 3. 极简实现到绿 -> 4. 结构与行为分离重构 -> 5. 闭环验证
```

### 步骤一：规格化清单（Specifying Invariants & Behaviors）
在动手编码前，必须输出一份简短的**行为清单**，包含：
1. **公开行为契约**：使用 `Given [前置条件] / When [动作/输入] / Then [预期可观察结果]`。
2. **明确的非目标（Non-Goals）**：声明哪些边界在本阶段不予支持，防止 AI 产生过度设计。
3. **失败模式契约**：明确各类异常情况下的特定错误类型或错误码。

### 步骤二：验收测试先行（Executable Acceptance）
- 将上述行为清单直接转化为可运行的测试代码，并在测试数据中标记 `kind: "spec"`。
- **门禁要求**：运行该测试，**必须确认其因缺少实现而失败（Red）**。严禁在未见证测试失败的情况下直接写实现代码。

### 步骤三：极简实现让测试变绿（Make it Green）
- 编写满足该测试的**最少生产代码**。
- 不在此阶段提前构思未来可能需要的复杂架构，只以让当前验收通过为目标。

### 步骤四：分离重构（Tidy First）
- 遵循 Kent Beck 的分离法则：**重构代码结构时绝不改变外部行为；增加新功能时绝不顺便重构结构**。
- 重构过程中，既有验收测试必须全程保持绿色。

### 步骤五：闭环审计
- 检查是否存在「只为覆盖率而写的无断言测试」。
- 检查断言值是否来自需求规格，而非照抄实现代码的临时返回值。

---

## 3. 外部 TDD 司机协同协议（Driver Selection & Mutex）

当需要更细粒度的「小步红绿重构」循环时，可以联动外部成熟的 TDD Skill。**必须严格执行二选一，严禁同时加载**：

| 外部 TDD 司机 | 核心侧重 | 选用场景 |
|---|---|---|
| **Matt Pocock `tdd`** (`mattpocock/skills`) | 垂直切片（Vertical Slice）、聚焦公开 Seam 契约、反实现细节绑定 | 适用于模块边界设计、Web/API 服务、组件交互开发 |
| **Obra `test-driven-development`** (`obra/superpowers`) | 强流程门禁（Strict Discipline）、无失败测试严禁写实现、先写实现必须删除 | 适用于核心算法、高风险状态机、严格防偷跑场景 |

### [警告] 协同约束：
- 在同一 Agent 对话或开发任务中，**只能选择其中一个作为主执行司机**，避免双重流程提示词互相干扰。
