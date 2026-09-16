# 指纹对抗知识源索引（宁缺毋滥，多源验证）

> 采集于 2026-09-16，三路并行调研交叉验证。置信度：官方/论文 > 一手逆向 > 社区共识 > 未验证。

## A. 一手代码 / 参考实现（已收编 vertical/）

| 资产 | 位置 | 用途 |
|---|---|---|
| fingerprintjs/fingerprintjs | `vertical/fingerprintjs`（pin 6006ce5, MIT） | `src/sources/` 检测项目录；`hasLied*` 谎言检测原型（注意其误报有官方 issue 记录，作"检测下限"读） |
| FoxIO-LLC/ja4 | `vertical/ja4`（pin d3dedaf） | JA4+ 族参考实现（python/wireshark/zeek）。许可证：JA4 BSD-3，其余 JA4+ FoxIO License 1.1 商用需 OEM |
| abrahamjuliot/creepjs | `vertical/creepjs`（pin 10aa672） | `src/lies/` 原型谎言检测最完备公开实现；worker 隔离指纹、跨源一致性 |
| kaliiiiiiiiii/brotector | `vertical/brotector`（pin 98b3309，既有） | webdriver/自动化框架反测页 |
| daijro/camoufox 系 | `vertical/camoufox-cli`（既有） | Firefox C++/Juggler 层指纹注入范式 |
| LoseNine/FingerPrintJSBrowser | `vertical/FingerPrintJSBrowser`（既有） | JS 改网页环境指纹，与 pjstealth 互补 |
| LoseNine/pjstealth | `vertical/pjstealth`（既有） | stealth 注入侧参照 |

## B. 论文谱系（方法论基石，不过时）

