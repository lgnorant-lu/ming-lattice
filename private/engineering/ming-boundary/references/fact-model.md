# fact-model — 事实模型与协议层规格

权威决策文本：`docs/adr/ADR-0008-project-graph-fact-model.md`（v1 决策基线）。
**v1.1 协议层设计 2026-09-29 商确采纳**（七商确点全按倾向落定），
本文件升格为协议层规格正身；实现批次落地时随 ADR 附录/ADR-0009 收编决策史。

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
- `extra` 自由袋：机制/目标/死标全进 extra，不进顶层；**但子键走 manifest 词表注册**

## schema v1.1 增量（2026-09-29 采纳，additive 不 bump v）

词表扩增——全部新值须在 `boundaries.yaml` 的 `manifest:` 段注册：

| 位 | 新增值 | 语义 |
|---|---|---|
| 节点 kind | `dir` | 目录单元（unit=`path/` 尾斜杠）——per-dir 覆盖断言主体 |
| 边 kind | `docref` | 文档→文档/目录链接边（markdown `[x](y)` inline 与 `[t][label]`/`[label]` 引用式双解析；`[label]:` 定义行不产边） |
| 边 kind | `mention` | 文档→符号提及边（code-span/heading，解析 `file#symbol`；歧义标 `scope:unresolved`+`extra.ambiguous`） |
| 边 kind | `declare` | 声明文档→单元认领边（`extra.source` 分源：gitignore/registry/doc-index/exempt/…） |
| 边 kind | `export` | 模块→模块 re-export/入口映射边 |
| extra 子键 | `docrole` | file 的文档角色：readme/api/adr/todo/guide/spec/… |
| extra 子键 | `surface` | decl 发布面：`public`/`internal` |
| extra 子键 | `source` | declare 边源分器 |
| extra 子键 | `mtime` | 文件时间戳（stale 派生事实底料） |
| extra 子键 | `comment`/`until` | exempt 边的理由/可选保质期 |

**消融消解案**（不进的及其理由）：
- `doc` 不立独立节点 kind——docrole 是 facet 不是身份类（分面纪律：正交轴各占字段位，禁造复合枚举）
- `export` 不立节点 kind——`surface` 属性管 decl、`export` 边管 re-export，各归其位
- 刻意孤立不立顶层 exempt 字段——统一为 `declare` 边 `extra.source:exempt` 子型
- `unique` 族 / n-way keyed parity / cardinality 谓词 / `reachable`/`diff` 生产器——候审，无第二消费方不进

## 协议规范形（v1.1 核心）

一切规则子句归约为一条规范形：

```
rule := ∀x ∈ SubjectSet : Witness(x)

SubjectSet := units(kind?, glob?, attr?, scope?)         # Q 形主体集
            | declared(source)                          # P 形声明侧
            | declared ∖ observed | observed ∖ declared  # P 形差集
            | computed(op)                              # 派生集（R/D 产物）

Witness := ∃edge(dir, rel∈R, dst∈Y)   # required(out) / covered(in)
         | ∄edge(dir, rel, cond)      # forbidden / isolated
         | ∀edge(dst∈Y)               # allowed
         | x ∈ ObservedSet            # parity 单侧
         | attr(x) ∈ Y                # 单元属性断言（dir=none 退化支：命名规范等）
```

形式层级（依赖分类学投影，详 §理论溯源A）：

| 形 | 数学形状 | 族 | staged 安全 |
|---|---|---|---|
| Q-∃ 检测 | 存在型证物 | `forbidden`/`allowed`/`dead`内建 | 安全（漏检=漏报不谎报） |
| Q-∀ 量化 | 全称/缺席断言 | `required`/`covered`/`isolated` | 禁评（部分视图必 fail-open） |
| P 对账 | 声明集⟺实测集 | `parity` | 禁评（同上） |
| R/D 物化 | 上游派生事实生产 | `reachable`/`diff`（候审） | 产物是普通事实，入上两形 |

