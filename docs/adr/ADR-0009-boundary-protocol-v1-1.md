---
dynamics: [立]
domain: gov
---

# ADR-0009: 边界协议 v1.1——∀-Witness 规范形 / Q-P 求值族 / 词表 manifest / finding 契约

- Status: Accepted
- Date: 2026-09-29
- 规格正身: `private/engineering/ming-boundary/references/fact-model.md`
  （协议层节已升格为完整规格——selector 产生式、族定义、staged 安全表、
  铁律、finding 契约；本文只记决策史与后果）
- 关联: ADR-0008（事实模型底层——v1.1 在其上扩协议层，不动事实仓库形状）

## Context

ADR-0008 落地后，规则面暴露结构性缺口：初版只有 forbidden/allowed/required
三个词表内词 + dead 内建，而真实诉求（文档拓扑、API 面监控、台账 parity、
命名规范）映射不进来。同时豁免机制在 partial 视图下缺语义定义，staged
闸门对缺席型断言必然误报。消融审计确认：继续加词表会重演 IV8 字段漂移——
需要先钉形式化核心，再让需求项找位置。

七项商确点经外部调研（SHACL selector/constraint 正交性、Rego 否定安全律、
依赖分类学完备性证明、SCIP/SARIF 格式即接口、gitignore/CODEOWNERS 声明边先例）
逐一裁决，全部按倾向采纳。

## Decision

### D1 规范形：`∀x∈SubjectSet : Witness(x)`

一切规则子句归约为全称-证物形。SubjectSet 四键封闭 selector
`{of_kind, glob, attr, computed-ref}`；Witness 谓词集 `{∃edge, ∄edge,
∀edge, ∈observed, attr∈}`。evaluator 求值核 = Q 形（逐单元边量化）+
P 形（集合对账）两族，R/D（可达/差分）降为上游派生事实生产器——其产物
是普通事实（`scope:computed`），不扩 evaluator 代数。

### D2 词表：manifest 注册段 + fail-closed

`boundaries.yaml` 增 `manifest:` 段注册全部词表（families/edge kinds/
node kinds/extra_keys/fidelities/scopes/extractors）。未注册值 fail-closed
报错。规则条目增 `{name(必填→finding.ruleId/suppression 锚), family,
severity∈{error,warn,note}, why(必填)}`；`label:` 兼容归一为 name。

### D3 语义条款

- **staged 安全表**：`--staged` 只评 Q-∃ 族（forbidden/allowed/builtin-dead）；
  ∀ 族（required/covered/isolated/parity/attrs）整族跳过——不完整视图下
  缺席断言必 fail-open（Rego negation-safety 同型）。
- **deny-overrides**：forbidden∩allowed 重叠时 forbidden 赢；交集非空被
  ruleset lint 检为配置警告。
- **豁免贯通**：顶层 `exemptions`（glob/unit + 必填 why + 可选 until）
  抑制全部 ∀ 族与 builtin 死链/死引用；Q-∃ 域边界规则不吃豁免。
- **fidelity×family 交叉表**：regex-degraded 证据下 ∃ 族漏检=漏报可降
  warn；∀ 族漏检=误报必须降 warn——gate 按族分轨降级。
- **确定性**：violations 排序用码点序（sortFacts 同律），禁 localeCompare。

### D4 finding 契约（消费层开放元件）

`{rule, severity, unit, expect, observed, fix}` — SARIF 对齐。
`consume(facts)→findings` 为统一接口：封闭 evaluator 与任意自定义
消费方（jq/脚本/LLM）同形产出，gate 哑聚合不问生产者——SHACL-SPARQL
逃逸舱的劣化实现：开放点在事实流上，不在引擎内。

### D5 schema v1.1 增量（additive 不 bump v）

`dir` 节点 kind + `docref`/`mention`/`declare`/`export` 边 kind +
`docrole`/`surface`/`source`/`mtime`/`comment|until` extra 子键 +
`of_kind` 选择器位 + `attrs` 族（dir=none 单元属性退化支）。
消融消解：doc 不立节点 kind（extra.docrole 承载）、export 不立
节点 kind、exempt 归 declare 子型、orphan 归 isolated 族。
候审不回：`unique`/`n-way parity`/`cardinality`/`reachable`/`diff`/
emit 消费方——映射不进规范形格点才算扩展事件。

## Consequences

- 规则面从 3 词扩到 7 族且全部有形式位置；缺席型断言语义首次成文。
- markdown/gitignore 两适配器落 v1.1：docref 死链、code-span mention
  二遍解析、`git check-ignore` oracle 声明边。
- golden fixture（`tests/fixtures/mb-golden/`）钉 byte-identical
  事实输出；豁免机制直接覆盖"刻意死链固件"vs"真仓零容忍"两场景。
- extractor 修复真 bug：reexport 判定改头锚定正则——`export_statement`
  节点文本含整个被导函数体，`from 'x'` 不得从体内字符串误捞。
- 本仓 real-repo 验证：80k+ 事实、违规清零（vendored 死链全走
  declared-exempt 通道，authored 死链已修）。
- 候审项依旧待消费拉动：第二消费方出现前 spec 留组件 references；
  n-way parity/unique/emit 同候审。
