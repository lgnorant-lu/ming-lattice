# 语言前端质量门：分层、指标与语料注册表（设计档）

> 状态：**转正**（corpus.yaml + scripts/metrics.mjs：M1-M5+M7 可执行、
> --sync 物化钉 rev、fixtures: 采收断言；M8 试点跑通留档，门化候消费方）。
> 定位：开发侧仪表层——**生产器健康度，不进 boundaries.yaml 消费方契约链**。

## 问题

语言前端（`langs/*.mjs`）的"解析对不对"此前无规格化覆盖门：
测试固件是手工选形态，外部验证靠人工 dogfood，指标全靠临场扫描。
业界对此问题有成熟答案，但各家"语言层放多重"分歧巨大——本档给
出我们的分层裁决与指标清单，每项附证据锚。

## 业界分层光谱（2026-10 调研）

| 系统 | 前端层 | 中间契约 | 边语义位置 | 测试机制 |
|---|---|---|---|---|
| Kythe | per-lang extractor | 统一 graph schema | extractor 码 | verifier CLI |
| SCIP | per-lang indexer | index protobuf | indexer 码 | `scip snapshot/test` 注解固件 |
| Glean | per-lang Angle schema | 派生谓词跨语言视图 | schema 数据 | derived predicates |
| ctags | per-lang parser | tags 行 | parser 码 | Units input/expected.tags + afl-fuzz.r |
| semgrep | per-lang parser | AST_generic 归一 | 归一层 | **parse_rate 阈值定成熟度档** |
| stack-graphs | tree-sitter CST | .tsg scope-graph DSL | **数据化 DSL** | （已归档 2025-09，全仓只读） |
| 本组件 | `<lang>.mjs` 描述符 | JSONL facts v1.1 | 描述符码 | 16 组断言 + 本档指标 |

判词：边语义数据化（stack-graphs 路线）被 GitHub 试到 GA 后放弃——
`langs/README.md` §65"边语义永不来自上游"的立法得到外部实证背书。
我们的站位 = 词表上游化（derived）+ 边语义本地化 + schema 统一，
落在已验证区间内。

## 分层图

```
上游数据层（pinned）   node-types.json │ tags.scm │ linguist │ test/corpus 固件
    ↓ sync-langs.mjs（fetch+derive+verify，漂移人审）
派生件层               <lang>.derived.mjs（declKinds/refKinds/exts+provenance）
    ↓ import
描述符层（手写语义）    <lang>.mjs（rules/handle/resolveSpec/regexFacts）
    ↓ produces
事实契约层             JSONL facts v1.1（additive schema）
    ↓ consumed by
评估层                 check-boundaries / run-boundary / consumers
侧挂仪表层（dev，本档） corpus.yaml + metrics 探针 → M1-M8 报告
```

## 指标清单（semgrep/tree-sitter/scip 先例转译）

| # | 指标 | 定义 | 分母来源 | 门形态 | 实证状态 |
|---|---|---|---|---|---|
| M1 | 解析错误率 | 含 tree-sitter ERROR 节点的文件 ÷ 目标文件（按仓、剔除目标自带对抗固件目录） | corpus.yaml 语料 | ≥99% GA 档（semgrep 同形） | [实证] ra 实测 82.6%原始/99.33%除测试目录 |
| M2 | 语法覆盖 | 规则命中节点种 ÷ `node-types.json` 具名节点种；另列"边承载种"覆盖 | pinned node-types.json（fetch 即得） | 报告+盲区清单，不设阈值 | [实证] 9/169；揭露 const_item/static_item 上游盲区 |
| M3 | 边产率 | import/export facts ÷ KLOC，按语料仓 | corpus + wc | 跨版本回归带 | [实证] 20-35/KLOC 量级已建 |
| M4 | 畸形名率 | 名含 `{}`/换行/注释残渣 ÷ 全名（err fixture 豁免表） | facts 文件 | =0 硬门（豁免表外） | [实证] 检出过 ripgrep 67 条残留（旧档） |
| M5 | 确定性 | run1 facts ≡ run2 facts 字节级 | 任意语料 | 硬门 | [实证] 组4 已有，corpus 档待固化 |
| M6 | 降级同构 | regexFacts ≡ astFacts 在可控子集 | fixture | 断言组已有 | [实证] 组17（8 仓语料对账全零） |
| M7 | 上游固件命中 | 采收的 tree-sitter corpus/ra test_data 输入件过抽取器，断言无畸形名/预期叶数 | corpus.yaml `fixtures:` 段 | 逐件断言 | [转正] metrics.mjs 落地——match 正则选件+minImports/minDecls/maxMalformed 断言+minFiles 漂移检测；ra 采收 8 件 use_tree + 4 件 decl 固件全过 |
| M8 | 差分召回 | 与 precise 索引器（scip-*）边交集率 | 采纳仓 precise 输出（--facts-extra 同源） | 报告级，候审到有消费方 | [试点] fd 首份：recall 98.2%（54/55）——详见下节 |

