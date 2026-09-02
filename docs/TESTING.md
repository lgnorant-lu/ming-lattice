# ming-skills 自动化测试体系与自举规范 (Testing Governance & Bootstrapping)

本文档定义 `ming-skills` 仓库自身工具链与技能规范的**自动化测试体系**。本仓库遵循 `private/testing-core-oracle` 元规则中枢，实现了**「用自己的测试方法论，守护自己的工程工具链」**的自举闭环。

---

## 1. 测试金字塔与架构分层

```
                ┌─────────────────────────────┐
                │   Integration Tests (集成)   │
                │   - lint.ps1 / sync.ps1     │
                │   - update.ps1 / CLI 端到端 │
                └──────────────┬──────────────┘
                               │
                ┌──────────────▼──────────────┐
                │   Contract Tests (黄金契约)  │
                │   - RouteDecision 8条黄金用例│
                │   - Manifest Schema 校验    │
                └──────────────┬──────────────┘
                               │
                ┌──────────────▼──────────────┐
                │     Unit Tests (单元测试)    │
                │     - validate.mjs (Hook)   │
                │     - yaml-lite.ps1 (解析器) │
                └─────────────────────────────┘
```

---

## 2. 自动化测试套件矩阵

| 测试套件 | 对应源文件 | 测试类型 | 核心断言与覆盖内容 |
|---|---|---|---|
| `tests/unit/test-validate-hooks.test.mjs` | `scripts/hooks/validate.mjs` | 单元测试 | Conventional Commits 格式、Type 白名单、Emoji 阻断、Mojibake 拦截 |
| `tests/unit/test-build-manifest.test.mjs` | `scripts/build-router-manifest.mjs` | 单元测试 | Manifest 编译完整性、11 个测试技能包收录、负向表存在性、配方引用 |
| `tests/test-route-decision.mjs` | `scripts/route-core.mjs` | 契约黄金测试 | 8 条硬性决策契约：现场失败原句分流测试、逆向分流、FFI 配方、UI、拒识 |
| `tests/unit/test-yaml-lite.test.ps1` | `scripts/lib/yaml-lite.ps1` | 单元测试 | YAML-Lite 标量/数组/嵌套解析、布尔值类型转换、真实 registry 全量解析 |
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
