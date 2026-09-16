# 预言机形状与测试范式消歧 (Oracle Shapes & Testing Paradigm Disambiguation)

> **定位**：本参考文档隶属于 `testing-core-oracle`，为整个测试规范子族（11 个包）提供测试名词的学术与行业标准消歧，以及基于「预言机形状（Oracle Shapes）」的正交选型清单。
> **边界声明**：本页仅负责范式消歧与选型定位，不负责红绿微循环，不提供 Hypothesis/proptest 等 API 教程，不可单独作为测试实施指南加载。编写测试仍必须走 `testing-core-oracle` 元规则与对应工作流。

---

## 1. 缩写消歧与范式真身 (Acronym Disambiguation)

行业中存在大量以 `*DD` 或字母缩写命名的技术名词，所属抽象层级截然不同。严禁将工作流过程、接口规约、预言机构造法与领域启发式混为一谈。

### 1.1 MT: 蜕变测试 (Metamorphic Testing)
- **学术渊源**：T.Y. Chen 等人于 1998 年首次提出蜕变测试概念（HKUST TR-98-01）；系统性综述见 **ACM Computing Surveys 51(1)** (Chen et al. 2018)；针对预言机有效性的实证研究见 **IEEE TSE 40(1)** (Liu et al. 2014)。
- **核心机制**：针对「测试预言机缺失问题（Test Oracle Problem）」，核心判据是**「是否存在事先写死的跨执行关系（Metamorphic Relation）」**，而非局限于特定领域。无论在图像变换、编译器编译选项变换，还是 HTML 解析（如打乱属性顺序、插入无害空白），只要能构造输入变换使得输出满足恒等、包含或单调关系，均属于 MT。
- **规范红线**：**蜕变测试的标准学术与工业简称仅为 MT，严禁缩写为 MDD**。MDD 在工业界专属指代 Model-Driven Development（OMG 体系下由 UML/状态机生成代码）。

### 1.2 CDC: 消费者驱动契约测试 (Consumer-Driven Contract Testing)
- **渊源与演进**：Ian Robinson 于 2006 年提出 Consumer-Driven Contracts 设计模式（收录于 Martin Fowler Bliki）；Pact 框架为日后（2013 年起由澳洲 REA 团队等主导）开源的自动化工程实现。
- **与其它 CDD 隔离**：
  - **CDC / Pact**：解决分布式微服务演进时，提供者单向破坏消费者的集成断裂问题；
  - **DbC (Design by Contract)**：Bertrand Meyer (Eiffel, 1986) 提出，属于代码级防御性契约（前置条件、后置条件、类不变量）；
  - **Component-Driven**：前端 Storybook 等隔离开发 UI 视图组件的工程流。
  - 严禁将上述三者统称为模糊的「CDD」。

### 1.3 PBT: 纠正伪简称 PDD
- **PBT (Property-Based Testing, 基于性质的测试)**：Koen Claessen & John Hughes (ACM SIGPLAN ICFP 2000, QuickCheck) 提出。开发者声明不变量（Invariants），由生成器海量变异反例并自动最小化缩减（Shrink）。
- **规范红线**：学术界与主流工具链（Hypothesis, proptest, fast-check）通称 **PBT**。文献中不存在「PDD (Property-Driven Development)」缩写，严禁在仓库与规范中生造。

### 1.4 EDD: 事件驱动 vs. 示例驱动
- **Event-Driven Architecture (事件驱动架构)**：系统运行时异步消息流、Pub/Sub、Event Sourcing 的架构模式。
- **Example-Driven Development (示例驱动开发)**：敏捷测试与需求工程中对 TDD / BDD 实践视角的描述（以具体 Input-Output 实例替代含糊文字描述）。二者概念正交。

### 1.5 SDD 与领域启发式的界限
- **SDD 本包不作通用收录**：看到 SDD 时必须先厘清其指的是 Schema-Driven、Specification-Driven 还是领域特定的启发式，避免黑话歧义。
- **信号处理/视觉阈值调试**：在 DSP、图像处理或模式识别中，针对 SNR、连通域面积、颜色直方图欧氏距离的阈值调优属于**领域工程启发式（Domain Heuristics）**，不是通用测试元方法，仅在具体场景包中落地，禁止上升为测试族通用公理。

### 1.6 Postel 铁律（宽进严出）的反思与现代安全防御
- **历史渊源**：RFC 760 中 Jon Postel 提出 "Be conservative in what you do, be liberal in what you accept"。
- **学术与工程批判**：
  - **Marshall Rose (RFC 3117, BXXP 备忘)**：指出对有缺陷协议报文的容错会导致协议实现之间产生微妙的非标准依赖；
  - **IAB RFC 9413 (Thomson & Schinazi, 2023: *Maintaining Robust Protocols*)**：系统性论证了 Robustness Principle 的危害（诱发生态中事实标准漂移与协议僵化 Protocol Ossification）；
  - **LangSec 语言理论安全 (Sassaman, Patterson, Bratus 等)**：证明不可信输入边界上的「宽进解析」是产生解析器差异漏洞（Parser Differentials）和请求走私（Request Smuggling）的理论根源。
