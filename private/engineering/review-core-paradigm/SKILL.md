---
name: review-core-paradigm
description: Review meta-rules for landed diffs: ablation pass (remove-if-survives test on introduced abstractions, over-production traps) + independent-context critic (diff+spec only) + human curation. Use post-implementation when suspecting over-engineering or needing independent review. Triggers: 消融, ablation, 过度设计, over-engineering, 简化审查, YAGNI, 评审, 独立评审. Not for test design, docs review, CI gates.
metadata:
  layer: methodology
  compose: overlay-on-diff
---

# Review Core Paradigm — 跨场景评审元规则

评审是发散检查（找不知道存在的问题），生成是收敛执行（让测试通过）。对落定 diff 的评审有两个已知系统性偏差要矫正：**模型产出偏好冗余**（过度设计是训练成因，非审美问题）与**同上下文自审不客观**（生成者偏见）。本包给两遍审查程序，分别对治。

## 1. 偏差前提

- **冗余是系统性偏差**：RLHF 长度奖励与 verbosity compensation 使模型在不确定时倾向多写——冗余常是信心的反指标。「别过度设计」是被动指令；消融是**可执行的反馈环**——摘掉看行为是否仍成立，把偏好变成可证伪操作。
- **自审两难**：评审者共享生成上下文 → 不客观（带着产出的推理找问题）；不共享 → 不充分。解法不是选一个，是分两遍：自审消冗余（作者知意图），critic 查正确性（独立上下文）。

## 2. Pass A — 消融实验（自审，每个落定 diff 都跑）

1. **枚举抽象面**：本次新增的全部抽象——新模块/新层/新接口/新配置键/新参数/feature flag/兼容 shim/新文件；
2. **摘除存活性测试**：逐项假想删除——行为仍成立、无真实调用方、无契约要求 → 冗余，标记删；
3. **过 over-production traps 清单**（LLM diff 复发模式，命中须说出名字）：
   - `While-I'm-here`：任务外顺手改动；
   - 无场景扩展点：为假想调用方预留的泛化；
   - 防御性重复：同一校验写两遍的「保险」；
   - 单次使用包装层：只有一个调用方的 helper/wrapper；
   - 「以防万一」旋钮：无人会改的配置；
4. **保留判据**（三者有一即留）：≥1 个真实调用方 / 契约演进要求（contract-core-paradigm）/ 明确失败闭合需求。
5. **生命周期视角（消融三角）**：裁定对象住在三态机上——**缺席**（未建/已拆/候审）⇄ **实例件** ⇄ **抽象件**（references/scripts/lib/范式包/编排脚本等既有载体，非新工件类）。四条迁移边各有阈值：
   - **拆**：零真实调用方、零契约要求、零失败闭合需求 → 在场→缺席；
   - **建/补**：证据到达 → 缺席→实例（首建与回补同边；候审区管未建件，已拆件复活信号挂 distill 条目）；
   - **提**：N≥2 真实实例**且同形** → 实例→抽象（采纳者级沿用 registry「二进毕业」；代码级 Roberts 三振；计数是「同形」的代理——实例各带参数动物园则三振也不提）；
   - **反提 = 提⁻¹**：抽象被证错（参数/条件分支增生是征兆）→ 内联回实例（Metz：最快前进是后退），不补条件硬撑。
   **[禁止] 缺席→抽象**：无实例证据不得直建抽象顶点——预抽象是图上的非法迁移。

## 3. Pass B — 独立上下文 critic（重要或高风险改动加跑）

- **分发新鲜上下文评审者**：只给 diff + 需求规格，不给实现推理与会话历史——评输出不评过程（Generator-Critic 律）；不同模型更佳；
- **发现分级**：P0 阻断（安全/正确性/契约破坏）/ P1 必须处理（架构边界/测试缺失）/ P2 建议；
- **人筛意见再回喂**：critic 产出由人摘取后交给实现者改——使用者手里有第三份上下文（意图），自动闭环会丢掉它。

## 4. 收尾证据（评审合格的出口条件）

- 变更文件清单 + 行为变化一句话；
- 跑了哪些检查/测试，没跑哪些及理由；
- 消融标记处置结果：删了哪些、留了哪些及判据；被裁件另记**复活信号**（何种证据到达即回补 + 移除位指针——落 distill 条目「时效边界」节）；
- 剩余风险明示。

## 5. 禁令

1. **[禁止] 评审直接改码**：critic 产报告，人筛后才执行——分析与重构分离；
2. **[禁止] 把生成推理喂给 critic**：只给 diff+spec，污染则独立性失效；
3. **[禁止] 消融 = 删光**：满足保留判据的抽象必须留；
4. **[禁止] review-edit 自动闭环**：agent 互审互改的 loop 产出不可预期；
5. **[禁止] 消融测试与文档骨架**：测试/文档的「冗余」常是契约面——消融对象是抽象与代码面。

## 6. Compose

```
review-core-paradigm（本包：评审域两遍程序）
+ testing-core-oracle（测试作为评审证据——批评有测试背书才算落定）
+ sec-core-paradigm（P0 安全面的判定清单）
+ contract-core-paradigm（消融豁免：契约字段不能因「没调用方」删）
+ arch-core-paradigm（P1 架构边界审查依据）
+ docs-core-paradigm（文档体系评审分流——文档问题走那边）
```
