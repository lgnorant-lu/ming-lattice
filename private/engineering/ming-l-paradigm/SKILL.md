---
name: ming-l-paradigm
description: 项目结构域分层元规则——Ming-L-* 九域全景（Meta立法/Spec协议/Dev开发/Plan规划/Gov治理/Exp实验/Verify验证/Ops运行/Know知识），域粒度分级，域间契约闭环，"新规则进哪个域"判定表，候审档机制。当项目立项搭规范体系、文档域规划、判断规则归属、审查规范是否过度设计时使用。触发词：项目分层、规范体系、治理文档、开发规范、设计域、domain layers、Ming-L、规范草案、候审档。
metadata:
  layer: methodology
  compose: overlay-on-engineering
---

# Ming-L Paradigm — 项目结构域分层元规则

> 沉淀于 DenoiseStudio 全量重写的协议层设计实践（2026-02），外源参照见 §5。
> 核心结论：**文档规范不是一堆 markdown，是分域的系统**——每个域回答一个不同的 concern，
> 域与域之间靠显式契约闭环。九个域，粒度分级，按需从薄到厚。

## 1. 九域全景（Ming-L-*）

| 域 | 回答的问题 | 典型内容 |
|---|---|---|
| **Meta 立法域** | 规则本身怎么被制定和修改 | ADR 流程、spec-first 原则、域清单、改域规则 |
| **Spec 协议域** | 系统是什么 | dtype/引擎/算子/接口/评测的 Reference schema |
| **Dev 开发域** | 代码怎么写 | 目录形态、命名、禁 import 清单、契约/测试写法规范 |
| **Plan 规划域** | 按什么顺序推进 | 里程碑、验收标准、依赖图、冻结点 |
| **Gov 治理域** | 人和 Agent 怎么协作 | 提交/分支/审查规范、Agent 读写边界、变更控制 |
| **Exp 实验域** | 假设怎么被检验 | 实验分支规约、负结果归档、证据链（manifest 绑定） |
| **Verify 验证域** | 怎么证明没缺陷 | 测试体系、契约层级、门禁阶梯 |
| **Ops 运行域** | 跑起来之后呢 | 观测消费、事故记录、事件流回放——**实际运行也是验证通道** |
| **Know 知识域** | 发生过什么 | 冻结历史、FAILURE_ANALYSIS、教训库——只增不隐 |

助记：**Meta 立法 → Spec 是什么 → Dev 怎么写 → Plan 何时做；Gov 协作 · Exp 实验 · Verify 证明 · Ops 运行 · Know 记忆。**

**可选第 10 域 `Req`（需求域）**：ISO 12207 technical processes 首项、SWEBOK KA1 均为 Requirements——"系统必须做到什么"（concern 本身）与 Spec"系统是什么"（回答）不同源。小项目薄处理：需求写进 Spec §0 目的/concern 清单，不独立成域；多利益相关方项目升格。

## 2. 域的正式定义与准入（ISO 42010 锚定）

域即 **viewpoint**：frame 一组 concern 的视角。正式准入判据：

```
新域成立 ⟺ 带来 ①新 concern 集合 或 ②新 stakeholder 视角
         （"≥一节内容"是必要非充分条件——先过 ①② 再谈厚度）
```

**Stakeholder 注意**：42010 枚举 users/operators/maintainers——**AI agent 不在其列**。凡 Agent 参与开发/消费的项目，Agent 是一等 stakeholder（本包实证扩展）：Gov 域的 Agent 边界条款即为此视角而立。

**视角聚簇（域之上的组织轴）**：九域按 stakeholder 视角天然分三簇——
`系统侧（关心东西本身）：Spec·Dev·Verify`｜`过程侧（关心活怎么干）：Meta·Gov·Plan·Exp(·Req)`｜`运行侧（关心跑完留下什么）：Ops·Know`。
聚簇解释域间亲缘（Spec/Dev/Verify 互为犄角），也是"域放哪"的第二根判定轴。

**域可跨项目继承**：组织级域文档被子项目继承、项目级可本地覆盖（PEP→CONTRIBUTING 式级联）。实证：本仓库 STANDARDS.md（Gov）被全部子技能包继承——这使得本包的 Gov/Verify 内容可被新立项项目直接复用而非重写。

**裁剪纪律（Tailoring，12207 概念）**：九域是**菜单不是清单**——可并发/迭代/递归应用，小项目 Meta+Spec+Dev 三域即可存活。全用不是目标，按需才是。

**域孵化路径**：域不必出生即独立——`某域的一节 → 独立文档 → 独立域` 是正常升格路径（实证：Exp 域始于 Gov 草案一节，因"实验证据链"concern 独立而升格）。降级同理：域萎缩回节不算失败。

## 3. 域粒度分级——不是所有域都该写厚

| 粒度 | 域 | 形态 |
|---|---|---|
| **框架级**（只定骨架，几十行） | Meta / Gov / Plan / Ops | 立法机制、协作原则、里程碑表、观测入口 |
| **细节级**（写到可执行） | Spec / Dev / Exp | 可执行 schema、禁 import 清单、实验证据链 |
| **无需立法**（自然积累） | Know | 冻结史，写入即归档 |

误判信号：框架级域写满细节 = 过度设计；细节级域只有口号 = 规范失能。

**域 ≠ 目录**：域是 concern 的归属，物理形态可以是独立文件、目录、或另一文档的一节——薄域以节存在完全合法，位阶清晰比文件厚度重要。

## 4. 域间契约闭环