- **Tolerant Reader 与 Postel 的关系及适用边界**：
  - Martin Fowler 的 **Tolerant Reader（宽容读取者）** 模式在提出时虽引用了 Postel 思想，但必须严格限定其适用范围：**仅适用于已认证的受控协作方内部的字段级演进**（如微服务消费端忽略提供方新增的字段）；
  - **严禁**将 Tolerant Reader 作为对不可信外部输入（如脏 HTML、任意输入字节、未校验的上传文件）的免检借口；
  - **不可信外部边界（网络、文件、入参、IPC）**：推行 **"Parse, don't validate"**（Alexis King 准则），采用严密语法 Fail-Fast 解析，非法数据立即拒绝，严禁宽容猜测。

---

## 2. 预言机形状谱系 (Taxonomy of Oracle Shapes)

测试的类型取决于断言依据的几何形态，各形状已明确划分职责归属，不得在本页重复发明执行引擎：

| 预言机形状 | 核心判据 | 适用场景 | 极简本征示例 (0~1个) | 职责归属包 |
|---|---|---|---|---|
| **点状示例 (Point Example)** | 存在明确输入 $x$，且能独立获知绝对输出 $y$ | 核心业务计算、具体状态跳转、回归断言 | `assert crc32(b"123456789") == 0xCBF43926`（预期独立于被测实现） | `testing-workflow-spec` |
| **可观察行为规格 (Observable Spec)** | 在特定前置状态下触发操作，断言可观察的门面状态变更 | 业务链路、集成门面、需求验收 | `Given 账户已冻结, When 尝试发起转账, Then 拒绝并返回 ERR_FROZEN` | `testing-workflow-spec` |
| **不变量 / 性质 (Invariant & Property)** | 无论输入在合法域内如何取值，输出必须满足代数守恒 | 编解码器、数据结构、序列化、纯算法 | `decode(encode(msg)) == msg` (往返律) | `testing-property-mutation` |
| **蜕变关系 (Metamorphic Relation)** | 绝对输出不可知，但存在事先写死的跨输入相对关系 | 搜索排序、图形变换、优化求解、文档抽取 | HTML 中对属性顺序重排或注入无害空白，抽取的 `{title, price}` 保持严格恒等（禁止用“或”逃避证伪） | `testing-property-mutation` |
| **参考模型 (Reference Model)** | 存在一个独立、确定可信的基准实现可供差分比对 | 性能极致优化 (SIMD/GPU)、算子重构、新旧抽取器迁移 | 纯 Python 循环矩阵乘法对比 C++/CUDA 核函数，断言输出等价（误差口径由场景包定义，本页不设通用 $\epsilon$） | `testing-property-mutation` |
| **黄金基线 (Characterization / Golden)** | 遗留黑盒逻辑庞杂，需在无规格下锁定既有可观测行为 | 棕场遗留系统重构、老旧解析器升级 | 声明 `kind: characterize`，锁定已声明字段子集或输出哈希（仅锁定现状而非规格，禁止无契约整文档 diff） | `testing-workflow-characterize` |

### 机制、工具与边界归属说明：
- **边界契约 (Boundary Contract)**：见清单二（微服务 CDC/Pact、不可信边界严格解析、代码级 DbC），归属于 `contract-core-paradigm` 与对应场景包；
- **类型状态 (Typestate) 的限定**：见清单二，**类型状态是在编译期缩减非法状态空间，不替代运行时预言机**（类型系统不能证明 `send()` 写入的具体字节内容是否符合协议报文），它只改变合法输入域的范围；
- **Fuzzing (模糊测试)**：属于自动化输入生成机制（字节输入、崩溃/挂起检测），断言对应「崩溃免疫不变量」，归属于 `testing-property-mutation`；
- **差分测试 (Differential Testing)**：属于参考模型的生成与比对执行机制，归属于 `testing-property-mutation`；
- **变异测试 (Mutation Testing)**：是对预言机杀伤力进行事后审计的探照灯，用于暴露断言盲区，归属于 `testing-property-mutation`。

---

## 3. 正交选型清单 (Orthogonal Selection Checklists)

测试选型不是单向瀑布流，而是由 **预言机形状**、**作用域边界** 与 **生命周期阶段** 组成的三维正交决策。编写测试时对照以下三张清单勾选：

