---
name: ming-skill-forge
description: 技能包创作与修订元规则——SKILL.md 解剖（frontmatter 契约、渐进披露三级预算、description 触发面工艺）、registry.yaml 登记、路由接线（DOMAIN_DEFS + skillTriggers）、references/scripts/assets 分工、硬门控 check-skill.mjs。当新建技能包、修订/调优现有 skill、诊断路由不触发、审查技能规范性时使用，即使用户没有明说"写个 skill"。触发词：新技能、写技能、skill包、skill-creator、skill authoring、frontmatter、渐进披露、progressive disclosure、技能规范、forge。
metadata:
  layer: methodology
  compose: overlay-on-engineering
---

# Ming Skill Forge — 技能包创作与修订元规则

> 软面是本文档（原则与工艺）；硬面是 `scripts/check-skill.mjs`（结构校验）。
> 上游正典：Anthropic skill-creator / Agent Skills 规范；本仓惯例见 references/sources.md。

## 1. 技能解剖

```
skill-name/                    # kebab-case，目录名 == frontmatter.name
├── SKILL.md                   # 必须：YAML frontmatter + Markdown 正文
├── references/                # 按需加载的深层文档（sources.md/checklist.md/案例）
├── scripts/                   # 可执行物（确定性重复工作才收脚本）
└── assets/                    # 产出物用模板/资源（不进上下文）
```

## 2. 渐进披露三级预算（Anthropic 核心原则）

| 级 | 内容 | 预算 |
|---|---|---|
| L0 | frontmatter `name`+`description` | ~100 词，**常驻上下文**——每个字都是常驻税 |
| L1 | SKILL.md 正文 | **<500 行**，触发才加载；超限拆 references 并留导航指针 |
| L2+ | references/scripts/assets | 无限，按名引用、按需加载；脚本执行不占上下文 |

纪律：**信息只住一处**——SKILL.md 与 references 不重复同一份内容；详细材料下沉 L2，正文只留规程与导航。

## 3. description 触发面工艺

description 是**唯一常驻的路由面**，写它 = 写触发器：

- **What + When 都要**：做什么 + 什么情境该用；"何时用"全部进 description，不进正文；
- **略 pushy**：模型天然 undertrigger——宁可显式列举触发场景；
- **触发词显式列出**：中英双语关键词；
- **负触发**（本仓增强）：不适用于什么写清楚，防误触发；
- **不绑具体工具/路径名**（lint 有 W 级检查）——工具缺席即漏触发。

**本仓双触发面**：description 管宿主 skill 触发，`build-router-manifest.mjs` 的 `skillTriggers` 管 router 召回——**两者关键词必须一致**，否则路由和直连各说各话。

## 4. 家族惯例（engineering 系元包）

- frontmatter 增 `metadata.layer`（methodology/architecture/testing/…）与 `metadata.compose`；
- `*-paradigm` / `*-idiom` 型元包**应带** `references/sources.md`（文献索引 + 明确不纳入反例）；
- 正文末尾保留 `Compose` 节（与其他元包的装配关系）；
- 禁令节用 `[禁止]`/`[警告]` 结构化标签，**禁 emoji**（仓库铁律）。

## 5. 注册与路由接线（新包三处不可少）

| 处 | 内容 | 校验 |
|---|---|---|
| `registry.yaml` private 区 | `name/path/enabled/note/deploy.claude` | lint.ps1 |
| `build-router-manifest.mjs` DOMAIN_DEFS | 域 `skills` 列表 + `skillTriggers` 关键词 + 必要时域级 `triggers` | `node scripts/build-router-manifest.mjs` 重建；`--check` 验证未过期 |
| `engineering/README.md` | 资产图 + Compose 公式 | 人工 |

新增包未进 DOMAIN_DEFS = 路由不可见——check-skill.mjs 会查这一项。

## 6. 硬门控分工

| 门 | 覆盖 |
|---|---|
| `pwsh scripts/lint.ps1` | 仓库级：SKILL.md 存在、frontmatter 缺字段、引用文件存在性、硬编码外部路径、空壳 |
| `node private/engineering/ming-skill-forge/scripts/check-skill.mjs <dir>` | **技能级**：命名一致/kebab、description 长度与触发词启发式、正文 ≤500 行预算、metadata 家族字段、sources.md 家族惯例、registry 条目、路由接线 |

边界：lint 查"这个文件像不像技能"，check-skill 查"这个技能合不合规范"。

## 7. 创作工作流

1. **访谈定域**：先归域（ming-l-paradigm §5 判定表）——多数"新技能"需求其实是现有包的 references 增补；
2. **写 description 优先**：触发面先行，正文后写；
3. **正文克制**：<500 行，细节下沉 references；
4. **三处接线**（§5）+ `check-skill.mjs` 自验 + `lint.ps1` 全仓；
5. **修订现有包**：先读 sources.md 的"不纳入"清单——被排除过的方向不再回来；
6. **eval 化验证**（可选）：构造触发/不触发用例各几条，看路由决策是否符合预期。

## 8. 禁令

1. **[禁止] 双写**：同一内容同时进 SKILL.md 与 references；
2. **[禁止] description 绑工具名/绝对路径**：宿主环境无该工具即漏触发；
3. **[禁止] 为一次任务建包**：单一场景进现有包的 references，不新立域；
4. **[禁止] emoji**：全仓铁律，用 `[禁止]`/`[警告]` 结构化标签；
5. **[禁止] 脚本囤积**：非确定性/非重复的工作不进 scripts/；
6. **[禁止] 接线漏处**：registry + DOMAIN_DEFS + README 三处必须同批变更；
7. **[禁止] 未注册先部署**：`scripts/sync.ps1` 部署前先过 lint + check-skill。

## 9. Compose

```
ming-skill-forge（本包：创作规程 + 硬门控）
+ ming-l-paradigm（新内容归域判定——先问进哪个域，再问建不建包）
+ docs-core-paradigm（SKILL.md 体裁 = howto+reference 混合，sources.md = reference）
+ contract-core-paradigm（frontmatter/registry 条目演进遵守只加不改义）
+ testing-core-oracle（skill eval：触发用例的 oracle 独立于实现）
```
