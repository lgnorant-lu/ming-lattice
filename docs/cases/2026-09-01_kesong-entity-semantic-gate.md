# 2026-09-01 可颂实体级数据门控修复

## 场景分类

其他（本地数据治理／代码审计）

## 目标概述

修复实体级机位交付中围栏外 POI 白名单可由历史清洗结果自动放行的问题，并在数据库加载前加固语义门禁。

## Scope 摘要（脱敏）

- auth_basis: own_system
- network_profile: offline
- asset_types: [local Python rules, local CSV delivery]

## 角色

- lead_role: lead
- specialists: [cae]

## 完整执行链路

1. 以任务实体 ID、挂靠 POI、机位坐标和围栏交叉审查可疑实体输出。
2. 识别到历史 clean 被无条件写入 POI 白名单，白名单优先规则绕过围栏。
3. 将围栏外白名单改为需要 `poi/reason/evidence` 的显式例外，并禁止历史修复自动升格围栏外 POI。
4. 新增最终实体交付语义审计和加载前硬门禁；实体级回归与全量单测验证。

## Evidence 链摘要（脱敏）

| E-id | severity | status | source_type | 可复用命令模式 | 关联 Finding |
|------|----------|--------|-------------|----------------|--------------|
| E-001 | medium | validated | command | `pytest test_<entity>_semantic_regression.py` | F-001 |
| E-002 | high | validated | command | `audit_gated_semantics.py --out report.json` | F-001, F-002 |
| E-003 | high | validated | command | `db_load_entity_gated.py --mode load` | F-002 |

## Finding / Path 摘要

- top_finding: 历史清洗产物不是围栏外实体归属真值；无证据白名单会固化跨分区误收。
- path_type: callflow
- path_one_liner: 历史 clean → 自动 POI 白名单 → 围栏绕过 → gated 交付；修复为显式例外审计和 load 前硬阻断。

## 踩坑记录

| 问题 | 原因 | 解决方案 | 耗时 |
|------|------|---------|------|
| 字段门控报告键冲突 | 最终 gated 均在同一父目录 | 报告键改用实体文件名 | 低 |
| raw 数量与交付数不一致 | 多关键词会重复召回同一机位 | 回归按唯一 ID 断言 | 低 |
| 围栏外不等于错误 | 任务多边形可能只覆盖主区 | 先审计、再逐实体补例外或剔除，不批量删除 | 中 |

## 工具链发现

- 纯本地 Python/CSV 审计足以发现实体归属问题；字段完整性校验不能替代语义归属校验。
- 加载器应在数据库连接前执行所有本地门禁，避免因错误门禁导致建表或部分写入。

## 关键代码/命令

```text
uv run python scripts/audit_gated_semantics.py --strict
uv run python scripts/field_gate.py --gated-all
uv run python scripts/db_load_entity_gated.py --mode load
```

## 对本包的改进建议

- [x] 无需更新路由矩阵：该本地治理任务被 R0 路由为低置信回退，非逆向主场景。
- [ ] 可考虑增加“本地数据质量／交付门禁”路由规则，避免落入泛用逆向回退。

## 可复用的模式/脚本片段

围栏外白名单应采用三元例外：`{poi, reason, evidence}`；审计只列出缺失三元组的最终交付行，并禁止从历史基线自动补齐该三元组。

## 进化动作

- [ ] 更新了路由矩阵
- [ ] 更新了 tool-index
- [ ] 更新了 bootstrap-manifest
- [ ] 更新了子 skill 文档
- [x] 新增了 pitfalls 记录

## 环境信息

- OS: Windows 11
- 工具版本: Python uv 项目环境
- 目标平台/版本: 本地实体级 CSV 交付