### 清单一：预言机形状勾选 (可多选组合)
- [ ] **存在独立已知的绝对值**：标准测试向量、已知外部夹具或回归缺陷。采用 **点状示例**（推荐每个性质保留 1～3 个手写用例）。
- [ ] **关注端到端流程与门面状态**：外部调用者关注流程状态流转与可观察结果。采用 **可观察行为规格 (BDD / GWT)**。
- [ ] **合法输入域宽广且存在数学守恒**：编解码、序列化、过滤、算术运算。采用 **性质不变量 (PBT)**（往返、幂等、单调、崩溃免疫）。
- [ ] **难以获知绝对标准值，但存在跨执行变换关系**：图像几何变换、文档重排、优化搜索。采用 **蜕变测试 (MT)**，事先写死确定的单向相对关系。
- [ ] **存在可信的参考实现**：已有慢速/原型版本、旧版解析引擎。采用 **参考模型 (差分测试)**。
- [ ] **棕场黑盒不可读**：需重构但无历史规格。声明 `kind: characterize`，采用 **黄金基线锁定**。

### 清单二：作用域边界勾选 (分层判定)
- [ ] **进程内模块间防卫**：采用 **DbC (前置/后置断言)** 与 **Typestate (类型状态编译期约束)**。
- [ ] **跨团队 / 跨进程协作演进**：采用 **消费者驱动契约 (CDC / Pact)** 与 Schema 兼容性校验。
- [ ] **内部受控协作方字段演进**：采用 **Tolerant Reader 宽容读取**，仅消费所需字段子集，忽略未声明的未知节点/扩展标签；**但绝不豁免必选字段的缺失或畸形**（必选字段缺失必须由解析器 Fail-Fast 拒绝，严禁猜测放行）。
- [ ] **不可信外部输入边界**：采用 **Parse, don't validate 严格解析**，非法数据 Fail-Fast 拒绝，严禁宽容放行。

### 清单三：生命周期阶段勾选 (单项断言互斥)
- [ ] **绿场全新开发 (Greenfield)**：采用规格先行流程，断言标为 `kind: "spec"`。
- [ ] **棕场遗留重构 (Brownfield)**：采用表征流程，断言标为 `kind: "characterize"` 锁定现状；修复缺陷或新增特性时，新断言使用 `kind: "spec"`，**同一条断言严禁既是 spec 又是 characterize**。

---

## 4. 参考文献 (Bibliography)

1. **T.Y. Chen, S.C. Cheung, S.M. Yiu**: *Metamorphic Testing: A New Approach for Generating Next Test Cases* (HKUST Technical Report TR-98-01, 1998).
2. **T.Y. Chen, F.-C. Kuo, H. Liu, P.-L. Poon, D. Towey, T.H. Tse, Z.Q. Zhou**: *Metamorphic Testing: A Review of Challenges and Opportunities* (ACM Computing Surveys, 51(1): 1–27, 2018).（注：*A Survey on Metamorphic Testing* 是 Segura et al. 的 IEEE TSE 42(9) 2016，勿混淆。）
3. **H. Liu, F.-C. Kuo, D. Towey, T.Y. Chen**: *How Effectively Does Metamorphic Testing Alleviate the Oracle Problem?* (IEEE Transactions on Software Engineering, 40(1): 4–22, 2014).
4. **Koen Claessen & John Hughes**: *QuickCheck: A Lightweight Tool for Random Testing of Haskell Programs* (ACM SIGPLAN ICFP, 2000).
5. **Bertrand Meyer**: *Design by Contract* (Advances in Object-Oriented Software Engineering, Prentice Hall, 1991).
6. **Ian Robinson**: *Consumer-Driven Contracts: A Service Evolution Pattern* (Martin Fowler's Bliki, 2006).
7. **Martin Fowler**: *Tolerant Reader* (Martin Fowler's Bliki, 2011).
8. **Alexis King**: *Parse, don't validate* (Lexi-lambda, 2019).
9. **M. Rose**: *Design and Implementation of the Blocks Extensible Exchange Protocol (BXXP)* (RFC 3117, 2001).
10. **M. Thomson & D. Schinazi (IAB)**: *Maintaining Robust Protocols* (RFC 9413, 2023).
11. **L. Sassaman, M. L. Patterson, S. Bratus**: *The Halting Problems of Network Stack Insecurity* (USENIX ;login:, 36(6): 22–32, 2011).
12. **L. Sassaman, M. L. Patterson, S. Bratus**: *A Patch for Postel's Robustness Principle* (IEEE Security & Privacy, 10(2): 87–91, 2012).
13. **L. Sassaman, M. L. Patterson, S. Bratus, M. E. Locasto**: *Security Applications of Formal Language Theory* (IEEE Systems Journal, 7(3): 489–500, 2013).
14. **Michael Feathers**: *Working Effectively with Legacy Code* (Prentice Hall, 2004 — Golden Master & Characterization Tests).