- **Meta 最先固化**：它定义其余域的修改规则——不先立 Meta，后面所有域的变更都无程序合法性；
- **Spec <-> Dev**：Spec 说"是什么"，Dev 说"怎么写"——同一字段在两域出现即第二真相，Dev 只引用；
- **Verify 压轴而非并行**：Dev 契约固化后，用 TDD/BDD/MDT 思维**对 Spec 做假想测试**（spec fuzzing）——测试写不下去处即 Spec 缺陷，回填候审档；此活动在写任何实现代码之前；
- **Exp 独立于 Plan**：负结果与正结果同权归档——实验域的产出是知识，不是功能；
- **Ops 反哺 Verify**：运行期宽事件是最大规模的持续验证——观测台是验证域的延伸。

**域间信息流（谁消费谁）**：

| 产出方 | 产物 | 消费方 |
|---|---|---|
| Meta | 域清单、修改程序 | 全域 |
| Spec | 可执行 schema | Dev（实现）、Verify（契约生成）、接口面（UI/CLI/Agent 自描述） |
| Dev | 写法契约 | Verify（测试规范从此派生）、Gov（审查依据） |
| Verify | 缺陷发现、门禁结果 | Spec（候审档回填）、Gov（合并门禁） |
| Exp | 正负结果 + manifest | Spec（选型证据）、Know（归档） |
| Ops | 事故记录、运行观测 | Know（归档）、Verify（回归素材） |
| Gov | 协作裁决 | 全域执行面 |

## 5. 判定：新规则/新概念进哪个域

```
这条内容是"系统必须做到什么"的？      → Req（薄处理时并入 Spec §0）
关于"系统本体"的？                    → Spec
关于"代码怎么组织/怎么写"？          → Dev
关于"先做哪个/验收标准"？            → Plan
关于"人/Agent 的协作边界"？          → Gov
关于"怎么检验一个假设"？             → Exp
关于"怎么证明正确"？                 → Verify
关于"跑起来怎么看/出事怎么办"？      → Ops
关于"曾经发生过什么"？               → Know
关于"以上任何一条怎么被修改"？       → Meta
都不像？先问：它值得一个域吗？——多数答案是不值得，进相邻域的一节。
```

## 6. 候审档机制（OPEN-FINDINGS）

域审查发现的问题**记录不动手**：

- 每条注明：现象、建议修法、目标文档；
- 已落盘的标 `[landed]` 并指落点，**不删除**（Know 域纪律：只增不隐）；
- 候审档在 Verify 轮统一处理——逐条商确，避免"发现即改"造成的规范抖动。

## 7. 域健康与启动序列

**失能信号（域死了的表现）**：

- 口头规则回潮——被遵守的规则不在任何域文档里；
- 第二真相出现——同一事实两处表述开始漂移；
- 候审档堆积不处理——发现即改或只记不改，都是失守；
- 域文档与实现漂移——Spec 说 X、代码做 Y；
- 域垄断——所有内容塞进一个域（典型：巨型 CONTRIBUTING.md 装下 Dev+Gov+Plan）。

**绿场启动序列（实证顺序）**：`Meta → Spec → Dev → Verify(spec-fuzz 假想测试) → Plan → 首个里程碑`。
立法先于立法对象；验证域在写实现前用"假想测试"反验 Spec——测试写不下去处即 Spec 缺陷。

**自指验证**：本范式应能描述它的容器——skills-collection 仓库即实例：registry.yaml=Spec（单一事实源）、STANDARDS.md=Gov、tests/=Verify、PLAYBOOK.md=Know、CLAUDE.md=Meta（"registry 是单一事实源"即立法条款）。范式能无损描述自身所在仓库，是自洽性证据；不能自指的元规则值得怀疑。

## 8. 参考系（诚实交代）

| 成分 | 出处 |
|---|---|
| 域分治骨架 | ISO/IEC/IEEE 42010（架构描述：stakeholder/concern/viewpoint 分离；2022 版 Stakeholder Perspectives/Aspects） |
| 完备性对照 | ISO/IEC/IEEE 12207 过程组（agreement/organizational/technical-management/technical）+ SWEBOK V4 18 KA——对照结论：九域覆盖其软件项目子集，缺口仅 Req（可选域）与多组织 agreement（不适用单作者项目） |
| Meta 域 | IETF RFC / Python PEP 立法流程（先立"规则怎么改"再立规则）+ Nygard ADR |
| 各域内容范式 | 本仓库 engineering/ 元规范族（arch/contract/obs/sec/docs/testing 六包） |
| 层间闭环 | 项目实证驱动（口径漂移→资产域、基线当真理→Verify 的 spec/characterize 分离） |

*完整文献索引与实证事件清单见 [references/sources.md](references/sources.md)；明确不纳入正文的反例亦在其中。*

## 9. 禁令

1. **[禁止] 域不分层级一视同仁**：Meta 写三百行细则 = 立法臃肿；Dev 只有"写干净代码"= 规范失能；
2. **[禁止] 同一事实两域表述**：Spec 已有的字段面，Dev/Gov 引用之，不手抄；
3. **[禁止] 为扩充而扩充**：新域准入以 §2 正式判据为准（新 concern 集或新 stakeholder 视角），"≥一节"只是厚度下限；
4. **[禁止] 口头规则**：任何被遵守的规则必须在某个域的文档里，否则不成立；
5. **[禁止] 候审档即改**：发现缺陷先记录，集中处理——边发现边改会产生规范振荡。

## 10. Compose

```
ming-l-paradigm（本包：域分层 + 判定 + 候审档）
+ arch-core-paradigm（Spec 域内部架构边界）
+ contract-core-paradigm（Spec/Dev 字段演进纪律）
+ docs-core-paradigm（各域文档体裁 + ADR）
+ obs-core-paradigm（Ops 域事件规范）
+ sec-core-paradigm（横切安全 overlay，各域各自承担）
+ testing-core-oracle（Verify 域 oracle 律）
+ testing-property-mutation（Verify 域性质/蜕变/变异方法）
```
