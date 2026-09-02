---
name: testing-scenario-embed-ffi
description: 嵌入式与跨语言 FFI 场景测试规范（Testing Scenario Embed & FFI）：针对 Rust 内核、V8 引擎嵌入、JS 行为补丁以及 PyO3 胶水层的复杂边界场景。定义跨三端共享的单一真相测试数据集契约（Shared Testdata，显式标注 kind: spec | characterize）、分层精力预算启发式，并通过分册提供针对 v8-isolate、js-patch 和 pyo3 的具体失败模式与测试约束。触发词：v8-test, pyo3-test, js-patch-test, ffi-test, isolate-testing, embed-test.
---

# Testing Scenario: Embed & FFI — 嵌入式引擎与跨语言测试规范

> **适用场景**：Rust 内核 + V8 引擎嵌入（rusty_v8/自研封装）+ JS 行为补丁 + PyO3 Python 扩展绑定。
> **场景特征**：跨语言、跨运行时（Rust 内存安全与所有权 <-> V8 垃圾回收与事件循环 <-> Python GIL 与动态类型）、多重失败模式。

---

## 1. 架构拓扑与边界契约

本场景由四层严格切分的边界组成，每个边界具有独立的 Oracle 来源与失败模式：

```
                    ┌──────────────────────────────┐
                    │       JS Patch / 行为补丁     │
                    └──────────────┬───────────────┘
                                   │ 契约：状态差分、补丁语义
                                   ▼
                    ┌──────────────────────────────┐
                    │         V8 Isolate 宿主       │
                    └──────────────┬───────────────┘
                                   │ 契约：线程独占、隔离、生命周期、错误穿透
                                   ▼
                    ┌──────────────────────────────┐
                    │        Rust 核心引擎          │
                    │   (纯算法 / AST / 调度器)     │
                    └──────┬───────────────┬───────┘
                           │               │
        契约：类型转换、     │               │  契约：退出码、
        异常映射、GIL安全    │               │  幂等、IO隔离
                           ▼               ▼
                    ┌────────────┐   ┌────────────┐
                    │ PyO3 绑定层 │   │  CLI 外壳   │
                    └────────────┘   └────────────┘
```

---

## 2. 单一真相数据集契约（Shared Testdata Contract）

跨语言系统最易产生「两端各测各的、拼在一起就对不上」的语义偏差。

### 核心约束：
1. **单一数据源**：在 `tests/testdata/` 或 `fixtures/` 下维护统一格式（JSON/YAML/Binary）的测试用例文件。
2. **`kind` 作为一等字段**：每个用例必须显式声明 `kind`（`spec` 用于人已确认的正确规范；`characterize` 用于锁定当前已有行为）。
3. **跨端共跑**：
   - **Rust 核心测试**读取 `testdata` 验证底层状态机解析与变换；
   - **V8 宿主测试**将同一 `testdata` 喂给 JS 补丁，验证 V8 内的可观察结果；
   - **PyO3 集成测试**（pytest）调用 Python 模块并读取同一 `testdata`，断言经由 FFI 返回的对象完全一致。
4. **数据项标准 Schema**：
   ```json
   {
     "id": "patch_crypto_hook_001",
     "kind": "spec",
     "input": { "url": "https://api.example.com", "body": "raw_payload" },
     "expected": { "intercepted": true, "signature_header": "X-Sig" },
     "expected_error": null,
     "codec": "utf8_to_bytes"
   }
   ```

---

## 3. 分层精力分配启发式（Test Effort Heuristics）

不要对所有层追求均匀的行覆盖，必须按计算密度与失败风险分配用例预算：

| 层次 | 推荐精力占比 | 核心验证方式 | 运行频次 |
|---|---|---|---|
| **Rust 纯算法与状态机** | **50% ~ 70%** | `#[cfg(test)]` 表驱动 + Property 测试 (proptest) | 每次代码保存 / 每次提交 |
| **V8 宿主与生命周期** | **10% ~ 20%** | 单用例独立 Isolate 集成测试，超时与错误穿透 | 每次提交 / PR 门禁 |
| **JS 行为补丁** | **10% ~ 15%** | 状态机差分规格断言 + Golden 边界回归 | 每次提交 / PR 门禁 |
| **PyO3 桥接与类型往返** | **5% ~ 10%** | pytest 极薄模块黑盒测试，异常映射与 GIL 安全 | PR 门禁 / 发布构建 |

---

## 4. 专项分册指引（References Breakdown）

遇到具体子模块时，阅读对应的专项分册以获取详细设计约束与反模式防护：

1. **V8 Isolate 宿主特化**：[references/v8-isolate.md](references/v8-isolate.md)
   - Isolate 线程独占律、单测单 Isolate 避免跨用例污染、Smoke 级内存防泄漏、确定性时间与随机注入。
2. **JS 行为补丁特化**：[references/js-patch.md](references/js-patch.md)
   - 补丁前后的可观察状态差分（Before vs After）、Golden 表征测试边界控制（禁全量源码快照）。
3. **PyO3 跨语言桥接特化**：[references/pyo3.md](references/pyo3.md)
   - 极薄绑定层设计、类型双向映射、异常类与结构化错误码契约（文案非契约）、GIL 死锁防范。
