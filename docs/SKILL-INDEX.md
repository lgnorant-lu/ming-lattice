# SKILL-INDEX — 全部 skill 精要索引（路由参考）

> 用途：第一层路由参考——AI/用户在任务开始时按此表选 skill。description 才是外层触发依据（Claude Code 按 frontmatter description 惰性加载）；本表是人工可读的精要版。
> 生成：2026-08-18 · 覆盖：基座 20 部署模块 + 垂直 27 参考 + 私有 1

## 一、基座模块（已部署, 20 个）

| 模块 | 一句话定位 | 核心触发词 | 前置依赖 |
|---|---|---|---|
| apk-reverse | Android APK 逆向全流程（解包/脱壳/重打包/动态） | apk/smali/jadx/apktool/加固/root检测/证书校验 | jadx, apktool, Frida, adb |
| ida-reverse | IDA Pro 二进制分析（静态/反编译/xref/补丁） | 逆向/反编译/反汇编/exe/dll/so/elf 分析 | IDA 9.x + idalib-mcp（72 工具） |
| radare2 | radare2 CLI 逆向（r2/rabin2/rasm2） | radare/r2/r2mcp/rabin2 | r2 安装 |
| js-reverse | 前端 JS 逆向（签名链路/加密参数/请求重放） | 前端签名/加密参数/js逆向/webpack/抓包 | js-reverse-mcp MCP |
| mobile-reverse | Android+iOS 移动端安全测试 | ipa/ios逆向/越狱/mobsf/objection | 移动设备/模拟器 |
| dotnet-reverse | .NET/C# 二进制逆向 | .net/dnspy/de4dot/csharp | dnSpy |
| malware-analysis | 恶意样本分析（静态+动态+行为） | malware/yara/样本/木马/勒索/webshell | 沙箱按需 |
| reverse-engineering | 通用逆向技术库（含 dsl-vm-reverse 子模块） | 自定义VM/dsl-vm/通用逆向 | 无 |
| protocol-reverse | 自定义二进制协议/Protobuf/gRPC/WebSocket 逆向 | 协议/Protobuf/gRPC/WebSocket | 按需 |
| firmware-pentest | 固件/IoT 安全（binwalk/EMBA） | firmware/binwalk/固件/路由器/嵌入式 | binwalk |
| ghidra-reverse | Ghidra 逆向（headless/GUI） | ghidra/免费逆向 | Ghidra 安装 |
| pwn-chain | 漏洞利用链开发 | pwn/exploit/利用链/提权 | 调试器 |
| thick-client | 桌面客户端安全测试 | 客户端/本地存储/更新链 | 按需 |
| code-audit | 源码安全审计（Semgrep/CodeQL） | 源码审计/SAST/代码审查 | Semgrep/CodeQL |
| pentest-tools | 渗透测试工具链 | 渗透/漏扫/nmap/ffuf | 工具链 |
| patch-diff-exploit | 补丁 diff → 漏洞利用 | 补丁/差异/0day/1day | BinDiff |
| binary-diff | 二进制对比（BinDiff/Diaphora） | 二进制对比/diff/版本差异 | BinDiff |
| go-rust-reverse | Go/Rust 二进制逆向 | Go/rust 二进制/符号恢复 | GoReSym/rustfilt |
| macos-reverse | macOS/Mach-O 逆向 | macos/mach-o/objective-c/swift | macOS 或跨平台工具 |
| supply-chain-security | 供应链安全（SBOM/SCA/CI-CD） | 供应链/sbom/sca/依赖投毒 | 按需 |

## 二、垂直参考（27 个, vendored）

### JS / Web 逆向（9）

| 仓库 | 一句话定位 | 筛选结论 | 前置依赖 |
|---|---|---|---|
| js-reverse-715494637 | 证据链方法论（请求链路工件化, L1-L4 复杂度分级） | reference（**RS 四份专项吸收进基座**） | 无 |
| hello-js-reverse-skill | JSVMP 双路径实战（算法追踪/环境伪装）+ 红线纪律 | **deploy**（JS 首选） | camoufox-reverse MCP |
| xbs-reverse-skill | 站点混淆家族专档 + 可运行 AST 流水线 + 验证码 | deploy-子集（取 ast-deobfuscation + web-verify-patcher） | Node（脚本） |
| ai-reverse-toolkit | 极简 slash-command 工具包（加密入口/补环境/AST） | reference（紧凑设计模板） | js-reverse MCP |
| jshook-skill | TypeScript 自建浏览器自动化+反混淆 CLI | watch（与基座 MCP 重复） | npm build + LLM key |
| codex-reverse-skills | 案例路由矩阵（42 篇索引 → 起手动作） | reference（矩阵拆入基座） | 多 MCP 生态 |
| js-reverse-ops | 运营级四阶段 + 134 脚本 + 15 playbooks | watch（方法论重叠 80%） | Node |
| re-skill-mcp | 自带 MCP server + hook 模板 + 补环境骨架 | deploy-子集（**需改名**避重名） | Python + 可选 MCP |
| iwen-scraping | 64 站真实案例代码库（京东 h5st/瑞数/字体反爬） | watch（案例参考库, 无 SKILL） | 无 |

