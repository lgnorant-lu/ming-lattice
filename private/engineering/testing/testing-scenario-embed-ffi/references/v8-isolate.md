# V8 Isolate 宿主测试专项分册 (v8-isolate)

> **物理事实**：V8 `v8::Isolate` 是完全独立且隔离的 JavaScript 虚拟机实例。Isolate 不可跨线程并发进入，其内部对象不可在不同 Isolate 之间共享，且其底层 C++ 内存需显式托管。

---

## 1. 核心约束与生命周期管理

### 规则一：单用例单 Isolate（禁止全局共享单例）
- **要求**：每个测试用例必须创建独立的 `v8::Isolate`（或通过 Fixture 进行清晰的创建/重置/销毁）。
- **危害**：在多个测试之间共享全局 Isolate 会导致全局变量污染、隐式原型链修改泄漏、执行状态残留，引发严重的测试执行顺序依赖（Flaky）。
- **注意**：多线程并行运行测试（`cargo test` 默认行为）时，若共享同一个 Isolate 会直接触发 V8 内部的 Fatal Crash 或线程断言失败。

### 规则二：内存泄漏与资源释放验证（Smoke 级别，禁止断言绝对 RSS）
- **要求**：针对反复创建/销毁 Isolate 或长时间执行循环的宿主，保持 Smoke 测试：
  1. 循环创建销毁 50~100 次 Isolate，确认进程稳定、无 Panic、无未捕获的 C++ 句柄泄漏；
  2. **[禁止] 严禁在日常单测中对进程绝对物理内存（RSS）进行精确断言**（RSS 受系统调度、GC 迟滞和机器差异影响极大，属于脆弱断言）；
  3. 验证注册到 JS 全局对象的 Rust C++ 函数指针（External References）随 Context/Isolate 销毁而正确释放。

---

## 2. 确定性控制（Determinism Control）

V8 内部对时间（`Date.now()`）和随机数（`Math.random()`）的默认实现依赖宿主操作系统。为保证测试可重复（FIRST 原则）：

1. **时钟注入**：
   - 宿主必须提供注入虚拟时钟的机制，在测试初始化 Context 时将 JS 的 `Date.now` 与 `performance.now` 劫持为固定步长的单调时钟。
2. **随机数固定种子**：
   - 涉及随机逻辑的测试，在 Context 注入时固定 PRNG 种子（如采用 XorShift/Mulberry32 替换 `Math.random`），杜绝随机波动。

---

## 3. 错误传播与异常穿透契约

必须系统化验证 JS 与 Rust 之间的异常双向转换：

| 异常类型 | 触发场景 | 期望的断言 Oracle |
|---|---|---|
| **JS 语法错误** | 传入畸形脚本 `eval("function {")` | Rust 返回结构化 `Err(V8SyntaxError { line, col })`，不得 Panic |
| **JS 运行时异常** | 脚本中 `throw new TypeError("bad")` | Rust 捕获异常并提取堆栈信息，转换为预期的 Rust 错误类型 |
| **执行超时 / 死循环** | 恶意脚本 `while(true) {}` | 触发宿主 `isolate.terminate_execution()`，Rust 返回 `Err(ExecutionTimeout)` |
| **Rust 回调异常** | JS 调用宿主注入函数，Rust 端抛错 | JS 端捕获对应的 JS Exception，且调用栈准确对应 |

### [禁止] 严禁反模式：
- **严禁**只测「脚本加载没有崩溃」（无断言测试）。
- **严禁**写成百上千个类似 `eval("1 + 1") == 2` 的空转测试，V8 自身的语法正确性不需要你在业务层重复验证。

---

## 4. 全局单例生命周期与 EventTarget 路由纪律（Global Singleton & Navigation Lifecycle）

在具有页面加载/导航（如 `page_load`）能力的嵌入式环境中，宿主对象（如 `Window`、`Document`）的生命周期与内部底层 AST/DOM 节点有不同步特征：

1. **JS 单例引用稳定性 vs 底层底层状态重置**：
   - JS 层的全局暴露引用（如 `window.document`）在多次 `page_load` 间可能保持单例 Proxy/LegacyUnforgeable 契约；
   - 但 Rust 端支撑它的实际底层树（如 `DocRc` / `StreamingHtmlParser`）会随页面重新解析而新建，`root_id` / `NodeId` 会发生变化。
2. **事件目标注册路由分离（EventTarget Routing Key）**：
   - 严禁将附着在全局生命周期单例上的事件监听器（如 `document.addEventListener('DOMContentLoaded', ...)`）直接绑定到容易在导航中失效的瞬态 `NodeId`；
   - 必须通过稳定的语义目标（如类似 `EventTargetKey::Document` 或在 document 替换/派发时正确映射当前根节点）来保证生命周期事件在跨页面加载后的派发完整性。

