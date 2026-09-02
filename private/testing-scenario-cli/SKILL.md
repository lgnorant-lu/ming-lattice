---
name: testing-scenario-cli
description: 命令行与脚本工具场景测试规范（Testing Scenario CLI & Tools）：将 CLI/脚本/转换器视为具有强契约的独立产品。定义参数矩阵、退出码契约、标准输入输出断言、Golden 文件比对、可注入文件系统/环境隔离，以及幂等性与半成品写入防范。触发词：cli-test, command-line-testing, exit-codes, golden-files, tool-testing, script-testing.
---

# Testing Scenario: CLI & Tools — 命令行工具与脚本测试规范

> **核心哲学**：将工具当成一个有契约的产品，而不是一堆散落函数的集合。
> 工具测试的重心在于**参数组合矩阵、退出码、幂等性、可注入的外部世界与精准的输出断言**。

---

## 1. 分层精力分配启发式（Effort Heuristics）

| 层次 | 推荐精力占比 | 核心验证方式 | 说明 |
|---|---|---|---|
| **内部库纯计算/解析 (Lib Core)** | **~80%** | 表驱动测试 + Property 不变量 | 不拉起子进程，秒级纯内存反馈 |
| **CLI 外壳与进程接入 (CLI Shell)** | **~20%** | 黑盒进程调用、参数/退出码矩阵、Smoke 测试 | 仅测试参数解析、退出码与管道接线 |

- **[禁止] 严禁反模式**：不要为了测试一个纯文本格式化算法而反复调用 `Command::new("my_cli")` 拉起子进程。

---

## 2. Oracle 判定来源与契约矩阵

1. **参数与错误码矩阵（Flag x Exit Code Matrix）**：
   - 正常参数输入 -> 退出码 `0`，标准输出 `stdout` 给出期望结构；
   - 缺少必填参数 -> 退出码 `2`（Usage Error），错误输出 `stderr` 包含提示；
   - 目标不存在 / IO 错误 -> 退出码 `1`（Runtime Error）。
2. **幂等性断言（Idempotence Invariant）**：
   - 连续执行两次相同转换命令（如 `my_tool format file.txt`），第二次运行应保持输出文件字节不变，无任何状态污染。
3. **半成品防范（No Partial Leftovers）**：
   - 当工具在处理中途出错或被强行中断时，断言目标文件不会被留下半截损坏的数据（采用「先写临时文件，成功后原子重命名」策略）。

---

## 3. 注入外部世界（Inject the World）

- **文件系统隔离**：所有读写测试必须在测试框架分配的独立临时目录（如 `TempDir`、`tmp_path`）中运行；
- **环境变量与路径**：禁止断言硬编码的绝对机器路径（如 `C:\Users\...` 或 `/home/...`）；
- **标准输入输出捕获**：将核心计算函数的签名设计为接收 `io::Read` / `io::Write`（或 Python 的 `TextIO`），直接在内存 Buffer 中进行断言。

---

## 4. [禁止] 严禁反模式：无脑全量快照

- **反模式**：将包含执行耗时、临时路径、版本号和自然语言日志的整段控制台输出直接 `assert_snapshot!(stdout)`。
- **正确做法**：
  - 仅对纯数据格式转换器（如 JSON/AST 导出）进行结构化 Golden 比对；
  - 对控制台文案只断言**特定状态关键字与关键结果行**。
