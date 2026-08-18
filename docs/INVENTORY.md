# Skill 采集清单 (INVENTORY)

> 用途：当前集散仓库已采集/待核查的全部 skill 来源清单。可交由外部 LLM（如 Grok）核查仓库真伪、活跃度、补充遗漏。
> 生成日期：2026-08-18（实时验证：git ls-remote + GitHub API）

## 一、基座（已纳入, submodule 跟踪）

### 1.1 基座本体

| 作者 | 仓库 | URL | 说明 |
|---|---|---|---|
| zhaoxuya520 | reverse-skill | https://github.com/zhaoxuya520/reverse-skill | ★26,051 · v1.0.1(2026-08-08) · pushed 2026-08-16 · 官网 reverse.apivix.com · **客户端无关路由底座 R0-R40 + 163 条回归基准 + field-journal 42 篇** |

### 1.2 基座全部模块（skills/ 下 40+）

**已部署（20 个, 部署到 claude）：**

| 模块 | 用途 |
|---|---|
| apk-reverse | Android APK 逆向（解包/jadx/apktool/Frida/加固脱壳） |
| ida-reverse | IDA Pro 二进制逆向（72 个 idapro_* MCP 工具） |
| radare2 | radare2 CLI 逆向 |
| js-reverse | 前端 JS 逆向（签名链路定位, js-reverse-mcp） |
| mobile-reverse | 移动端（Android+iOS）逆向与安全测试 |
| dotnet-reverse | .NET/C# 二进制逆向（dnSpy/de4dot） |
| malware-analysis | 恶意样本静态/动态分析 |
| reverse-engineering | 逆向通用技术（含 dsl-vm-reverse 子模块） |
| protocol-reverse | 自定义二进制协议/Protobuf/gRPC/WebSocket 逆向 |
| firmware-pentest | 固件/IoT 安全（binwalk/EMBA） |
| ghidra-reverse | Ghidra 免费逆向（headless/GUI） |
| pwn-chain | 漏洞利用链 |
| thick-client | 桌面客户端安全测试 |
| code-audit | 源码安全审计（Semgrep/CodeQL） |
| pentest-tools | 渗透测试工具链 |
| patch-diff-exploit | 补丁 diff 与漏洞利用 |
| binary-diff | 二进制对比（BinDiff/Diaphora） |
| go-rust-reverse | Go/Rust 二进制逆向 |
| macos-reverse | macOS/Mach-O 逆向 |
| supply-chain-security | 供应链安全（SBOM/SCA/CI-CD） |

**未部署（基座还有, 按需启用）：** attack-chain、browser-extension-reverse、browser-automation、case-review、cloud-k8s、database-security、digital-forensics、diagram-generator、docs-generator、edr-bypass-re、email-security、hardware-security、identity-federation、llm-security、ot-ics、radio-sdr、threat-hunting、wifi-wireless、windows-ad、api-security + 内部组件（ops/config/references/scripts/tests/field-journal）

## 二、官方/机构（未采集, 可选）

| 作者 | 仓库 | URL | 说明 |
|---|---|---|---|
| anthropics | skills | https://github.com/anthropics/skills | ★170,062 · pushed 2026-08-17 · **Anthropic 官方 skills 仓库**（本地旧版 reverse-engineering 即来源于此, 已备份在 .trash） |

## 三、垂直采集（已下载 19 个, vendored 于 vertical/）

### JS / Web 逆向（8 个）

