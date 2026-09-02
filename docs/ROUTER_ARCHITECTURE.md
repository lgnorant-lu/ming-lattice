# 跨 Harness 领域路由架构设计规范 (Router Architecture Specification)

本文档定义 `ming-skills` 作为独立主权技能平台的核心路由体系规范。本架构实现了**「抽象决策内核（Core）」与「平台宿主外壳（Harness Adapters）」的彻底解耦**，确保在任何 AI 编码客户端中均能保持确定性、无副作用的分流与配方装配。

---

## 1. 架构设计哲学

```
                用户输入意图 Hint (纯文本，不假设有无 / 前缀)
                               │
               ┌───────────────▼───────────────┐
               │    route-core 纯函数决策内核    │
               │    (零 I/O、零网络、零副作用)    │
               │    输入: (hint, manifest)     │
               └───────────────┬───────────────┘
                               │
               ┌───────────────▼───────────────┐
               │      RouteDecision JSON       │
               │      (跨 Harness 统一契约)     │
               │      side_effects: "none"     │
               └───────────────┬───────────────┘
                               │
      ┌────────────────┬───────┴────────┬────────────────┐
      ▼                ▼                ▼                ▼
【Claude Code】   【OpenCode】     【Codex / Grok】    【DSH / 其它】
- ming-skills-    - 按 Decision    - 注入 Recipe       - 统一读取 JSON
  router 输出       skills[] 加载    装配提示词        - 严格遵循零副作用
- reverse 负向镜像
- 阻断非 RE 建单
```

### 核心三铁律
1. **决策层与副作用彻底剥离**：路由决策内核（`route-core.mjs`）永远保证 `side_effects: "none"`，严禁在路由阶段创建文件或初始化工单。
2. **拒识（`none` / `handoff`）是一等公民**：当任务未匹配到强特征时，输出 `domain: "none"`，绝不机械兜底到某一特定领域（如通用逆向）。
3. **输出是装配配方（Recipe 集合），而非单个文件**：工程任务的解法往往是多技能组合（如 `testing-core-oracle` + `workflow` + `idiom` + `scenario`）。

---

## 2. 统一机读契约 (Machine-Readable Schemas)

### 2.1 决策对象契约 (`RouteDecision`)
定义于 [`docs/schemas/route-decision.schema.json`](file:///d:/dogepy/skills-collection/docs/schemas/route-decision.schema.json)：

```json
{
  "domain": "testing | reverse | ui | protocol | mixed | none",
  "confidence": "high | medium | low | none",
  "candidates": [
    "testing-core-oracle",
    "testing-workflow-spec",
    "testing-workflow-characterize",
    "testing-property-mutation",
    "testing-rust-idiom",
    "testing-python-idiom",
    "testing-js-idiom",
    "testing-go-idiom",
    "testing-scenario-cli",
    "testing-scenario-scraper",
    "testing-scenario-embed-ffi"
  ],
  "active_recipe": {
    "name": "spec-driven-greenfield",
    "skills": ["testing-core-oracle", "testing-workflow-spec"]
  },
  "action": "dispatch | handoff | ask",
  "side_effects": "none",
  "must_not": ["initReverseCase", "create_work_dir"],
  "reasons": [
    "negatives_hit[reverse]: 测试覆盖, 覆盖设计",
    "domain_selected: testing (score=2)"
  ]
}
```

### 2.2 路由清单契约 (`RouterManifest`)
定义于 [`docs/schemas/router-manifest.schema.json`](file:///d:/dogepy/skills-collection/docs/schemas/router-manifest.schema.json)，由 `scripts/build-router-manifest.mjs` 自动生成至 `config/router-manifest.json`：
- **`domains`**：领域定义、包含的技能包列表、正向触发词（`triggers`）、负向排除词（`negatives`）、默认配方；
- **`recipes`**：标准预定义装配图（如 `spec-driven-greenfield`、`embed-ffi-greenfield`、`scraper-pipeline` 等）。

---

## 3. 决策流程与判定优先级

纯函数 `Decide(hint, manifest)` 遵循严格的优先级次序：

1. **显式点名技能包（Explicit Mention）**：
   - 若输入文本包含具体的包名（如 `testing-python-idiom`、`apk-reverse`），直接精准派发该技能（若属于 testing 则自动补齐 `testing-core-oracle`）。
2. **负向特征熔断（Negatives Gate）**：
   - 若输入文本命中某领域的 `negatives`（例如：逆向领域命中了“单元测试”、“覆盖率设计”），该领域的得分**硬性归零**，彻底阻断跨领域误入。
3. **正向特征积分（Positive Scoring）**：
   - 统计各领域 `triggers` 的命中频次并排序。
4. **决策结果输出**：
   - **单领域胜出** $\rightarrow$ `action: "dispatch"`，输出精细化 Recipe；
   - **多领域并列** $\rightarrow$ `domain: "mixed", action: "ask"`；
   - **零特征命中** $\rightarrow$ `domain: "none", action: "handoff"`。

---

## 4. 跨 Harness 适配器规范

| 宿主环境 (Harness) | 适配器职责 | 严禁事项 |
|---|---|---|
| **Claude Code** | 部署 `ming-skills-router`；在 `reverse-skill-router` 的 description 镜像负向声明；低置信度时阻断 `case-init`。 | 严禁在总控内直接执行 `case-init.ps1` 建单。 |
| **OpenCode** | 读取 `RouteDecision.skills` 进行动态模块加载。 | 严禁假设存在特定的 Slash 指令。 |
| **Codex / Grok** | 将装配配方注入当前会话执行上下文。 | 严禁依赖特定 OS 终端的日志输出格式。 |
| **DSH / 自动化流水线** | 调用 `node scripts/route-core.mjs "<hint>"` 读取纯 JSON 决议。 | 严禁在外部自建第二套私有分流字典。 |

---

## 5. 黄金测试套件保障 (Golden Tests)

在 [`tests/test-route-decision.mjs`](file:///d:/dogepy/skills-collection/tests/test-route-decision.mjs) 中固化了 8 条黄金回归用例，确保任何重构都不会破坏以下核心用例：
- `规范化测试覆盖设计，找找相关的skill...` $\rightarrow$ **100% 判定为 testing 领域，负向硬阻断 reverse，零副作用**。
