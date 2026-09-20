# Sources — explore-core-paradigm 引用边界与文献索引

## 偏差证据（为何必须程序性发散）

- **Artificial Hivemind**（arXiv 2510.22954，NeurIPS'25）：Infinity-Chat 26K 开放查询上 LLM 双重坍缩——intra-model 自重复 + **inter-model 同质**（不同模型产出惊人相似）；
- **Verbalized Sampling**（arXiv 2510.01171，ICML'26）：mode collapse 的数据级成因=偏好数据 typicality bias；提示词级解法=要 k 个候选+概率+尾部采样（p<0.10），多样性 1.6-2.1×、免训练、与温度正交；CHATS-lab/verbalized-sampling 有开源实现；
- **arXiv 2608.19437**：跨三年模型代际，开放任务输出多样性显著下降——偏差在恶化；
- **arXiv 2509.21267**：任务依赖多样性框架——homogenization 是否有害取决于任务，「该在何处求异」的分类学。

## 异策略与多智能体侧

- **DMAD**（ICLR'25）：多智能体辩论若推理策略同质则退化为多数投票——给 agent 分配**不同推理策略**（非 persona 皮）破固定心智集；
- **DynaDebate**（arXiv 2601.05746）：Path Generation Agent 先显式产多条解路径再辩——先发散后收敛的显式分工；
- **Persona-based brainstorming**（arXiv 2512.04488）：persona 的领域选择塑造 idea domain——立场要选**领域**不是贴标签；
- **Debate-to-Write**（COLING'25）：persona 作为高层信念产生视角多样、非线性的 idea 展开。

## 搜索与承诺判据侧

- **ToT**（arXiv 2305.10601，NeurIPS'23）：thought 节点 BFS/beam + 自评 + 回溯——lookahead/评估/回溯的显式搜索词汇；
- **CodeTree**（arXiv 2411.04329）：策略→方案→精炼的阶段化树搜索，执行反馈剪枝；
- **SWE-Search**（arXiv 2410.20285）：MCTS + value agent + discriminator debate 的工程代理形态；
- **Risa**（arXiv 2608.22191）：「Disagree to Explore, Agree to Commit」——本包判据的命名来源，但**本包对 agree 做了修正**（见下）；
- **SWE-Explore**（arXiv 2606.07297）：仓库探索是可测量的独立能力（覆盖/排序/上下文效率）。

## 修正性反证（agree ≠ 真理）

- **Self-Consistency Backfires**（arXiv 2608.11403）：难任务上模型 mode 即错时，多采样+多数票把错答案投得更硬；无验证器信号能检出；
- **Consensus is Not Verification**（arXiv 2603.06612）：聚合策略在事实性任务上无一稳定优于单采样——一致性只能选「选项」不能选「真相」；
- **arXiv 2502.11027**：多样性-保真度权衡——prompt 扰动多样性助 Best-of-N；多数投票下多样性消失 → 正确形态是**多样性生成+选择**，非多样本+投票。

## 启发式算子侧

- **MP 元认知提示**（AAAI'25）：strategize→monitor→reflect 元认知环赋予横向思维，超 CoT；
- **LLM 增强形态学分析**（DRS 会议论文）：decompose→generate→combine 三阶段；
- **SCAMPER×GPT-4 设计实证**（AI EDAM, Cambridge）：AI 激发新颖想法但缺可行性判别——支持「发散产候选、裁决交别处」的分工；
- **Inversion/Pre-mortem**：Klein 预期后见（HBR 2007，~30% 优于前向风险分析）；counteracts sycophancy——「模型最抗拒的模式」；
- **社区先例**：viktorbezdek/skillstack `creative-problem-solving`、oborchers `structured-brainstorming`（含 inversion-and-pre-mortem reference）、prompt-architect pre-mortem 模板——skill 封装形态已验证。

## 升降模型的统一解释

本仓 2026-09-20 商讨产出：所有发散算子=「上升到抽象层→换轨→重新实例化」——VS 上升到分布层尾部实例化；形态学上升到轴层重组实例化；premortem 上升到「已失败」虚拟未来层回溯实例化。与 review 消融（上升对照实例存活剪枝）共享上升动作、下降动作相反（一加一减）。**若出现第三个升降操作消费者，再评估抽 `abstraction-*` 共享包**——当前判定不抽（无独立触发面+共享内容仅数行）。

## 明确不纳入

- SCAMPER/TRIZ/六帽等创意清单——模型先验已有，forge §7.1 不过，仅本文件留名；
- 模型权重侧方法（CreativityNeuro 等 activation/weight steering）——不可提示词化；
- 事实性问答的多采样聚合（self-consistency 系）——那是验证域工具，且 backfire 证据见上。
