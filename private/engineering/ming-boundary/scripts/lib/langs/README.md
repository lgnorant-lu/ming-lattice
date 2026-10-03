# lib/langs — 语言前端描述符目录

## 新语言入场五步（索引——每步细节指回下文对应节）

```
1. 调研   分诊矩阵查先例 → 上游金源表找词表/固件锚 —— 先答"值不值得做"
2. 定界   边面语法物 + 模块语义速查填矩阵行 —— syntactic 够不着的归 precise 通道
3. 过闸   准入四条件逐条对（真消费方/syntactic 档/零新依赖/降级戳）——缺一即停
4. 落地   <lang>.mjs 描述符 + upstream.yaml pin + sync-langs 派生词表
5. 钉死   固件断言面七场景补齐 —— 新语言不重写测试骨架
```

每语言一个 `<lang>.mjs` 描述符件，导出契约：

```js
export const exts: Set<string>            // 触发扩展名
export const rules: string                // ast-grep 规则 YAML（syntactic 档）
export function prepare(ms): object       // 每文件预处理（声明表/range 索引等）
export function prepareRun({root,files})  // run 级预处理（可选：python 包索引）
export function sniffFile(abs): boolean   // 可选：无扩展名件 128B 嗅探认领（shebang）
export const handles: (id) => boolean     // 该语言认哪些 ruleId
export function handle(id, m, ctx): true  // 匹配→facts 推入 ctx.out
export function regexFacts(root, rel, extractor): facts[]  // 降级兜底——
//   M6 义务：regexFacts 边集 ≡ handle 边集（test-ming-boundary 组17 钉；
//   单遍掩蔽状态机跨行延续，spec 需用字段两遍法回原行取）
```

`ctx = { root, rel, extractor, out, prepared, run }`（run=prepareRun 返回值，
无 prepareRun 的语言为 null）。骨架参照 `rust.mjs`/`python.mjs`。

## 准入闸（ADR-0010，四条须全满）

1. **真消费方**——至少一个采纳仓的实际边界契约需要该语言的边/decl 面；
   "将来可能用"不算。无消费方的前端=无断言面的事实源，不测也测不准。
2. **语法可捕获**——需求面停在 syntactic 档；要语义级（宏/feature/类型）
   的一律走外部 precise 证据源（`--facts-extra` 归并口），不在 kit 内拟合。
3. **零新运行时依赖**——ast-grep 内置 language 头或纯 line-regex；
   需要新解析器/工具链的语言只走适配器。
4. **自带降级戳**——`fidelity` 显式，事实不假装是语义提取。

## 分诊矩阵（常见语言——研究档案，非实现承诺）

