---
name: ming-l-paradigm
description: 项目结构域分层元规则——Ming-L-* 九域全景（Meta立法/Spec协议/Dev开发/Plan规划/Gov治理/Exp实验/Verify验证/Ops运行/Know知识）x 七动力学（立用守省改增废）+ 规则属性系统 + 标识分配律 + 序律（推进顺序/生命周期序）+ 采纳档（minimal/standard/full 分层采纳 + 域脚手架/命名空间登记），域粒度分级，域间契约闭环，"新规则进哪个域"判定表，候审档机制。当项目立项搭规范体系、文档域规划、里程碑排序、判断规则归属、审查规范是否过度设计时使用。触发词：项目分层、规范体系、治理文档、开发规范、设计域、domain layers、Ming-L、规范草案、候审档、脚手架、里程碑。
metadata:
  layer: methodology
  compose: overlay-on-engineering
---

# Ming-L Paradigm — 项目结构域分层元规则

> 沉淀于 DenoiseStudio 全量重写的协议层设计实践（2026-02），外源参照见"参考系"节与 references/。
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

**孵化位 `Req`（需求域，可选第 10 域）**：ISO 12207 technical processes 首项、SWEBOK KA1 均为 Requirements——"系统必须做到什么"（concern 本身）与 Spec"系统是什么"（回答）不同源。机械态：**词表已登记**（`ming-config.schema.json` domains 枚举 + audit DOMAINS 均合法可声明、可实例化、矩阵正常生效），**模板与采纳档未立**——首个实际使用的项目决定其毕业（补模板/入档）或除名（移出词表）。小项目薄处理：需求写进 Spec §0 目的/concern 清单，不独立成域；多利益相关方项目升格。另：`--ming-schema` 指向项目本地扩展 schema 即可声明词表外自定义域——自定义域不另立机制，走 schema 覆盖通道。

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

**框架元律（M3 位阶，MOF 四层映射）**：框架自身也须有极小立法，一节装下——
- **机制准入**：新横切机制须回答一个现有机制答不了的**正交问题**（域=在哪 / 动词=什么动作 / 属性=什么性质 / 标识=叫什么 / 序律=什么先后——五轴覆盖已满，新增先过同一判据）；
- **词表治理**：九域名+孵化位、七动词、status/type/binding 是封闭枚举——共享词表的扩展=显式修订本文件并 bump 版本；项目私有扩展走 `--ming-schema` 覆盖通道（事实源=`assets/ming-config.schema.json` 的 enum，audit 直接消费），不污染共享词表；
- **自洽性**：M3 conforms to itself——本包文档与脚本应尽量符合自身规则（模板骨架可过 audit-domains 即自证）。

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

## 5. 七动力学——域的动词面（域 x 动词矩阵）

九域是**名词**（规则住哪），动力学是**动词**（规则怎么变状态）。政策周期正典（Lasswell 1956 → Anderson 1974 → Geva-May termination 研究）阶段模型的正交化：**动力学不是流程，是对任何域在任意时刻可施加的算子**——规避阶段模型"过度线性化"的学术批评。

| 动词 | 英文 | 语义 | 典型物 |
|---|---|---|---|
| **立** | Genesis | 域/规则诞生、模板实例化 | 脚手架、域升格 |
| **用** | Access | 读/写/查触达面 | 索引、懒加载、ADR 提案 |
| **守** | Enforce | 机器强制（文档→法律的分界） | lint/钩子/schema 校验 |
| **省** | Evaluate | 健康评审（产出判决而非信息） | 失能信号巡检、候审档处理、审查节奏 |
| **改** | Evolve | 修订既有（歧义裁决亦归此） | ADR 修正、升格降级 |
| **增** | Extend | 新内容准入 | 域准入判据、`ming_` 孵化 |
| **废** | Retire | 日落/降级/撤销 | `deprecated→removed`、域萎缩回节 |

