---
dynamics: [立,改,增,废]
domain: gov
---

# ADR-0006: 项目级经验沉淀库与 ming-distiller 入口

- Status: Accepted
- Date: 2026-09-17

## Context

工程元规范族（engineering/）与路由（ming-skills-router）长期只有"消费侧"：触发词靠人手工策划进 DOMAIN_DEFS，scenes 差页靠手写，route.decided 事件有产出无消费者。外部项目实战产生的经验没有回流通道。同时已知路由关键词匹配存在假阳性/假阴性盲区（ROUTER_ARCHITECTURE §已知边界），而全量正文交给模型审阅又慢且污染上下文。

关键澄清：沉淀物的主要消费者是**项目自身的复盘与迭代调优**，价值在持续迭代的伪闭环而非单条内容；skill 库不是默认落点。

## Decision

1. 新增 `private/ming-distiller` 双模态入口 skill（写沉淀/查沉淀），语义触发为主（description 承载），路由接线为辅（engineering 域窄触发词：沉淀/蒸馏/复盘/distill/retrospective 等；**"总结"类宽词永不进表**）。
2. 沉淀库存于仓根 `distill/`（入 git，`git log -p` 即迭代史）：`INDEX.yaml` 机读索引 + `<project>/<date>-<topic>.md` 懒加载条目 + `_proposals/` 晋升 staging。
3. 检索三级协议：只读索引语义筛选 → 命中读 ≤2 条正文 → 不足走外部调研（调研产出可再蒸馏，闭环扣合）。禁止全量灌入与硬解释命中。
4. skill 库晋升是显式 staging 旁路：只有用户点名才产提案，人审后才合入 scenes/DOMAIN_DEFS/新包；默认不碰 `private/` 与 manifest。
5. 在外部项目会话中经 realpath(SKILL_DIR) 上溯定位仓根（部署为 symlink），fallback 为 `MING_SKILLS_HOME` 环境变量；不自动 commit。

## Consequences

- 路由 blast radius 为零：不改 Decide 内核、不加域、不动 schema，黄金测试不受影响；触发词假阳性面仅靠窄词小幅扩张。
- 蒸馏产出的真实意图短语成为离线词表维护语料，与 ROUTER_ARCHITECTURE 批准的"离线冻结向量校验"方向衔接——向量不进运行时 Decide()，进词表流水线。
- INDEX.yaml 手工维护存在与条目 frontmatter 漂移风险；暂不写校验脚本，待 2-3 次真实蒸馏后按实际失败案例决定是否加 `check` 脚本。
- 已知边界：条目时效靠 `时效边界` 节自律；scope: project-only 内容不进晋升通道。