**铁律**（全部为形式化结果，非经验约定）：

- 缺席不能被事实表达 → P 形不可约简为 Q（负空间断言无 JSONL 行可落）
- 对不完整视图禁止缺席型量化（Rego negation-safety 同型）→ `--staged` 只评 Q-∃ 族
- fidelity×family 交叉表：regex-degraded 证据下 ∃ 族漏检=漏报（可 warn 放行）；
  ∀ 族漏检=误报（必降 warn 防噪音淹没）——gate 降级策略按族分轨
- 冲突语义 **deny-overrides**（forbidden∩allowed 非空时 forbidden 赢）；
  ruleset lint 检出该交集=配置 bug
- evaluator 求值序与 violations 输出排序确定性钉死（与事实排序同一纪律）
- 豁免贯通：顶层 `exemptions: [{glob|unit, why(必填), until?}]` 抑制 ∀ 族
  （required/covered/isolated/parity/attrs）与 builtin 死链/死引用 finding；
  forbidden/allowed 域边界规则不吃豁免（配置收窄 `from`/`to` 才是正路）

规则条目：`{name(必填，作 finding.ruleId 锚与 suppression 目标), family, severity, why?, <族参数>}`

**消费层统一接口**：`consume(facts)→findings`——封闭 evaluator 与任意自定义消费方
（jq/脚本/LLM，零框架）产出同一 SARIF 对齐 finding
`{rule, level, unit, expectation, observed, remediation}`；gate 哑聚合按 level 归并，
不问生产者。派生事实生产器复用同一回注通道（SHACL-SPARQL 逃逸舱的劣化版：
开放点在事实流上，不在引擎内）。

## 契约三层（ADR D3）

1. **语言无关边界**——Q/P 形各族按域断言（已实现：forbidden/allowed/required/dead；
   v1.1 新增：covered/isolated/parity + attr-witness；orphan=isolated 族归并）
2. **符号级应消费断言**——"decl X 应被 Y 消费"，通用但要 scope 先行（file-local 不参与；
   v1.1 的 `surface:public` 是新的参与门槛——断言面收窄到发布面）
3. **语言特定 AST 断言**——每语言适配器内的事，引擎不越界

## 非目标（防重型化护栏）

不做：Glean/Trustfall/Joern 式查询引擎、SQLite/DuckDB 物化、通用 AST 规范化、
服务/数据库运行时、IV8 特例字段进通用 schema。消费面 = jq/rg + 本组件 evaluator。

## 已验证先例与死因

- 抽样探针在本仓实测：390 decl → 补 method_definition 后 1352（class 方法占 71%）；
  export_statement 漏检会让 shim re-export 边全静默蒸发
- IV8 seam-ledger 独立收敛出同构设计（内容锚、指纹戳、fail-closed）——见 ADR §4.10
- Sourcetrail 死因 = 特例驱动 schema 膨胀；本项目红线对应条款

## 理论溯源（协议层公理依据）

本节为后续设计延伸留档——每条断言族标注其形式理论出处，新增族先在此表定位再谈实现。

### A. 数据依赖理论（规则代数的形式根基）

规则语言的全部量化族是一阶逻辑 **embedded implicational dependencies（EID）** 分类学的投影：
∀x̄ φ(x̄) → ∃z̄ ψ(ȳ)，按"头部是关系原子还是等式 / 身体是否含否定"切分出闭集：

| 依赖类 | 逻辑形 | 本组件对应 |
|---|---|---|
| Denial constraint | ∀x̄ ¬(A₁∧…∧Aₙ) | `forbidden` / `isolated`（零度=对边集的否定量化） |
| IND 包含依赖 | R[X] ⊆ S[Y]（外键原型） | `allowed`（边目标⊆白名单）+ `dead` 内建（引用完整性=每个边目标须解析到实存单元） |
| TGD 元组生成依赖 | ∀x̄ φ(x̄)→∃z̄ ψ | `required`（出度存在）/ `covered`（入度存在） |
| EGD 等式生成依赖 | ∀x̄ φ(x̄)→t₁=t₂ | `parity`（声明集⟺实测集，双向 IND 退化为等式）+ 单元属性唯一性（FD 属 EGD 子类，如 deployable 名唯一） |
| 递归 Datalog/不动点 | 超 FOL 表达力 | `reachable`/`circular`——**理论证实不能写成逐单元量化，须物化为派生事实** |
| 时序/bi-temporal | 快照间断言 | `diff` 候选族——作为上游 Δ 事实生产器，不进 evaluator |

