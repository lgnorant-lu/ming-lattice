# host-tools — 本机命令守卫/提示注册表

POSIX 原生件不做全局替换（它们是**脚本消费的 API 合同**——configure/make/MSYS2 自家脚本以 POSIX 参数调用，现代替代无一是 flag 兼容的）。本件做的是**分层软门控**：按风险面选拦截位置，保留逃生口，注册表一眼可查。

## 分层（tier）

| tier | 机制 | 谁被管 | 例 |
|---|---|---|---|
| `block-form` | PATH shim 硬拦特定参数形态 | 全体（含 agent/脚本） | `find /` → exit 2 |
| `soft-ban` | PATH shim + TTY 判定：交互拦+提示，非交互透传 | 仅交互人 | `grep` → 提示 rg |
| `hint` | bashrc function（不进 PATH） | 仅交互人 | `du` → 提示/转 dua |
| `coexist` | 仅登记 | — | `sed`/`awk`（无合格替代） |

关键区分：**shim 管一切调用方**（L1/L2 必须是 PATH 件，agent 子进程也走 PATH）；**function 只导交互人**（L3 零风险扩面——脚本根本看不见）。`soft-ban` 的 TTY 判定（`[ -t 0 ] && [ -t 1 ]`，可用 `GUARD_ASSUME_TTY=1` 测试注入）修掉了旧版无条件拦导致 MSYS2 `bzfgrep`/`bzdiff` 系脚本连带 exit 2 的伤。

## 组件

- `tools.yaml` — 单一事实源（native/tier/alt/逃生口/理由）
- `shims/` — L1/L2 守卫源件（`install.ps1` 部署到 `~/.local/bin`，LF+UTF-8 无 BOM）
- `tools.mjs` — `tools`（状态表）/ `tools doctor`（在位校验+bashrc 编码体检）/ `tools gen-hints`
- `install.ps1` — 部署链：shim→`~/.local/bin`、hints 托管块→`~/.bashrc`、`tools` 入口；`-WhatIf` 预览、`-Uninstall` 拆除；UTF-16 `.bashrc` 原位修复（留 `.bak`）

## 逃生口约定（registry 统一声明）

- `--real-<tool>` 单发透传（`grep --real-grep -n pat f`）
- `<TOOL>_GUARD_OFF=1` 会话解锁（`GREP_GUARD_OFF=1 ./configure`）
- 提示行恒印真实件绝对路径（`/usr/bin/grep.exe`）

## 平台矩阵（平台中性核 + 适配器）

平台中性核 `tools.mjs`（node，天然跨端）+ 每端部署适配器。平台判定：`MSYSTEM` 环境锚 → msys2，否则 `process.platform`；`HT_PLATFORM` 注入供测试。

| 端 | shim 层 | hints 层 | 安装器 | 状态 |
|---|---|---|---|---|
| Git Bash/MSYS2 | `~/.local/bin` + `mingw64/bin` fallback | `.bashrc` 托管块 | `install.ps1` | [实证] |
| Linux/macOS bash/zsh | `~/.local/bin`（chmod +x） | `.bashrc`+`.zshrc` 托管块 | `install.sh` | [实证] install.sh 冒烟测试 |
| pwsh | 无 shim（`ls`/`cat`/`ps` 是 Get-* 别名非 exe，shim 语义错位） | 函数语法不同须另模板 | — | 候审——不为凑表硬做 |
| cmd | doskey 宏残废级 | — | — | 不做 |

## 部署与体检

```powershell
pwsh private/host-tools/install.ps1           # Windows/MSYS2 部署（-WhatIf 预览 / -Uninstall）
bash private/host-tools/install.sh            # POSIX 部署（--uninstall 拆除）
tools                                          # 状态表
tools doctor                                   # shim 分层在位/rc 编码/PATH 部署点
```

部署点 `~/.local/bin`（`~/bin` 兜底）已在 PATH 最前且免疫 Git for Windows 升级（`mingw64/bin` 旧 shim 由 install.ps1 best-effort 同步作 fallback，提权失败自动跳过）。cmd/pwsh 链上 `C:\Windows\system32\find.exe` 是同名异物（文本搜索），本守卫只管 bash 链——已知边界。

## 测试

`tests/unit/test-host-tools.test.mjs`：registry schema、status 渲染、shim 契约（`find /` 拦/透传、grep TTY 拦/管道透传、`--real-grep`/`GREP_GUARD_OFF` 逃生）、doctor wipe 检测、bashrc 编码探针。`HT_HOME` 注入隔离 HOME，不碰真实用户文件。
