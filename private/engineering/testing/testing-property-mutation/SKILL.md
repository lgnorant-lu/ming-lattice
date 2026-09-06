---
name: testing-property-mutation
description: 基于性质与变异测试规范（Testing Property & Mutation）：超越手写固定用例，利用形式化不变量（对称性、幂等性、单调性、守恒性）生成海量随机输入验证系统边界；利用代码变异分析（cargo-mutants、mutmut、stryker）审计测试套件的真正缺陷杀伤力与存活变异体。触发词：property-testing, mutation-testing, hypothesis, proptest, cargo-mutants, invariants-testing.
---

# Testing Property & Mutation — 性质驱动与变异证伪

> **核心哲学**：手写测试用例往往受限于开发者自身的思维盲区（只测自己想到的案例）。
> **Property-Based Testing** 逼你在写测试前先声明不变量（Invariants），再让生成器自动寻找反例；
> **Mutation Testing** 故意破坏生产代码看测试会不会变红，回答「测试套件的杀伤力到底有多大」。

---

## 1. 形式化不变量设计（Property Invariants）

在针对纯算法、解析器、编解码器、数据结构或协议处理编写测试时，优先提取以下 4 类数学不变量：

### 1. 对称往返律（Round-Trip Invariant）
- **公式**：`decode(encode(x)) == x` 或 `decompress(compress(bytes)) == bytes`
- **适用场景**：序列化/反序列化、AST 转换、加密/解密、跨语言结构转换。
- **边界**：两端共享错误或都返回原值也可能满足往返律。配合独立标准向量、单向期望或领域约束；有损转换比较规范化后的等价结果，不强求原字节相等。

### 2. 幂等律（Idempotence Invariant）
- **公式**：`apply(apply(state, action), action) == apply(state, action)`
- **适用场景**：数据清洗、格式化工具、配置应用、补丁加载。

### 3. 单调性与守恒律（Monotonicity & Conservation）
- **公式**：
  - 单调性：输入集合扩大时，计数 >= 之前计数；时间戳单调递增。
  - 守恒性：转账/分片后，总和守恒；过滤后元素必是原集合子集。
- **适用场景**：聚合计算、分词统计、数据流过滤。

### 4. 崩溃免疫与合法错误律（Crash-Free & Error Handling）
- **公式**：任意生成字节流可能有效也可能无效；有效输入满足结果不变量，无效输入按公开契约拒绝。不得 Panic、越界或泄漏资源，也不能把“全部拒绝输入”的实现当作正确解析器。

### 生成器与失败解释

- 尽量直接生成有效域和明确无效域，避免 `assume` 过滤掉几乎全部样本形成空真。
- 保存种子、工具版本、缩减后的最小反例；回归固定反例，探索允许新种子。
- 失败后先判断是性质不成立、生成器越界还是实现错误；不要直接修改实现迎合错误性质。

---

## 2. 跨语言性质测试工具栈

| 语言 | 推荐工具库 | 核心用法与模式 |
|---|---|---|
| **Rust** | `proptest` / `quickcheck` | `proptest! { #[test] fn test_roundtrip(val in any::<MyStruct>()) { ... } }` |
| **Python** | `Hypothesis` | `@given(st.text(), st.integers()) def test_property(txt, num): ...` |
| **JS / TS** | `fast-check` | `fc.assert(fc.property(fc.string(), str => { ... }))` |

---

## 3. 变异测试（Mutation Testing）：测试测试本身

覆盖率 100% 无法证明断言有效。变异测试（Mutation Testing）通过故意注入代码故障来诊断测试套件的杀伤力：**存活变异体（Survived Mutants）是复查盲区的审查清单，杀伤率用于质量诊断而非机械的阻断门禁**。

### 核心机制：
1. **变异算子（Mutators）注入**：自动化工具故意篡改生产代码（例如将 `+` 改为 `-`，将 `>` 改为 `<`，将 `if (cond)` 改为 `if (true)`，或删掉某行）。
2. **运行测试套件**：
   - 若测试失败（Red） -> 该变异被**击杀（Killed）**，测试有效；
   - 若测试仍全部通过（Green） -> 产生**存活变异体（Survived Mutant）**，暴露测试盲区。

### 工具链：
- **Rust**：`cargo-mutants`（针对 Rust 语法树进行语义变异，零依赖生成存活报告）。
- **Python**：`mutmut` / `cosmic-ray`。
- **JS / TS**：`stryker`。

### 诊断行动指南：
- 审查存活报告中的变异代码行：
  - 若该分支包含关键业务逻辑 -> 补写针对该条件的显式断言；
  - 若变异等价、未覆盖、无法编译或运行超时 -> 分别标注，人工复查；存活不自动意味着生产代码该删除。