| 语言 | 边面语法物 | 模块语义速查 | syntactic 可达性 | precise 生态通道 | 闸状态 |
|---|---|---|---|---|---|
| Rust | `use`/`mod x;`/`pub use` | crate::/self/super/modDir，cargo crate 根 | [OK] 已落地 | rust-analyzer→SCIP（fd 试点 recall 98.2%） | **已入**（IV8 dogfood） |
| Python | `import a.b`/`from .x import y` | pkg→dir、`__init__.py`、相对点=父包、PEP420 命名空间目录 | [OK] 已入 `python.mjs`（sysroots 由 __init__ 链实算——prepareRun 包索引，非猜词表；sys.path 动态/`__import__` 诚实缺席） | **grimp**（flask/django/requests/IV8 归一后逐条等位；scip-python 归档失效、pyright 无索引导出——已弃） | **已入（v1.3）**——IV8 521py 零边实证过闸 |
| Go | `import "path"` | module path→dir、`internal/` 约束、需读 go.mod 前缀 | [OK] 大体可行（replace/workspace 面缺席） | gopls/scip-go | 候消费方 |
| Java | `import a.b.C` | package→目录 1:1 | [OK] 可行（多源根/build 面缺席） | scip-java | 候消费方 |
| C/C++ | `#include` | quoted=相对、angle=-I 依赖 | [受限] include path 需构建上下文 | clangd→SCIP | 候选，语义面偏深 |
| TypeScript/JS | `import`/`export`/`require`/动态 `import()` | 相对路径+index 兜底+目录 spec+bundler query 后缀剥离 | [OK] 已落地 `js.mjs`（8 扩展名归 3 grammar——`.jsx`→Tsx 路由走 sgconfig languageGlobs；`.d.ts` 多行泛型等 4 处上游 grammar 缺口走文件级豁免） | **depcruise**（express/solid/vite 差分 missed=0——入口闭包口径差须归一） | **已入（v1.6）** |
| Bash/sh | `source`/`.` | file→file（相对文件目录，.sh/.bash 探测） | [OK] 已入 `sh.mjs`（v1.4）——上游 tags.scm 缺席，decl 词表手写；`$VAR` 动态 source=unresolved+sh-source-computed 不判死；`bash x.sh` 子进程调用不产边 | — | **已入**——宿主仓脚本面审计（21 sh 件+IV8 2 件） |
| Markdown | 无边面——块骨架 decl（frontmatter/section×2方言/blockquote-head/fence/refdef） | 消费方=docClass/docmeta 图层（头载体定位/section 层级/fence 掩蔽面）；`.mdx` 走 sgconfig languageGlobs | [OK] 已入 `markdown.mjs`——上游 tags.scm 缺席词表手写（node-types.json 对账金源）；行内 link/code_span 属上游未 bundle 的 inline grammar 诚实缺席；regexFacts 行扫描同构兜底经 6,438 件全仓差分对齐 tree-sitter-md 语义（M6 parity 组19 钉板：BOM/缩进ATX/setext-listish/fence 上下文/html_block 全谱/refdef 包法/utf8-fatal） | — | **已入**——消费方 docmeta/docClass 在位；IV8 254/254 判决对拍基线 |
| Lua | `require` | `a.b`→`a/b.lua`+init.lua | [OK] 轻量 | — | 候消费方 |
| Zig | `@import` | file→file 直接 | [OK] 轻量 | — | 候消费方 |
| Ruby | `require`/`require_relative` | load path 半动态 | [受限] 可降级 | sorbet | 候消费方 |
| PHP | `use`/`require` | PSR-4 前缀映射（composer.json） | [受限] 需读包配置 | — | 候消费方 |
| Kotlin | `import` | package≠目录 | [受限] 命名空间脱钩 | — | 不建议 syntactic |
| Swift | `import` | module≠文件 | [受限] 同上 | — | 不建议 syntactic |
| C# | `using` | namespace≠目录 | [受限] 同上 | csharp-ls | 不建议 syntactic |
| React (.jsx/.tsx) | 标准 JS/TS | 无专属模块语义 | [OK] **已入**——Tsx 桶收齐，无专属前端 | — | 已入（随 v1.6） |
| Vue/Svelte (SFC) | `<script>` 块内标准 JS/TS | 需块剥离层（SFC 容器非 grammar 问题）；`<template>` 基本不产边 | [受限] 需 SFC 剥离前置 | vue-tsc/volar、svelte-language-tools | 候消费方——全消费仓 0 文件实测（2026-10-02） |

"不建议 syntactic" = 文件粒度映射失真面大，直接走 precise 通道更诚实。

**Rust 已落地件的已知盲面**（syntactic 档诚实缺席，IV8 实测记录）：
`include!`/`include_str!` 文件包含不产边、`#[path]` 重定向不解析、
`extern crate`（2015 版次遗留）不产边、宏生成项无 decl。
`#[cfg]` 属性**不求值但标记** `extra.cfg=true`（含内联 mod 内 use 的传递门），
消费方据以区分"真死链"与"条件缺席"（IV8 实测 70 条 cfg 事实、0 误死）。

## 上游金数据源（调研档案——词表面可借上游演进，边语义不可借）

| 上游 | 数据 | 覆盖 | 可转化物 |
|---|---|---|---|
| tree-sitter 各语法仓 `queries/tags.scm` | 官方 `@definition.*`/`@reference.*` 标准词表 + 每语言定义/引用查询 | ~200 语言 | decl/引用边的官方规则源（GitHub 代码导航同套） |
| tree-sitter `test/corpus/` | 官方解析固件（输入→语法树期望） | 同上 | 金固件摘选（MIT，可引用式复用） |
| GitHub Linguist `lib/linguist/languages.yml` | 语言→扩展名/文件名/别名 | 813 语言 | `exts` 表上游锚，替代手写集合 |
| universal-ctags `Units/` | 每语言 input+`expected.tags` 金对 | ~100 语言 | decl 断言 oracle 参照（tags 语义≠边，翻译成本高） |

