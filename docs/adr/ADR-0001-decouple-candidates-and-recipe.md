# ADR-0001: 解耦机读全量候选集 (candidates) 与推荐执行装配 (active_recipe)

- **状态**: Accepted
- **日期**: 2026-09-02
- **决策者**: ming-skills 核心团队

---

## 1. 背景与上下文 (Context)

早期 `RouteDecision` 结构体中仅包含单一 `skills: string[]` 字段。在处理用户“盘点现有的测试规范族并都讲述一番”的宏观意图时，分类器直接输出绿场 2 包短配方（`oracle` + `workflow-spec`），导致大模型无法感知其余 9 个技能包的存在，造成了严重的**知识供给空缺（召回漏洞）**。

若简单地将 11 个包全部作为正文塞进会话上下文，又会造成巨大的 Token 消耗与大模型注意力稀释。

---

## 2. 决策内容 (Decision)

将 `RouteDecision` 的职责彻底拆分为高召回与高精度两个正交维度：

1. **`candidates: string[]`（高召回机读名单）**：
   - 输出该领域（或复合任务中的双领域）全部可用的技能包名称列表；
   - 仅作为轻量元数据注入会话，提供全局知识感知，Token 开销极低。
2. **`active_recipe: { name, skills }`（高精度默认装配建议）**：
   - 输出推荐的默认组合（如盘点意图输出 `testing-overview-catalog` 4 包核；单点 CLI 输出 `cli-tool-spec`）；
   - 适配器默认**仅加载 `active_recipe.skills` 包含的 $\le 4$ 个包正文**，其余包由模型在后续按需点名加载。
3. **`must_not: string[]`（副作用阻断清单）**：
   - 明确列出禁止操作（如非 `reverse` 高置信下禁止 `initReverseCase`）。

---

## 3. 后果与影响 (Consequences)

- **正面收益**：
  - 彻底解决了盘点类任务的召回漏洞（`must_include ⊆ candidates` 100% 成立）；
  - 会话正文加载量受控（$\le 4$ 份），避免了上下文爆炸；
  - 黄金测试断言模型从脆弱的“绝对相等”演进为更具鲁棒性的“集合包含律”。
- **负面影响 / 约束**：
  - Harness 适配器必须正确消费 `candidates` 与 `active_recipe`，不可将两者混为一谈。