## corpus.yaml 语料注册表（已转正 `ming-boundary/corpus.yaml`）

```yaml
version: 1
langs:
  rust:
    corpora:
      - { name: fd,            path: fd-small,     scale: small,
          minParseRate: 1.0,   maxMalformed: 0,  errFixtureGlobs: [] }
      - { name: rust-analyzer, path: ra-large,     scale: large,
          minParseRate: 0.99,  maxMalformed: 2,
          errFixtureGlobs: ['test_data/', 'fixtures/'] }
```

- `path` 相对 `MB_CORPUS_ROOT` 解析（跨机/测试注入面）；`errFixtureGlobs`
  对 M1 分母与 M4 双向豁免；`--gate` 越阈 exit 1；`--determinism` 起 M5
  双跑；`--node-types <file>` 注入本地档免网络。
- 批次上限按**命令行长动态算**（≤24K 字符/批——ra 400 件/批触 Win32
  32K 静默 spawn 失败实证，不拍固定数）。
- M7 fixtures 采收通道仍用探针路径（ra test_data 已实证），常驻固件化
  待第二语言上线时一并定形。

## 本轮探针实证裁决（临时件 `mb-metrics.mjs`）

1. **M1 的"错误"分两族**：目标仓自带对抗固件（ra 248 件集中在
   test_data——豁免表职责）+ 真源码语法滞后（10 件：`dyn 'lt + Trait`
   lifetime 前置绑定、`~const`/`[const]` token tree）。后者是
   **上游 grammar lag 签名**——指标的价值恰在把上游欠账与我们的
   bug 分离，裁决手段=pin bump 或明示接受，而非静默失明。
2. **M2 揭露上游词表盲区**：`const_item`/`static_item` 不在
   tree-sitter-rust@pin tags.scm——overlay 层正当补丁位（非漂移）。
   `impl_item` 上游正确归 refKinds（impl X=对 X 的引用），属已覆盖。
3. **M7 采收通道实证**：ra `test_data/parser/inline/ok/use_tree*.rs`
   直接喂抽取器——`use ::*`→`(unparsed)`、`use std::{::*}`→`std::`
   尾冒号残留、`use *`→`*`。均为可接受或微瑕输出，但证明合成
   fixture 的形态覆盖始终不及上游负样本库。
4. **ast-grep 规则面边界**：`kind: MISSING` 被拒（零宽隐式节点不可
   匹配）——parse-error 指标只数 ERROR；`--inline-rules` 多档用
   `---` 分隔文档合法（MISSING 报错是 kind 校验非分隔符问题）。
5. **spawn 批调 Windows 命令行 32K 限**：400 件路径参数触线静默
   失败，150/批全过——将来 metrics 工具批尺寸按参数总长度动态算。

## 附：两类"上游"的分界（tags.scm 数据 vs LSP 真值）

| 维度 | tags.scm（tree-sitter 多语言规则） | LSP/indexer（rust-analyzer 等） |
|---|---|---|
| 本质 | 语法词表：哪类节点算 def/ref、name 字段位 | 语义真值：每个引用解析到哪个定义（宏/cfg/跨 crate 后） |
| 回答 | "什么算 decl/ref" | "这个 use 到底绑到谁" |
| 成本 | 纯解析零构建 | cargo metadata+依赖+proc-macro 构建上下文 |
| 上游性 | 社区共享静态数据（pin+derived 可吃） | 每仓运行产物（不能 pin，只能按需跑） |
| 本组件位置 | derived.mjs 数据源（已入） | M8 差分 oracle / --facts-extra 通道（候审） |

判词：LSP 不能进门（准入闸 #3 零新运行时依赖 + 构建上下文不可得），
但 `rust-analyzer scip`（上游已并入，PR#12976）直接产 SCIP index——
对采纳仓跑一次做边集 diff 即 M8 召回报告。是按需 oracle 不是门；
差集分类（cfg 门死/宏生成漏/真漏）才是信息增量，裸 recall% 不是。

