---
name: ming-distiller
description: 项目级经验沉淀与沉淀检索双模态入口（ming-skills 中枢）。阶段性设计/逆向/测试/调参工作收尾时，把本轮决策、踩坑与判据蒸馏为带机读索引的项目复盘条目（distill/ 库）；或先查索引检索既有沉淀，命中再懒加载正文，不足走外部调研。触发词：沉淀、复盘、蒸馏、distill、记录经验、项目复盘、retrospective、查沉淀、之前踩过。不适用：直接改写 paradigm/router 源文件（晋升走显式 staging）、单次任务流水账。
metadata:
  layer: meta
  compose: standalone
---

# ming-distiller — 项目级经验沉淀与检索

价值锚点是**闭环本身**：蒸馏 → 索引 → 后续查询复用 → 再蒸馏修订。单条条目价值有限，迭代轨迹（git log）才是资产。沉淀物服务项目自身复盘，**skill 库不是默认落点**。

## 0. 自定位（每次先做）

```
HUB_ROOT = realpath(本 SKILL 目录) 上溯两级      # private/ming-distiller -> 仓根
校验     = <HUB_ROOT>/registry.yaml 存在才认账
fallback = 环境变量 MING_SKILLS_HOME -> 仍无则问用户，不猜路径
```

realpath 落不进仓（拷贝分发场景）时走 fallback 链。工作目录即仓根（`registry.yaml` 在场）时可直接跳过 realpath。确认 HUB_ROOT 后，沉淀库即 `<HUB_ROOT>/distill/`。

## 1. 写沉淀（复盘触发）

1. **收证**：提取本轮关键决策、踩坑、判据。证据锚点必须可复查（文件/命令/输出/链接），不收"印象流"。
2. **定轴**：`axis` 用闭集（`testing docs docs-presentation obs sec contract overlay arch reverse ui antibot protocol other`）；`tags` 自由词。`project` = 项目目录名 slug，重名加限定词。
3. **写条目**：`distill/<project>/<YYYY-MM-DD>-<topic>.md`，骨架见 [references/entry-template.md](references/entry-template.md)。
4. **更新 `distill/INDEX.yaml`**：追加一行元数据。同 topic 再蒸馏 = **原地更新同文件**（`revision+1`、`updatedAt` 刷新，git 即版本层，INDEX 永远指单一路径）；仅当换文件名重建时才用新文件，此时旧条目标 `status: superseded`、新条目 frontmatter 挂 `supersedes: <旧id>` 指回。
5. **不自动 commit**：写完报告待提交文件清单，由用户决定是否 `docs(distill):` 提交。

## 2. 查沉淀（检索触发）

```
只读 INDEX.yaml（语义筛选，体积小）→ 命中最多读 2 条正文 → 不足走外部调研
```

- 索引未命中：**明说"无沉淀"**，禁止把相邻条目硬解释成命中；
- 外部调研产出可顺手再蒸馏一条新条目——闭环在此扣合；
- 时间回溯：`git log -p distill/<project>/` 即该项目沉淀的完整迭代史。

## 3. 晋升旁路（显式才走，罕见）

用户明确说"这条进 skill 库/paradigm"时：

1. 产提案到 `distill/_proposals/<date>-<slug>.md`：目标包、类型（scene 差页 / trigger 词 / 新 paradigm 草案）、证据引用、建议 diff、**明确不采纳项**；
2. 不直接编辑 `private/engineering/**` 或 `build-router-manifest.mjs`——人审合入后跑 lint + 测试 + `build-router-manifest.mjs --check`；
3. 项目私有决策留原项目 ADR，只有跨仓库仍成立的方法论才配晋升。

## 4. 禁令

1. **[禁止] 写密钥/密码/token/本机私有路径**——涉密事实泛化表述，项目私有事实标 `scope: project-only`；
2. **[禁止] 无证据判据**——可复用判据必须挂证据锚点；
3. **[禁止] 全量灌入**——查询一次最多读 2 条正文，其余靠索引摘要；
4. **[禁止] 缺时效边界**——条目须写明"此判据在什么版本/环境下成立"，过期比缺失更坏；
5. **[禁止] 默认动 skill 库**——无显式晋升指令时 `private/` 与 manifest 一律只读。

## 5. Compose

```
ming-distiller（本包：沉淀写/查双模态 + 晋升 staging）
+ ming-skills-router（装配分流；本包走 description 语义直达，不依赖路由配方）
+ docs-core-paradigm（条目体裁纪律：一文件一主题、无第二真相、时效边界）
+ ming-skill-forge（晋升提案落地时按其创作规程与 check-skill.mjs 门控执行）
```
