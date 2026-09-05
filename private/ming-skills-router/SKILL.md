---
name: ming-skills-router
description: Top-level domain router and recipe dispatcher for ming-skills. Routes intent across software engineering & testing standards, reverse engineering, UI paradigms, and quality overlays. Strictly zero side-effects.
---

# ming-skills 全局领域分流与配方装配中枢

本技能是 `ming-skills` 顶级**无副作用领域闸门（Domain Gate）**。它的唯一职责是**判定所属领域桶并输出组合执行配方（Recipe）**，绝不进行工单初始化或创建工作区文件。

---

## 执行契约（双模分流与零副作用）

### 模式一（首选）：执行本技能自带的决策纯函数

在当前运行环境中执行**本技能目录下自带**的机读决策脚本（零 I/O 纯函数）：

```bash
node <本技能目录>/scripts/route-core.mjs "<用户意图文本>"
```

读取标准输出中的 `RouteDecision` JSON 结构体，严格按其中的 `domain`、`active_recipe` 与 `must_not` 执行。

### 模式二（降级）：声明式规则直接匹配

若当前环境无 Node.js 运行时或脚本执行受限，**严禁胡编乱造，直接依据下表规则透明降级分流**：

| 命中特征 / 关键词 | 归属领域 | 默认动作与装配配方 | 绝对禁令 (`must_not`) |
|---|---|---|---|
| 单元测试、覆盖率、TDD/BDD、pytest、cargo test、FFI测试、性质测试、变异测试、表征锁定 | **`testing`** | 1. 盘点意图：装配 `testing-core-oracle` 全景讲解；<br>2. 实现意图：装配 `oracle + 场景/语言包` | 严禁创建 `work/` 目录；<br>严禁调用 `case-init`；<br>严禁擅自改动业务代码 |
| 逆向、反编译、脱壳、Frida Hook、IDA Pro、Smali、JADX、二进制漏洞、ROP、协议逆向 | **`reverse`** | 转交专职路由器 `/reverse-skill-router` 并在获得授权后按 SOP 执行 | 严禁在未授权目标上操作；<br>非逆向意图禁止建单 |
| 前端布局、设计规范、色彩体系、响应式、Design Tokens | **`ui`** | 装配 `ui-design-paradigms` 提供设计指导 | 严禁调用逆向工具链 |
| 文档四体裁、ADR、可观测宽事件、AST10安全供应链、数据演进契约、质量Overlay | **`engineering`** | 装配 `docs-core-paradigm`、`docs-presentation-idiom` 等工程元包 | 严禁创建工单 |
| 包含多个领域的长复合句（如测试 + 逆向） | **`mixed`** | 输出复合候选清单，仅作规范审阅，向用户澄清主次意图 | 严禁直接初始化单方工单 |
| 纯闲聊、无实质工程意图、无关自然语言 | **`none`** | 输出 `[NO_ROUTE]`，提示用户明确指定技能 | 保持零操作 |

---

## 铁律约束（Strict Invariants）

1. **绝对禁止副作用**：本路由器严禁以任何理由创建 `work/` 目录；
2. **绝对禁止误调逆向**：在任何非 `reverse` 高置信任务上，**绝对禁止**调用 `case-init`。
