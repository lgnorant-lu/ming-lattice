# sources.md — 思想来源与不纳入清单

## 直接来源

- **Lauren Tan, "How I Shipped 2000 PRs Last Month — Trusting AI Agents"**（演讲，YouTube `NjoZoUm85x0`）：
  信任梯模型（codebase>static analysis>rules/bugbot/skills>style guide）、"codebase 是 agent 的记忆/训练语料"、workaround+注释组合的病毒式复制机制、agent 把一次性评审意见固化成伪永久规则（"Lauren said never do this" 化石例）、"见坏模式先写 lint 规则止血"、gardener 常设哨兵角色、Dune 框架的"捷径=正途"设计公理。
- **pstack**（Cursor 插件仓开源技能包）：`comment-sicko` 审计代理——"删除复述代码的注释、标记 workaround 代码"，注释审计由 agent 判断而非 lint 执行的先例。
- **二手分析**：barnabyrobson.org/on-pstack（信任梯/两遍循环图解）、pjfp.com、intelligentartifact.com 的转述（PR 量主要是 gardening 非新功能的澄清）。

## 反向论据来源（本协议采纳其边界）

- **Eric Lippert, "Comment Rot"**：注释会过期腐烂——支持"why 注释是唯一活口"的反面论证：活口也须审计。
- **Clean Code 注释论战**（David Reis "Good Comment, Bad Comment" 等）："好码无注释"被误读为"零注释"——本协议明确不采纳绝对禁令，采纳"位错审计"（注释住对层即合法）。
- StackExchange 自文档代码讨论串："why 不可推导语义"是注释的正当住处的经典表述。

## 明确不纳入

- **绝对禁注释**：Dune 的语境是 agent 主写、UI 框架、已清理仓——本仓人机混写、文档密集，钝器禁令代价>收益（边界论证见 SKILL.md §6 保留活口）。
- **机械注释门禁**：启发式判定进不了 fail-closed 门（噪声门比无门更糟，§7 判据）。
- **diff 增量评审**：review-core-paradigm 已覆盖，本包只审存量信号面。
