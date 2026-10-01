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
| M6 | 降级同构 | regexFacts ≡ astFacts 在可控子集 | fixture | 断言组已有 | [实证] 组5 |
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
