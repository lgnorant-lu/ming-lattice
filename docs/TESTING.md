# ming-skills 自动化测试体系与自举规范 (Testing Governance & Bootstrapping)

本文档定义 `ming-skills` 仓库自身工具链与技能规范的**自动化测试体系**。本仓库遵循 `private/testing-core-oracle` 元规则中枢，实现了**「用自己的测试方法论，守护自己的工程工具链」**的自举闭环。

---

## 1. 测试金字塔与契约分层

```
                ┌─────────────────────────────┐
                │   Integration Tests (集成)   │
                │   - lint.ps1 / sync.ps1     │
                │   - update.ps1 / CLI 端到端 │
                └──────────────┬──────────────┘
                               │
                ┌──────────────▼──────────────┐
                │   Contract Tests (契约与断言)│
                │   - 20 条结构化黄金用例集   │
                │   - 假 Harness 适配器断言   │
                │   - Schema 校验与零副作用   │
                └──────────────┬──────────────┘
                               │
                ┌──────────────▼──────────────┐
                │     Unit Tests (单元与表征)  │
                │     - validate.mjs (Hook)   │
                │     - build-manifest.mjs    │
                │     - yaml-lite (characterize)│
                └─────────────────────────────┘
```

## 2. testing-family 规范族在本体的装配映射

依据 [`private/testing-core-oracle/references/compose.yaml`](file:///d:/dogepy/skills-collection/private/testing-core-oracle/references/compose.yaml)，本仓库（CLI 工具链 + 跨 Harness 路由中枢）装配以下核心包：

| 层级 | 装配技能包 | 核心职责与应用契约 |
|---|---|---|
| **元规则** | `testing-core-oracle` | 独立判定律（Schema 与黄金事实源）、Goodhart 三禁令（拒绝盲目覆盖率 KPI）、零副作用密封性 |
| **场景层** | `testing-scenario-cli` | 脚本当产品：退出码矩阵（0/1/2）、`-DryRun` 零写盘、跨平台路径分隔符、POSIX/Win 双外壳 |
| **语言层** | `testing-js-idiom` | 纯 `.mjs` 零依赖决策内核、流式断言、崩溃免疫 |
| **驱动层** | `testing-workflow-spec` + `testing-workflow-characterize` | 新功能（路由决策）走 Spec 驱动；已有存量工具（`yaml-lite.ps1`）标记为 `kind: characterize` 表征回归 |
| **加深层** | `testing-property-mutation` | 关键不变式形式化断言（幂等性、`side_effects === "none"`、`testing` 与 `reverse` 互斥） |

---

## 3. 自动化测试套件矩阵

| 测试套件 | 对应源文件 | 测试类型 | 核心断言与覆盖内容 |
|---|---|---|---|
| `tests/unit/test-validate-hooks.test.mjs` | `scripts/hooks/validate.mjs` | 单元测试 | Conventional Commits 格式、Type 白名单、Emoji 阻断、Mojibake 拦截 |
| `tests/unit/test-build-manifest.test.mjs` | `scripts/build-router-manifest.mjs` | 单元测试 | Manifest 编译完整性、11 个测试技能包收录、负向表存在性、配方引用 |
| `tests/test-route-decision.mjs` | `scripts/route-core.mjs` | 契约黄金测试 | **20 条结构化黄金用例**：单领域（测试/逆向/UI）、双领域 mixed、点名、歧义消歧、边界拒识 |
| `tests/contract/test-adapter-contract.mjs` | 假 Harness 适配器 | 契约测试 | 证明适配器在读取 `RouteDecision` 时，非 reverse 高置信绝不触发 `initCase()` 或工作区写盘 |
| `tests/unit/test-yaml-lite.test.ps1` | `scripts/lib/yaml-lite.ps1` | 表征测试 | `kind: characterize` 表征回归，校验 YAML 解析器对真实 `registry.yaml` 的结构还原 |
| `tests/integration/test-cli-tools.test.mjs` | `scripts/` 全量工具链 | 集成测试 | `lint.ps1` 0 ERROR 闭环、`sync.ps1 -DryRun` 演练、`update.ps1 -DryRun` 演练 |

---

## 3. 测试执行指南

### 一键执行全量测试套件

- **跨平台入口 (Node.js)**:
  ```bash
  node tests/run.mjs
  ```
- **PowerShell 入口**:
  ```powershell
  pwsh scripts/test.ps1
  ```

### 输出示例
```
================================================================
       ming-skills 自动化测试金字塔与契约套件驱动器              
================================================================

[TEST UNIT] scripts/hooks/validate.mjs...
  -> validate.mjs 全部断言通过！
[TEST UNIT] scripts/build-router-manifest.mjs...
[build-router-manifest] 成功生成机读清单: config\router-manifest.json
  -> build-router-manifest.mjs 全部断言通过！
[TEST UNIT] 路由决策纯函数 8 条黄金用例回归...
  ...
[TEST UNIT] scripts/lib/yaml-lite.ps1 解析器测试...
  -> yaml-lite.ps1 全部断言通过！
[TEST INTEGRATION] 运维工具链端到端集成测试...
  -> 运维工具链全部端到端集成测试通过！

================================================================
  测试总结果: 5/5 套件全部通过！(100% GREEN)
================================================================
```

---

## 4. 门禁联动与防御机制

1. **Pre-commit 强门禁**：
   - 每次执行 `git commit` 时，`.githooks/pre-commit` 会自动触发 `node tests/run.mjs`；
   - 任何一个单元测试、黄金用例或集成测试失败，**Git 将强制拦截提交**，确保问题绝不流入主干。
2. **零副作用原则**：
   - 所有测试用例均在内存中或通过 `-DryRun` 运行，严禁在测试过程中污染真实工作区或创建临时孤儿目录。
