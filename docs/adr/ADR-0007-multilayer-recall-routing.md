# ADR-0007: 多层召回评分路由——词法层入核、嵌入层离线、召回优先策略

- Status: Proposed
- Date: 2026-09-18
- 关联: ADR-0006（distill-loop，向量离线化先例）、docs/ROUTER_ARCHITECTURE.md §已知边界-3（运行时嵌入否决条款）

## Context

路由召回目标是**路由器自扛召回率**：不能依赖模型读 description 兜底（44+ 描述全注上下文成本高），**召回率优先于精确率**——假阴性是主敌，假阳性由下游 description 精排保底。期望多维多层评分，而非单一信号。

2026-09-18 覆盖度实测暴露现状盲区：`skillTriggers` 词不在任何域触发词时仅域内细化、裸词永不开门——`arch-core-paradigm` 全部 10 个词均不可裸词召回（"做个六边形架构设计"→ handoff）。手工修补+T7 I 级检查已落地，但盲区是**撞见的**，不是**测出来的**——缺乏系统化召回度量与挖掘手段。

先例约束（ADR-0006 / ROUTER_ARCHITECTURE §31）：运行时 Decide() 禁止引入本地 ONNX（冷启动 2~5s、120MB+）或在线推理依赖；已批准方向为"离线冻结向量校验与词表维护辅助"。运行时调用形态为每调用一进程的 CLI（`runRouteCli`），无常驻服务摊销模型加载——该否决工程依据仍然成立。

外部调研要点（作为设计参考基线存档）：

- **RRF/凸组合融合**：多源异尺度分数按秩融合（RRF, k=60）或归一化加权求和（CC）；我们的 reasons[] 可审计文化倾向 CC——保留各信号分项贡献
- **两阶段 retrieve→rerank / 级联 cheap→expensive**：宽网召回→精排是 IR 标准形态；我们的精排阶段由 description 天然承担
- **SkillRouter 论文（80K 规模）**：仅 name+description 嵌入比全文丢 31-44pp——嵌入文档须为 name+description+skillTriggers 三合
- **多语言必须**：中英混合触发面排除了 all-MiniLM-L6-v2（纯英文）；候选 multilingual-MiniLM-L12 / e5-small（~50MB 量化）
- **GitHub Actions 定位**：CI 不能跑 query 时推理；可用于 manifest 变更时重建嵌入 artifact，与本地脚本冗余互验

## Decision

1. **运行时多层评分（确定性信号，全部零推理依赖）**
   - S1 显式点名：最高优先，用户宣言不可被分数稀释（现状）
   - S2 关键词触发：域 triggers + skillTriggers + negatives 中和（现状）
   - S3 词法相似层（**新增**）：BM25/TF-IDF 对 (name+description+triggers) 三合文档打分——纯逻辑实现，符合零依赖约束，提供词形重叠容错
   - S5 负词否决：现状保留
   - 融合：各信号 min-max 归一化 → 加权凸组合 → reasons[] 记录分项贡献（可审计优先于 RRF）

2. **召回优先策略**
   - candidates 取各信号超阈值的并集（宽网提名）
   - domain==='none' 但词法层有可信命中时，action 由空 handoff 升为 `ask`+candidates——召回增量主要来源
   - 非确定性信号**永不单独触发 dispatch**：dispatch 仍需确定性域分或点名，fail-closed 姿态不破

3. **嵌入层离线化**（ADR-0006 批准方向的具体化，非新裁决）
   - `scripts/build-embeddings.mjs` 生成 `config/router-embeddings.json`（44×384 ≈ 150KB，提交进仓+freshness 检查，同 manifest 治理）；模型权重走 HF 缓存，gitignore 不进仓
   - 用途一：词表维护——嵌入相似度挖掘 paraphrase 盲区，产出候选触发词/skillTriggers 提案（**人审后入表**，与 distill 晋升同理）
   - 用途二：eval 基线——量化"若运行时嵌入上线能增多少召回"，为未来修正裁决留证据
   - 云端 encoder API 仅作可插拔备选，默认离线；不引入路由运行时

4. **运行时嵌入列为待议项**
   - 触发复议条件：出现常驻服务路径可摊销冷启动，且离线词表挖掘经 eval 证明显著不足
   - 届时立新 ADR 修正 §31 条款；本 ADR 不推翻先例，在其边界内取零成本增量

5. **验证先于采纳（eval-first gate）**——三层数据集设计（2026-09-18 二轮调研细化）
   - **A 回归层**（黄金 paraphrase ≈ 60-80 条）：现有 23 黄金各改 2-3 种说法；生成方法用 CLINC150 双轨——paraphrase 种子 + **场景应答**（"假装你要 X 会怎么说"，产出 paraphrase 得不到的措辞多样性）；synthetic 样本须标 provenance 与真实样本分账
   - **B miss 语料层**（实战假阴性，随实战增长）：原料即 `route.decided` 事件里的 hint（observability 通道已在）——domain=none/handoff 但本应路由的案例入档，如 "做个六边形架构设计" 裸词案例
   - **C 负空间层（OOS）**：CLINC150 的 OOS split 设计——**不该路由的查询必须入集**（闲聊/通用编程/边界混淆词），守卫 fail-closed 姿态不被召回优化侵蚀
   - **标注铁律**（goldset 原则）：**禁用路由器自身输出自动当期望**——未评分日志 bootstrap 不出 gold，会把历史错误烙进基准；每条期望 outcome 人审确认
   - **覆盖度口径**：按 domain×skill 分类矩阵度量覆盖，不以观察流量自封完备（goldset 第二原则）
   - **统计诚实**：~100 条规模下单点召回率 CI 宽——eval 作**回归门**（有没有退化）而非精度测量仪；权重调参若发生须留 holdout 防过拟合 eval 集本身
   - S3 上线以 eval 增量为准入门槛；S4 离线产出的词表提案以 eval 验证为准入

## Consequences

- 召回率提升路径全部落在零依赖约束内：词法层运行时增量 + 嵌入离线挖掘的词表复利
- reasons[] 可审计性保持：凸组合分项记录优于黑盒分数
- 嵌入 artifact 治理与 manifest 对齐；模型权重体积（≤~120MB 可接受）只影响开发机缓存
- 风险：S3 词法层需防噪声词拉高分（停用词/短词过滤）；eval 集早期规模小，统计功效有限——以趋势观测而非阈值裁决过渡
- 遗留待议：运行时嵌入复议条件、miss 语料采集通道（route.decided 事件回流蒸馏）