关键定理级事实：**缺席不能被事实表达**——负空间断言（"此单元不存在"）无法落成 JSONL 行，故 P 形（声明集对实测集）不可约简为 Q 形。这是 parity 独立于 required 的形式理由。

原始文献：

- Codd, E.F. (1972). "Further Normalization of the Data Base Relational Model" — FD 起点
- Nicolas, J.M. (1978). "Logic for Improving Integrity Checking in Relational Data Bases" — 依赖的 FOL 表示首发
- Fagin, R. (1982). "Horn clauses and database dependencies", JACM 29(4) — embedded dependencies 定型
- Beeri, C. & Vardi, M.Y. (1984). "A proof procedure for data dependencies", JACM 31(4) — EID 统一
- Abiteboul, S., Hull, R., Vianu, V. (1995). *Foundations of Databases*, Addison-Wesley — 标准教科书（"爱丽丝书"），依赖章
- Chomicki, J. "Database Consistency: Logic-Based Approaches"（讲义）
  https://cse.buffalo.edu/~chomicki/talks-bolzano08.pdf — 本表分类+可判定性结论的直接出处
- Krötzsch, M. "Database Theory — Lecture 17: Dependencies"（TU Dresden 讲义）
  https://iccl.inf.tu-dresden.de/w/images/e/eb/DBT2023-Lecture-17-overlay.pdf — TGD/EGD 形式定义
- "Characterizing Data Dependencies Then and Now"（Makowsky 工作综述，2024）
  https://ar5iv.labs.arxiv.org/html/2408.01109 — 分类学现代刻画

### B. 约束语言先例 — W3C SHACL

与本组件整体架构同构：**shapes graph ⟺ boundaries.yaml；data graph ⟺ facts JSONL；
target selector（sh:targetClass/targetNode/targetSubjectsOf/targetObjectsOf）⟺ SubjectSet；
constraint components（sh:minCount/maxCount/class/pattern/closed）⟺ Witness 谓词族；
validation report ⟺ violations 输出**。收割：约束即数据（shape 本身也是图）、
selector 与谓词正交、severity 分级入报告。拒收：SPARQL 逃逸舱（对应我们"不建通用查询语言"）。

- SHACL W3C Recommendation: https://www.w3.org/TR/shacl/
- SHACL 1.2 Core: https://w3c.github.io/shacl/shacl-core/

### C. 策略即代码先例 — OPA/Rego

Rego 是声明式规则语言（规则即虚拟文档的物化视图）。**收割到一条设计律——
否定安全（negation safety）**：Rego 强制"否定式中的变量必须由非否定式绑定"，
否则 `deny` 在输入缺失时静默不触发（deny is undefined ≠ deny is false）。
**这正是本组件 `--staged` 跳过 `required` 的形式化**——全称/缺席断言在部分视图下
必然 fail-open，故增量模式只评存在型边谓词。设计律固化：*对不完整视图
禁止缺席型量化*。

- Rego 语言文档: https://www.openpolicyagent.org/docs/latest/policy-language/
- negation safety 规则 + partial-rules 风格: https://github.com/StyraInc/rego-style-guide

### D. 索引格式先例 — SCIP / LSIF 死因

LSIF 死于全局不透明 ID 编码的图：不透明 ID → 顺序约束 → 增量索引不可行。
SCIP 修正 = 人可读符号 ID。本组件 `unit` 用 `file#symbol` 语义键而非数字 ID——同一决策。
SCIP 另一先例：**occurrence 由索引器物化而非查询期推导**——支撑"R/D 降为派生事实生产器"。

