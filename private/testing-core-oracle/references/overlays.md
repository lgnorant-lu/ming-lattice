# 质量属性横切不变量与安全供应链附录 (Quality Overlays & Security Matrix)

本文档是 `testing-core-oracle` 的横切不变量附录。定义非功能性质量属性的简明约束与 OWASP Agentic Skills Top 10 (AST01~10) 供应链对照表。

---

## 1. OWASP Agentic Skills Top 10 (AST01~10) 本仓控件对照表

| 官方编号 | 风险名称 (Risk Name) | 本仓对应防御控件与硬性契约 |
|---|---|---|
| **AST01** | Malicious Skill / Hijacking (恶意技能包 / 劫持) | `registry.yaml` 来源 Pin 冻结 + 私有/上游正规分层 |
| **AST02** | Supply Chain Poisoning (供应链投毒与未锁版本漂移) | `registry.yaml` commit SHA/Tag 强锁定 + `.hooksrc` 门禁 |
| **AST03** | Excessive Permissions (过度权限与越权执行) | `RouteDecision.must_not` 阻断非 RE 建单，严禁越权文件 I/O |
| **AST04** | Insecure Skill Metadata (未校验/伪装的前置元数据) | `scripts/lint.ps1` 静态门禁强校验 Frontmatter 结构与路径 |
| **AST05** | Lack of Sandboxing / Isolation (缺少环境沙箱与隔离) | 决策内核纯 Node 零 I/O，测试套件采用 `-DryRun` 零写盘 |
| **AST06** | Insecure Remote Loading (不安全的远程动态加载) | 严禁运行时从不可信 CDN/外网拉取执行脚本，全部本地 vendored |
| **AST07** | Configuration Drift (配置漂移与状态失真) | `scripts/sync.ps1` 自动化符号链接对齐单一事实源 |
| **AST08** | Insufficient Security Scanning (安全扫描与静态门禁不足) | `.githooks/pre-commit` 自动触发密钥扫描与测试套件 |
| **AST09** | Lack of Audit Logging (缺少审计与调用追踪) | 统一 `RouteDecision` 机读输出与 OTel 宽结构化事件名 |
| **AST10** | Cross-Platform Execution Risks (跨平台执行与路径风险) | 纯 `.mjs` 跨端决策大脑 + 双端外壳参数透传，坚决废除 Cmd |

---

## 2. B 级横切不变量简明契约 (Quality Overlays)

### 2.1 性能不变量 (Performance Overlay)
- **[禁止]** 功能测试中断言墙钟绝对耗时（如 `assert elapsed < 5ms`）；
- **[规范]** 锁死算法复杂度与无 I/O 约束：`Decide()` 纯函数必须保持纯内存计算，单次判定 $\le 5\text{ms}$。

### 2.2 隐私不变量 (Privacy Overlay)
- **[禁止]** 将用户 Prompt 原文完整记录进 Git 提交日志或公开测试用例；
- **[规范]** 宽结构化事件中仅记录 `hint_hash` 与提取出的 `tokens`，敏感参数默认脱敏。

### 2.3 可靠性与韧性 (Reliability Overlay)
- **[禁止]** 遇到畸形输入、空字符串或未定义包名时抛出未捕获异常或崩溃退出；
- **[规范]** 崩溃免疫：任何异常输入均优雅返回 `domain: "none"` 与 `action: "handoff"`。

### 2.4 上下文与成本经济性 (Context Cost Overlay)
- **[禁止]** 默认将 11 个技能包的全文无脑注入会话上下文；
- **[规范]** 机读名单廉价提供（`candidates`），正文按需加载（默认 $\le 4$ 包 `active_recipe`）。

### 2.5 跨端兼容性 (Portability Overlay)
- **[禁止]** 引入 Windows Cmd (`.cmd` / `.bat`) 脚本与专有 GBK 编码；
- **[规范]** 纯 Node.js 大脑 + PowerShell (`.ps1`) 与 POSIX Shell (`.sh`) 双外壳，统一 UTF-8 without BOM。