| 工作 | 年份 | 贡献 |
|---|---|---|
| Panopticlick / Eckersley (PETS) | 2010 | 首个大规模实证：8 属性 ≥18.1 bits 熵，94.2% 唯一 |
| Cookieless Monster / Nikiforakis (S&P'13) | 2013 | 逆向 3 家商用指纹商；UA 欺骗扩展本身可指纹化 |
| FPDetective / Acar (CCS'13) | 2013 | 百万站指纹脚本普查框架 |
| Beauty and the Beast / AmIUnique (S&P'16) | 2016 | Canvas 高判别属性；118,934 指纹语料 |
| FP-Scanner / Vastel (USENIX Sec'18) | 2018 | 谎言检测学术奠基：没有对策能一致地说谎 |
| FP-Inconsistent (arXiv) | 2024 | 20 家 bot 服务实测绕过率 52.93%/44.56%；跨属性+跨时间不一致检测 |
| BrowserFM (MadWeb'25) | 2025 | feature model 表示指纹-配置关系；BOM 可达 16,000 属性 |

## C. 传输层指纹

| 来源 | 内容 | 置信度 |
|---|---|---|
| github.com/salesforce/ja3（已 archive）+ Salesforce 工程博客 | JA3/JA3S 原始定义 | 官方 |
| BoringSSL permute_extensions commit e9c5d72 | Chrome 110+ 扩展序随机化→JA3 崩塌的直接原因 | 源码 |
| blackhat.com BH EU17《Passive Fingerprinting of HTTP/2 Clients》 | Akamai h2 fp 格式原始论文 | 论文 |
| cisco/mercury | NPF 指纹格式（TLS/DTLS/QUIC/HTTP/TCP），SHA-256 | 官方 |
| p0f/p0f | TCP/IP 被动指纹事实标准 | 源码 |
| refraction-networking/{utls,uquic,clienthellod} | Go 侧指纹伪造基座；tlsfingerprint.io 后端 | 源码，活跃 |
| bogdanfinn/tls-client + fhttp | Go 全栈方案（TLS+H2+H3+头序），cgo 共享库 FFI | 源码，活跃，~1.8k星 |
| Danny-Dasilva/CycleTLS | JA3/JA4R 直配；GPL-3.0 | 源码，活跃 |
| 0x676e67/{wreq,rnet} | Rust reqwest 分叉+BoringSSL；rnet=PyO3 绑定（GPL-3.0） | 源码，活跃 |
| cloudflare/boring | BoringSSL Rust 绑定基座 | 源码，5M+ 下载 |
| lexiforest/{curl-impersonate,curl_cffi} | 活跃 fork（ECH/ZSTD/MLKEM/h3）；Python 默认答案，MIT | 源码，活跃 |
| lwthiker/curl-impersonate + 原理解析博客 | 原版（2024-03 后实质停维）与 impersonate 方法论 | 官方 |
| jawah/utls（PyPI utls） | stock BoringSSL drop-in `import ssl`；chrome:150 profile | 源码，新项目 |
| sardanioss/httpcloak | uTLS+自研 h2/h3/QUIC/MASQUE，宣称逐字节对齐（未独立验证） | 社区，新项目 |
| gospider007/{fp,fingerproxy} | MITM 指纹代理路线（按 UA 换指纹） | 源码 |
| meilimei/Mosaiq chromium-fork patches | Chromium 源码级 TLS/QUIC 指纹 patch spec（extensions.cc/net/quiche 三层同改） | 社区 spec |
| CPython #80665 / OpenSSL #19220 / pyopenssl #1430 | "Python stdlib 伪造不了 JA3"的一手依据 | 官方 issue |

## D. 判定引擎 / 厂商形态

| 来源 | 内容 | 置信度 |
|---|---|---|
| developers.cloudflare.com/bots/concepts/{bot-detection-engines,bot-score} + blog.cloudflare.com/{ja4-signals,bots-heuristics} | CF 三层引擎官方口径；JA4 确认使用 | 官方 |
| docs.datadome.co threat-detection + datadome.co 工程博客 TLS 篇 | DD 四类 ML 模型；TLS 指纹官方确认 | 官方 |
| Akamai BM：官方产品文档 + patents US11184390B2 + Edioff/akamai-analysis | sensor_data 字段布局为社区推断 | 官方+社区 |
| kasada.io 官方 + kernel.sh/blog/detection + crawlex Kasada 篇 | bytecode VM + PoW + 命名规则库 | 官方+社区 |
| Imperva 官博 2016 + crawlex Imperva 篇 | 递进链；___utmvc RC4 密钥在页面里 | 官方+社区 |
| autom.dev Google SearchGuard 诉讼分析（2025.12） | BotGuard v41 解密：512 寄存器 VM、Welford 方差、自动化全局清单 | 一手逆向+法庭文件 |
| DDoS-Guard 官方知识库 | 仅确认 JS Cookie Challenge 形态 | 官方（弱） |

## E. 检测手法 / 攻防演化（社区一手）

| 来源 | 内容 |
|---|---|
| arh.antoinevastel.com | detect-chrome-headless v1-v3、new-headless 分析（作者：FP-Scanner 作者、前 DataDome VP Research） |
| rebrowser.net/blog + rebrowser-patches | Runtime.enable 泄漏披露与修复；V8 value-mirror.cc 变更（2025-05 该信号失效） |
| kaliiiiiiiiii（CDP-Patches、selenium-driverless） | Input.dispatch 坐标泄漏 crbug#1477537（Chrome v142+ 修复）；Proxy trap 反检测 |
| ultrafunkamsterdam/nodriver | CDP-minimal 驱动范式（无 webdriver 协议） |
| blog.crawlex.net | Akamai/Kasada/Imperva/Turnstile/DDG/FPJS 内部机制逐篇拆解（推断与文档分开标注，严谨） |
| incolumitas.com + bot.incolumitas.com | 各 scraping 服务一致性实测记录（platform=Linux vs UA=Windows 实锤案例） |
| intoli.com/blog/making-chrome-headless-undetectable | headless 检测项鼻祖（2018，手法名沿用至今） |
| apify/fingerprint-suite + daijro/browserforge | 贝叶斯网络生成联合一致指纹——"进攻方怎么过一致性"必读（未收编，96MB） |
| glizzykingdreko/new-datadome-deobfuscator、manjustice/datadome-vm-internals | DataDome 混淆层/自有 VM 当前态逆向（2025-2026，需追新） |
| scrapfly.io/blog anti-bot 系列 | 8 厂商识别特征表 + 分层检测表（厂商视角但技术扎实） |
| usefoil.com/learn、browserinsight.net | "哪些检测信号还活着"2026 盘点 |

## F. 未验证项（诚实标注）

- DDoS-Guard WS 下发探测帧模式：实战观测确认存在，公开资料未见文档化
- 各家判定引擎是否用概率图模型：无证据（Fingerprint 官方只写 "probabilistic identification + ML models"）
- ja3.zone 存活状态未确认；ja3er.com 确认已死
- flynet-xyz 项目未检索到，疑为记忆偏差
- httpcloak "逐字节一致"声明未经独立验证