- SCIP 协议: https://scip-code.org/docs.html ；schema: https://github.com/sourcegraph/scip/blob/main/scip.proto
- LSIF 死因分析: https://sourcegraph.com/blog/announcing-scip

### E. 孤立/可达性先例 — dependency-cruiser / knip

- dep-cruiser `no-orphans`：`{from:{orphan:true, pathNot:[豁免清单]}}`——刻意孤立走
  声明豁免（本组件升级为 exempt=declare 边子型）；`numberOfDependentsLessThan` 基数谓词候审
  https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md
- knip：unused = project − reachable(entry)——**两段式架构先例**（build 物化图 / analysis 纯查询），
  entry+plugin 生态证明 R 形须物化；`ignore` 只压报告不除分析——对应豁免≠不观测
  https://knip.dev/explanations/how-knip-works

### F. 声明边源先例 — .gitignore allowlist / CODEOWNERS 型

default-deny 式 gitignore（`/*` + `!` 逐条放行）：根目录误入文件默认不可提交——
佐证"刻意孤立/未声明文件"是白名单问题不是黑名单问题。本组件对应：P 形
`parity(declared: ignore-allowlist, observed: tracked)` + emit 消费方一键生成骨架。

- gitignore 文档（否定符 `!`、目录不穿透语义）: https://git-scm.com/docs/gitignore
- allowlist 实例: https://github.com/anp2dev/anp2/blob/main/.gitignore ；
  技术指南: https://lukeocodes.dev/gitignore-allowlist
- **适配器设计裁决**：不重写 gitignore 匹配语义（`!` 反排、`/**`、父目录不穿透
  全是坑）——**调 `git check-ignore --stdin -v -z` 当 oracle**：命中记录实测语法
  = `<source>\0<linenum>\0<pattern>\0<pathname>\0` 四字段组，白送 provenance；
  不传 `-n`（其裸路径记录与命中记录终止符混用，徒增解析歧义）。
  **所有权条款**：oracle 仅在 `--root` 为 worktree 顶时激活（`rev-parse
  --show-toplevel` 判等）——子目录抽取不继承父仓声明；`.gitmodules` 登记的
  submodule 路径须先从输入剔除（check-ignore 对其 fatal 128 会废掉整批），
  但含 `.git` 的非登记嵌套仓照常喂（父仓忽略规则对它们有效）。
  **联动**：ignored 集兼任内容扫描剪枝面——被忽略树只留 file/dir/declare
  事实不读内容；`--extract-dirs` 显式收窄优先。
  https://git-scm.com/docs/git-check-ignore

### G. 文档拓扑先例

- zenzic：mkdocs/docusaurus/vanilla 三引擎 orphan-pages/dead-links/stale-snippets/
  placeholder/unused-assets 检查族 + **Two-Pass Pipeline**（物化后断言）先例
  https://github.com/PythonWoods/zenzic
- doc_checker（pasqal-io）：API 覆盖率=每个公开 API 有 mkdocstrings 引用——
  covered(in, mention) 同型；LLM 质量检查留图外
  https://github.com/pasqal-io/doc_checker
- MD-Files-Connector：每个 .md 须被根 README 链到——covered(in, docref, readme) 极简版
  https://github.com/Maneesh-Relanto/MD-Files-Connector
- doc-freshness-checker：文档内符号/路径/版本引用对账——mention dead 检测同型
  https://github.com/cosmocoder/doc-freshness-checker

### H. 本仓内先例

- IV8 seam-ledger：declared-exclusion 通道 → exempt=declare 边子型的原型
- registry `familyCheck`：P 形 parity 的既存实现（声明⟺实测，registry⟺fs）
- `.hooksrc.tmpl` 仓产模板+宿主实例：scaffold 分发形态先例（ADR D4）

### I. Finding 输出先例 — SARIF 2.1.0（OASIS）