**矩阵纪律**：`域 x 动词` 画矩阵，**每个空格必须是有意的零**——空格即病灶检查器。活体先例全覆盖见 [references/precedents.md](references/precedents.md)（K8s feature gates=增、deprecation policy=废、Rust crater run=省……）。机读约定：文档 frontmatter `dynamics` 记**本档实际执行**的动词集（描述性观测，非域级覆盖声明）；域级"有意零"在 `ming.yaml` 的 `dynamics_zero:` 平铺条目（`"<域> <动词>"`）裁决——audit 据此区分已裁决零（静默）与未标空格（I）。

**机械化**：`scripts/audit-domains.mjs` 是省+守的机器形态——orphan 检测/landed 指针/矩阵盘点（dynamics_zero 裁决位+矛盾漂移查）/双真相/frozen 拦截/proposed+provisional 计龄/标号四检（唯一性·悬空引用·格式·登记表互锁）/O1 倒挂/未登记命名空间族启发式/frontmatter 词表补检（dynamics 值+status 缺席提示+文档域反向登记）/ming.yaml 校验（词表事实源=ming-config.schema.json，`--ming-schema` 覆盖即项目私有扩展通道）/gates 退出轴/`--emit-index` 索引层；**自测套** `audit-domains.test.mjs` 38 fixture 树用例（守门员自洽，\r 末行丢键已固化回归）。域骨架生成见 `scripts/scaffold-domains.mjs`（模板实例化 + namespaces.json/ming.yaml 播种，生成物即过审计；九域+候审档模板齐备），配套 `scaffold-domains.test.mjs` 9 用例（档产物面/幂等/--force/--domains/生成物即审计）。平台门禁部署形态见 [references/hard-gates.md](references/hard-gates.md)。

## 6. 规则属性系统（Rule Attribute Systems）

每条规则除归属域外带四个属性。**注意位阶**：四属性不是与"域/动词"平权的维度，是**字段级小系统**——且各怀不同内部结构（两个状态机、一个代数、一个分类器），不平权也不合并。

### 6.1 效力阶梯（binding）——拦截深度 x 保证强度

| 级 | 形态 | 保证强度 |
|---|---|---|
| 0 convention | 文档惯例 | 无 |
| 1 warn | lint 警告 | 弱——可见但可发货 |
| 2 error | lint/钩子/CI 拦截 | 强——但流水线必须跑到 |
| 3 runtime | schema/契约运行时校验 | 强——但路径必须执行到 |
| 4 structural | 能力不注入/类型不可表达 | **绝对——违规无法被表达** |

- **ceiling（天花板）**：规则效力上限 = 可表达性。"算子不读文件"可达 4（不注入 FsGuard 即结构性不可达）；"命名清晰"天花板为 0；
- **迁移力学**：新规则默认 ≤1 起步（安全边界除外直达 ≥2）；晋升条件 = 零违例持续 N 周期 + 机器检查就位；降级条件 = 误报频发 → 降级修 checker。

### 6.2 模态状态机（status）——规则的真理方向

```
proposed --promote--> normative --relax--> descriptive
   |                     |                     |
   |                  supersede          archive
   |                     |                     |
   +--fast-track--> provisional --ratify--> normative
   |                     |
   +----reject------+   supersede
                    v      v
                    frozen（吸收态：永不复活，新版=新规则）
```

- **provisional 插队轨**：fast-track 紧急落盘走 `status: provisional`（非旗标——避免与 status 构成歧义矩阵），须带 `since:` 计龄，超龄未回候审档补裁决 = W（audit 6b 查）；倒挂检查同 proposed 处理（准规范前态）。

- **模态决定测试种类**：normative→spec 测试（断言应然）；descriptive→characterization（锁定实然）；proposed→契约草案验证；frozen→无测试（纯史）；
- `proposed` 即 `ming_` 孵化字段与候审档条目的正式态名；
- **ADR 例外**：决策记录 frontmatter 只挂 `domain: meta`——生命周期（Proposed/Accepted/Superseded）走正文 Status 字段，不进本模态词表（规则模态与决策态是两套状态机，混挂会造成 status 缺席误报与语义混淆）；
- **status 缺席**：规则承载文档应显式标模态，缺席=I 级提示且**不设默认值**——缺省视为 descriptive 会把 normative 文档静默降格，比不报更坏；
- 对应道义逻辑 normative/assertoric 区分（Hume is-ought：从实然推导应然是非法推理——"基线当真理"型 bug 的哲学原型）。