### 二进制（6）

| 仓库 | 一句话定位 | 筛选结论 | 前置依赖 |
|---|---|---|---|
| reverse-skills-p4nda0s | IDA-NO-MCP 参考包（IDAPython/Frida/Unicorn/DEX 砸壳） | reference（IDAPython 片段库） | IDA 导出数据 |
| binary-re-arm64 | 嵌入式 ELF(ARM64/MIPS) 四阶段 agentic 逆向 | reference（r2 JSON 方法论） | Linux |
| reveng-static | 静态优先双平台插件 + 12 Python 助手 + MCP corpus | reference（repo 审计/IOC） | Python 3.10+ |
| rust-reverse-engineering-skill | Rust 二进制专项（指纹→rustfilt→Ghidra 导出） | **deploy**（补基座短板） | bash + rustfilt |
| ida-claude-plugins | IDA 官方 Domain API 插件开发/执行 | reference（官方权威, unsafe 门控） | IDA 9.1+ / uv |
| jadx-mcp-server | 纯 Java jadx MCP 服务器（14 工具） | watch（SNAPSHOT 依赖无法构建） | Maven |

### 移动端 / 恶意软件（4）

| 仓库 | 一句话定位 | 筛选结论 | 前置依赖 |
|---|---|---|---|
| android-reverse-claude-skill | APK 全流程自动逆向（自适应 Frida 绕过/Fragment 注入/Firebase 测试） | **deploy**（脚本需搬） | bash, jadx |
| garlic | 世界最快 APK/Java 反编译器（C 实现, jadx 上位替代, CLI+MCP 双形态） | **deploy**（deployable/garlic-reverse） | Garlic v1.6+ 二进制 |
| r2garlic | radare2 的 Garlic DEX/Dalvik 插件 | reference | r2 + garlic |

### 工具链结论（CLI vs MCP）

- **jadx → Garlic**：CLI 优先（`garlic apk -o`），可选 `garlic -m` MCP（DuckDB SQL 分析）——新工具天然双形态，**不需要专门 MCP skill**
- **IDA → Rizin**：rizin 命令与 radare2 兼容，**基座 radare2 skill 直接覆盖**，不需要专门 skill；CutterMCP 是 GUI 形态（按需）
- CLI 仍是 AI 最佳搭档：skill 价值在方法论不在工具前缀；新工具（C 实现/单二进制）对 AI 调用更友好

### iv8 生态（V8 环境 + 字节码还原, 2026-08-18 采集）

| 条目 | 定位 | 状态 |
|---|---|---|
| iv8 (HanZzzzz000) | Python 原生 V8 运行时（470★, **最新 v0.1.4** 2026-07-15, BOM/DOM 模拟+API 监控+CDP, `pip install iv8`） | 源码入库 |
| web-reverse-iv8 (Nan857) | **别人整理的成熟 skill**（v9.6: HAR→`_initiator.stack` 定位→反混淆→iv8 补环境→本地验证, 阶段门硬阻断） | ✅ **已部署**（deployable） |
| jsc-deobfuscator (hasherezade) | V8 字节码静态反混淆（Python 脚本直接可跑, bytenode 对抗） | ✅ **已部署**（deployable） |
| view8 (suleram) | V8 序列化字节码反编译（JSC→可读代码, 需 patched V8 二进制） | reference |
| js-deobfuscator (kuizuo) | Babel AST 自动化反混淆（web 形态**无 CLI**, playground 在线） | reference（算法借鉴） |
| decode-js (echo094) | javascript-obfuscator 专攻（库形态无 CLI） | reference |
| ming_iv8_rs (用户自有) | V8+Rust 高保真 runtime（★20） | 用户项目, 互补 |

### 微信/支付宝小程序（2026-08-18 采集）

| 条目 | 定位 | 状态 |
|---|---|---|
| wx-mp-mcp (WhiteNightShadow) | 微信小程序逆向 MCP（hello_js 作者, 解包 .wxapkg） | 源码入库 |
| wxminidec (killmonday) | 微信小程序**签名/加密分析 SKILL**（AI 反编译+定位签名+mitmproxy 脚本, 2026-07-31） | 源码入库, 待筛选 |

**spiderking 结论**：GitHub 搜索无有效对应（同名项目 ★≤5 且无关）——**噱头居多, 不采集**。

### Ruyi(如意)生态（2026-08-18 采集, LoseNine）

