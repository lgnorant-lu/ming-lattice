# Proposals — `_proposals/` 提案候审区协议

既有包修改提案的档案区：攒裁决请求，人审合入，留档不出区。与 `registry.yaml candidates:`（新包候审，见 ming-skill-forge `references/candidacy.md`）分工：那边管"该不该有这个包"，这边管"已有包该怎么改"。

## 1. 选区键：按 subject 不按 source

反馈落在哪，看**说的是谁**，不看在哪产生：

| 反馈主体 | 落点 |
|---|---|
| 既有包体（脚本/模板/SKILL 语义） | `distill/_proposals/` |
| 项目自身复盘 | `distill/<project>/` |
| 新包候选 | `registry.yaml candidates:` |

**移送边界**：修法落在包体产物 → 升 `_proposals`；修法落在项目自身文档/配置 → 留项目本地候审档（OPEN-FINDINGS 类）。防 `_proposals` 变垃圾场。

## 2. 提案格式

文件：`distill/_proposals/<YYYY-MM-DD>-<slug>.md`

```yaml
---
id: <date>-<slug>
target: <包路径，如 private/engineering/ming-l-paradigm>
type: promotion | field-feedback | package-iteration
status: pending            # pending | landed | rejected
openedAt: <YYYY-MM-DD>
source-project: <可选——field-feedback 类填采纳方项目名>
---
```

- `type` 词表：`promotion`（distill 沉淀晋升）/ `field-feedback`（采纳实证——采纳者跑出来的包体反馈，作者独自产生不了的证据类）/ `package-iteration`（常规迭代建议）；
- 正文必备节：**来源证据锚点**（可复查：文件/命令/输出）→ **提案条目**（编号 P1..Pn，现象+建议修法+目标位）→ **不采纳项**（考虑过但排除的方案与理由）；
- 建议裁决表可选但推荐——人审按条批注效率最高。

## 3. 生命周期

```
pending --人审合入--> landed --标注落点（commit/文件），不出区不删除
   \--人审驳回-----> rejected --驳回理由留档正文，不出区不删除
```

- **landed 不删档**：与 Know 只增不隐同纪律——提案是决策史的一部分；
- **aging**：`pending` 超 **30 天**未裁决应复审（对标 audit `--proposed-days` 默认——提案是裁决请求，不该像 candidates 那样躺 90 天攒证据）；
- 机器面无：提案量 <3 时纯散文约定；≥3 再考虑进 `check-skill.mjs`（hub 内部门禁——**不是** audit-domains，那是分发给采纳者的项目侧工具，部署面不同）。

## 4. 纪律

- [禁止] 绕过提案直接改 `private/engineering/**`——人审合入后才动包体；
- [禁止] 无证据提案——每条目必须挂可复查锚点（与 distill 条目同律）；
- [禁止] 提案隐身——fast-track 修复须回案补提案记录（可插队不可隐身，O4 同律）。
