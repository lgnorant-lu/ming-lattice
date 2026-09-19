# Candidacy — 包候审区协议

新包不该凭一次灵感立项，也不该躺在脑子里被遗忘。候审区是二者之间的正式状态：**登记事实，无实体，攒证据，到期毕业或撤回**。

## 1. 开市条件

一个包提案进入候审区，须同时满足：

- 有**至少一份真实实例证据**（某项目/某文档实际产出了该领域内容）——"感觉有用"不算证据；
- 能写清**毕业条件**（什么第二信号出现时该立项）——没有毕业判据的提案是许愿不是候审；
- 不与既有包重名、不与其他候选重名、归属域已选定。

## 2. 登记格式（registry.yaml `candidates:` 顶层段）

```yaml
candidates:
  - name: <kebab-case 拟用包名>
    domain: <目标 DOMAIN_DEFS 域>
    path: <拟建路径>
    rationale: "<一句话为什么值得存在>"
    evidence:                       # 证据累积区——每条 = 一个实例事件
      - "<日期> <来源>：<实例证据一句话>"
    graduation: "<毕业判据——什么第二信号触发立项>"
    openedAt: <YYYY-MM-DD>
```

`evidence` 是放行机制的核心：每出现一个新的真实用例就追加一条，**证据只增不删**（撤回走删除整条目而非清证据）。

## 3. 毕业与撤回（放行机制）

| 信号 | 触发 | 动作 |
|---|---|---|
| graduation-ready | `evidence` ≥ 2 条 | check-skill 报 I 级信号——**人审决定**是否毕业；机器只提示不自动立包 |
| aging candidate | 开市 >90 天未毕业 | check-skill 报 I 级——复审：补毕业判据、转证据到既有包 references、或撤回删条目 |
| 实体冲突 | `path` 目录已存在 | check-skill 报 W——要么毕业接线要么撤回，不许"候选+实体"双态 |
| 毕业执行 | 人审通过 | `scaffold-skill.mjs` 立包 → 三处接线 → **从 candidates 段删除该条目**（毕业即出区） |

毕业是**人工仪式**：机器信号只是提醒，立项决策永远过人——与"路由置信不授执行权"同原则。

## 4. 与 `_proposals/` 的分工

- `distill/_proposals/`：沉淀晋升的**提案档案**（prose 论证 + 建议 diff）——内容重、按需产生；
- `registry candidates:`：包候选的**机读登记**——常驻索引、轻量、每条目一份 rationale。

候选项可持有一份 `_proposals/` 档案（重提案时），但登记本身永远在 registry——单一事实源。

## 5. 硬门检查项（check-skill.mjs 实现）

| 级 | 项 |
|---|---|
| E | 名非 kebab / 缺必填字段 / 零 evidence / 候选重名 / 与既有包重名 |
| W | path 已有实体目录 / openedAt 不可解析 |
| I | graduation-ready（evidence≥2）/ aging（>90d） |
| 统计 | `--all` 尾行：`candidates: N registered (oldest Xd; K ready)` |

## 6. 纪律

- [禁止] 零证据开市——候选区不是点子墙；
- [禁止] 候选无限躺平——aging 信号出来必须复审（续住要有新判据，不续就撤）；
- [禁止] 候选态写 SKILL.md——实体目录出现即 W 冲突；
- [禁止] 绕过登记直接建包——新包须么走候选毕业，要么有即时真实需求；两者都不是 = 不建。
