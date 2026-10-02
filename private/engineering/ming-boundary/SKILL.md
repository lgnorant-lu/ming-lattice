---
name: ming-boundary
description: 仓库结构事实提取与边界契约断言组件——JSONL 事实流（file/dir/decl/import/link/docref/mention/declare/export）+ boundaries.yaml 声明式契约 v1.1（forbidden/allowed/required/covered/isolated/reachable/parity/attrs 八族，∀-Witness 规范形）+ 纯评估引擎。当涉及项目图、依赖边界审计、文档拓扑覆盖、孤儿/刻意隔离检测、断链检测、声明-实测对账、生成与手写接缝核验时使用。
metadata:
  layer: infrastructure
  compose: none
---

# ming-boundary

项目图事实提取与边界契约断言组件（ADR-0008 参考实现）。两段式：先产事实，再断契约——提取器与评估器完全解耦，中间契约是 JSONL 事实流。

## 1. 何时用 / 何时不用

- 适用：依赖边界审计（X 层不许 import Y 层）、断链/孤儿符号检测、deployable 链接完整性、跨仓事实提取复用、"改了这个文件会炸谁"的影响面初筛
- 不适用：单文件内逻辑正确性（走测试）、运行时行为断言（走 hook/trace）、语义级类型检查（走编译器）

## 2. 核心规程

### 2.1 事实流（extract-facts.mjs）

```
node scripts/extract-facts.mjs [--root DIR] [--out FILE]
    [--allow-degraded] [--extract-dirs d1,d2] [--no-content-scan]
    [--no-md-scan] [--no-ignore-scan] [--files f1,f2]
```

`--files`：只抽给定仓相对路径子集（staged 增量面用；符号链接项产 link 事实，工作区缺席项静默跳过）。`--no-md-scan`/`--no-ignore-scan` 关掉 markdown/gitignore 两默认适配器。

**内容扫描谓词（v1.1a 实测修正）**：缺省=全部支持扩展名（js/ts/tsx/rs/py/sh/ps/md 等前端已入面）且未被 `.gitignore` 声明忽略的文件——被忽略树只留 file/dir/declare 事实不读内容（vendored/venv/产物树的死链与符号属上游账面噪音，事实源处剪枝）。`--extract-dirs` 显式收窄优先于忽略集。gitignore oracle 仅在 `--root` 为 git worktree 顶时激活（`rev-parse --show-toplevel` 判等）——子目录抽取不继承父仓声明；`.gitmodules` 登记的 submodule 路径自动剔除出 oracle 输入（check-ignore 对其 fatal 128）。ast-grep 单文件失败（ENOBUFS/os error/输出超 512MB 字符串顶）自动二分降级→单文件→regex 兜底，记 `fidelity:regex-degraded` 不 die。

