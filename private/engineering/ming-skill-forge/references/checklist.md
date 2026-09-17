# Checklist — check-skill.mjs 校验项人读版

每项注明级别（E=硬错误阻断 / W=警告 / I=提示）与出处依据。

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

## 家族惯例（engineering 系）

| 检查 | 级 | 依据 |
|---|---|---|
| `metadata.layer` / `metadata.compose` 字段 | W | engineering 元包惯例 |
| `*-paradigm`/`*-idiom` 包带 `references/sources.md` | W | 家族文献链惯例 |
| 正文末尾 `Compose` 节 | I | 元包装配关系惯例 |
| 无 emoji | E | 仓库铁律（githooks 同级门禁） |

## 接线项

| 检查 | 级 | 依据 |
|---|---|---|
| `registry.yaml` 有条目且 path 相符 | E | registry 是单一事实源 |
| 条目含 `note` 与 `deploy` 段 | W | 部署完整性 |
| `build-router-manifest.mjs` DOMAIN_DEFS 引用该名 | W | 未接线=路由不可见；纯内部包可豁免（--no-router 标志） |
| SKILL.md 内相对链接文件存在 | E | lint 同级（防死链） |

## 用法

```bash
node private/engineering/ming-skill-forge/scripts/check-skill.mjs <skill-dir>
# 选项: --json 机器可读输出; --no-router 跳过 DOMAIN_DEFS 检查（内部未路由包）
```
退出码：0=无 E 级；1=存在 E 级。