**分界线**：tags.scm 覆盖"什么算定义/引用"（decl/mention 词表），
**不管模块边语义**——`use`/`import`/`#include` 的路径→文件映射是构建系统层
（cargo/go.mod/tsconfig），上游无对应物。上游能消"写什么节点"，
消不掉"边去哪"——后者仍须按语言落地，故准入闸不因上游存在而撤除。

兼容性注意：tags.scm 是 tree-sitter 原生 S-expr 方言，本 kit 跑 ast-grep
`kind:` 规则——可译粒度="节点种清单+`@name` 字段绑定"（`has:{field:name}`），
完整方言要么写转换器要么另接 `tree-sitter` CLI 做第二前端。

**已落地（v1.3 Python 入场触发）**：

```
upstream.yaml        pin 表：lang→{grammar repo, rev, tags path, linguist key}
sync-langs.mjs       CLI 壳：取数(curl)+写盘；解析核在 derive.mjs（纯函数）
derive.mjs           tags.scm/linguist 解析、派生定型、pin 对 derived 对账
<lang>.derived.mjs   产物：declKinds/refKinds/exts+provenance+DO-NOT-EDIT
```

**更新管理三层**（pin 不自动跟上游——漂移必须人审，同 registry.yaml 哲学）：

| 层 | 命令 | 网络 | 职责 | 挂载 |
|---|---|---|---|---|
| 离线对账 | `sync-langs --verify` | 无 | derived.provenance.rev==pin；stale/missing/orphan 即 exit1 | `verify.mjs --profile full` 步骤表 |
| 在线漂移 | `sync-langs --heads` | ls-remote | pin vs grammar HEAD 报告（不代改） | `update.ps1` 尾部（DryRun 跳过） |
| 重生成 | `sync-langs` / `--check` | fetch | 派生重写 / 字节级对账 | 人审 pin 后手动 |

**去 POSIX 化（v1.4）**：YAML 读取改 `lib/yaml.mjs`——纯 mjs 子集解析
优先（零子进程跨端），不支持的构造抛错回退 pwsh 桥，桥也缺席才 die；
`sync-langs` 取数改 Node 22 全局 `fetch`（去 curl 依赖）。组15 钉死
lite≡pwsh parity + 非法构造 fail-closed。

**手写面剩余**（上游给不了的——这是规则不是债）：边规则
（use/import/#include 的语义）、模块→文件解析（构建系统层）、
shape 词 overlay（上游 class 粗词→本组件 fn/trait/macro 细词）、
名称抽取 regex。python.mjs 的 sysroots 曾用猜词表，v1.3 已改
包索引实算——**凡能由仓内结构推出的都不许手写词表**。

## 固件规范（金数据约定）

每语言一组标准固件，覆盖**同一张断言面**——新增语言=补固件块+断言，
不重写测试骨架（现状位于 test-ming-boundary.test.mjs 组3）：

```text
必备场景                     断言面
静态边命中                   import.extra.to=相对解析、scope=module
外部源边                     scope=external（裸首段/包前缀）
死边                         extra.dead=true、scope=unresolved
面边                         pub use→export 双发（或该语言等价物）
decl 族谱                    该语言声明形态全型覆盖 + surface=public/internal
降级戳                       --allow-degraded 路径产 regex-degraded 同构事实
语言特有语义                  每语言 1-2 条（rust=super 深度/crate 根/内联 mod）
```

## 明确不做（防投机回潮）

- 不预建表驱动注册表——第三语言落地时与 js/ts/tsx 一起迁（三现律）
- 不为"语言全家桶"产事实——无消费方的事实是噪音源不是资产
- 不在 langs/ 内放适配器——外部 precise 证据经 `--facts-extra` 通道，
  适配器件属采纳仓一侧不归 kit