**语言面（v1.1b 五公仓压测实证）**：`.ts/.mts/.cts` 走 TypeScript 规则集、`.tsx` 走 Tsx（tree-sitter-typescript 节点名与 js 同构，规则仅换 language 头）；js-yaml 的 src/*.ts 面在补上后 import 145→280/decl 75→249、changesets monorepo 0→743 import——**TS 缺席会让 TypeScript 仓静默退成文件枚举器**。Rust 自 v1.2 起有 ast-grep syntactic 桶：`use`/`mod x;` 产 import 边（组树按叶展开：`use a::{b,c::{d}}`→`a::b`/`a::c::d` 逐叶产边、`{x,y}` 无前缀组逐顶项分发、`self`/别名/glob/组内注释与叶级 `#[cfg]` 均已归一）、`pub use` 双发 export 边、`fn/struct/enum/trait/type/macro_rules!` 产 decl（`crate::` 锚定本 crate `src/` 根做最长前缀解析、`self::`/`super::` 相对目录、裸 ident 首段=外部 crate 标 `scope:external`、内联 `mod x {}` 只产 decl 不产边、`pub(crate)` 限域记 `internal`）；宏展开/feature 语义按 ADR-0010 留给外部 precise 证据源，禁拟合；`#[cfg]` 属性不求值但给事实打 `extra.cfg` 标记（含内联 mod 内 use 的传递门），消费方据以区分"条件缺席"与真死链。Python 自 v1.3 入场（IV8 521 文件零边实证过闸）：`import`/`from-import` 产 import 边，相对点层级锚包链、`__init__.py` 优先、PEP420 命名空间目录不判死、`__init__` 内 from-import 双发 export 边（py-reexport）、绝对导入经包索引实算的导入根（__init__ 链顶祖先+松散目录）落空即 external 不判死；`def`/`class`/模块级赋值产 decl（词表由 sync-langs 派生件驱动）。Bash 自 v1.4 入场（`sh.mjs`，tree-sitter-bash 无上游 tags.scm 故词表手写）：`source`/`.` 产 import 边按文件目录解析+`.sh/.bash` 探测，落空 dead；含 `$VAR`/命令替换的动态 source 标 `mechanism:sh-source-computed`（unresolved 不判死）；`fn`/`export|readonly NAME=` 产 decl。Go 仍无前端：零代码边事实时 emit 生成稿头注显式告警。新语言前端准入四条件、分诊矩阵与固件规范见 `scripts/lib/langs/README.md`——描述符形态 `{exts,rules,prepare,handles,handle,regexFacts}`，无消费方不入闸。markdown 引用式链接 `[t][label]`/`[label]`（CommonMark 引用式，Rust/Go/docs 生态主流）经一遍 defs 表解析出 docref；`[label]:` 定义行本身不产边（定义≠使用）。

产出确定性 JSONL，schema v1.1（additive 于 v1）：

```
{v, unit, kind, name, file, line?, fidelity, scope, extractor, extra?}
```

- `unit`：语义身份键（`file`、`file#symbol`、目录为 `path/`）——内容锚，不用行号
- `kind`：节点=file/dir/decl；边=import/link/docref/mention/declare/export
- `fidelity`：exact（fs/git-oracle 层）/ syntactic（ast-grep）/ regex-degraded（显式降级）
- `scope`：repo / module / file-local / external / unresolved / computed——**先分 scope 再判异常**
- `extractor`：`walk@1` / `ast-grep@<ver>` / `line-regex@1` / `markdown@1` / `git-check-ignore@1`

v1.1 增量面：dir 单元（per-dir 覆盖断言主体）；markdown 适配器产 `docref`（`[x](y)` 死链标 `extra.dead`）+ `mention`（code-span/heading 符号提及，二遍解析 `file#symbol`，歧义标 `scope:unresolved`+`extra.ambiguous`）+ `extra.docrole`（frontmatter→文件名→路径兜底链）；gitignore 适配器以 `git check-ignore` 为 oracle 产 `declare` 边（`extra.source`/行 provenance/`negated`）；re-export 产 `export` 边且 decl 标 `extra.surface=public|internal`。

死链/计算式不丢边：`extra.dead=true`（相对 spec 解析失败）、`extra.mechanism=dynamic-computed`（`import(expr)` 静态不可解）。

### 2.2 契约评估（check-boundaries.mjs）

```
node scripts/check-boundaries.mjs --facts F.jsonl [--rules boundaries.yaml]
    [--json] [--staged a.mjs,b.mjs]
```

协议规范形 `∀x∈SubjectSet : Witness(x)`——八族按形式分三层（Q-∃ 检测 / Q-∀ 量化 / P 对账）：

- `forbidden`：`from` 域经 `via` 边到 `to` 域即违规（Q-∃）
- `allowed`：`from`+`via` 命中的边，其 dst 必须在 `to` 名单内（Q-∃；与 forbidden 重叠时 deny-overrides，交集非空被 lint 警为配置 bug）
- `required`：`units_in` 每单元至少一条 `needs` 边且目标域 ∈ `to_in`（Q-∀）
- `covered`：单元须被 `via` 入向边覆盖（Q-∀；docref 入向=文档拓扑覆盖）
- `isolated`：单元不得有任何 in/out 边——刻意隔离须 declare/exempt 认领（Q-∀）
- `reachable`：文件须自 `roots` 根集沿 `via` 边可达——mark-sweep 孤儿检测，
  不可达=孤儿候选（Q-∀；入口/机制调度件须登记根或豁免；dead/external 边不续传播；
  豁免件仍在图中续传——只压报告不除分析）
- `parity`：声明集（declare 边，`from_kind`/`to_kind` 选面）⟺ 实测集对账（P）。
  v1.4 扩为双源形：`declared`（字面名单）或 `declared_from` 选择子
  `{kind, mechanism, units_in, name}` 从边事实收名集，`observed` 侧同形
  （`observed_from` 或单元集 `observed_kind`/`observed_units_in`）；
  `direction: both|missing-only|undeclared-only`（缺省双向），规则级
  `exempt` 按名 glob 与源文件 glob 双通道（名豁免勿进顶层 exemptions——
  会污染其他规则面）
- `attrs`：单元属性谓词——文件名黑名单等无涉边断言（dir=none 退化支）
- 内建：dead link/docref/dead import 恒违规（断裂边无需声明）

规则条目 `{name, family, severity(error|warn|note), why, …}`——`name` 必填作 ruleId/suppression 锚；顶层 `exemptions: [{glob|unit, why, until?}]` 抑制全部 ∀ 族与 builtin 死检查（Q-∃ 域边界规则不吃豁免）。`manifest:` 段注册词表（families/edge kinds/extra_keys/extractors），未注册值 fail-closed。

- 退出码：0=干净 / 1=有违规 / 2=用法 IO 错 / 3=规则 schema 非法（fail-closed）

`producers.ref`（v1.4）：契约自带 ref 边生产器规格，run-boundary 经
`--emit-spec` 喂给 extract——`{lang, callee(regex), mechanism, role,
name_args, symbol_arg?(候选位数组), for_expand?(参数位数组),
units_in?, const_files?}`。语义在语言描述符内：rust 支持
`for x in [lit,…]`/`for (a,b) in [(l,e),…]` 元组解构字面量展开、
限定 callee 前缀容忍（`ops::register` 对 `^register`）、
`const_files` 声明常量源文件后 `const NAME: &str = "…"` 实值建表——
`ops::CTOR_MEMBER` 这类常量键归实名（值从源码读不抄契约，零匹配
fail-closed）、不可解析参数产 `UNRESOLVED` 段（可豁免可审计，
不静吞）；regex 降级档（超大件 ast-grep 静默零输出兜底，阈值
`MB_AST_MAX_BYTES` 缺省 8MiB，仅零匹配件触发）同机制产
`regex-degraded` ref。

`--staged` 增量模式只评 Q-∃ 族（forbidden/allowed/内建 dead）——∀/P 族在不完整视图下缺席断言必 fail-open（Rego negation-safety 同型），整族跳过。finding 契约 `{rule,severity,unit,expect,observed,fix}` 码点序输出。

### 2.3 域分类

`domainOf(rel, domains)` 首段锚定——`private/x/scripts/y.mjs` 归 `private`，中段关键词不参与。domains 有序，先命中先赢。

### 2.4 采纳面（任意仓接入）

```
pwsh scripts/install-hooks.ps1 -Target <repo> -WithBoundary
```

一条命令铺全采纳面：门禁引擎 kit（engine+gates+lib，gates.local 按设计不入默认 kit）+
`private/engineering/ming-boundary/scripts/` 组件子树 + `scripts/lib/` yaml 桥两件套 +
`gates.local/boundary-edge.mjs` 门 + `boundaries.yaml` 起始模板（`assets/boundaries.starter.yaml`）。
`boundaries.yaml` 已存在永不覆盖——契约是采纳侧资产。依赖：node 必，pwsh（yaml 桥）必，
ast-grep 建议（缺席 `--allow-degraded` 降 regex 档），git（ignore 适配器 oracle）可选。

手工等价路径：复制上述四面 + 自写 boundaries.yaml——无魔法路径约定，门与组件按
`<repo>/private/engineering/ming-boundary/scripts` 相对寻址。

### 2.5 pre-commit 接线（gates.local/boundary-edge.mjs）

staged 文件集（含 `.md` 与 `.gitignore`）→ `extract-facts --files` → `check-boundaries --facts - --staged` → 违规映射 findings。证据分级按 fidelity×family 交叉表：syntactic/exact 按规则 severity 映射（note 降为非阻断警告）；regex-degraded 一律降 warn 人工复核；finding `fix` 文本随消息透出。boundaries.yaml 缺席的下游仓静默跳过；evaluator/schema 失败=error finding。配置：`gate.boundary-edge.level`（.hooksrc §12）。

### 2.6 消费层编排（run-boundary.mjs + consumers/）

`run-boundary.mjs` = 编排者：**extract once → fan-out**——一次提取分发全部启用消费方
（evaluator 恒在，不进 consumers 段）。`boundaries.yaml` 顶层 `consumers:` 段逐 id 列举
激活（列举=唯一激活通道，列名无实现 fail-closed）。解析序：`entry:`（仓根内）→
`boundary.consumers/<id>.mjs`（采纳侧约定区，安装器永不覆写）→ `consumers/<id>.mjs`（内置件）。
内置三公民：`metrics`（report，诊断遥测）、`emit-skeleton`（files，manual-only，
拓扑推断起草 `boundaries.suggested.yaml`，永不覆盖既有文件，推断规则一律 warn）、
`diff`（report，事实面差分，需 `baseline:`）。协议与元数据全集见 `scripts/consumers/README.md`。
空契约面（采纳初期只有 consumers 无 rules）：evaluator 自动跳过+warning 而非撞
domains 硬性校验——evaluator 也只是消费方之一。`diff` 的 baseline 建议放仓根之外
或 gitignored——置根内会被 walk 计成新文件事实（baseline.jsonl 自己上 +added 清单）。
`--facts-extra e.jsonl[,e2…]` = 生产者侧外部归并口（ADR-0010 中/重档）：scip/cargo/
rustdoc 等适配器产物以同份 JSONL 契约并入评估与分发，事实用 `fidelity`/`extra`
自证出身（如 `fidelity:semantic`+`extra.producer`）；并入到新 tmp 副本不改写 `--facts` 源文件。

## 3. 红线 / 边界

- [禁止] 前端缺失静默降级——ast-grep 不在位且未传 `--allow-degraded` 时 exit 3（双事实源分叉比没有更糟）
- [禁止] 给 schema 加字段解释单个仓库特例——特例先记 evidence，泛化验证后再加（加法演进，schemaVersion 升位）
- [禁止] 行号进 `unit` 或作判定键——`line` 只是展示元数据
- [警告] 缺省谓词只认"gitignore 声明忽略"——非 git 根（或 `--no-ignore-scan`）时全文件扫描：vendored 树此时会产内容事实，边界靠契约里 exemptions/domains 表达，不靠目录名
- [警告] junction/symlink 不穿透、产 link 事实即停——消费方自行 resolve 目标再扫（实测语义，勿假设跟随）

## 4. 已踩过的坑（摘要）

- `if (!sg) { if (!degraded) die }` 嵌套写法曾把 `--allow-degraded` 降级路径整个吞掉——降级层是死代码（静默 fail-open，抽零边报零违规）。条件链必须互斥平坦
- `import_statement` 规则漏 `export * from`——shim 靠 re-export 承载，缺 kind 即 required 假阴性
- class 方法占声明面大头（实测 962/1352），漏 `method_definition` 等于符号面黑洞
- `import('./x')` 字面量与 `import(expr)` 计算式必须分流——后者标 `dynamic-computed` 而非丢弃
- 按名计数孤儿检测会把 file-local 助手全误标——`scope` 字段就是为这个存在的
- `export_statement` 节点文本含**整个被导函数体**——reexport 判定必须头锚定 `export {…}|\* from`，`specFromText` 全文本捞会把体内字符串的 `from 'x'` 误当 re-export（真仓炸出 `./b.mjs` 假死链）
- markdown `[x](y)` 匹配前必须先剥行内 code-span——文档描述 markdown 语法自身时 `[a](b)` 样例会被当死链误报
- yaml-lite 不吃跨行内联 list——manifest 词表段必须单行内联或块列表
- glob 翻译要占位符隔离 `**` 与 `*` 的替换序，否则 `.*` 里的 `*` 被二次替换吃掉
- win32 上 `spawnSync('ast-grep')` 对 npm 全局 `.cmd` shim 必然 ENOENT（CVE-2024-27980 禁 .cmd 直跑，多行参数过 shell 又必碎）——前端探测必须扫 PATH 推导包内原生 exe（lib/frontends.mjs，抽取器与测试共用，勿再硬编码机器路径）
- `git check-ignore -z -v` 的输出语法实测是"每条命中=4 个 \0 字段+\0 收尾"——传 `-n` 会混入 `path\0` 裸记录产生混用终止符歧义，非命中不产边就别传 -n
- golden JSONL 固件必须 `.gitattributes text eol=lf` 钉行尾——autocrlf=true 的机器 checkout 成 CRLF 即假死
- 围栏代码块（三反引号与 ~~~）是字面文本不是 markup——里面形如 `[b(0x14)]()`、`[native code](x)` 的 JS/伪码撞形曾灌出 30+ 假死链（IV8/js-reverse 实测），docref/mention 双双不取围栏内；行内写三反引号本身会打乱 code-span 配对，文档里别这么写
- yaml-lite 曾只剥双引号——`'probe_*.py'` 解析成带引号字面量致规则静默全哑；YAML 单引号包裹 glob 是手写惯用形，成对引号剥一层（不成对的不碰）
- `git check-ignore` 对**已登记 submodule** 内路径 fatal 128、整条 stdin 输出作废——输入须先按 `.gitmodules` 登记路径剔除（`base/reverse-skill` 实例）；但含 `.git` 的**非登记**嵌套仓（vertical 物化）照常喂——父仓忽略规则对它们有效，别一刀切
- spawnSync 对 ast-grep 的"批级失败"不止 ENOENT/ENOBUFS——os error 87、stdout 超 512MB 字符串顶（`ERR_STRING_TOO_LONG` 是抛异常非返回 error）都要走二分→单文件→regex 降级链；tabx.js 式巨型混淆单文件实证过
- `CONTENT_DIRS` 目录白名单是本仓私货不是通用语义——`js逆向/`、`crates/`、`projects/` 这类真仓目录词表对不上时抽取器静默退化成文件枚举器（js-reverse 曾零 import 事实）；谓词必须落成"未被忽略声明"而不是"目录名命中"
- yaml-lite 不认 flow-map `{ k: v }`——consumers 条目写成单行 map 会静默解析成字符串;块式键值才安全（runner 侧已加形态检测告警）
- 规则 `from`/`to`/`from_in`/`to_in` 收**域名**不是 glob——`from: 'src/**'` 恒假成死规则；ruleset-lint 已加"引用未声明域"校验（sentinels: external/__other__/__dead__/__none__）
- emit 类生成器的引导悖论：观察现状生成的契约会把违规固化成法律——只写新路径+推断一律 warn+零入度数量进注释（terraform `-generate-config-out` 先例）
- "目录被忽略"判定不能按 declare 首段截断——`**/.*` 这类点文件规则会误伤 `deployable/`（其子路径命中）；按"目录下文件 declare 覆盖率≥80%"判才稳

## 参考

- `references/fact-model.md` —— 协议层规格正身（v1.1 规范形/族定义/铁律/finding 契约/理论溯源）
- `docs/adr/ADR-0008` —— 事实模型决策（五分支/schema/契约三拆）
- `docs/adr/ADR-0009` —— v1.1 协议决策史（七商确点裁决 + 三语义条款 + 增量表）