违规输出形状对齐 OASIS 静态分析交换标准（不必实现 SARIF 本体，字段集对齐即得互操作面）：
`ruleId`（规则名）/`level`（error|warning|note）/`message`/`locations[].physicalLocation.
{artifactLocation.uri, region.startLine}`/`relatedLocations`（涉事另一端）/`fixes`（修复建议）。
本组件 finding 契约 = `{rule, level, unit, expectation, observed, remediation}`——
最后一项是门控"放行留痕"与"拦截给修法"的共同字段位。

- OASIS SARIF 2.1.0: https://docs.oasis-open.org/sarif/sarif/v2.1.0/
- schema+教程: https://github.com/oasis-tcs/sarif-spec

## 增量裁定纪（2026-09-29 轮，已收编上文 v1.1 规格）

本轮启发式+消融审计净产出（已全部采纳并落位到对应节，本处留决策纪）：

1. **staged 安全表**（Rego 否定安全律的展开）：∃-检测族（forbidden/allowed/dead）
   在部分视图安全——漏检=漏报不谎报；∀/缺席族（required/covered/isolated/parity）
   在部分视图必然 fail-open——**`--staged` 模式只评前者，后者全树模式专属**。
   这是谓词代数给出的机械可判定界线，不是经验约定。
2. **fidelity×family 严重度交叉表**：降级证据（regex-degraded）下——∃ 族漏检
   放大为漏报（可 warn 放行）；∀ 族漏检放大为误报（必须降 warn 防噪音淹没）。
   gate 的降级策略按 family 分轨，不是一刀切。
3. **mention 解析歧义**：doc 文本符号名天然有歧义（同名函数多文件）。
   缓解：只认 code-span（`` `x()` ``）/heading 位提及；解析域限定于该 doc
   已 docref 链接到的模块面；歧义命中的 mention 边标 `scope:unresolved`+
   `extra.ambiguous`（实现注记：unresolved 位归 scope 词表，fidelity 保四值集）。
4. **`extra` 子键治理**：docrole/surface/source/exempt/mtime 等 sub-key 进
   `boundaries.yaml` 的 `manifest:` 词表注册段——自由袋必须有注册闸，
   否则复刻 IV8 字段漂移。
5. **头部析取消融**："被 README 或 nav 任一覆盖"=Witness 的 `rel` 集合参数，
   不需要新形式——参数吃掉需求，代数不扩。
6. **`unique` 族**（EGD-attr 子类，如 deployable 名唯一）：记档候审，
   registry lint 已隐含覆盖，无第二消费方不进 v1.1。
7. **内容合规边界**：config/schema 校验留图外——校验器以 `conform` 边
   回注事实流，图层只断言边的存在性，不管内容本体。
8. **消费层开放元件 = finding 事实契约**（SHACL-SPARQL 逃逸舱先例的劣化版——
   逃逸舱不在 evaluator 内而在事实流上）：封闭 evaluator（Q/P 族）与任意
   自定义消费方（jq/脚本/LLM，任意语言零框架）**产出同一 SARIF 形 finding**；
   gate 是哑聚合器按 level 归并，不问生产者是谁。派生事实生产器（R/D）
   复用同一回注通道——消费层只有一个接口形状 `consume(facts)→findings`。
   防线：finding.level/kind 走 manifest 词表注册，防开放通道变垃圾场。
   拒收先例：eslint plugin/rustc compiler-plugin 型宿主内嵌扩展 API
   （泄漏引擎内部结构给扩展者，重且脆）。
9. **rule 条目元数据**：`name:`（必填，作 finding.ruleId 锚点与 suppression 目标）
   + `severity:`（per-rule 级，gate 按 finding.level 映射）+ `why:`（理由备注，
   dep-cruiser name/comment/severity 先例）。规则冲突语义：**deny-overrides**
   （forbidden∩allowed 非空时 forbidden 赢，与 default-deny 授权模型同族）；
   ruleset lint 子查负责检出该交集=配置 bug。
