# ADR-0002: 纯 Node.js 决策内核与双端外壳架构

- **状态**: Accepted
- **日期**: 2026-09-02
- **决策者**: ming-skills 核心团队

---

## 1. 背景与上下文 (Context)

本仓库需要在 Windows、Linux、macOS、WSL 以及 Git Bash 等多种宿主环境下运行。如果业务逻辑（如路由决策、编译清单、Git Hooks 门禁扫描）分散在不同的 Shell / PowerShell 脚本中，必然导致跨平台行为不一致、代码逻辑重复与测试维护成本翻倍。

---

## 2. 决策内容 (Decision)

确立**「纯 Node.js 大脑 + 双端薄外壳」**架构范式：

1. **唯一决策大脑**：
   - 所有的核心决策（`scripts/route-core.mjs`）、清单编译（`scripts/build-router-manifest.mjs`）、Hook 校验（`scripts/hooks/validate.mjs`）以及测试运行器（`tests/run.mjs`）统一采用纯原生 Node.js (`.mjs`) 编写；
   - 零外部 npm 依赖，确保在任何安装有 Node.js v18+ 的环境下行为 100% 确定。
2. **双端薄外壳**：
   - Windows 原生环境提供 `scripts/*.ps1`（如 `test.ps1`, `install-hooks.ps1`）；
   - POSIX / Linux / macOS / Git Bash 环境提供 `scripts/*.sh`（如 `test.sh`, `install-hooks.sh`）；
   - 外壳脚本**仅负责环境检查、命令行参数透传与进程退出码返回，严禁包含任何业务逻辑**。

---

## 3. 后果与影响 (Consequences)

- **正面收益**：
  - 路由决策与门禁判定在所有操作系统与客户端上实现跨端一致；
  - 核心逻辑仅需编写一套单元与契约测试即可覆盖所有平台。
- **负面影响 / 约束**：
  - 执行环境需安装 Node.js 运行时（现代 AI 编码客户端的标配）。
