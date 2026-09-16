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

- **工作单元**：一次请求、CLI 调用、决策、批次或跨界调用。正常完成路径优先发出一条摘要事件；重试、子任务和长任务进度可以有独立事件，通过相关 ID 连接。异常终止可能来不及发结束事件，不伪造完成。
- **结构化 ≠ 宽事件** — JSON 五行散落仍不可切。宽事件是同一条记录上足够多的维度。
- **高基数进事件，低基数进指标** — request_id / user_id / batch_id 不当 metrics label。
- **划界**：本包只管事件与相关 ID；指标形状（何时该有 metric、RED/SLO 聚合）与 span 语义/采样策略属场景差与栈层，不在本包范围。
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
- 测试验证事件名、code、字段类型与含义、正确的成功/失败/取消状态及关联关系，不只检查字段存在。时间长度非负、重试次数正确、敏感字段未泄漏；不将未承诺的自然语言文案作为契约。
- 同一 trace/decision/batch ID 能串起跨边界记录。

建议字段（名称可映射 OTel semconv，不绑导出器）：`timestamp`、`event`、`trace_id`、`error_code`、`duration_ms`、场景差字段。

## 4. 门禁与 CLI 事件边界

质量门禁的失败路径不能只依赖控制台文本：

- **预检失败**：未知目标、缺失入口、参数拒绝和 schema 失败都应发出稳定的失败事件（例如 `sync.failed`），包含 `ok: false`、`error_code`、工作单元 ID 和必要上下文。
- **早退语义**：失败或取消路径不能发出 `completed`/成功事件；异常发生在结束事件之前时，记录可观察的失败，而不是伪造完成。
- **输出隔离**：结构化 JSON stdout 与 NDJSON 事件旁路互不污染；人读日志、错误诊断和机器输出各有明确通道。
- **契约覆盖**：成功、业务失败、预检失败、未知配置、超时和事件写入失败至少各有一条可判定路径；断言事件名、状态、错误码、类型和脱敏，而不是全文文案。

## 5. Compose

```
obs-core-paradigm
+ 本场景差页
+ testing-core-oracle（断言事件存在、不断言散文）
+ contract-core-paradigm（error_code 与 schema 枚举同源）
```

人读文本可以并存。先核实已有 stdout/stderr 契约，再用显式机读模式或独立通道增加结构化事件，不能粗暴替换现有人读输出，也不能污染 stdout 上的 JSON。纯决策函数返回数据，由外层在获准的通道记录日志。

游戏每 sprite 打点、逆向 journal 的法律边界见场景差；无实践则跳过。
