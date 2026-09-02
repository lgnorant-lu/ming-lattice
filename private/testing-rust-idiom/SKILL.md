---
name: testing-rust-idiom
description: Rust 地道测试机制规范（Testing Rust Idiomatic）：定义 cfg(test) 单元测试与 tests/ 黑盒集成测试边界、利用强类型系统与所有权消除无效断言、Result 与 should_panic 断言范式、Miri 未定义行为检测（仅限纯 Rust 层）以及 cargo-fuzz 入口。触发词：rust-test, cargo-test, proptest-rust, miri-test, rstest, idiomatic-rust-testing.
---

# Testing Rust Idiomatic — Rust 地道测试机制规范

> **核心哲学**：Rust 强大的编译期类型系统、所有权模型与生命周期已经消灭了空指针与数据竞争等一大类传统缺陷。
> Rust 测试预算不应浪费在给编译器已保证的事情写断言，而应重点保护**不变量、错误边界、Unsafe 代码安全性、并发死锁与公开 API 契约**。

---

## 1. 测试组织与可见性边界（Rust Book Ch 11）

### 1. 单元测试 (`src/**/*.rs` 内的 `#[cfg(test)]`)
- **定位**：测试内部复杂纯算法、私有状态机转换或不易直接从外部触发的边界。
- **约束**：
  - 放置在与被测代码相同的源文件底部 `mod tests { use super::*; ... }`；
  - 仅测试高逻辑密度的核心算法，不为简单转发/胶水代码写单测。

### 2. 集成测试 (`tests/*.rs`)
- **定位**：黑盒测试 crate 的公开契约（Public API）。
- **约束**：
  - `tests/` 目录下的每个文件被编译为独立的 crate，**只能访问被测 crate 的 `pub` 导出接口**；
  - **[禁止] 严禁**为了让 `tests/` 能测到内部辅助方法而强行将私有函数提升为 `pub`。

---

## 2. 惯用测试模式与断言范式

### 1. 利用类型系统消除测试（Parse, Don't Validate）
- 尽量将约束编码进类型中（如使用 `NonZeroU32`、`NewType`、受限枚举），让非法状态在编译期无法表达，从而无需编写多余的运行时防御断言。

### 2. `Result<T, E>` 返回值测试
- 优先让测试函数返回 `Result<(), Box<dyn std::error::Error>>`，允许在测试体内直接使用 `?` 传播错误，保持测试代码极简清晰。

### 3. Panic 与异常断言
- 验证非法输入的 Panic 时，使用 `#[should_panic(expected = "specific error message")]`：
  ```rust
  #[test]
  #[should_panic(expected = "index out of bounds")]
  fn test_out_of_bounds_panics() {
      let v = vec![1, 2];
      let _ = v[5];
  }
  ```

---

## 3. 深度质检工具链

### 1. Miri（未定义行为与内存检测）
- **适用边界**：Miri 无法直接模拟 C++ 外部调用、V8 引擎或操作系统 C-FFI。
- **执行规则**：针对纯 Rust 算法层、包含 `unsafe` 块的内部数据结构或纯 Rust 包装层运行 Miri：
  ```bash
  cargo miri test --lib
  ```
  检测内存对齐错误、越界访问、未初始化内存读取与使用后释放（UAF）。

### 2. 模糊测试（Fuzzing）
- 针对解析器与不可信字节流输入，接入 `cargo-fuzz`（基于 libFuzzer）：
  ```rust
  fuzz_target!(|data: &[u8]| {
      let _ = parse_untrusted_input(data);
  });
  ```
  断言对于任何变异字节流均不会发生 Panic 或内存破坏。
