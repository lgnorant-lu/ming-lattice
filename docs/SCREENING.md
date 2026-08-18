# 筛选报告 (SCREENING) — 27 个 vertical 审阅结论

> 生成：2026-08-18 · 5 个子代理并行审阅（JS×9 / 二进制×5 / 移动+恶意×5 / KB+CTF+杂项×7），逐仓读取 SKILL.md/README/脚本并与基座对比。
> 结论分级：deploy（部署给 AI） / deploy-子集（只取部分） / reference（吸收进基座或按需查阅） / watch（观察） / drop（删除）

## 一、deploy（完整部署，5 个）

| 仓库 | 核心价值 | 前提条件 |
|---|---|---|
| **hello-js-reverse-skill** | JS 实战最深：1360 行 SKILL.md + 9500 行 references + 4 真实案例（含 RS6 三层嵌套 VMP）+ 5 套模板 + 红线纪律 | 需接入 camoufox-reverse MCP |
| **rust-reverse-engineering-skill** | 补基座最短板（go-rust-reverse 仅 70 行）：Rust 指纹→rustfilt→crate 恢复→Ghidra 导出全链 + 9 脚本 | bash（Windows 需 git-bash） |
| **android-reverse-claude-skill** | 自适应 Frida 绕过循环 + Fragment 注入检测 + Firebase 测试矩阵（基座 apk-reverse 无） | bash/Linux-macOS 优先，脚本需搬 |
| **ios-reverse-claude-skill** | 基座 iOS 深度不足的唯一成熟补缺（11 阶段 + 8 脚本 + Ghidra Java 脚本） | 需修 `${CLAUDE_PLUGIN_ROOT}` 变量 |
| **ctf-skills（子集）** | ctf-pwn(19)/ctf-web(21)/ctf-reverse(19)/ctf-crypto(17)/ctf-misc(13)/ctf-forensics(15) 案例密度高 | 选 6 个核心类目 |

## 二、deploy-子集（选择性并入，3 个）

| 仓库 | 取什么 | 弃什么 |
|---|---|---|
| **xbs-reverse-skill** | ast-deobfuscation（13 可运行脚本 + 8 站点混淆家族专档）、web-verify-patcher（验证码领域，基座空白） | web-js-env-patcher（依赖私有 addon.node）、web-reverse-env（已废弃） |
| **areclaw** | 15 个 Frida 脚本 + OWASP/MASTG/MITRE 映射（Windows-first 契合本机） | install.py 整仓安装（phantom-frida 私有 release） |
| **re-skill-mcp** | 自带 MCP server（1567 行 6 工具）+ 10 hook 模板 + 补环境骨架 + 小红书案例 | 需改名（frontmatter 与基座 reverse-engineering 重名） |

## 三、reference（吸收进基座或按需查阅，12 个）

| 仓库 | 吸收点 |
|---|---|
| js-reverse-715494637 | **瑞数/RS 四份专项**（r2mKa/basearr/双跳 cookie/sdenv——基座 RS 覆盖为零）+ anti-patterns |
| open-reverselab | 198 篇 KB（ctf-website 119/apk 24/pe 25/general 18）→ 基座 references 战术库 |
| trailofbits-skills | 精选 4-5 个：audit-context-building / yara-authoring / vulnerability-triage-brocards / dwarf-expert |
| ai-reverse-toolkit | 紧凑 skill 设计模板（env_core.js 引擎 + run.js 分离） |
| codex-reverse-skills | casebook 路由矩阵（厂商/壳形态→起手动作） |
| js-reverse-ops | playbooks 触发信号结构（Trigger→Misleading→Procedure→Verify） |
| reverse-skills-p4nda0s | IDAPython 片段库（799 行）+ Unicorn/U3D/iOS 专项 |
| binary-re-arm64 | r2 JSON 优先方法论（可吸收进基座 radare2） |
| reveng-static | repo 审计（RAG corpus + MCP 查询）+ IOC 提取（高质量但命名冲突） |
| ida-claude-plugins | 官方 Domain API 权威（ida-plugin-development 部分） |
| malware-re-skills | re-ioc-extraction 的 YAML schema + 证据规则 |
| claude-code-pentest | MITRE 映射 + 纯 stdlib 脚本思路 |

## 四、watch（观察，5 个）

| 仓库 | 原因 |
|---|---|
| jshook-skill | 与基座 js-reverse_* MCP 能力重复；dist/ 未构建 |
| re-skill-retro | 复古游戏 niche（有需求再 deploy）；2026-03 后冷 |
| game-security-skills | 涉游戏安全时 deploy windows-kernel/dma-attack/anti-cheat 三个；内容专业且新（2026-08-18） |
| jadx-mcp-server | spring-ai SNAPSHOT 依赖大概率无法构建；86MB 视频噪音；功能是 jadx CLI 子集 |
| iwen-scraping | **64 站真实案例代码是稀缺资产**（京东 h5st/瑞数 3 例/字体反爬），但声称的 skills/iwen-creative 知识库不存在 → 案例参考库定位 |

## 五、drop（删除候选，1 个）

| 仓库 | 原因 |
|---|---|
| awesome-re-mcp | 纯链接索引且**过时**（WinDbg 标"No MCP"但微软 2025 已发布官方 MCP）；无部署价值（保留其对照信息在 docs/MCP-INVENTORY.md） |

## 六、跨仓库问题清单

1. **本地 .git HEAD 分支指向缺失 master**（已修复：symbolic-ref 批量指向 main/master）
2. xbs 硬编码 `C:\Users\25198\` 路径（ast-deobfuscation/SKILL.md:56）——使用前清理
3. re-skill-mcp / reveng-static 的 frontmatter name 与基座冲突（reverse-engineering）——部署需改名
4. malware-re-skills 残留 LLM 生成伪影（turn0search 引注 + 不可见 Unicode）
5. android/ios skill 依赖 `${CLAUDE_PLUGIN_ROOT}` 插件变量——独立部署需替换
6. 所有 bash 系脚本 Windows 兼容性：本机 git-bash 可用，系统级安装（apt/dnf）需门控

## 七、下一步建议（待用户确认）

- **立即 deploy**：hello-js + rust + android + ios + ctf 子集（registry modules 加入 + sync）
- **吸收进基座**：RS 专项（715494637）→ 基座 js-reverse references；IOC schema → malware-analysis
- **本地 patch 与 pin 脱节语义**：deploy-子集/改名类修改会让本地内容 ≠ upstream commit，update 检测会标记——需决定"patch 层"策略（vendored 本地补丁 vs fork 上游）