### 6.3 作用域代数（scope）——谓词合取 + 单调加强

- 作用域 = 谓词合取：`dir ∈ X AND actor ∈ Y AND phase ∈ Z`，未写维度 = 全集；
- **单调加强**（类 Liskov）：子作用域只可加严、不可放宽；
- **声明式豁免**：放宽必须写在父规则本体（`exempt: [tests/]`）——子作用域不得私自放松（实证：测试目录的纯度豁免是父规则自开的口子）。

### 6.4 类型分类器（type）——Searle 构成/规制二分

| | constitutive | regulative |
|---|---|---|
| 语法 | `X counts as Y in C` | `Do/Don't X` |
| 违规形态 | type error（不可表达） | 违规报告（可表达但禁止） |
| 校验器 | schema validator | lint/property test |
| 效力天花板 | 可达 4 | 一般 ≤3 |

写法推论：Spec 域规则多为 constitutive（schema/定义体），Dev/Gov 规则多为 regulative（祈使/禁令体）——两域规则语法气质不同的根源。

### 6.5 两个统一性发现

- **效力阶梯顶端 = 类型转换**：regulative 规则推到第 4 级 = 改写成 constitutive（"禁 import os" → "算子签名无 fs 参数"——违规从可表达变不可表达）。**提升效力的终极手段是重设计接口，不是加强检查**；
- **七动词 = 属性状态机的转移函数**：增→创建 proposed，改→promote/relax 转移，废→frozen 转移，省→巡检各状态机。域级与规则级动力学同一动词组分形复用——属性系统不是动力学之外的东西，是动词在规则粒度上的作用对象。

### 6.6 候审条款（provisional，未验证）

