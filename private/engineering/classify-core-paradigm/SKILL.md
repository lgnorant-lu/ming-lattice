---
name: classify-core-paradigm
description: 分类轴设计元规则——分面分类优于鸽笼枚举、决策分化律（类目存在的唯一理由是下游决策分叉）、封闭词表 fail-closed、豁免排气阀一等存在、三平面分离、容忍分层。当设计枚举/kind/tag/状态机/严重度/域归属等分类面、评审"该不该加新值/新轴"、诊断类目膨胀或前缀冲突时使用。触发词：分类、taxonomy、枚举设计、kind 字段、tag 词表、分面、facet、MECE、命名空间、前缀冲突、分类体系、enum、状态机设计。不适用：具体业务对象建模（OOP 类设计走常规 DDD）；权限/ACL 角色设计（sec 域）。
metadata:
  layer: methodology
  compose: none
---

# classify-core-paradigm — 分类轴设计元规则

> 「分类→决策」轴在仓内独立收敛六次（域归属判定/意图路由/路径分域/
> 层×族登记/处置分类/严重度分级）——每次重新发明且易错。本包收公理，
> 不收具体词表（词表归各采纳端）。

## 1. 何时用 / 何时不用

- 适用：设计枚举字段/kind 词表/tag 体系/状态机状态集/严重度分级/
  域归属映射；评审"加新值还是加新轴"；诊断类目膨胀、前缀撞车、
  复合枚举失控（`kind:doc` vs `kind+extra.docrole`）；跨仓词表同步策略
- 不适用：业务实体 OOP 建模；权限角色矩阵（sec 域）；值域的
  具体取值内容（归各采纳端词表，本包只收设计纪律）

## 2. 核心规程——六公理

### 公理 1：分面优于鸽笼

正交轴各占字段位；新需求先问「**新面还是新值**」——新面开新字段位，
新值进既有词表。**禁造复合枚举**：`kind:doc` 是错的（把 docrole 面硬
塞进 kind 面），`kind:file + extra.docrole` 是对的。判据来自 Ranganathan
PMEST 分面公式：枚举式鸽笼在维度交叉处必然爆炸，分面各轴独立演进。

### 公理 2：决策分化律

类目存在的唯一理由=**下游决策因它分叉**。不改决策的类目=死税——
消融审计入口：问"砍掉这个类，下游行为变吗"，不变即删。
可审计形态：类目清单 × 消费点映射表（每类目须至少一个消费点在案）。

### 公理 3：封闭词表治理

枚举值走注册表 fail-closed（未注册值即违规）；自由标签圈禁在
extra/folksonomy 区不许进键位。词表外延即契约外延——新值先注册后使用。

### 公理 4：豁免排气阀

MECE 是愿景不是现货——**declared-residue 桶必须一等存在**
（候审档/exempt/unclassified）。缺排气阀的分类面=误报制造机：
真实世界必有"暂时归不进任何类"的成员，没有桶逼出假归类。

### 公理 5：三平面分离

轴设计（idea）/命名（verbal）/编码键位（notational）三层解耦——
**改名不换义**：键位重写时语义锚不变（棕场"文件名零负载"同族：
路径是 notational 平面，语义不寄生其中）。

### 公理 6：容忍分层

协议层用**定义式分类**（严格键、fail-closed）；适配器层用**原型式分类**
（启发式+兜底桶+fidelity 降级标记）——messy 输入在边界被驯化，
不污染协议内面。正则/启发分类器产出的值带 fidelity 注记，
定义层只消费已净化值。

## 3. 判例册（六实例六形态）

| 实例 | 轴 | 公理行使 |
|---|---|---|
| ming-l §9 域归属判定表 | 内容类型→九域 | 决策分化律（域归属决定文档/门控路由） |
| ming-skills-router Decide | hint→domain/recipe | 封闭词表+residue（ask/none 是排气阀） |
| ming-boundary domainOf | path→边界域 | 分面（域是路径面不是 kind 面） |
| registry 层×族 | package→layer×family | 双轴分面（layer 与 family 正交不复合） |
| IV8 seam 处置分类 | member→kept/retire/ablate/exclude | 决策分化律（处置动作分叉）+ residue 候审档 |
| 门禁 finding 严重度 | finding→error/warn/note | 封闭词表（fail-closed 拒非法级别） |

**活体反例**：boundary 组件曾倾向 `kind:doc` 独立节点——消融审计纠正为
`file+extra.docrole`。错误本质=枚举式鸽笼思维把 docrole 面塞进 kind 面。
若公理 1 在列，此错本不必犯。

## 4. 红线 / 边界

- [禁止] 复合枚举——两轴挤一字段（`status:merged-pending` 形态）必被
  下游 split/匹配逻辑双倍还债
- [禁止] 无消费点的类目——决策不分叉的类目是死税，消融审计删
- [禁止] 无排气阀的闭集——residue 桶缺席时真实成员被逼假归类
- [警告] 词表治理的工具面（manifest 注册段/词表文件格式）归各引擎件
  ——本包管公理不管实现形态

## 5. Compose

- 与 `contract-core-paradigm`：分类面演进遵守只加不改义——删类目=
  先标 residue/deprecated 再撤，消费点迁移完成前词表不收缩
- 与 `ming-l-paradigm`：§9 域归属判定是公理 2/3 的场景实例——
  本包是底层公理面，ming-l 管具体域划分
- 与 `ming-boundary`：manifest 词表注册段是公理 3 的引擎化先例；
  kind/extra 分面是公理 1 的活体判例

## 参考

- `references/sources.md` —— Ranganathan 分面分类学 + ISO 25964 KOS
  治理 + 六实例判例索引
