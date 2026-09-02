---
name: obs-core-paradigm
description: Cross-scene observability meta-rules for wide structured events, correlation IDs, and telemetry that is queryable without joining prose logs. Use when adding logging, tracing, metrics, audit journals, CLI machine events, or pipeline batch telemetry. Triggers include observability, structured logging, wide events, correlation-id, OpenTelemetry, telemetry, 可观测, 结构化日志, 宽事件.
metadata:
  layer: observability
  compose: overlay-on-testing
---

# Obs Core Paradigm — 跨场景可观测元规则

可观测要回答的是：一次工作单元失败时，能否凭一条宽事件和一个相关 ID 还原发生了什么。本包不规定 collector、后端或语言 SDK。

## 1. 形状

- **工作单元** — 一次请求、一次 CLI 调用、一次 Decide、一次批次、一次跨界调用。单元结束时发出 **一条** 宽结构化事件。
- **结构化 ≠ 宽事件** — JSON 五行散落仍不可切。宽事件是同一条记录上足够多的维度。
- **高基数进事件，低基数进指标** — request_id / user_id / batch_id 不当 metrics label。
- **字段 canonical** — event 名、error_code 与契约枚举、测试断言用同一套词。
- 相关 ID 穿透进程、语言、Harness 边界。

## 2. 跨场景禁令

1. **[禁止] 日志当小说** — 不把自然语言句子当契约；测试不断言 message 全文。
2. **[禁止] 碎片行靠人脑 join** — 禁止用 20 行 Received/Saving/Done 代替一条完成事件。
3. **[禁止] 高基数打进 metrics 标签** — 动态 ID 只放事件/trace 属性。
4. **[禁止] 密钥、完整 prompt、未脱敏 PII 进事件** — 可留哈希或截断长度。
5. **[禁止] 三件套完成幻觉** — 装了 metrics/logs/traces 不等于可观测；问得出新问题才算。

## 3. Oracle

给定一次失败的工作单元：

- 存在名为稳定枚举的事件（如 `route.decided`、`sync.completed`）。
- 含 `error_code` 或成功标志、duration、相关 ID。
- 测试只断言事件名、code、必填字段存在，不断言文案。
- 同一 trace/decision/batch ID 能串起跨边界记录。

建议字段（名称可映射 OTel semconv，不绑导出器）：`timestamp`、`event`、`trace_id`、`error_code`、`duration_ms`、场景差字段。

## 4. Compose

```
obs-core-paradigm
+ 本场景差页
+ testing-core-oracle（断言事件存在、不断言散文）
+ contract-core-paradigm（error_code 与 schema 枚举同源）
```

人读摘要（stderr 一行）可以并存；机读事实源是宽事件，不是 Write-Host 散文。

游戏每 sprite 打点、逆向 journal 的法律边界见场景差；无实践则跳过。
