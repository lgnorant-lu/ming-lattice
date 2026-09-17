# 沉淀条目骨架（entry template）

复制本骨架到 `distill/<project>/<YYYY-MM-DD>-<topic>.md`，逐节填写。每节一两句即可——条目是复盘索引点，不是报告。

```markdown
---
id: 2026-09-17-<topic>          # <date>-<topic-slug>，全库唯一
project: <project-slug>         # 项目目录名
axis: [testing]                 # 闭集: testing docs docs-presentation obs sec contract overlay arch reverse ui antibot protocol other
tags: [<自由词>]                # 检索提示，可多个
revision: 1                     # 同 topic 再蒸馏 +1
updatedAt: 2026-09-17
status: active                  # active | superseded（被同 topic 新 revision 取代时标 superseded）
scope: project-only             # project-only | general（general 才有晋升资格）
---

# <标题：一句话说清这条经验是什么>

## 情景
当时在做什么、约束是什么。

## 决策与理由
选了什么、为什么。

## 证据锚点
文件/命令/输出/链接——必须可复查。

## 可复用判据
下次同类情形的判定规则，每条挂证据锚点。

## 时效边界
此判据在什么版本/环境/时间点成立；什么信号出现即失效。

## 不采纳项
考虑过但排除的方案与理由（防翻案）。

## 下次触发语
一句话——即 INDEX.yaml 中本条目的 summary 字段内容。
```

## INDEX.yaml 条目字段

`distill/INDEX.yaml` 每条目一行元数据，字段与 frontmatter 对齐（条目正文是事实源，索引随条目同步维护）：

```yaml
schemaVersion: "1.0"
entries:
  - id: 2026-09-17-<topic>
    project: <project-slug>
    path: distill/<project-slug>/2026-09-17-<topic>.md
    axis: [testing]
    tags: [<自由词>]
    summary: <下次触发语>
    revision: 1
    updatedAt: 2026-09-17
    status: active
    scope: project-only
```
