---
name: ming-boundary
description: 仓库结构事实提取与边界契约断言组件——JSONL 事实流（file/decl/import/link）+ boundaries.yaml 声明式契约（forbidden/allowed/required）+ 纯评估引擎。当涉及项目图、依赖边界审计、孤儿符号检测、断链检测、生成与手写接缝核验、跨文件应消费断言时使用。
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
```

产出确定性 JSONL，schema v1：

```
{v, unit, kind, name, file, line?, fidelity, scope, extractor, extra?}
```

- `unit`：语义身份键（`file` 或 `file#symbol`）——内容锚，不用行号
- `kind`：file / decl / import / link（前两者=节点，后两者=边）
- `fidelity`：exact（fs 层）/ syntactic（ast-grep）/ regex-degraded（显式降级）
- `scope`：repo / module / file-local / external / unresolved——**先分 scope 再判异常**
- `extractor`：`walk@1` / `ast-grep@<ver>` / `line-regex@1`

死链/计算式不丢边：`extra.dead=true`（相对 spec 解析失败）、`extra.mechanism=dynamic-computed`（`import(expr)` 静态不可解）。

### 2.2 契约评估（check-boundaries.mjs）

```
node scripts/check-boundaries.mjs --facts F.jsonl [--rules boundaries.yaml]
    [--json] [--staged a.mjs,b.mjs]
```

- `forbidden`：`from` 域经 `via` 边到 `to` 域即违规
- `allowed`：`from`+`via` 命中的边，其 dst 必须在 `to` 名单内
- `required`：`units_in` 每个单元至少一条 `needs` 边且目标域 ∈ `to_in`
- 内建：dead link / dead import 恒违规（断裂边无需声明）
- 退出码：0=干净 / 1=有违规 / 2=用法 IO 错 / 3=规则 schema 非法（fail-closed）

`--staged` 只评 staged 文件发出的边（pre-commit 语义）；required 族永远全树（边存在性是全局性质）。

### 2.3 域分类

`domainOf(rel, domains)` 首段锚定——`private/x/scripts/y.mjs` 归 `private`，中段关键词不参与。domains 有序，先命中先赢。

## 3. 红线 / 边界

- [禁止] 前端缺失静默降级——ast-grep 不在位且未传 `--allow-degraded` 时 exit 3（双事实源分叉比没有更糟）
- [禁止] 给 schema 加字段解释单个仓库特例——特例先记 evidence，泛化验证后再加（加法演进，schemaVersion 升位）
- [禁止] 行号进 `unit` 或作判定键——`line` 只是展示元数据
- [警告] vendored/base/deployable 不产内容事实（白名单外）——只 file/link，别指望从 vendored 里抽符号
- [警告] junction/symlink 不穿透、产 link 事实即停——消费方自行 resolve 目标再扫（实测语义，勿假设跟随）

## 4. 已踩过的坑（摘要）

- `import_statement` 规则漏 `export * from`——shim 靠 re-export 承载，缺 kind 即 required 假阴性
- class 方法占声明面大头（实测 962/1352），漏 `method_definition` 等于符号面黑洞
- `import('./x')` 字面量与 `import(expr)` 计算式必须分流——后者标 `dynamic-computed` 而非丢弃
- 按名计数孤儿检测会把 file-local 助手全误标——`scope` 字段就是为这个存在的

## 参考

- `references/fact-model.md` —— ADR-0008 决策背景与五分支完整设计
