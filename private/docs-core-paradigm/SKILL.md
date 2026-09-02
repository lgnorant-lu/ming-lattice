---
name: docs-core-paradigm
description: Cross-scene documentation meta-rules using Diataxis four quadrants, Nygard ADRs, and a single source of truth for reference. Use when writing, splitting, or reviewing docs, READMEs, ADRs, schemas-as-docs, CLI help, pipeline field dictionaries, or FFI ABI notes. Triggers include documentation, diataxis, ADR, docs-as-code, how-to, reference-docs, explanation, tutorial, 文档体裁, 架构决策记录.
metadata:
  layer: documentation
  compose: overlay-on-testing
---

# Docs Core Paradigm — 跨场景文档元规则

文档的第一读者是人和下一轮 Agent。本包只规定体裁、决策留痕与事实源，不规定站点生成器、主题或语言。

## 1. 指南针（Diátaxis）

先判定读者此刻要的是「做」还是「知」，是「学」还是「干」，再选一篇只服务一个象限的文章。

| 内容服务 | 读者阶段 | 体裁 | 写法 |
|---|---|---|---|
| 行动 | 习得 | Tutorial | 一条有终点的受控路径，少讲为什么 |
| 行动 | 应用 | How-to | 已会基础的人如何完成一件具体事 |
| 认知 | 应用 | Reference | 中性描述产品本身，格式一致、可查找 |
| 认知 | 习得 | Explanation | 为什么这样、力量如何权衡 |

ADR 不是第五个体裁。它记录「已做选择」，给决策者与 Agent 防翻案，体裁上接近短 Explanation。

README 允许极短混合（是什么 + 链到四象限）。细节不得堆在 README。

## 2. 跨场景禁令

1. **[禁止] 混象限** — 一页同时当教程、手册和 API 手册。跨象限就拆文或只留链接。
2. **[禁止] Reference 教学** — 查找页不写「如何完成任务」；任务进 How-to。
3. **[禁止] 教程上理论课** — 教程最多一句原因并链到 Explanation。
4. **[禁止] 第二真相** — 退出码、字段、flag、ABI、事件名以 schema / 代码 / 测试夹具为第一事实源。散文只引用，不手抄一份会漂的表。
5. **[禁止] 过期假现状** — 无法与代码同 PR 维护的段落标过期或删除。过期比缺失更坏。

## 3. ADR 契约（Nygard）

对改变结构、质量属性、依赖、对外接口或做法的选择，写一篇短记录：

- Status（Proposed / Accepted / Superseded）
- Context（力量与约束）
- Decision（选了什么、没选什么）
- Consequences（得与失、何时重开）

Accepted 后不改写历史；要改就 Supercede。仓库私有分叉用 ADR；跨仓库仍成立的方法论进本 Skill，不进 ADR。

## 4. Oracle

- 任意一篇能标且只标一个主象限（README / FAQ 除外，且必须向外链接）。
- Reference 中的每个可执行事实能指到 schema、生成物或测试，而不是另一段散文。
- 场景 How-to 按步骤可做完，不依赖未写的隐含环境。
- Agent 默认只加载当前任务所在象限 + 必要 ADR，不把 Explanation 与 Reference 整库灌进上下文。

## 5. Compose

```
docs-core-paradigm
+ 本场景差页（references/scenes/<scene>.md，无实践则跳过）
+ 若文档即契约或测试 Oracle — 再加载 testing-core-oracle 与对应场景测试包
+ 本仓已选答案 — docs/adr/，不是本包的替代
```

不要为每个场景复制一套文档元包。游戏与逆向无实践时不要编造。