| 条目 | 定位 | 状态 |
|---|---|---|
| ruyipage | BiDi 过检测 Firefox 自动化框架（★1744 活跃, `pip install ruyipage`, 配套指纹浏览器 release） | 源码入库（pin 9444997） |
| ruyipage-skill | **官方 skill v1.2**（BiDi 优先/人机化动作/指纹浏览器/20 篇 docs 按需阅读） | ✅ **已部署**（deployable） |
| ruyi-trace-analyzer | RuyiTrace 文档仓库：**ruyiPage 抓轮廓 → Trace 采 NDJSON → AI 补环境** 工作流 + 12 真实防护案例（akamai-酷航/kasada-reese84/abgous/h5st-滑块/某数6…） | reference（**内核为闭源发行版 427MB, 只采文档**） |
| firefox-fingerprintBrowser | ruyiPage release 配套指纹 Firefox 说明页 | 源码入库 |
| ruyipage-js / ruyipage-go / ruyipage-dev / ruyi-mcp | JS/Go 库 + 开发文档（含 SKILL.md/agents）+ MCP 桥接 | ⚠️ 上游 2026-08 下架/私有化（HTTP 404），**内容已持有, sourceGone 标记零网络跳过** |

> 生态现状：ruyipage 与 ruyipage-skill 仍活跃（HTTP 200）；**下架进行时**——Restore-JS（《反爬虫JS破解与混淆还原手册》教程书）与 Crack-JS-Spider 在列表页出现后数分钟内 404，ruyipage-js/go/dev/mcp 已先期下架，作者在批量收敛敏感资产；**看到即采**，不留到下一轮。

### LoseNine 候选轮（2026-08-18, 下架窗口以分钟计）

| 条目 | 定位 | 状态 |
|---|---|---|
| AI_JS_DEBUGGER | CDP AI 自动 JS 逆向 v0.4.0：断点/XHR 回溯/AES·RSA 密钥 hook/自动报告+mitmproxy 脚本生成（web UI, OpenAI 兼容 API; 原仓库 **Valerian7**/AI_JS_DEBUGGER, LoseNine fork） | ✅ 入库 reference（pin e748a44） |
| devtools-detecter | 定时性能采样 DevTools 检测 JS 库（对抗面参考） | ✅ 入库 reference |
| pjstealth | 浏览器特征抹除+指纹随机化 Python 库 | ✅ 入库 reference |
| FingerPrintJSBrowser | 过 FingerPrintJS 的定制 chromium 141 指纹浏览器（闭源 release, 单 README） | ✅ 入库 reference |
| Chromium_FingerPrint_Tutorial | 《Chromium 指纹浏览器开发教程》**宣传页**（README+15 图书截图, 内容走淘宝书/语雀付费） | ❌ 不采集（宣传页无内容） |
| Restore-JS | 《反爬虫JS破解与混淆还原手册》教程书 | ❌ 已 404 下架（错过窗口） |
| Crack-JS-Spider | （列表页出现后数分钟即下架） | ❌ 已 404 下架 |

### 反混淆工具评估结论（2026-08-18）

| 工具 | CLI 可用性 | 结论 |
|---|---|---|
| jsc_deobfuscator | ✅ Python 脚本直跑 | **deploy**（deployable 包装已建） |
| view8 | ⚠️ 依赖 patched V8 二进制 | reference |
| js-deobfuscator | ❌ web 形态无 CLI | reference（AST 算法借鉴源） |
| decode-js | ❌ 库形态无 CLI | reference |
| ios-reverse-claude-skill | iOS IPA/Mach-O 静态逆向（11 阶段 + Ghidra 脚本） | **deploy**（需修路径变量） | macOS 工具链或 Linux fallback |
| areclaw | Windows 优先 Android 分析工作区（15 Frida 脚本 + MASTG 映射） | deploy-子集（脚本+映射） | Windows + Git Bash |
| malware-re-skills | 防御性 RE：IOC 提取 + 脱壳评估（纯 prompt） | reference（IOC schema 吸收） | 无 |

### 知识库 / CTF / 安全 / 杂项（8）

| 仓库 | 一句话定位 | 筛选结论 | 前置依赖 |
|---|---|---|---|
| open-reverselab | 198 篇 KB 战术库 + 141 个 MCP 工具 | reference（KB 摘入基座） | 无 |
| ctf-skills | CTF 全方向（pwn/web/reverse/crypto/misc/forensics） | **deploy-子集**（6 个核心类目） | 无 |
| re-skill-retro | 复古游戏 ROM 逆向脚手架（6502/GB/MZ） | watch（niche） | 无 |
| game-security-skills | 游戏安全专题（dma-attack/windows-kernel/anti-cheat 6925 行） | watch（涉游戏安全时 deploy 3 个） | 无 |
| trailofbits-skills | ToB 官方 40 插件市场（audit/yara/dwarf 等） | reference（精选 4-5 个） | 按插件 |
| claude-code-pentest | 6 阶段 pentest 生命周期 + 43 纯 stdlib 脚本 | reference（MITRE 映射） | 无 |
| awesome-re-mcp | RE MCP 生态索引（过时） | **drop** | 无 |

## 三、私有（1）

| skill | 一句话定位 | 状态 |
|---|---|---|
| blog-content | 博客创作与发布全流程规范 | 已部署 |

## 四、案例库（docs/cases/）

| 案例 | 一句话 | 价值点 |
|---|---|---|
| device_register-kimi-ttEncrypt.md | Kimi device_register 从抓包到纯 Python 完整还原 | 教科书级"Java 定数据流→Native 定位核心→Frida 坐实原语"方法论 + 15 项验证闭环 |
