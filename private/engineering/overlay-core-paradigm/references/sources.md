# Sources — Overlay 元包引用边界

## 性能

- Brendan Gregg, Systems Performance（先找出限制因素再谈数字）
- 功能测试禁机器敏感墙钟 — 与 testing-core-oracle Overlay 同条，本包不重写测试哲学

## 韧性

- Google SRE Book / Workbook（错误预算、重试上限、幂等）
- 半成品与原子改名是 CLI 场景已有实践，本包提升为跨场景不变量

## 隐私

- 最小必要、目的限定；日志/Golden/prompt 默认不进 git
- 与 OWASP 数据保护章节交叉，条款不抄入

## 成本

- Agent 上下文经济：名单廉价、正文按需（与路由 ADR 同类，但本包跨仓库）

## 兼容

- 核心纯函数、壳翻译；编码与 locale 显式

## 明确不纳入正文

- Criterion / Lighthouse / 某 APM 操作手册
- 混沌工程平台选型
- 完整 WCAG 条款表（无 UI 产品时）
- 把游戏帧预算写成「因此元包允许一切绝对值」
