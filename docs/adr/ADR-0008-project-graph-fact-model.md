---
dynamics: [立]
domain: gov
---

# ADR-0008: 项目图事实模型——同级事实分支 / JSONL 事实集 / 契约三拆 / 零组件引入

- Status: Proposed
- Date: 2026-09-28
- 关联: ADR-0006（distill-loop 先例：候选层 staging 后经评审晋升）；
  本地 staging 全证据稿 `distill/_proposals/2026-09-28-project-graph-fact-model.md`
  （355 行，含先例地图与五轮消融原始数据——gitignored，不入仓）

## Context

仓内边界关系大量隐式存在但无静态断言面：deployable→vertical/base 源指针
只在 `sync.ps1` 运行时校验；own⇄vendored、private⇄scripts 方向纪律无契约
保护；docs⇄code 引用漂移无法离线检出（ADR-0007 的
`scripts/build-embeddings.mjs` stale 路径即实例）。动机 = 把"结构事实"
提取为可查询、可断言、可增量的数据层。

外部调研结论（先例地图，详 staging 稿 §1）：**窄而深活、全而通死**——
Sourcetrail/GitHub semantic/babelfish 死于通用表示层野心；
dependency-cruiser（required/orphan 断言）、ArchUnit/Deptrac、
Nx Conformance、Bazel visibility、cargo-semver-checks（Trustfall
"查询即 lint"）、Glean（schema 化事实+unit 归属增量+文件分区懒拼接）
为可转译先例。aider repo map 的同名坍缩坑与 CodeScene 共变耦合为
方法论证据。

五轮启发式+消融实证（本仓盘面）：390 声明初版召回不足符号面 25%
（962 方法黑洞）；junction 不穿透；动态 `import()` 字面量/计算式
盲区实存；8 疑似断链仅 1 真 stale（scope 分类学吃掉 7/8 误报）；
IV8 seam-ledger 栈为独立收敛同构实现（1251 条事实台账、稳定键
迁移、ir_fingerprint 溯源、freeze-old-fail-new 门禁）。

## Decision

### D1 事实模型：单抽象层、五同级分支

文件域 / 符号内容 / 外部依赖清单 / 变更史（共变）/ 运行时事件——
五分支为**同级正交事实源**（非流水线层级），各自独立生产、
查询时 join。分支只认事实 schema、互不相识（Glean per-language
schema 共存同构）。

### D2 事实记录 schema（方向，字段集实现时定稿）

`{v, unit, kind, name, file, line?, fidelity, scope, source,
extractor, action?, extra}`。硬性约束：

- **additive-only + schemaVersion + 宽容读者**（contract-core 五条）
- **`unit` 用内容锚/语义身份键**，不用行号（IV8 `_LINE_RULES`
  漂移失败史）；`line` 仅作展示位
- **`fidelity` 按分支×语言分档**（semantic/syntactic/regex-degraded/
  unresolved）；降级必须 fail-closed——静默降级 = 双事实源分叉
  （IV8 tree-sitter 钉死先例）
- **`source`/`extractor` 溯源字段**（IV8 `ir_fingerprint` 先例）+
  参数戳（window/scope 与 name 同列位阶）
- **`action`/adjudication 延迟决策一等元数据**（IV8 台账先例）

### D3 契约层三拆——"按语言"只到抽取器

| 子层 | 语言相关性 |
|---|---|
| 边界契约（allowed/forbidden/required/orphan） | **语言无关**——路径/项目/部署拓扑规则（depcruiser 主体=路径正则；Nx/Bazel 先例） |
| 符号级预期消费断言 | 抽取按语言、**评估引擎通用** |
| AST 内窥断言 | 真按语言，由语言适配器供给 |

### D4 形态：轻骨架 + 委托实例化 + 零组件引入

不引入 Glean/Trustfall/Joern/RocksDB/Angle 等任何实现栈——学的是
事实模型/增量归属/文件分区/查询即 lint 四条哲学，其余是平台级
历史包袱。理想形态 = **事实格式 schema + 通用契约引擎 +
2-3 个参考抽取适配器 + 声明模板 + skill 化实例化指引**；
实例化（为某具体仓写 boundaries/ruleset）委托给调用方 agent——
消费方本是 LLM，语义工作是其原生能力。声明面形态 = 仓产模板 +
宿主实例（`.hooksrc.tmpl` 同型），候选 `boundaries.yaml` 仓根文件。

### D5 存储：JSONL + committed 投影 + 门禁

单仓事实量小（本仓探针分钟级产出，IV8 台账 1251 条），JSONL
天然支持 unit 归属增量（按文件重写行段）。升级阈值：消费方出现
真实 join/范围查询瓶颈再议 SQLite/DuckDB/Trustfall 适配。
IV8 实证形态 = 生成器 + committed md/json 投影 + pre-commit 门禁，
纯文件化无 DB 无服务。

### D6 抽取器序列与穿透语义

首参考 = **js/mjs**（ast-grep 前端，本仓主力语言自用驱动）；
ps1 行级正则降级线（演示 fidelity 机制）。抽取规则必须开全形态
族谱（function/async/arrow/method/getset/export-default/dynamic-import
字面量；计算式 `import(path.join(...))` 记 `unresolved` 非断链）。
穿透语义显式声明：junction 不穿透（实测）、hidden/ignored 各自
命名集合，消费方 resolve 后自扫目标。

### D7 门禁拓扑双层

staged/pre-commit：新引入依赖边合法性（冻结存量、拦截新增——
IV8 `check_seam_gate` 键=(member,iface,classification) 先例）；
全树/CI/按需：orphan、required 边（deployable→声明源 R1 为首条
真契约）、跨文件断言、全局拓扑。

## Consequences

- 本仓自审已产出可断言契约清单（九条隐式契约 R1–R9，staging §4.7.2）
  与测量基线（173 deployable 边零越界、域间矩阵、共变簇）；
- 采纳档继承 ming-l tier 机制；域归属 = 新 concern 集成立新包
  （倾向 `private/engineering/ming-boundary-*`，候审）；
- 不做：通用查询引擎（rg/jq+skill 指引足够）、L3 消费层（等 L2
  验证）、统一 AST、重型组件；
- 候审项：schema 字段定稿、组件归属落地、T7 工具版本钉+golden
  fixture、docs⇄code 边 stale 修复面（已修 1 例）、IV8 作第二
  数据点的召回压测（它是抽取器的考官，不是契约的法官——其契约
  语义未定型前不当 golden）。
