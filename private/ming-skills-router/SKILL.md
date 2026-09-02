---
name: ming-skills-router
description: Top-level domain router and recipe dispatcher for ming-skills. Routes intent across testing standards (11-skill family), reverse engineering, UI paradigms, and private protocols. Strictly zero side-effects.
---
# ming-skills 全局领域分流与配方装配中枢

本技能是 `ming-skills` 顶级**无副作用领域闸门（Domain Gate）**。它的唯一职责是**判定所属领域桶并输出组合执行配方（Recipe）**，绝不进行工单初始化或创建工作区文件。

## 执行契约（RFC 2119）

1. **`NOW`（分流判定）**：
   - 运行决策内核获取机读决议（无 I/O 纯函数）：
     ```bash
     node scripts/route-core.mjs "<用户意图文本>"
     ```
   - 读取并严格遵循输出的 `RouteDecision` JSON 结构体。

2. **`ACT`（按决议动作执行）**：
   - **`domain=testing`**：
     - 若配方为 `testing-overview-catalog`（盘点/讲述意图）：**向用户全面陈述体系全貌、各包职责与路线图，禁止直接盲目动手改写代码**；
     - 若配方为具体实现（如 `spec-driven-greenfield` / `embed-ffi`）：输出标准 1+1 装配并进入开发工作流；
     - **禁止**调用任何逆向 SOP 或 `case-init` 脚本。
   - **`domain=reverse`**：
     - 指引转交逆向专职路由器 `/reverse-skill-router` 进行深度工具链自举。
   - **`domain=ui`**：
     - 输出 `ui-design-paradigms` 设计规范指引。
   - **`domain=none`（拒识）**：
     - 输出 `[NO_ROUTE]` 说明，提示用户当前意图未命中本仓库已知领域，请显式指明具体技能。
   - **`domain=mixed`**：
     - 输出多领域复合候选名单与装配图，向用户提问澄清主次目标。

3. **`STRICT INVARIANT`（铁律：零副作用）**：
   - 本路由器**绝对禁止**创建 `work/` 目录；
   - **绝对禁止**在非 `reverse` 高置信任务上调用 `case-init`。
