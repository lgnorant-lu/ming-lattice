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

### 2. 幂等律（Idempotence Invariant）
- **公式**：`apply(apply(state, action), action) == apply(state, action)`
- **适用场景**：数据清洗、格式化工具、配置应用、补丁加载。

### 3. 单调性与守恒律（Monotonicity & Conservation）
- **公式**：
  - 单调性：输入集合扩大时，计数 >= 之前计数；时间戳单调递增。
  - 守恒性：转账/分片后，总和守恒；过滤后元素必是原集合子集。
- **适用场景**：聚合计算、分词统计、数据流过滤。

### 4. 崩溃免疫与合法错误律（Crash-Free & Error Handling）
- **公式**：对任意随机畸形字节流 `raw_bytes`，`parse(raw_bytes)` 必须返回合法的 `Err(ParseError)`，**[禁止] 严禁发生 Panic、内存越界或未捕获异常**。

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
  - 若该变异为无意义的冗余代码 -> 简化或删除生产代码中的死逻辑。
