# lib/langs — 语言前端描述符目录

每语言一个 `<lang>.mjs` 描述符件，导出契约：

```js
export const exts: Set<string>            // 触发扩展名
export const rules: string                // ast-grep 规则 YAML（syntactic 档）
export function prepare(ms): object       // 每文件预处理（声明表/range 索引等）
export const handles: (id) => boolean     // 该语言认哪些 ruleId
export function handle(id, m, ctx): true  // 匹配→facts 推入 ctx.out
export function regexFacts(root, rel, extractor): facts[]  // 降级兜底
```

`ctx = { root, rel, extractor, out, prepared }`。骨架参照 `rust.mjs`。

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
| Rust | `use`/`mod x;`/`pub use` | crate::/self/super/modDir，cargo crate 根 | [OK] 已落地 | rust-analyzer→SCIP | **已入**（IV8 dogfood） |
| Python | `import a.b`/`from .x import y` | pkg→dir、`__init__.py`、相对点=父包 | [OK] 可行（sys.path/动态 `__import__` 诚实缺席） | pyright/scip-python | 候消费方 |
| Go | `import "path"` | module path→dir、`internal/` 约束、需读 go.mod 前缀 | [OK] 大体可行（replace/workspace 面缺席） | gopls/scip-go | 候消费方 |
| Java | `import a.b.C` | package→目录 1:1 | [OK] 可行（多源根/build 面缺席） | scip-java | 候消费方 |
| C/C++ | `#include` | quoted=相对、angle=-I 依赖 | [受限] include path 需构建上下文 | clangd→SCIP | 候选，语义面偏深 |
| TypeScript/JS | `import`/`export`/`require` | 相对路径+index 兜底（已有） | [OK] 已落地 | scip-typescript | **已入** |
| Bash/sh | `source`/`.` | file→file | [OK] 轻量（同 ps1 档即可） | — | 候消费方 |
| Lua | `require` | `a.b`→`a/b.lua`+init.lua | [OK] 轻量 | — | 候消费方 |
| Zig | `@import` | file→file 直接 | [OK] 轻量 | — | 候消费方 |
| Ruby | `require`/`require_relative` | load path 半动态 | [受限] 可降级 | sorbet | 候消费方 |
| PHP | `use`/`require` | PSR-4 前缀映射（composer.json） | [受限] 需读包配置 | — | 候消费方 |
| Kotlin | `import` | package≠目录 | [受限] 命名空间脱钩 | — | 不建议 syntactic |
| Swift | `import` | module≠文件 | [受限] 同上 | — | 不建议 syntactic |
| C# | `using` | namespace≠目录 | [受限] 同上 | csharp-ls | 不建议 syntactic |

"不建议 syntactic" = 文件粒度映射失真面大，直接走 precise 通道更诚实。

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
