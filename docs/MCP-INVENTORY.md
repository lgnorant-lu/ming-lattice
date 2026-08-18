# MCP 对照清单 (本地 vs 生态索引)

> 用途：本地 9 个已注册 MCP 与 awesome-re-mcp 生态索引（2026-08-18 采集）的对照，找缺失可补项。
> 本地注册表: ~/.claude.json mcpServers（9 个用户级）

## 一、本地已有 MCP（9 个）

| MCP | 类型 | 对应索引分类 | 说明 |
|---|---|---|---|
| js-reverse | npm js-reverse-mcp | ❌ 索引未收录（JS 逆向 MCP, 索引偏二进制/桌面） | **本地独有** |
| reqable | 本地 exe（Reqable 抓包） | ❌ 索引未收录（HTTP 抓包工具） | **本地独有**, 与 mitmproxy/Fiddler 同类但索引标注缺失 |
| fast-context | npm + 私有 WINDSURF key | ❌ 非 RE 生态（上下文压缩） | 本地独有（通用工具） |
| serper | npm + key | ❌ 非 RE（搜索） | 通用 |
| exa | sse 云 | ❌ 非 RE（搜索） | 通用 |
| context7 | npm @upstash + key | ❌ 非 RE（文档检索） | 通用 |
| fetch | uvx 官方 | ❌ 非 RE（网页抓取） | 通用 |
| duckduckgo | uvx 官方（断开） | ❌ 非 RE（搜索） | 通用 |
| sequential-thinking | npx 官方 | ❌ 非 RE（推理） | 通用 |

## 二、索引有、本地无（接入候选, 按价值排序）

| 候选 MCP | 来源 | 价值 | 建议 |
|---|---|---|---|
| frida-mcp (dnakov) | https://github.com/dnakov/frida-mcp | 移动动态插桩, 基座 apk-reverse 场景高度相关 | ⭐ 优先评估 |
| ida-pro-mcp (mrexodia) | https://github.com/mrexodia/ida-pro-mcp | **基座 ida-reverse 已在用其生态**（服务器名 idapro） | ✅ 已隐含使用, 确认版本 |
| Burp Suite MCP (PortSwigger 官方) | https://github.com/PortSwigger/mcp-server | 抓包/代理官方集成 | ⭐ 优先评估 |
| Jadx-MCP-Plugin (mobilehackinglab) | https://github.com/mobilehackinglab/Jadx-MCP-Plugin | jadx 反编译 + AI | 评估（本地已有 jadx-mcp-server 备选） |
| apktool-mcp-server (zinja-coder) | https://github.com/zinja-coder/apktool-mcp-server | APK 操作 | 评估 |
| radare2-mcp (radareorg 官方) | https://github.com/radareorg/radare2-mcp | radare2 26+ 工具 | 评估（基座 radare2 模块 CLI 已够用） |
| GhidraMCP (LaurieWired, 5.4k★) | https://github.com/LaurieWired/GhidraMCP | Ghidra 全功能 | 若使用 Ghidra 则接入 |
| x64dbgMCP | https://github.com/Wasdubya/x64dbgMCP | Windows 调试 40+ SDK 工具 | 按需 |
| WireMCP (Wireshark) | https://github.com/0xKoda/WireMCP | 流量分析 | 按需 |
| mcp-for-security (cyproxio) | https://github.com/cyproxio/mcp-for-security | SQLMap/FFUF/NMAP 集合 | 按需 |
| YaraFlux (ThreatFlux) | https://github.com/ThreatFlux/YaraFlux | YARA 恶意样本检测 | 按需 |
| ZAP-MCP | https://github.com/ajtazer/ZAP-MCP | OWASP ZAP + SQLMap | 按需 |
| CutterMCP / binaryninja-mcp | 见索引 | 其他反编译器 | 按需 |

## 三、生态缺口（索引标注, 无 MCP 可用）

- WinDbg / OllyDbg / Immunity（Windows 调试器）— 缺口
- UPX / PEiD / DIE（壳检测）— 缺口
- AFL++ / libFuzzer / honggfuzz（fuzzing）— 缺口
- Cuckoo / CAPE / ANY.RUN（沙箱）— 缺口
- ExifTool / binwalk（文件格式）— 缺口
- mitmproxy / Fiddler（HTTP 调试）— 缺口（**本地 reqable 恰好填补此类**）

## 四、本地特色（可反向贡献给索引）

- `reqable` MCP：HTTP 抓包类（索引标注 mitmproxy/Fiddler 缺失, reqable 可补位）
- `js-reverse` MCP：JS 逆向类（索引完全没有 JS 分类）

## 五、给 Grok 核查项

1. frida-mcp (dnakov) 的维护状态与功能覆盖（进程管理/脚本注入/实时插桩是否满足基座 apk-reverse 场景）
2. PortSwigger 官方 Burp MCP 与 reqable 本地的功能重叠/互补
3. Jadx-MCP-Plugin vs jadx-mcp-server(Qtty) vs jadx-mcp-server(zinja-coder) 三家对比选型
4. ida-pro-mcp (mrexodia) 最新版本与基座 ida-reverse 的兼容性
5. 索引遗漏的其他高价值 RE MCP（2026-08 新出现）
6. WireMCP 威胁检测能力的真实性（索引称有 threat detection）