**M8 试点实录（2026-10-02，fd 语料 pin ce97e47）**：
`rust-analyzer scip .`（113s）→ protobufjs+scip.proto 解码 →
symbol→定义文档映射 → 文件级引用边集 vs 我们 syntactic import 边：

- recall=98.2%（54/55 我方边获 ra 引用证据）
- 唯一 miss `filter/mod.rs → filter/owner.rs`：`pub use self::owner::X`
  ra 解析到 `mod owner;` 声明位（本文件）非 owner.rs——口径差
  （我们产"文件依赖"边更直接），非缺陷
- ra 独有 73 条=全引用面（含调用/类型引用）天然超集；Import 角色位
  （0x2）实测 ra 不打——过滤后 0 边，故比对走全引用集
- 解码选型定案：protobufjs（node 原生栈）——`go install` scip CLI
  被上游 go.mod replace 指令拒，GitHub release API 限速；
  scip.proto 单文件自足无 import，loadSync+decode 约 20 行
- 观察项：ra 把 tests/*.rs 的引用解析进 src/*（testenv `use crate::`
  外另有跨目录边）——疑 ra 按 workspace 视图归并测试 crate，留档候查

**M8-js 试点实录（2026-10-02，dependency-cruiser@18.4.0 差分）**：

`npx -p dependency-cruiser@18.4.0 depcruise <dirs> --no-config
--output-type json` → local 边集（resolved 归一 `./` 前缀）vs 我们
module 边集。三语料差分结果：

| 语料 | ours | theirs | missed | ours-only | 结论 |
|---|---|---|---|---|---|
| express | 153 | 153 | 0 | 0 | 边集逐条等位 |
| solid | 17 | 12 | 0 | 5 | 多产全为 depcruise 入口闭包外未巡件 |
| vite | 1907 | 112 | 0 | 1795 | depcruise 只巡 272/1587（entry 闭包）+ 资产边口径差（166 条 .css/.png/.vue） |

- **差分产出 3 真修复**：目录 spec `''` 后缀 `existsSync` 收目录产
  `->.` 假边（强制 isFile）；`require('.')`/`..` 无尾斜杠误 external
  （REL_SPEC 放行行尾）；`./w?worker&url` bundler query 后缀丢边
  （spec 剥 `[?#]`）——外加 to 的 `./`/`.//` 前缀归一
- **判据**：口径先归一（`./` 前缀、资产边声明性纳入我方）再比；
  ours-only 主导项若是"对方未巡文件"则记覆盖差非缺陷
- js 边级 oracle 定候选：depcruise（npx 免装、JSON 自足、TS 内建）；
  madge 未测——edge 级差分已实证，第二层候选价值有限

**python precise 层选型调研（2026-10-02，实装验证）**：

- `scip-python`（Sourcegraph）：**出局**——npx 启动即崩于
  `Invalid regular expression: /\/g`（PythonEnvironment.ts 烤死
  Unix 路径正则，Windows 不可运行）；且上游仓已归档。归档+跨端
  缺陷双杀，不作 oracle 候选
- pyright/basedpyright：纯 LSP 诊断件，无 index/LSIF 导出格式——出局
- **grimp**：**边级 oracle 首选**（import-linter 图引擎，静态构图不执行码，
  模块名→文件解析含 sys.path/namespace 包——与 resolvePy 语义级同构，
  差分粒度天然对齐，避 rust M8 的符号级口径差）
- **jedi**：符号级候选（infer/goto 解到定义文件）——粒度比边级细，
  仅在需要符号级差分时启用
- 门化地位同 rust M8：报告级 oracle，候"采纳仓需 precise 对账"消费方

**M8-python 试点实录（2026-10-02，grimp@3.17 差分，三仓全精确）**：

`uv venv` + `grimp.build_graph('pkg')`（PYTHONPATH 指包根，src-layout
指 `src/`）→ `find_modules_directly_imported_by` 边集 vs 我们 module
边集（modOf：`x/__init__.py→x`、剥 `.py/.pyi`）。三语料差分结果：

| 语料 | ours(归一) | grimp | missed | ours-only | 结论 |
|---|---|---|---|---|---|
| flask(+sansio) | 95 | 95 | 0 | 0 | 边集逐条等位 |
| django | 3231 | 3231 | 0 | 0 | 7083 件规模逐条等位 |
| requests | 73 | 73 | 0 | 0 | 边集逐条等位 |

- **口径归一规则**：`from P import a,b` 我方发"包对象边（P 的
  `__init__` 执行是真实依赖）+ 逐名子模块边"；grimp 逐名记——名字
  是模块→叶子边，非模块名（类/函数）→包边。归一法：同 (file,line)
  语句组内，回读源行取名字表，**全名皆已解子模块才弃包边**（混合
  `from django.db import NotSupportedError, models` 中类名须留包边，
  否则会假 missed——粗归一曾造 35 条伪差）
- **grimp 使用面实录**：普通包内 PEP420 namespace 子包不随父包遍历
  （flask/sansio 无 `__init__.py`——须 `build_graph('flask','flask.sansio')`
  显式补）；查子包触发 `find_spec` **执行父包 `__init__`**，依赖须可
  导入（flask 需 werkzeug/jinja2 等装齐）——oracle 环境成本记录
- **差分产出 2 真修复**：① `__init__.py` 内 `from . import x` 的包边
  归 `to==rel` vacuous 自环——AST/regex 双路抑制（grimp 不产自环），
  re-export 锚从自环包边改挂子模块边（语义更准）；② **CI 文件系统
  幽灵子模块边**——`from geos import Point`（类名）的逐名探测
  `existsSync('Point.py')` 在 Windows 误中 `point.py`；CPython
  FileFinder 大小写精确比对，改 `statExact` 逐段 readdir 校验
  （DIR_CACHE 摊销），django 消 172 条幽灵边
- **判据沉淀**：归一后 missed=0+ours-only=0 是"边语义对齐"的强证据；
  我方未归一原图是严格超集（包对象边对边界分析有效——`__init__`
  可带副作用），非缺陷

**M6 双路对账实录（2026-10-02，regex 降级路 vs AST 路边集核验）**：

降级档一直声称"语义同构"但从未系统验证——写 per-file
`regexFacts` 探针对全量 py 件做 `(file→to)` 边集对账，django
3043 件首轮抖出 **15 处分歧 = 4 个真缺陷**：

| 缺陷 | 形态 | 修法 |
|---|---|---|
| file-dir 无条件前置根 | `import typing` 在 flask 包内误中兄弟 `typing.py`——包成员目录不进 sys.path | rootsFor 仅非包目录（dir 无 `__init__`）前置，AST 路同步切 rootsFor |
| self-hit 吞真目标 | 松散目录 `flask.py` 里 `from flask import Flask` 自遮蔽 | resolvePy 自**文件**命中让位下一根；自**包**命中保 pkgDir 继续探子模块（`from django.conf import global_settings` 于 conf/__init__.py 是真边） |
| 行尾注释混入 names | `from x import views  # noqa` 注释进名字表 → 子模块探测 miss | 注释并入单遍掩蔽扫描（串外 `#` 截断） |
| 串内括号/撇号污染 | `'('`/`it's` 使 depth 假正 → 后续行整片跳（checks.py:765 注释 `(FIXME` + 下行注释撇号吞 `)` → depth 永久+1）+ docstring 样例假边 + 跨行 `from x import (\n` 丢子模块边 | 单遍扫描统一三引号/单双引号掩蔽 + `#` 截断；from-import 括号未闭续吃行（逐行剥注释+同步 depth） |

**终态**：flask/django 双路边集**完全同构**（regex-only=0、
ast-only=0）。降级档语义对齐从口头声明变成大语料实证。

**M6 全语言扩展实录（2026-10-02 续）**：对账扩到 rust/js/sh 后
再抖三层缺陷，全部根治；新增测试组 17 按形态钉死：

| 语料 | 首轮差 | 根因 | 修法 |
|---|---|---|---|
| fd/ripgrep | 12/12 对称 + 58 ast-only | regex 缺 `ctx.inline`——内联 `mod tests { use super::*; }` 里 super 错锚 crate 根/目录；多行 `use a::{b,\n c}` 首行无分号整体丢；`r#"..."#` 跨行原生串未掩 → 宏内 `/**` 文本卡死块注释态吃掉 5000 行 | regexFacts 事件序扫描：掩蔽（`//`/嵌套 `/* */`/串/字符字面量/原生串含跨行）→ 括号深度 + 内联 mod 栈 → use 取位置处栈快照；多行 use 续行并语句 |
| ripgrep | 1 ast-only | `use super::*` 两路都产**目录值** `to`（永不匹配文件 fact 的建模疣） | resolveSpec 空 rest 分支锚到宿主文件（`base.rs`/mod.rs/lib.rs/main.rs），AST 路同步受益 |
| typeshed | 112 regex-only | `from __future__ import` 在 `stdlib/__future__.pyi` 可解析时产幽灵边——**tree-sitter 归 future_import_statement 节点**，AST 路天然不匹配（编译器指令非真依赖） | regex 路 `spec.mod==='__future__'` 同义跳过 |
| vite | 136 ast-only + 1 regex-only | js regexFacts 裸跑：无掩蔽（`// import x` 假边）、无多行 `import {`/`export {` 组（ASI 无分号）、无 `export ... from`/动态 `import()`、无顶层闸（函数内缩进 `import` 语法错误面 AST 不产） | 两遍法：vis（注释+串+模板全掩）只做关键字定位，spec 回原行同位重解析；真组形态才续行（`export const x = {` 字面量不误吞）；`export type` 对齐 AST 不收（type-only 运行期擦除）；d2>0 块内静态 import/export 排除但 `import()` 动态任意深度放行 |

