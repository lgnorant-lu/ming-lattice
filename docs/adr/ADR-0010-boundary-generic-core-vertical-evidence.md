---
dynamics: [立]
domain: spec
---

# ADR-0010: 边界层定位——通用图面 + 垂直证据源，不争语言内语义深度

- Status: Accepted
- Date: 2026-09-30
- 规格正身: `private/engineering/ming-boundary/references/fact-model.md`
  （分层原则已在 §0 挂指针；本文记决策理由与先例证据链）
- 关联: ADR-0008（事实模型）、ADR-0009（协议 v1.1）、
  `scripts/consumers/README.md` §设计血统（先例对照表）

## Context

五仓压测（js-yaml/requests/changesets/awesome/anyhow）暴露方向问题：
Python/Rust 仓零代码边——自写前端追不动语言语义，不做又显缺口。
同期 IV8 `cargo check` 告警审计给出反例证据：16 条访问器告警系
P-3 D-A 迁移期瞬时残留（注册先迁 `op_*`、旧 `attr_rw!` 滞后删除），
20 个 `_inner` 文本差集"孤儿"实为宏展开内自产自销——**只有编译器
语义面能正确裁决语言内死活**；但"生成面必须被接线"这类跨层契约
cargo 并不建模。两侧各有不可替代面，需定分界。

## Decision

### 三层各归其位

```
前端（事实提取）  ->  事实图 facts.jsonl  ->  消费层（evaluator/emit/diff/…）
   天然垂直             通用交换格式            声明式、语言中立
```

- **前端垂直、图面通用、消费层声明式**。垂直性住在边缘；
  核心契约语言不逐语言分裂。
- **垂直语义工具降级为证据源**：接 Rust/Go/Python 时优先消化
  其输出（`cargo check --message-format json`、knip JSON、
  staticcheck JSON -> facts/findings 注入），不自写语义前端。
  facts.jsonl 扮演 SARIF/IR 同构角色（编译器前端->IR->通用 pass；
  LSP；SARIF——分层先例同构）。
- **本层不可替代面**：跨介质边（代码<->文档<->manifest<->gitignore<->
  契约）、多语混合仓统一契约、无外部工具链依赖的 staged 快速面。
- **本层不主张替代**：单语仓+强原生工具场景（Go+staticcheck）
  的语言内维度，本层增值=契约统一+介质穿越+零依赖。

### 先例血统（决策依据，非功能清单）

| 生态先例 | 语义 | 映射 |
|---|---|---|
| Rust `dead_code` | decl 零入度+`pub` 豁免 | `isolated`/`covered` 族+`surface` 标记 |
| Go `deadcode` | RTA+`-whylive` 证人链 | 候审 `reachable` 的语义模板 |
| JS/TS knip | 入口注册表驱动 | docrole/exemptions=入口声明面；其 configuration hints~=fidelity 戳记 |
| Python vulture | 静态近似+置信度 | 前端候审 |

## Consequences

- 语言前端继续候审，**适配器优先**（吃工具输出）先于自写前端；
  Rust 这类宏+feature 语义面禁用 regex 拟合。
- IV8 的"生成面<->注册表"接缝是首个候选 dogfood：`parity` 族表达
  "每个 `op_*` 须被 `ops::register` 引用"即本层能做而 cargo 不能。
- 零边支持的语言不哑忍：emit 对零 import/decl 仓出头注 WARN
  （诚实降级已落）。

## 不采纳项

- 逐语言 RTA 深度复刻：成本与语义风险不匹配，且与原生工具重复建设。
- Gherkin 式外部 DSL 消费方：findings JSONL 已是开放面。
