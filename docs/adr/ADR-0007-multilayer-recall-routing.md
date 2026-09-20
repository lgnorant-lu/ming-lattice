---
dynamics: [立,改,增,废]
domain: gov
---

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
   - **S3 tokenizer 规格（三轮调研关键发现）**：CJK 无空格分词必须走**字符级 bigram**（PGroonga TokenBigram / Lucene / Meilisearch 全系生产检索引擎同法——白空格 tokenizer 对中文查询返回 0 命中的生产事故案例见 hindsight #3892/#1077）；实现=ASCII 词 `[a-z0-9]{2,}` + CJK 区间（U+4E00-9FFF）重叠二元组，CJK 标点切分，k1=1.4 b=0.75
   - **IDF 即特异性先验**：BM25 的 IDF 天然降权"测试/性能"类泛词（出现于多文档→低 IDF），结构性缓解已知边界#1 中文前缀穿透（"渗透测试"的"测试"bigram 弱分、"渗透"bigram 强分），减少对人工 negatives 词表的依赖
   - **字段加权规格 BM25F（四轮调研）**：三合文档非均质——name/description/skillTriggers 三字段权重不同；采用 Robertson 2004 版 BM25F：**先按字段 boost 加权词频再进非线性饱和**（`weight=Σ_c occurs·boost_c/((1-b_c)+b_c·l_c/avl_c)` → `weight/(k1+weight)`），勿做字段独立打分后线性加（破坏饱和特性）；字段 boost 初值 name×3 / triggers×2 / description×1。注意"标题 boost 不普适"反例（ADCS'16）：导航型查询才受益——name 字段加权仅兜**嵌入式提及**，精确点名已由 S1 承担，防双计分
   - **小语料注记**：44 文档使 IDF 粒度仅 44 档、绝对分数无意义——词法层只产**排序信号**，进融合前按 query min-max 归一
   - **实现不变量**：S3 必须消费与 S2 相同的 `activeText`（代码块/引用已剥离、否定从句已过滤）——"不用 apk-reverse"的否定语义在词法层同样成立，不得另起未过滤的文本通道
   - S5 负词否决：现状保留
   - 融合：各信号 min-max 归一化 → 加权凸组合 → reasons[] 记录分项贡献（可审计优先于 RRF）
   - **权重标定协议（四轮调研）**：权重**不手工钦定**——初值启发式（词法/关键词权重主导，本仓语料是技术标识符密集场景，alpha 向 BM25 侧倾；参照"技术文档应提高 BM25 权重"的 Elastic 经验），eval 集就绪后做 **OpenSearch SRW 式网格搜索**（归一化×组合方式×权重 0.1 步进）对 recall@k 寻优，留 holdout 防过拟合；RRF（k=60）保留为对照基线——若 CC 在 eval 上表现脆化则切换，二者均为业内标准件

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
   - **度量口径**（三轮调研对齐 vLLM-sr/CLINC 指标谱）：主指标 **candidates recall@k**（期望技能是否进候选集）+ dispatch 正确率（应路由案例的 action/domain/recipe 吻合）+ **OOS 误纳率**（C 层被路由的比例——CLINC 实证 OOS 检测最难，最好系统仅 66% OOS recall，我们靠确定性门槛天然占优）；报告按 domain×language 切片（zh/en/mixed），杜绝均值掩盖
   - **语料 schema**：`{id, query, expect:{domain?,skills?,anySkills?,action?,actionIn?}, tier:A|B|C, provenance:golden-paraphrase|scenario|real-miss, lang:zh|en|mixed}`——provenance 分账是 goldset 原则的落点；`anySkills`（任一候选即召回）与 `actionIn`（动作白名单）为召回优先策略的期望算子——OOS 相邻查询的真契约是"永不置域/dispatch"而非"必须 handoff"
   - S3 上线以 eval 增量为准入门槛；S4 离线产出的词表提案以 eval 验证为准入

## Implementation Notes (S3 落地, 2026-09-19)

S3 词法层已入核并验证（`scripts/build-router-manifest.mjs` 产 `skillDocs` 三合文档；`route-core.mjs` 内 bigram tokenizer + BM25F + candidates 并集 + none→ask 升级）。实测增量：**74/78 → 76/78**（A 层 48/50→50/50 满分；a-008/a-035 两个泛词盲区经词法候选召回修复；C 层 23/25）。调参过程中发现并修复两个结构性缺陷：

- **停用词必须双侧过滤**：无停用词表时英文功能词（is/a/to/what）与中文功能 bigram（帮我/怎么/区别）计入命中数与打分，OOS 误纳 15 例；建 `LEX_STOP_EN`/`LEX_STOP_ZH` 双侧过滤后收敛
- **min-max 归一化的结构性漏洞**：top 命中恒为 norm=1.0，任何单弱命中都过相对阈——加**证据下限**：`matched≥1 && matchedBoost≥1`（至少 1 词命中 name/triggers 加权字段，纯 description 命中不提名）
- 未解决边界（有意留档 known-miss）：c-013/c-014（物理测试/性格测试被"测试"关键词劫持——S2 层问题，非 S3）；单词低鉴别力命中仍有上限（如"上游改了字段"仅"字段"命中 contract-core——matchedBoost 救回后已召回，但更普遍的"单内容词"场景词法层触顶，正是 S4 嵌入的目标面）
- 适配契约同步放宽：`injectedCandidates` 断言从"恰好 11"改为"域内全量⊆"（并集宽网的必然结果）

## Spike Result (S4 嵌入, 2026-09-19) — eval 门禁未通过

`tools/embeddings/`（paraphrase-multilingual-MiniLM-L12-v2, q8, 384 维）对同一 78 例语料的实测：

- **emb-only 命中 = 0**：嵌入层未补回任何现状漏掉的案例；either-并集 = 关键词+词法基线本身
- **A 层 37/50**：同域技能级消歧弱是结构性短板（测试类查询嵌到正确域但选错技能——description 语义天然彼此接近）；跨域错向案例存在（签名参数→protocol 域、渗透审计→engineering 域）
- **OOS 分数带重叠**：C 层 top1 cosine max=0.555 > A 层中位 0.491——不存在干净的语义 OOS 阈值；嵌入对"测试"歧义类反而更敏感
- **裁决**：按"上线以 eval 增量为准入"条款，S4 **不接入运行时**，§31 否决维持且被强化——44 技能+触发词密集语料上，确定性栈召回已超嵌入。嵌入的理论优势（paraphrase 容错）在关键词覆盖良好的前提下未兑现
- **保留资产**：工具链留仓可复现（`build-embeddings.mjs`/`eval-embeddings.mjs`，模型走 hf-mirror 缓存，权重不进仓）；`router-embeddings.json` artifact 因无消费者暂不提交——B 层实战语料攒大后可重跑翻盘测试，翻盘证据出现前不重议运行时嵌入

## Consequences

- 召回率提升路径全部落在零依赖约束内：词法层运行时增量 + 嵌入离线挖掘的词表复利
- reasons[] 可审计性保持：凸组合分项记录优于黑盒分数
- 嵌入 artifact 治理与 manifest 对齐；模型权重体积（≤~120MB 可接受）只影响开发机缓存
- 风险：S3 词法层需防噪声词拉高分（停用词/短词过滤）；eval 集早期规模小，统计功效有限——以趋势观测而非阈值裁决过渡
- 遗留待议：运行时嵌入复议条件、miss 语料采集通道（route.decided 事件回流蒸馏）
