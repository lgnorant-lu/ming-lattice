# 语言前端质量门：分层、指标与语料注册表（设计档）

> 状态：设计提案（M1-M5 已在临时探针实证；M7 采收可行性已验证；M8 候审）。
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
| M7 | 上游固件命中 | 采收的 tree-sitter corpus/ra test_data 输入件过抽取器，断言无畸形名/预期叶数 | corpus.yaml `fixtures:` 段 | 逐件断言 | [实证] 可行性实证——8 件 use_tree 固件即抖出 `::*`/`use *`/`std::{::*}` 三种合成 fixture 没想到的残留形态 |
| M8 | 差分召回 | 与 precise 索引器（scip-*）边交集率 | 采纳仓 precise 输出（--facts-extra 同源） | 报告级，候审到有消费方 | 候审 |

## corpus.yaml 语料注册表（sketch）

```yaml
version: 1
langs:
  rust:
    repos:
      - { name: fd,            size: small,  rev: <sha> }
      - { name: ripgrep,       size: medium, rev: <sha> }
      - { name: rust-analyzer, size: large,  rev: <sha>,
          exempt: ["crates/parser/test_data/**"] }   # 自带对抗固件，M1/M4 豁免
    fixtures:
      - { src: "tree-sitter-rust test/corpus", license: MIT, kinds: [use_declaration] }
      - { src: "rust-analyzer test_data/parser/inline/ok", license: "MIT/Apache-2.0",
          pick: "use_tree*.rs" }
```

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

## 不采纳项

- **重型生态工具入库**：scip-rust-analyzer/semgrep/ctags 二进制是
  M8 差分 oracle 的候选，按需对采纳仓实例化，不进 kit（准入闸#3
  零新运行时依赖 + ADR-0010 precise 走 --facts-extra 归并）。
- **边语义 DSL 化**：stack-graphs 归档实证此路在规模上不成立。
- **查询层**（Datalog/Angle 式 facts 派生）：fact-model §134 已立法
  不做 Glean/Trustfall/Joern 式引擎；JSONL facts 是终端抽象。
- **MISSING 节点探针**：ast-grep kind 面不可达，放弃。

## 候审项

- M8 差分召回：等"采纳仓需要 precise 边对账"的真实消费方
- const_item/static_item overlay 补丁：独立小裁决（属 decl 谱系补全
  不是门设计）
- corpus.yaml 转正 + metrics.mjs 入库：待本档方向获准
- fuzz 面（ctags afl-fuzz.r 先例）：最末位，语法生成器驱动
