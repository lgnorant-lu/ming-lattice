# PyO3 跨语言绑定测试专项分册 (pyo3)

> **核心原则**：PyO3 桥接层应当**极薄（Thin Wrapper）**。所有核心业务逻辑与数据结构算法必须留在纯 Rust crate 中由 `cargo test` 验证。Python 侧测试仅用于验证**模块公开接口、类型往返转换、异常映射与 GIL 安全**。

---

## 1. 架构分层与责任边界

```
  [Python 环境 (pytest)]
           │
           ▼  (仅测: import、类型转换、异常捕获、GIL争用)
  [PyO3 绑定层 (my_extension.so)]
           │
           ▼  (向下委托，无独立复杂算法)
  [纯 Rust 核心库 (my_core crate)]  <── (主要精力: cargo test 单元/集成测试)
```

- **[禁止] 严禁反模式**：严禁为了让 Python `pytest` 能够单测到 Rust 内部的某个辅助函数，而强行给该私有函数增加 `#[pyfunction]` 或把内部模块公开。

---

## 2. 类型双向往返映射契约（Type Round-Trip Contract）

必须对跨越 FFI 边界的基础与复杂类型建立明确的往返映射测试：

| Rust 类型 | Python 类型 | 边界测试关注点 |
|---|---|---|
| `Option<T>` | `None` / `T` | 验证 `None` 与有效值的正确映射，无空指针崩溃 |
| `Result<T, E>` | `T` / 抛出异常 | 验证 `Err(E)` 被正确转换为目标 Python Exception 类型 |
| `Vec<u8>` / `&[u8]` | `bytes` / `bytearray` | 验证大字节流无意外拷贝、空字节切片处理 |
| `i64` / `u64` / `u128` | `int` | 验证超出 32 位/64 位的超大整数在 Python 端的精度保真与溢出防护 |
| `HashMap<String, T>` | `dict` | 验证键值对完整性及不可哈希类型的防御 |

---

## 3. 错误映射与异常契约（Exception Mapping）

Python 开发者依赖稳定的异常类型与结构化错误码，不能直接将 Rust 的 `panic` 暴露给 Python：

1. **Rust Err -> Python 异常层级**：
   - 纯 Rust 侧使用 `thiserror` 或枚举定义结构化错误（如包含 `error_code`）。
   - PyO3 侧统一实现 `From<MyRustError> for PyErr`，映射到标准 Python 异常（如 `PyValueError`、`PyKeyError` 或自研的 `MyCustomPyException`）。
2. **测试断言规范**：
   - **默认契约**：在 pytest 中断言**异常类（Exception Class）**与**结构化错误属性（如 `exc_info.value.code`）**；
   - **[禁止] 严禁将自然语言错误消息文案（Message Prose）当作强契约断言**（除非该文案已在对外公开文档中作为协议承诺）。

---

## 4. GIL（全局解释器锁）与多线程安全

跨语言调用最易发生死锁或崩溃：

1. **长时间计算释放 GIL**：
   - 若 Rust 计算密集型函数耗时较长，必须在进入 Rust 时调用 `py.allow_threads(|| ...)` 释放 GIL。
   - **测试验证**：在 Python 侧启动多个 `threading.Thread` 并发调用 Rust 导出函数，断言多线程能真正并发执行，无卡死和死锁。
2. **跨线程持有 Python 对象**：
   - 验证没有将未加保护的 `Py<PyAny>` 引用在多个无 GIL 的 Rust 线程之间裸传递导致引用计数竞争。
