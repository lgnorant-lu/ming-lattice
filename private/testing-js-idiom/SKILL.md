---
name: testing-js-idiom
description: JavaScript 与 TypeScript 地道测试机制规范（Testing JS/TS Idiomatic）：定义 Node 与浏览器宿主环境隔离、异步与事件循环契约断言、避免全局原型链污染、精确断言与拒绝全量源码文本快照的反模式防护。触发词：js-test, ts-test, vitest, jest, node-testing, async-testing.
---

# Testing JavaScript & TypeScript Idiomatic — JS/TS 地道测试机制规范

> **核心哲学**：JavaScript 的原型继承、全局作用域易污染性以及事件循环异步机制是引入测试偶发失败（Flaky）的高发区。
> JS/TS 测试必须确保**环境上下文彻底重置、异步 Promise 闭环等待**，并严格限制 Snapshot 的断言边界。

---

## 1. 宿主环境与全局隔离（Context Resetting）

在 Node.js 或前端 Vitest/Jest 环境中运行测试时，严防跨用例状态泄漏：

### 1. 全局对象与原型链清理
- **约束**：若测试或打补丁过程中修改了 `globalThis`、`window`、`process.env` 或挂载了全局钩子，必须在 `afterEach` 中严格还原：
  ```ts
  import { beforeEach, afterEach, vi } from 'vitest';

  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });
  ```

---

## 2. 异步契约与事件循环（Async & Promise Contracts）

严禁写出因为未等待异步完成而导致「代码抛错但测试误判为绿色」的假绿测试：

### 1. 必须 await 异步操作
- 任何返回 Promise 的 SUT 调用必须使用 `await expect(...).resolves` 或 `await expect(...).rejects`：
  ```ts
  test('async payload fetch should reject on 404', async () => {
    await expect(fetchPayload('invalid_id')).rejects.toThrowError(/not found/i);
  });
  ```

### 2. 严禁使用固定 `setTimeout` 等待
- **[禁止]** 严防使用 `await new Promise(r => setTimeout(r, 1000))` 等待状态变更；必须使用轮询可观察条件的 `waitFor(() => expect(...))`。

---

## 3. 断言原则：结构化精准断言 vs 全量源码快照

- **[禁止] 严禁反模式**：对 AST 变换或行为补丁生成的几千行 JS 源码做 `expect(code).toMatchSnapshot()`。源码中微小的空白、注释或局部变量重命名会导致快照失效，并诱使开发者盲目更新快照。
- **正确做法**：断言结构化结果对象中的**核心属性与行为**（如 `expect(result.interceptedHeaders).toEqual(['X-Sig'])`）。
