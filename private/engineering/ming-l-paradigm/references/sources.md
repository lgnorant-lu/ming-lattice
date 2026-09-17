# Sources — Ming-L 域分层引用边界与文献索引

本包的完整证据链：每条设计结论可指回下列文献或实证事件之一。

## 权威文献与真条目

- **架构描述与域分治**:
  - ISO/IEC/IEEE 42010:2011/2022 *Systems and software engineering — Architecture description*——stakeholder/concern/viewpoint/view 分离；2022 版新增 Stakeholder Perspectives（concern 按视角分组）与 Architecture Aspects。本包"域=viewpoint"的正式锚。
  - ISO/IEC/IEEE 12207:2017/2026 *Software life cycle processes*——四过程组（agreement / organizational project-enabling / technical management / technical）与 Tailoring（裁剪）概念；对照出 Req 缺口与 agreement 不适用性。
  - IEEE SWEBOK Guide V4（18 KA）——完备性对照基准；其 KA6 Software Engineering Operations 佐证 Ops 域独立性。
- **立法与决策留痕**:
  - Python PEP 1 *PEP Purpose and Guidelines*——"规则自身的修改规则"正典；
  - IETF RFC 2026 *The Internet Standards Process*——标准轨道立法先例；
  - Michael Nygard: *Documenting Architecture Decisions*（2011）+ MADR——ADR 格式源。
- **架构边界与能力**:
  - Alistair Cockburn: *Hexagonal Architecture*（2005，及 2025 书稿"强实现判据"）；
  - Gary Bernhardt: *Functional Core, Imperative Shell*（2012）——管道内核的轻量等价物；
  - Dennis & Van Horn (1966) / Mark Miller capability 谱系——对象能力模型、POLA、ambient authority 概念源；
  - Martin Fowler: PoEAA（分层修正对象）、*Strangler Fig*（绞杀接缝）、*Tolerant Reader*（宽容读取限定条件）。
- **契约与演进**:
  - Bertrand Meyer: *Design by Contract*（1991）；
  - Semantic Versioning 2.0 + Conventional Commits——版本语义与提交词表。
- **测试与验证**:
  - T.Y. Chen et al.: Metamorphic Testing 系列（1998 HKUST TR；2018 ACM Computing Surveys 综述）——oracle 缺失场景的蜕变关系；
  - Koen Claessen & John Hughes: *QuickCheck*（2000）——PBT 源；
  - Michael Feathers: *Working Effectively with Legacy Code*——characterize 测试与 seam；
  - Ian Cooper: *TDD, Where Did It All Go Wrong*——测公共缝不测私有实现。
- **规范系统理论（动力学与属性系统的学科锚）**:
  - H.L.A. Hart: *The Concept of Law*（1961）——primary/secondary rules 联合；次级规则三腿 recognition/change/adjudication 直接锚定 Meta 条款（并暴露出我们缺"裁决"条款——候审 §6.6）；internal/external point of view 对应模态轴。
  - John R. Searle: constitutive vs regulative rules——"X counts as Y in C" vs "Do X"；规则类型分类器的来源；构成性规则创造活动本身（Spec 气质）vs 规制性规则约束已存在行为（Dev/Gov 气质）。
  - van der Torre & Tan: *An Architecture of a Normative System*（AAMAS'06）——normative systems / NorMAS 文献，多智能体系统领域的规范架构先例。
  - 道义逻辑（deontic logic）：obligation/permission/prohibition 模态——属性系统模态轴的严格化来源。
  - 政策周期：Lasswell（1956）/ Anderson（1974）阶段模型 + Geva-May *Riding the Wave of Opportunity: Termination in Public Policy*（2004）——termination 是被普遍遗忘的阶段，佐证"废"动词独立性。
  - ILM/DLM 信息生命周期（Splunk/IBM/TechTarget 综述）——create→store→use→share→archive→destroy，佐证"省/废"相独立。
- **文档**:
  - Daniele Procida: Diátaxis 四体裁——各域文档体裁规范的上游。

## 节点/图系统参照（Spec 域内部选型证据）

- chaiNNer + Navi：结构类型精化、端口边界规范化、`package→category→group→node` 命名路径；
- ComfyUI：`ANY` 逃生口、pull+lazy 求值、扁平命名事故（issue #839 自定义节点静默覆盖核心节点；#8805 命名空间标准化提案）；
- detectron2 `Instances(image_size, **fields)`：开放字段集 + 统一长度——RegionSet 原型；
- FiftyOne `Sample`：引用 + 命名 annotation 字段、GT/预测平级共存——SceneRecord 原型；
- Blender Geometry Nodes：field vs 单值、mute/bypass；UE 蓝图：pin 类型着色、编译即校验。

## 评测协议参照（Verify/Eval 域证据）

- J. Hosang et al.: *What makes for effective detection proposals?*（2015）——AR（Average Recall）指标与 proposal<->detection 相关性证明；
- N. Chavali et al.: *Object-Proposal Evaluation Protocol is 'Gameable'*（2016）——部分标注数据集上提案评测可作弊，全标注前提的来源；
- COCO Oracle MCG（1509.03660）——oracle 从提案集选最优的官方上限测量先例；
- 提案 repeatability 协议（扰动→重检测一致性）——评测版蜕变测试。

## 实证来源（本包沉淀现场）

DenoiseStudio 全量重写设计（2026-02）：
- 口径漂移 → Assets 域（实验 manifest 绑定 benchmark 数字）；
- characterize 基线被当真理（"提案回归 3 连败"）→ Verify 域 spec/characterize 物理隔离；
- 隐藏侧信道（`current_sample_name` 找 `*_tip.png`）→ Spec 域能力模型条款；
- 预览兜底链显示非真实输出 → Spec 域 preview policy 一等字段；
- 候审档（OPEN-FINDINGS）机制本身在本项目产生并验证。

## 明确不纳入正文

- TOGAF/企业架构治理（组织级，重度过剩）；
- PMBOK/瀑布项目管理过程域（与裁剪纪律冲突的部分）；
- CMMI 成熟度分级（过程评估框架，非域定义）；
- 把"层"（layer，系统内部上下级）与"域"（domain，concern 归属）混用——本包正文已分词，引用时注意。
