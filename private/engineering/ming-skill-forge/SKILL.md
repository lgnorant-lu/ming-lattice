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
- `*-paradigm` 型元包**应带** `references/sources.md`（文献索引 + 明确不纳入反例）与正文末尾 `Compose` 节（与其他元包的装配关系）——自声明后缀触发惯例检查；`-idiom` 不索（testing-*-idiom 是语言落地包非元包，同后缀不同种）；
- 禁令节用 `[禁止]`/`[警告]` 结构化标签，**禁 emoji**（仓库铁律）。

## 5. 注册与路由接线（新包三处不可少）

| 处 | 内容 | 校验 |
|---|---|---|
| `registry.yaml` private 区 | `name/path/enabled/note/deploy.claude` | lint.ps1 |
| `build-router-manifest.mjs` DOMAIN_DEFS | 域 `skills` 列表 + `skillTriggers` 关键词 + 必要时域级 `triggers` | `node scripts/build-router-manifest.mjs` 重建；`--check` 验证未过期 |
| `engineering/README.md` | 资产图 + Compose 公式 | 人工 |

新增包未进 DOMAIN_DEFS = 路由不可见——check-skill.mjs 会查这一项；**有意不路由**的包在 registry 条目标 `router: false` 显式豁免（比 --no-router 临时豁免更优：豁免本身是登记事实）。

**候审区（candidates）**："值得立项但证据不足"的包提案登记在 registry `candidates:` 顶层段——一进证据开市、二进证据触发毕业信号、毕业走 scaffold 接线并删候选条目。协议全文见 `references/candidacy.md`；`check-skill --all` 附带候选契约检查与统计放行信号。

## 6. 硬门控分工

| 门 | 覆盖 |
|---|---|
| `pwsh scripts/lint.ps1` | 仓库级：SKILL.md 存在、frontmatter 缺字段、引用文件存在性、硬编码外部路径、空壳 |
| `node private/engineering/ming-skill-forge/scripts/check-skill.mjs <dir>` | **技能级**：命名一致/kebab、description 长度与触发词启发式、正文 ≤500 行预算、家族惯例（按自声明能力触发：有 metadata 查完备、`-paradigm` 查 sources.md/Compose）、registry 条目、路由接线、skillTriggers/description 一致性提示。标志：`--all` 扫 registry private 区全量、`--no-registry` 豁免 registry 检查、`--json` 机器可读输出、`--no-router` 跳过 DOMAIN_DEFS 检查（路由基础设施等不进路由的包用） |

| `node .../scaffold-skill.mjs <name> --desc "..." [--paradigm]` | 脚手架：`assets/skill.md.tmpl` 注入生成 SKILL.md（`--paradigm` 附 sources.md 桩），fail-closed 拒覆写，生成后自证过检并打印 §5 三处接线清单 |

另：`check-skill.mjs --all` 作为 `skill-conformance` 套件进 `tests/run.mjs`（E 级门禁）；check-skill 行为契约由 `tests/unit/test-check-skill.test.mjs` 锁定。

边界：lint 查"这个文件像不像技能"，check-skill 查"这个技能合不合规范"，scaffold 管"新技能从模板出生即合规"。

## 7. 创作工作流

1. **必要性三问**（进包前置门，在定域之前先问"建不建"）：
   - a) **先验稀缺性**：目标知识强通用模型的先验里有没有？批判性思维、提问方式、通用工作态度这类"巴菲特已知"的内容 → 不建包，写成项目惯例/AGENTS 约定/提示词；
   - b) **语义撞车**：与现有包的触发面是否重叠？skill 库规模越大误选率越高（shadowing 是主瓶颈而非上下文开销）——重叠 → 进现有包 references 增补，不新立域；
   - c) **复现性**：是否一次性/单场景？是 → 不建包（禁令③的过程前置）；
2. **访谈定域**：先归域（ming-l-paradigm §5 判定表）——多数"新技能"需求其实是现有包的 references 增补；
3. **写 description 优先**：触发面先行，正文后写；
4. **正文克制**：<500 行，细节下沉 references；
5. **三处接线**（§5）+ `check-skill.mjs` 自验 + `lint.ps1` 全仓；
6. **修订现有包**：先读 sources.md 的"不纳入"清单——被排除过的方向不再回来；
7. **eval 化验证**（可选）：构造触发/不触发用例各几条，看路由决策是否符合预期。

## 8. 禁令

1. **[禁止] 双写**：同一内容同时进 SKILL.md 与 references；
2. **[禁止] description 绑工具名/绝对路径**：宿主环境无该工具即漏触发；
3. **[禁止] 为一次任务建包**：单一场景进现有包的 references，不新立域；
4. **[禁止] emoji**：全仓铁律，用 `[禁止]`/`[警告]` 结构化标签；
5. **[禁止] 脚本囤积**：非确定性/非重复的工作不进 scripts/；
6. **[禁止] 接线漏处**：registry + DOMAIN_DEFS + README 三处必须同批变更；
7. **[禁止] 未注册先部署**：`scripts/sync.ps1` 部署前先过 lint + check-skill；
8. **[禁止] 为先验已有知识建包**：模型与领域专家都已知的内容（批判性思维、提问方式、通用纪律）写成惯例或提示词，不进 skill——每多一个包都在收全库的路由税（§7 必要性三问的硬面）。

## 9. Compose

```
ming-skill-forge（本包：创作规程 + 硬门控）
+ ming-l-paradigm（新内容归域判定——先问进哪个域，再问建不建包）
+ docs-core-paradigm（SKILL.md 体裁 = howto+reference 混合，sources.md = reference）
+ contract-core-paradigm（frontmatter/registry 条目演进遵守只加不改义）
+ testing-core-oracle（skill eval：触发用例的 oracle 独立于实现）
```
