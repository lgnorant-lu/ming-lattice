# Sources — 可观测元包引用边界

## 形状

- Honeycomb, Structured Events Are the Basis of Observability — https://www.honeycomb.io/blog/structured-events-basis-of-observability
- Observability Engineering（宽结构化事件作为基本砖）
- Wide events 101 — https://boristane.com/blog/observability-wide-events-101/

## 字段约定（借名，不绑栈）

- OpenTelemetry Semantic Conventions — https://opentelemetry.io/docs/specs/semconv/
- Events — https://opentelemetry.io/docs/specs/semconv/general/events/
- Logs — https://github.com/open-telemetry/semantic-conventions/blob/main/docs/general/logs.md

## 内容纪律

- Google SRE / USENIX structured logging（when / where / what，message 不是小说）
- 高基数：动态 ID 进事件，不进 metrics label

## 明确不纳入正文

- 具体 collector、Grafana、某厂商 APM
- 语言 SDK 样板（Python logging + OTLP exporter 教程）
- SkillTrace / 某 Agent 轨迹产品全文