**全语料终态**：fd/ripgrep/express/solid/vite/flask/django/typeshed
**8 仓全部 regex-only=0、ast-only=0**——三语言降级档与 AST 路
边集级同构均有语料实证。组 17 把内联 mod 语境/多行组/掩蔽负向
/`__future__`/成员调用排除等形态钉成回归断言。

**IV8 消费方实证（2026-10-02，首个真实采纳仓）**：

`iv8_rs` 包 49 模块：归一后 ours=99 grimp=93，**missed=0**，
ours-only=6 全为"我方更强"的口径差——4 条 `_iv8.pyd` 原生扩展边
（grimp 只构图 `.py`）、1 条 `sys.path.insert` 注入边
（profile_gate→scripts.check_pairwise_profile——松散根模型恰好
捕获真实运行时依赖）。M8-python 完成从语料到真实消费方的闭环。

**js 族描述符化实录（2026-10-02，langs/js.mjs 升格）**：

js 系 8 个扩展名归一描述符，但 ast-grep 只供三 grammar——
路由表 `GRAMMAR_OF`（描述符持有，metrics M1 与 extract 分桶共用）：

| grammar | exts | 语料实证 |
|---|---|---|
| JavaScript | .js .mjs .cjs | express 141 件 .js 全过 |
| TypeScript | .ts .mts .cts | vite 572 ts + solid 56 ts |
| Tsx | .jsx .tsx | vite jsx/tsx + solid tsx |