| # | 作者 | 仓库 | URL | ★ | 最后 push | 形态 |
|---|---|---|---|---|---|---|
| 1 | 715494637 | reverse-skill | https://github.com/715494637/reverse-skill | 342 | 2026-05-02 | 子目录 SKILL.md（jsr-reverse/）· 请求链证据化/JSVMP/AST/Worker/WASM |
| 2 | WhiteNightShadow | hello_js_reverse_skill | https://github.com/WhiteNightShadow/hello_js_reverse_skill | 1,086 | 2026-07-29 | cases/ 案例 + references · Camoufox 反检测全链路 |
| 3 | lwjjike | xbsReverseSkill | https://github.com/lwjjike/xbsReverseSkill | 354 | 2026-07-21 | 3 个 SKILL.md（ast-deobfuscation/web-reverse-algorithm/web-js-env-patcher）· 站点模式 |
| 4 | zhizhuodemao | ai-reverse-toolkit | https://github.com/zhizhuodemao/ai-reverse-toolkit | 411 | 2026-03-14 | rules/ + skills/（find-crypto-entry/env-patch/ast-deobfuscate）· 知乎 x-zse-96 示例 |
| 5 | wuji66dde | jshook-skill | https://github.com/wuji66dde/jshook-skill | 256 | 2026-02-11 | 根 SKILL.md · 智能代码收集/20+ 混淆/加密检测/CDP |
| 6 | firstrui | codex-reverse-skills | https://github.com/firstrui/codex-reverse-skills | 41 | 2026-03-26 | skills/（web-js-reverse-master-flow + 1997-pro-web-reverse-casebook） |
| 7 | DQmyth | js-reverse-ops | https://github.com/DQmyth/js-reverse-ops | 11 | 2026-06-09 | AGENTS.md 型 · 高杠杆 JS 逆向运营 |
| 8 | xiao-heng | iwen-scraping | https://github.com/xiao-heng/iwen-scraping | 2 | 2026-06-07 | **219MB 实战样本库**（58同城 webpack/快手 sig3/知乎 x-zse）· 下载中, 过滤噪声后保留 |

### 二进制 / 移动端 / 恶意软件（7 个）

| # | 作者 | 仓库 | URL | ★ | 最后 push | 形态 |
|---|---|---|---|---|---|---|
| 9 | P4nda0s | reverse-skills | https://github.com/P4nda0s/reverse-skills | 1,976 | 2026-05-06 | skills/ 子目录（rev-dex-dumper/rev-u3d-dump/rev-idapython 等）· IDA-NO-MCP |
| 10 | LING71671 | open-reverselab | https://github.com/LING71671/open-reverselab | 1,066 | 2026-08-12 | CLAUDE.md 型 · **197 篇 KB 文章 + 100+ MCP 工具** |
| 11 | ljagiello | ctf-skills | https://github.com/ljagiello/ctf-skills | 3,020 | 2026-07-30 | 子目录 SKILL.md（ctf-reverse/ctf-web/ctf-pwn 等）· CTF 全方向 |
| 12 | incogbyte | android-reverse-engineering-claude-skill | https://github.com/incogbyte/android-reverse-engineering-claude-skill | 102 | 2026-06-20 | CLAUDE.md 型 · APK/XAPK/AAB/DEX 自动逆向 |
| 13 | incogbyte | iOS-reverse-engineering-claude-skill | https://github.com/incogbyte/iOS-reverse-engineering-claude-skill | 82 | 2026-07-01 | skills/ 子目录 · IPA/Mach-O 逆向 |
| 14 | TheQmaks | areclaw | https://github.com/TheQmaks/areclaw | ~ | ~ | CLAUDE.md 型 · Android 安全分析 |
| 15 | hackersifu | reverse-engineering-skills | https://github.com/hackersifu/reverse-engineering-skills | 34 | 2026-03-12 | README 型 · **防御性 RE + 恶意软件**（IOC 提取/静态优先） |

### 其他垂直（4 个）

