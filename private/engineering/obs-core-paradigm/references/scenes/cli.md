# Scene delta — CLI / 脚本工具

工作单元：一次进程调用（含 DryRun）。

## 差字段

`exit_code`、`dry_run`、`argv_kind`（不要把完整密钥参数写入事件）。事件名与 STANDARDS 锁定的集合对齐，例如 `lint.checked`、`sync.completed`、`test.suite_finished`、`route.decided`。

## 形态

stdout 可给人读摘要；机读 JSON 事件走约定通道或 sidecar 一行。失败时 error_code 与退出码矩阵同源。
