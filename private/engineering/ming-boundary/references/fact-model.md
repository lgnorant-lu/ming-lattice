# fact-model — 事实模型设计依据（ADR-0008 摘要）

权威决策文本：`docs/adr/ADR-0008-project-graph-fact-model.md`（repo 根 docs/adr/）。
本文件只做实现侧导航，不复读 ADR 全文。

## 五分支同级事实源

五个分支在同一抽象层并列产出、查询期 join——不是流水线层级：

| 分支 | 事实源 | 本组件状态 |
|---|---|---|
| 1. file | 文件域分类 + 链接 | walk@1 已实现 |
| 2. content | 符号声明 + import/export 边 | ast-grep（syntactic）/ line-regex（degraded） |
| 3. deps | 外部依赖清单 | scope=external 的 import 边即原始面；SBOM 级待定 |
| 4. history | git 共变/变更史 | 未实现（探针证实可行；价值待消费方） |
| 5. runtime | 运行时事件 | 未实现（route-misses.jsonl 形态在先） |

## schema v1（加法演进契约）

```
{v, unit, kind, name, file, line?, fidelity, scope, extractor, extra?}
```

演进规则（contract-core 五条套用到本 schema）：

- 只加不改：新字段永远可选；消费方宽容读者，未知键忽略
- `v` 升位时机：语义变化而非加法变化（加法不需要 bump）
- `unit` = 身份键：`file` 或 `file#symbol`；禁止行号/绝对路径进 unit
- `fidelity` 必须显式：exact | syntactic | regex-degraded | （未来 semantic）
- `scope` 先分再判：repo / module / file-local / external / unresolved / computed
- `extractor` 带版本戳：`tool@ver`——同查询不同工具版本产出可比性靠它
- `extra` 自由袋：机制/目标/死标全进 extra，不进顶层

## 契约三层（ADR D3）

1. **语言无关边界**——allowed/forbidden/required/orphan 按域断言（已实现：check-boundaries.mjs 前三族；orphan 待消费方）
2. **符号级应消费断言**——"decl X 应被 Y 消费"，通用但要 scope 先行（file-local 不参与）
3. **语言特定 AST 断言**——每语言适配器内的事，引擎不越界

## 非目标（防重型化护栏）

不做：Glean/Trustfall/Joern 式查询引擎、SQLite/DuckDB 物化、通用 AST 规范化、
服务/数据库运行时、IV8 特例字段进通用 schema。消费面 = jq/rg + 本组件 evaluator。

## 已验证先例与死因

- 抽样探针在本仓实测：390 decl → 补 method_definition 后 1352（class 方法占 71%）；
  export_statement 漏检会让 shim re-export 边全静默蒸发
- IV8 seam-ledger 独立收敛出同构设计（内容锚、指纹戳、fail-closed）——见 ADR §4.10
- Sourcetrail 死因 = 特例驱动 schema 膨胀；本项目红线对应条款