| # | 作者 | 仓库 | URL | ★ | 最后 push | 形态 |
|---|---|---|---|---|---|---|
| 16 | vgrichina | re-skill | https://github.com/vgrichina/re-skill | 129 | 2026-03-05 | phases.md 型 · **复古游戏 ROM 逆向**（工作区脚手架） |
| 17 | 2389-research | binary-re | https://github.com/2389-research/binary-re | 14 | 2026-07-06 | skills/SKILL.md · **ELF/ARM64 agentic 逆向** |
| 18 | ZhuSheng-0807 | reverse-engineering-skill | https://github.com/ZhuSheng-0807/reverse-engineering-skill | 1 | 2026-06-10 | cases/ + MCP server · 24KB 方法论 |
| 19 | th3vib3coder | RevEng | https://github.com/th3vib3coder/RevEng | 0 | 2026-05-23 | skills/ 子目录 · **静态优先**（不执行样本）· repo/binary/Android/Ghidra |
| 20 | jingjing2222 | rust-reverse-engineering-skill | https://github.com/jingjing2222/rust-reverse-engineering-skill | 6 | 2026-04-18 | README 型 · Rust 逆向（防御性） |
| 21 | gmh5225 | awesome-game-security（仅 .claude/skills 子目录） | https://github.com/gmh5225/awesome-game-security | ~ | ~ | **10 个 SKILL.md**：anti-cheat / dma-attack / game-engine / game-hacking / graphics-api / mobile-security / research-rigor / reverse-engineering / windows-kernel / overview · sparse checkout 8.4M |

## 四、待核查项（请 Grok 核查）

1. **zhongjiaxiong/web-reverse-skill-notes** — ls-remote 404（3 个变体均无）。已改名/转私有/删除？原调研称其为"Web 逆向笔记沉淀"
2. **incogbyte/android-claude** — 旧名不存在, 正确名为 `android-reverse-engineering-claude-skill`（已确认）。是否还有别的 Android/iOS skill 仓库？
3. **TheQmaks/areclaw** — ls-remote OK 但 GitHub API 偶发失败（可能限流），star 数待确认
4. **gmh5225/awesome-game-security** — 超级大仓库（含 .claude/skills/mobile-security 子目录）, 未采集（价值密度低）。是否值得仅采 skills 子目录？
5. **wuji66dde/jshook-skill** — 已确认存在（256★），但首次 ls-remote 抖动。是否有配套 MCP（jshook-mcp）？
6. **Yuyz0112/claude-code-reverse** — 是"逆向 Claude Code 本身"的分析项目（非逆向分析 skill），未采集，确认归类
7. **mcpmarket.com 上挂靠的 skill**（system-archeology-reverse-engineering、anti-reversing-js-deobfuscation-master）— 市场目录形态, 是否有对应 GitHub 源仓库？

## 五、建议补充检索方向（Grok 可顺带找）

- 2026-08 新出现的逆向 skill（近 2 周, 尤其 Claude Code / Codex 生态）
- **特定风控/壳层垂直**：JSVMP 指令集级还原、顶象/瑞数/极验/同盾家族最新对抗链
- 私有协议状态机级复现 skill
- WASM/Worker 专项、TLS/HTTP2 指纹对抗专项
- 游戏安全（Cheat Engine/反作弊对抗）方向的 agent skill
- 硬件/IoT 固件逆向的 agent skill（QEMU 动态模拟链路）
- 各家 MCP 服务（js-reverse-mcp、camoufox-reverse、anything-analyzer、frida-mcp）的最新状态与替代品

## 六、已放弃/不采

| 仓库 | 原因 |
|---|---|
| zhongjiaxiong/web-reverse-skill-notes | 不存在（404） |
| th3vib3coder/RevEng | 已采（0★ 但形态独特, 保留评估） |
| gmh5225/awesome-game-security | 仅 sparse 采集 .claude/skills 子目录（10 个 SKILL.md） |
| Yuyz0112/claude-code-reverse | 非逆向分析 skill（逆向 Claude Code 本体） |

## 七、供应链安全提醒

- 2026-05 有安全研究（labs.reversec.com）披露 **Claude Code 恶意 skill/agent 攻击面**（skill 文件可作为初始访问向量）。采集自第三方仓库的 skill 均**只读参考**（不部署、不自动执行），部署前请审阅 SKILL.md 与 scripts 内容。
