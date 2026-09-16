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
| **语言地道习惯 (Idioms)** | [`testing-rust-idiom`](./testing-rust-idiom/SKILL.md) | Rust 地道测试 (cargo test, cfg(test)/tests 边界, miri, cargo-fuzz) |
| | [`testing-python-idiom`](./testing-python-idiom/SKILL.md) | Python 地道测试 (pytest fixture 分层, parametrize, raises 异常契约) |
| | [`testing-js-idiom`](./testing-js-idiom/SKILL.md) | JS/TS 地道测试 (vitest, jest, 宿主上下文重置, Promise 契约) |
| | [`testing-go-idiom`](./testing-go-idiom/SKILL.md) | Go 地道测试 (testing, table-driven, wantErr, testdata) |
| **场景特化 (Scenarios)** | [`testing-scenario-cli`](./testing-scenario-cli/SKILL.md) | CLI 工具链、退出码矩阵 (0/1/2)、DryRun 与原子写盘 |
| | [`testing-scenario-scraper`](./testing-scenario-scraper/SKILL.md) | 数据采集管道、离线 HTML Fixture 与活网探针隔离 |
| | [`testing-scenario-embed-ffi`](./testing-scenario-embed-ffi/SKILL.md) | 跨语言 FFI 契约、V8/PyO3 运行时生命周期与内存隔离 |

---

## 2. 标准测试 Compose 规范

```
测试装配 = testing-core-oracle (必带元规则)
         + 1 个工作流驱动包 (spec | characterize)
         + 1 个语言习惯包 (rust | python | js | go)
         + [按需] 0..N 个场景包 (cli | scraper | embed-ffi)
         [+ 可选: testing-property-mutation 变异加深]

（场景包为可选项，以 compose.yaml `scenario.required: false` 为准）
```

---

## 3. 基础参考与选型指南

- [`预言机形状与范式消歧 (Oracle Shapes & Disambiguation)`](./testing-core-oracle/references/oracle-shapes-and-disambiguation.md)：定义 MT (蜕变测试)、PBT (基于性质的测试)、DbC (契约设计)、CDC (消费者驱动契约) 的学术与行业标准消歧，梳理预言机形状与正交选型清单。
- [`compose.yaml`](./testing-core-oracle/references/compose.yaml)：机读组合规范（层数/members/必需性），与上表口径一致时以它为准。
- [`review.md`](./testing-core-oracle/references/review.md)：只读审阅流程与分层成本口径。
- [`overlays.md`](./testing-core-oracle/references/overlays.md)：B 级质量属性横切规则在测试族的落点。
- [`sources.md`](./testing-core-oracle/references/sources.md)：全族文献真条目与"明确不纳入正文"清单。

