# 测试规范子族 (Testing Paradigm Spec Family)

本目录收录 **11 个测试规范技能包**，采用四层正交解耦模型，负责定义跨语言、跨场景的「行为证伪律」与「测试驱动规范」。

---

## 1. 四层解耦装配矩阵

| 层级 | 技能包名称 | 职责与定位 |
|---|---|---|
| **元规则 (Meta Oracle)** | [`testing-core-oracle`](./testing-core-oracle/SKILL.md) | 独立 Oracle、禁止同义反复、不可信输入失败可见、测试隔离性 |
| **工作流驱动 (Workflow)** | [`testing-workflow-spec`](./testing-workflow-spec/SKILL.md) | 绿场 BDD/TDD 规格驱动（红-绿-重构） |
| | [`testing-workflow-characterize`](./testing-workflow-characterize/SKILL.md) | 棕场遗留系统行为锁定（Golden Master、差分测试） |
| **加深变异 (Property & Mutation)** | [`testing-property-mutation`](./testing-property-mutation/SKILL.md) | 基于性质的测试 (PBT) 与变异杀伤率评估 |
| **语言地道习惯 (Idioms)** | [`testing-rust-idiom`](./testing-rust-idiom/SKILL.md) | Rust 地道测试 (cargo test, miri, mockall, proptest) |
| | [`testing-python-idiom`](./testing-python-idiom/SKILL.md) | Python 地道测试 (pytest, hypothesis, responses) |
| | [`testing-js-idiom`](./testing-js-idiom/SKILL.md) | Node.js / TypeScript 地道测试 (node:test, vitest) |
| | [`testing-go-idiom`](./testing-go-idiom/SKILL.md) | Go 地道测试 (testing, table-driven, testcontainers) |
| **场景特化 (Scenarios)** | [`testing-scenario-cli`](./testing-scenario-cli/SKILL.md) | CLI 工具链、退出码矩阵 (0/1/2)、DryRun 与原子写盘 |
| | [`testing-scenario-scraper`](./testing-scenario-scraper/SKILL.md) | 数据采集管道、离线 HTML Fixture 与活网探针隔离 |
| | [`testing-scenario-embed-ffi`](./testing-scenario-embed-ffi/SKILL.md) | 跨语言 FFI 契约、V8/PyO3 运行时生命周期与内存隔离 |

---

## 2. 标准测试 Compose 规范

```
测试装配 = testing-core-oracle (必带元规则)
         + 1 个场景包 (cli | scraper | embed-ffi)
         + 1 个语言习惯包 (rust | python | js | go)
         + 1 个工作流驱动包 (spec | characterize)
         [+ 可选: testing-property-mutation 变异加深]
```