- **`.jsx` 必须挂 Tsx 不是 JavaScript**：JavaScript grammar 不含 JSX
  元素语法，.jsx 走它必报 ERROR（create-vite 模板实证）；且 ast-grep
  按**规则语言的扩展名表**过滤目标文件——描述符内路由不生效，须
  `scripts/lib/sgconfig.yml` 的 `languageGlobs: {Tsx: ["*.jsx"]}`
  + `-c` 显式引用（叠加不覆盖默认映射，已实证 .tsx 不受影响）
- **CJS `require()` 是边不是噪声**：express 首跑 M3=0 暴露——
  `require-call` 规则（call_expression has function=identifier require）
  + specFromText require 分支补全后 18.5 边/KLOC
- **M1 分桶按描述符 `astLangOf(ext)`**：metrics.mjs m1ParseRate 接受
  ext→grammar 函数，三桶各探各自 grammar
- **畸形名防线同构 python**：decl 裸名 regex 取不出即跳过，
  禁 slice 兜底（solid `x: () => void =` TS 属性形、vite
  `[Symbol.iterator]` 计算名方法实证；后者由 decl-method 扩
  `\[...\]` 名捕获正常收纳）
- **上游 grammar 版本缺口实录**（ast-grep 0.45.3 捆绑
  tree-sitter-typescript）：TS4.7 `<in out T>` variance（solid
  signal.ts）、TS5.0 `export type * as ns`（vite index.ts+
  terserOptions.d.ts）、`typeof import()` 泛型实参、.d.ts 多行
  泛型列表——全部文件级 errFixtureGlobs 精准豁免（漂移不掩），
  升 ast-grep 后逐条复核回拉
- 语料：express(small,.js) / solid(med,ts+tsx) / vite(large,全八扩展名
  单仓覆盖)——三仓 M3=18.5/12.7/36.7 边/KLOC、M4=0、M5 byte-identical

