# ADR-0003: 支持 PowerShell 与 POSIX Shell，坚决废除 Cmd/Batch

- **状态**: Accepted
- **日期**: 2026-09-02
- **决策者**: ming-skills 核心团队

---

## 1. 背景与上下文 (Context)

在 Windows 操作系统中，部分旧工程仍提供 `.cmd` / `.bat` 脚本入口。然而，Windows Command Prompt (cmd.exe) 存在严重的工程劣势：
- 默认代码页为 GBK/ANSI，极易破坏 UTF-8 编码并产生 Mojibake 乱码；
- 缺乏原生 JSON 解析与复杂数组/对象处理能力；
- 与 Git Bash / PowerShell 相比功能极其简陋，维护第三套外壳成本过高。

---

## 2. 决策内容 (Decision)

1. **废除 Cmd/Batch**：
   - 本仓库**坚决不提供任何 `.cmd` 或 `.bat` 脚本**。
2. **规范化双外壳支持**：
   - Windows 开发者使用 PowerShell (`pwsh` / `powershell.exe` 调用 `scripts/*.ps1`)；
   - Linux / macOS / Git Bash 开发者使用 POSIX Shell (`sh` / `bash` 调用 `scripts/*.sh`)。

---

## 3. 后果与影响 (Consequences)

- **正面收益**：
  - 从源头上根除 Cmd 引起的 GBK 字符集污染；
  - 减少外壳脚本维护负担，聚焦于 PowerShell 与 POSIX 标准。
