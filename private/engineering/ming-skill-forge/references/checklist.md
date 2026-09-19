# Checklist — check-skill.mjs 校验项人读版

每项注明级别（E=硬错误阻断 / W=警告 / I=提示）与出处依据。

**触发原则**：检查按**自声明能力**触发，不按包形归簇——有 `metadata:` 块才查字段完备、名字以 `-paradigm` 结尾才查元包惯例；未声明能力的包只过通用项。新增检查项须有现有检查表达不了的不变量（ming-l §2 准入判据的门控应用）。

## 结构项

| 检查 | 级 | 依据 |
|---|---|---|
| SKILL.md 存在且非空 | E | Anthropic spec：目录+SKILL.md 为最小形态 |
| frontmatter `---` 块存在 | E | 同上 |
| `name` 存在、kebab-case、与目录同名 | E | spec 命名字段约束；本仓 lint 查 name==registry 名 |
| `description` 存在、≥20 字符 | E | 触发面下限（lint 同级） |
| `description` ≤400 字符 | W | L0 常驻税——过长是上下文浪费 |
| 正文 ≤500 行 | W | Anthropic 渐进披露预算 |

## 触发面质量

| 检查 | 级 | 依据 |
|---|---|---|
| description 含 What（做什么）与 When（何时用） | W | skill-creator："all when-to-use info goes here" |
| description 含显式触发词（中英至少一类） | W | undertrigger 对策 |
| description 不含绝对路径/具体工具名绑定 | W | lint 既有 W 级；工具缺席即漏触发 |

## 家族惯例（自声明触发）

| 检查 | 级 | 依据 |
|---|---|---|
| 有 `metadata:` 段时 `layer` / `compose` 字段完备 | W | engineering 元包惯例；无 metadata 段不索求（testing 族以 compose.yaml 为组合真源，补字段=双真相） |
| `*-paradigm` 包带 `references/sources.md` | W | 家族文献链惯例；`*-idiom` 不索——testing-*-idiom 是语言落地包非元包（同后缀不同种） |
| `*-paradigm` 包正文末尾 `Compose` 节 | I | 元包装配关系惯例 |
| 无 emoji | E | 仓库铁律（githooks 同级门禁） |

## 接线项

| 检查 | 级 | 依据 |
|---|---|---|
| `registry.yaml` 有条目且 path 相符 | E | registry 是单一事实源 |
| 条目含 `note` 与 `deploy` 段 | W | 部署完整性 |
| `build-router-manifest.mjs` DOMAIN_DEFS 引用该名 | W | 未接线=路由不可见；有意不路由的包在 registry 标 `router: false` 显式豁免（I 级留痕），临时豁免用 --no-router |
| `router:false` 声明与 DOMAIN_DEFS 引用矛盾 | W | 豁免位漂移——声明不路由却仍被引用 |
| `skillTriggers` 词与 description 零交集 | I | 双触发面漂移提示（forge §3：两关键词集必须一致） |
| SKILL.md 内相对链接文件存在 | E | lint 同级（防死链）；代码围栏与行内代码豁免——语法示例非真链接 |

## 候审区项（--all 附带，registry `candidates:` 段）

| 检查 | 级 | 依据 |
|---|---|---|
| 候选名 kebab-case / 必填字段齐（domain/path/rationale/graduation/openedAt）/ evidence ≥1 | E | candidacy.md §2 契约——零证据不开市 |
| 候选间重名 / 与既有包重名 | E | 重名即应毕业或撤回 |
| 候选 `path` 已有实体目录 | W | 候选+实体双态非法——毕业接线或撤回 |
| `openedAt` 日期可解析 | W | 时效统计依赖 |
| evidence ≥2 → graduation-ready | I | 放行信号：达毕业阈值提示人审（机器不自动立包） |
| openedAt >90d → aging | I | 候开设时效——复审存续或撤回 |
| 统计尾行 `candidates: N registered (oldest Xd; K ready)` | — | 放行面板：`--all` 附带，--no-registry 豁免 |

## 用法

```bash
node private/engineering/ming-skill-forge/scripts/check-skill.mjs <skill-dir>
node private/engineering/ming-skill-forge/scripts/check-skill.mjs --all   # registry private 区全量（= skill-conformance 套件）
# 选项: --json 机器可读输出; --no-router 跳过 DOMAIN_DEFS 检查（内部未路由包）; --no-registry 跳过 registry 校验（隔离 fixture）
```
退出码：0=无 E 级；1=存在 E 级。行为契约锁定于 `tests/unit/test-check-skill.test.mjs`；脚手架 `scripts/scaffold-skill.mjs`（模板 `assets/skill.md.tmpl`）。