- 规则 frontmatter 机查面（`domain/status/type/binding/dynamics/canonical/since`）——`audit-domains.mjs` 已实现词表校验与双真相/frozen/计龄检查，字段语义在本项目实例化中验证中；
- Meta 第四条裁决条款：Hart 次级规则三腿（承认/变更/**裁决**）中我们缺裁决——"机器可判归门禁终裁，机器不可判归人工审查+ADR"；
- 残余问题：ceiling 是否入 frontmatter；proposed→normative 晋升判据是否与效力晋升共用零违例期；豁免是否仅限 scope 维度；scope 字段的谓词语法尚未定（当前机器只校验存在性）。

## 7. 标识分配律（Identifier Allocation）

标号是规则与实体的身份证——**可被引用才可被裁决、落地、追溯**。它是横切机制：每个域都发标号（spec 发 `L*`、plan 发 `M*`、meta 发 `ADR-*`、候审档发 `A/B/C/Q*`、dev 发 `D*`/`CL*`、错误面发 `E_*`），故不属任何一域，与属性系统同层单列。

五律：

1. **前缀 = 有界上下文**：标号前缀声明归属命名空间，跨空间不撞名、不解释；
2. **语义序 vs 分配序分清**：`M<N>` 语义序、`L<N>` 栈位序、`ADR-<N>` 纯分配序、`A/B/C/Q<N>` 类别×序号复合——序性写进登记表，不混用；
3. **只增不复用**：作废号 = 墓碑（ADR 废案号不重发、`removed` 算子 type 保留）——标号是引用锚点，复用即断链；
4. **标号不可变**：内容可改号不改；改号 = 新号 + 旧号墓碑。超替走**双向链**（adr-tools `-s` 先例：新件标 supersedes、旧件回填 superseded-by——候审档 `[landed]` 指针同构）；
5. **格式即 schema**：每命名空间一条正则，进 Meta 域"标号命名空间登记表"（前缀/归属/格式/序性四列），机器可查。

**实证**：DenoiseStudio 落地轮机械扫描抓到两个活撞车——候审档 D 区 vs dev `D1~D6` 章（候审区更名 `Q`）；契约四层 `L0~L3` vs 文档层 `L0~L3`（契约层更名 `CL<N>`）。另 `C2` 双用于生命周期机与候审注记（机器更名 `C-2`）。无登记表时这些全部裸奔。

**机械执行面**：`audit-domains.mjs` §7 四查——**唯一性**（同 ID 多定义位 = E）、**悬空引用**（正文标号无定义位 = W；候审档与 descriptive/frozen 史档豁免——冻结史旧名非悬空）、**格式合规**（W）、**登记表互锁**（meta 表与 namespaces.json 漂移 = E）。

**登记表外置（高度自定义化）**：命名空间声明是**数据不是脚本**——`namespaces.json`（prefix/pattern/domain/ordering/role/note）按项目私有，`role=id` 参与定义/引用扫描、`role=value` 仅为词表。其中 `domain` 字段 = **发证机关**（该命名空间格式的立法域），**不约束宿主文档域**——verify 域文档持 spec 发放的 `L*` 标号合法（域≠目录同律）。audit-domains 三级回退：`--labels <json>` > `<target>/namespaces.json` > `assets/namespaces.default.json` 内置种子；`scaffold-domains.mjs` 播种项目副本，立即可裁剪扩展。

**分配器裁决**：单作者低并发 → 人工分配 + 机器查重足够（PEP/RFC 编辑分配先例）；并发发号（多分支/多 Agent）才建取号器——adr-tools issue#102 是已录实坑，counter lockfile 可以合并冲突为检测器。**文件系统本身即已发号簿**（`adr/NNNN-*.md` 文件名=号码簿）；`namespaces.json` 登记的是**命名空间声明**（格式 schema），与号码簿不同位面，不构成双真相。

## 8. 序律（Ordering Laws）——时间轴维度

域×动词矩阵说"每格能发生什么"，序律说"格子按什么顺序执行"。动词是字母表，序律是句法。
**纪律**：序律只陈述**时间约束**，实体规则引用不重复（防双真相）；每条律须有可检的违反形态（跳步=可检违规），不可检的序是建议不是律。

| 律 | 时间约束 | 实体规则所在（引用不重复） |
|---|---|---|
| **O1 依赖序** | 被依赖者先固化；同层候选按扇出+不可逆性加权 | —— |
| **O2 裁决序** | 裁决先于生成 | 候审档纪律（Meta 细则） |
| **O3 校验夹位** | 固化→审计→下游；批次节奏：按目标文档分批、批间回验 | —— |
| **O4 增序** | 提案无序、落盘有序；fast-track 插队须 `status: provisional`/`ming_` 留痕并事后补裁决——可插队不可隐身 | ming_ 豁免位（标识律） |
| **O5 改序** | expand→migrate→contract 三步，不原地替换 | 演进五条（contract-paradigm） |
| **O6 废序** | deprecated→迁移窗口→removed；墓碑不重用 | 标识分配律 N3 |
| **O7 守序** | convention→warning→error 不直跳 | 效力阶梯（属性系统）——本律约束其**转移边** |

**动词覆盖**：立 O1~O3 / 增 O4 / 改 O5 / 废 O6 / 守 O7 / 省并入 O3 / **用有意留白**（运行期序归引擎生命周期机，非 Plan 序律管辖）。
**与属性系统的交点**：序律对状态机（效力阶梯、模态）的**转移边**施加约束——是正交时间维在转移点的投影，非从属。
**项目实例**：`docs/plan/ORDERING.md`（`O<N>` 须先登记命名空间——序律不得自身裸奔）。

## 9. 判定：新规则/新概念进哪个域

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

## 10. 候审档机制（OPEN-FINDINGS）

域审查发现的问题**记录不动手**：

- 每条注明：现象、建议修法、目标文档；
- 已落盘的标 `[landed]` 并指落点，**不删除**（Know 域纪律：只增不隐）；
- 候审档在 Verify 轮统一处理——逐条商确，避免"发现即改"造成的规范抖动。

## 11. 域健康、启动序列与采纳档

**失能信号（域死了的表现）**：

- 口头规则回潮——被遵守的规则不在任何域文档里；
- 第二真相出现——同一事实两处表述开始漂移；
- 候审档堆积不处理——发现即改或只记不改，都是失守；
- 域文档与实现漂移——Spec 说 X、代码做 Y；
- 域垄断——所有内容塞进一个域（典型：巨型 CONTRIBUTING.md 装下 Dev+Gov+Plan）。

**绿场启动序列（实证顺序）**：`Meta → Spec → Dev → Verify(spec-fuzz 假想测试) → Plan → 首个里程碑`。
立法先于立法对象；验证域在写实现前用"假想测试"反验 Spec——测试写不下去处即 Spec 缺陷。

**自指验证**：本范式应能描述它的容器——skills-collection 仓库即实例：registry.yaml=Spec（单一事实源）、STANDARDS.md=Gov、tests/=Verify、PLAYBOOK.md=Know、CLAUDE.md=Meta（"registry 是单一事实源"即立法条款）。范式能无损描述自身所在仓库，是自洽性证据；不能自指的元规则值得怀疑。

*注：本仓是**概念实例**（域映射成立），docs/ 未采 `domain:` frontmatter 机读方案——`audit-domains.mjs` 面向采纳方案的文档树，对本仓扫出的 orphan W 是"未采纳"信号而非范式失效。*

**采纳档（Adoption Tiers）**：九域是菜单不是清单——采纳深度显式分档（WCAG A/AA/AAA + projen project types 先例）：

| 档 | 内容 | 适用 |
|---|---|---|
| `minimal` | META + namespaces.json + 1 spec 文档 + OPEN-FINDINGS | 脚本/小工具 |
| `standard` | + dev/CONTRACT + spec 分层 + audit 软门 | 多数项目 |
| `full` | 九域全景 + 全查 + 硬门接线 | 方法论级项目 |

**两轴分离**：tier（内容多少）× gates（执行强弱 `off|soft|hard`）正交；推荐 minimal→soft、full→hard 默认不锁死——恰是效力阶梯的项目级应用。档声明进 `ming.yaml`（schema: `assets/ming-config.schema.json`），audit 按档豁免：未实例化域的矩阵空格静默（"有意的零"的档级推广）。**gates 退出语义**（fail-on-warn 先例）：`off`=纯报告永不 fail、`soft`=E 才 fail、`hard`=E+W 都 fail——只改退出码不改检查分级（`--strict` 管单查升档，两轴各管一段）。

**脚手架七层**：①配置层 `ming.yaml`（copier answers-file 先例——模型读一份配置即知项目形态）②模板层 `assets/templates/`（只装骨架不装内容）③数据层 `namespaces.default.json` 等机读种子 ④执行层 `scaffold-domains.mjs`→`audit-domains.mjs`→gate 接线 ⑤测试层 verify 域约定模板（不预设语言栈 tests/ 代码形态）⑥索引层 `audit --emit-index` 生成 labels-index.json（派生视图非事实源）⑦回授层（项目经验反哺种子/模板/precedents——约定非工具）。

**防臃肿阀**：不自动登记命名空间（裁决在人）；不做模板升级引擎（散文漂移常态，升级走人工 review，`template_v` 仅供参照）；不建插件/继承体系。

## 12. 参考系（诚实交代）

| 成分 | 出处 |
|---|---|
| 域分治骨架 | ISO/IEC/IEEE 42010（架构描述：stakeholder/concern/viewpoint 分离；2022 版 Stakeholder Perspectives/Aspects） |
| 完备性对照 | ISO/IEC/IEEE 12207 过程组（agreement/organizational/technical-management/technical）+ SWEBOK V4 18 KA——对照结论：九域覆盖其软件项目子集，缺口仅 Req（可选域）与多组织 agreement（不适用单作者项目） |
| Meta 域 | IETF RFC / Python PEP 立法流程（先立"规则怎么改"再立规则）+ Nygard ADR；H.L.A. Hart《The Concept of Law》——次级规则三腿（承认/变更/裁决）锚定 Meta 条款结构 |
| 七动力学 | 政策周期（Lasswell/Anderson；Geva-May termination 研究——终止是被普遍遗忘的阶段）；ILM 信息生命周期（create→…→archive→destroy） |
| 规则属性系统 | 道义逻辑（normative/assertoric 模态）；Searle constitutive/regulative 规则二分；Spectral severity（效力分级先例）、OWNERS（作用域先例） |
| 标识分配律 | adr-tools（`adr new` 单调取号 + `-s` 超替双向链；issue#102 并发撞号实坑）、MADR `NNNN-slug` 文件名制、PEP/RFC 编辑分配、DOORS PUID 三段复合前缀 |
| 序律 | expand-migrate-contract 演进迁移模式（破坏性改动三步序）、本项目实证逆向（候审档批间回验/sweep resume/frozen_eval 门禁） |
| 框架元律 | OMG MOF M0-M3 四层元建模（M3 自洽闭架——metametamodel conforms to itself） |
| 采纳档与脚手架 | WCAG A/AA/AAA 符合性分级、W3C 成熟度模型（maturity≠conformance）、projen config-as-code 合成、copier answers-file+模板迁移、OPA/Conftest 分层门控（pre-commit→CI→准入） |
| 学科定位声明 | **以上学科作覆盖校验器（coverage oracle），非推导地基**——设计先自工程痛点长出，学科用于查漏；映射若只描述不预测即为强套 |
| 各域内容范式 | 本仓库 engineering/ 元规范族（arch/contract/obs/sec/docs/testing 六包） |
| 层间闭环 | 项目实证驱动（口径漂移→资产域、基线当真理→Verify 的 spec/characterize 分离） |

*完整文献索引与实证事件清单见 [references/sources.md](references/sources.md)；明确不纳入正文的反例亦在其中。*

## 13. 禁令

1. **[禁止] 域不分层级一视同仁**：Meta 写三百行细则 = 立法臃肿；Dev 只有"写干净代码"= 规范失能；
2. **[禁止] 同一事实两域表述**：Spec 已有的字段面，Dev/Gov 引用之，不手抄；
3. **[禁止] 为扩充而扩充**：新域准入以 §2 正式判据为准（新 concern 集或新 stakeholder 视角），"≥一节"只是厚度下限；
4. **[禁止] 口头规则**：任何被遵守的规则必须在某个域的文档里，否则不成立；
5. **[禁止] 候审档即改**：发现缺陷先记录，集中处理——边发现边改会产生规范振荡；
6. **[禁止] 矩阵空格无意留白**：域 x 动词矩阵的空格必须是有意的零并标注理由；
7. **[禁止] 效力跃进**：规则不得从 convention 直跳 error+——沿阶梯迁移，未达天花板前保留降级通道；
8. **[禁止] 标号裸奔**：新标号族先登记命名空间（前缀/格式/序性）再使用；号码不回收、不改名（改名=新号+旧号墓碑）；
9. **[禁止] 插队隐身**：fast-track 修复必须留痕（`status: provisional`/`ming_` 标记）并事后回候审档补裁决——可插队不可隐身；
10. **[禁止] 机制越权**：新横切机制先过正交判据（回答现有机制答不了的问题）；序律只陈述时间约束，不重复实体规则。

## 14. Compose

```
ming-l-paradigm（本包：域分层 + 动力学 + 属性系统 + 标识分配律 + 序律 + 判定 + 候审档 + 采纳档 + audit-domains 体检器 + scaffold-domains 脚手架 + namespaces/ming-config 种子与模板组）
+ arch-core-paradigm（Spec 域内部架构边界）
+ contract-core-paradigm（Spec/Dev 字段演进纪律）
+ docs-core-paradigm（各域文档体裁 + ADR）
+ obs-core-paradigm（Ops 域事件规范）
+ sec-core-paradigm（横切安全 overlay，各域各自承担）
+ testing-core-oracle（Verify 域 oracle 律）
+ testing-property-mutation（Verify 域性质/蜕变/变异方法）
```