**js upstream 接线实录（2026-10-02，js 入 derived 阵营）**：

`upstream.yaml` 补 js pin（tree-sitter-javascript@58404d8）——js 不再是
唯一无上游语言；`sync-langs` 产 `js.derived.mjs`（decl=12 ref=3），
M2 覆盖仪首次对 js 实报 19/119 节点种 = 16%。derived 驱动下
`js.mjs` 的 decl 规则从手写五形扩到上游全词表：

| 新增承接形态 | 上游 capture | 实证 |
|---|---|---|
| function/class 表达式 | `[class/class_declaration]` 交替组展开 | `const C2 = class Inner {}` → Inner |
| generator 表达式 | generator_function | `function* gfN(){}` |
| 赋值声明 | assignment_expression names=[left\|left>property] | `x=()=>{}`、`obj.m=fn`→尾段名 |
| 对象 pair | pair key:property_identifier + 值函数形 | `{p:()=>{}}`→p |
| exported const | export_statement value>left | `export` 赋值形 |

- **交替组展开与值形补位**：`[...]` 伪帧闭合时捕获按 childKinds
  展开到各候选、names 按子 kind 分桶（byKind）——组共享 names
  会互借名路径。`value/right:[arrow|fn-expr]` 上游值形约束
  names 模型不承载，`VALUE_FN_OF` 手写补 `has:any` 位
- **两处手写承接**：method_definition 上游限 property_identifier
  名会漏 `[Symbol.iterator]`（vite 实证）——保留手写规则、该 kind
  不生成防双发；`_` 通配宿主（`name:(_)@name`）非合法 ast-grep
  kind，namesRuleYaml 遇 `_` 尾段整条名约束退化（词表留 derived）
- **谓词/锚点伪节点根治**：parseTags 把 `#pred`/`@doc`/`.*+?` 当过
  宿主产 `inside=null` 崩溃——谓词帧惰性化（不并 names、不占
  lastChild）、量词锚点原子不占 pending、invalid host 拒绝
- **副产修复**：python.mjs 缺 `rulesFor` 导出——M2 对 python 一直
  静默 0%（历史欠账，js 接线倒逼发现）；补直通 canonical 后实报
  8/129=6.2%

**derived 字段约束归位（2026-10-02，系统性漏损根治）**：

`derived.mjs` 曾只序列化 `kind`/`inside`/`nameKind`，上游 tags.scm 的
`field:` 约束全丢——同一根因两度案发（rust const/static 词表补丁、
python assignment 丢 `left:(identifier)` 产 `obj.attr=` 畸形名）。
现 `parseTags` 增 names 路径追踪（`names:[{path:[f1,f2..],kind}]`，
交替组 `[...]` 建伪帧共享外层 field——`function:[id|attr]` 实证坑），
`namesRuleYaml` 把约束译回规则层 `has:{field}`/`any:` 组合——上游语义
在 match 时生效而非 handle 侧事后过滤（handle 裸名过滤降为纵深二道）。
回归：django/typeshed/rust-fd 全绿，facts 面零漂移（typeshed 170346
条与修前一致），`--verify` 对账 ok。

## 不采纳项

- **重型生态工具入库**：scip-rust-analyzer/semgrep/ctags 二进制是
  M8 差分 oracle 的候选，按需对采纳仓实例化，不进 kit（准入闸#3
  零新运行时依赖 + ADR-0010 precise 走 --facts-extra 归并）。
- **边语义 DSL 化**：stack-graphs 归档实证此路在规模上不成立。
- **查询层**（Datalog/Angle 式 facts 派生）：fact-model §134 已立法
  不做 Glean/Trustfall/Joern 式引擎；JSONL facts 是终端抽象。
- **MISSING 节点探针**：ast-grep kind 面不可达，放弃。

## 候审项

- M8 差分召回：试点已跑通（上节实录）——门化仍候"采纳仓需要 precise
  边对账"的真实消费方；试点管线（scip decode.cjs）属一次性 dev 件不入库
- corpus.yaml + metrics.mjs：已转正（suite=corpus-metrics；实跑 fd/rg
  M1=100%、ra 99.33% 实欠10/豁免248、M4=0；--sync 物化钉 rev；
  fixtures: 段驱动 M7）
- fuzz 面（ctags afl-fuzz.r 先例）：最末位，语法生成器驱动
