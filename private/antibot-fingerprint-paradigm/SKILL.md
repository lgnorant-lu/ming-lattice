---
name: antibot-fingerprint-paradigm
description: 反爬指纹对抗的分层知识库与组件选型元规则（TLS JA3/JA4、Akamai h2、TCP/IP、JS 环境一致性、谎言检测、判定引擎形态）。当任务涉及指纹对抗、风控识别、协议层伪装、HTTP 客户端选型（curl_cffi/utls/tls-client/wreq）、浏览器指纹一致性、webdriver/CDP 痕迹清理、挑战协议（DDoS-Guard/Cloudflare/DataDome/Akamai/Kasada/Imperva）时使用。触发词：指纹、JA3、JA4、风控、反爬、指纹浏览器、canvas指纹、webgl指纹、webdriver检测、TLS指纹、headless检测、bot detection、fingerprint spoofing。
metadata:
  layer: knowledge-paradigm
  compose: overlay-on-reverse
---

# Antibot Fingerprint Paradigm — 指纹对抗分层知识库

> 沉淀于 2026-09-16 DDoS-Guard 实战（iv8_rs + curl_cffi 静默挑战端到端跑通）+ 三路并行外部调研。
> 配套离线参考：`vertical/fingerprintjs`（检测项目录）、`vertical/ja4`（JA4 族参考实现）、`vertical/creepjs`（谎言检测）、`vertical/brotector`（自动化检测反测页）、`vertical/camoufox-cli`。
> 详细来源表见 `references/sources.md`。事实均经多源交叉；未验证项显式标注。

## 0. 第一性原理

指纹风控的本质不是"测"，是**枚举+比对**：网络栈每一层的实现选择都客观不同（BoringSSL/Go crypto/tls/OpenSSL/NSS/Schannel），防守方把每层的原始字节/行为特征收下来与已知库比对或喂评分模型。它不需要理解你是谁，只需要观测值域分布。

两条铁律（实战实证）：

1. **先对齐传输层，再调 JS 指纹**。DDoS-Guard 案例：mark/ POST 与真机 oracle 逐字节一致仍 403，换 `curl_cffi impersonate=chrome150` 立即通过——TLS 层先筛人，JS 层根本轮不到。
2. **一致性高于单点值**。检测查的是联合分布（UA/platform/WebGL/字体/时区/IP/ClientHints），单点 spoof 基本失效且反成指纹（Nikiforakis 2013：UA 欺骗扩展本身可被指纹化）。

## 1. 分层模型（L1–L6）

| 层 | 信号 | 伪造难度 | 备注 |
|---|---|---|---|
| L1 IP/TCP | IP 信誉/ASN（机房 vs 住宅）、p0f 签名（TTL/MSS/wsize/TCP options 序） | 客户端 HTTP 库救不了；只能靠对的代理出口 | 代理出口的 TCP 栈才是对端看到的 |
| L2 TLS | ClientHello：cipher 列表及顺序、扩展列表及顺序、曲线、ALPN、GREASE、ECH → JA3/JA4 | Python/Node stdlib **不可伪造**（OpenSSL API 不暴露扩展顺序，CPython #80665、OpenSSL #19220） | 必须换 TLS 引擎 |
| L3 HTTP | Akamai h2 fp（SETTINGS 帧 `id:value` 线序 + WINDOW_UPDATE + 伪头序）、header 顺序/大小写、H3/QUIC transport params | 库级可控 | Chrome 148: `1:65536;2:0;4:6291456;6:262144\|15663105\|0\|m,a,s,p` |
| L4 JS 环境 | navigator/canvas/WebGL/fonts/audio/mediaDevices/touch/时区/perf 精度 | iv8_rs persona 声明式可配 | 见 §4 |
| L5 行为 | PoW 耗时、时序形状、鼠标键盘、请求节奏 | 最难伪造 | DDoS-Guard mark/ POST 含 delta_time |
| L6 一致性 | 跨层交叉验证（谎言检测） | — | 见 §4.2；**最致命一层** |

## 2. TLS 指纹谱系

- **JA3**（Salesforce 2017，`salesforce/ja3` 已 archive）：`md5(Ver,Ciphers,Extensions,Curves,PointFormats)`，GREASE 剔除。**Chrome 110+ 扩展序随机化后已退化为噪声**——同一浏览器每次握手哈希不同；对拍看 JA3N（排序归一化变体）。
- **JA4 族**（FoxIO 2023，repo `vertical/ja4`）：`t13d1516h2_8daaf6152771_806a8c22fdea` = `[q|t|d][版本][d=SNI|i][cipher数][ext数][ALPN首尾]_[排序cipher SHA256截断]_[排序ext+sigalgs SHA256截断]`。扩展先排序天然免疫 permutation——这是它取代 JA3 的核心原因。JA4H=HTTP、JA4T/JA4TS=TCP、JA4X=X509、JA4L=延迟。
  - **许可证红线**：JA4 本体 BSD-3；JA4+ 其余全部 FoxIO License 1.1，**商用须 OEM 授权**（patent pending）。内部逆向研究没问题。
- **Akamai h2**（BH EU17 论文）：四段 `SETTINGS|WINDOW_UPDATE|PRIORITY|伪头序`。伪头序 Chrome `m,a,s,p` / Firefox `m,p,a,s` / Safari `m,s,p,a`。
- **QUIC/H3**：无单一主导标准但信号面明确——Initial 包内嵌 ClientHello（JA4 前缀 `q`）+ transport params + H3 SETTINGS。多数自动化栈不支持 h3，"能跑 QUIC 本身是弱人类信号"。
- **p0f**（lcamtuf）：`ver:ittl:olen:mss:wsize,scale:olayout:quirks:pclass`，被动 OS 指纹事实标准。

## 3. 组件选型（按生态）

**默认答案：Python 侧 curl_cffi**（`lexiforest/curl_cffi`，MIT，~6k星，活跃；底层 lexiforest/curl-impersonate fork，比 lwthiker 原版多 ECH/ZSTD/MLKEM/h3）。`impersonate=chrome*` 或自定义 `ja3=/akamai=/extra_fp=`。

| 生态 | 组件 | 定位 |
|---|---|---|
| Go | `refraction-networking/utls`（~2.5k星，活跃） | crypto/tls 硬分叉，ClientHelloSpec 逐扩展定制；一切 Go 方案的基座 |
| Go | `bogdanfinn/tls-client` + `fhttp`（~1.8k星，活跃） | TLS+H2+H3+头序全包，cgo 共享库供 Python/Node FFI；profile 到 Chrome_144 |
| Go | `Danny-Dasilva/CycleTLS`（~1.5k星） | JA3/JA4R 字符串直配；GPL-3.0 注意传染性 |
| Rust | `0x676e67/wreq`（~1k星，活跃） | reqwest 分叉+cloudflare/boring；不做 JA3 解析但 TLS/h2 帧级细粒度；`rnet` 是其 PyO3 绑定（GPL-3.0） |
| C | `lexiforest/curl-impersonate` | patch curl+BoringSSL，逐字节复刻；curl_cffi 的底座 |
| Python | `jawah/utls`（新） | stock BoringSSL drop-in 替换 `import ssl`，`set_fingerprint("chrome:150")`；证明公开 API 即可对齐 Chrome |
| Node | node-tls-client / impers / httpcloak | 全部走 FFI/共享库——纯 Node/OpenSSL 同 Python 一样无解 |

**自研下沉四档**（现有组件不够时）：
1. 客户端组装层：uTLS ClientHelloSpec 或 BoringSSL 公开 API 拼 ClientHello——**90% 场景到此为止**；
2. HTTP+TLS 联动 patch（curl-impersonate 模式）：改 h2 帧序/头序；
3. Chromium 源码级：BoringSSL `extensions.cc` 扩展序/GREASE seed + net/ + quiche transport params（**双栈同改，否则 JA4_q 露馅**）——公开实例 `meilimei/Mosaiq` patch spec；
4. MITM 指纹代理（成本最低）：正向代理按 header 注入 ClientHello spec（`gospider007/fingerproxy`）。

**下沉判据**：校验 QUIC/h3 → Go/Rust 更深的 QUIC 对齐；校验 TCP/IP → 任何 HTTP 库都救不了，只能靠出口；上游 profile 追不上新指纹特征 → uTLS/wreq 逐字段控制；要真 JS 环境+协议一致 → camoufox（Firefox C++/Juggler 注入）或 Chromium patch。

## 4. JS 环境层（L4/L6）

### 4.1 检测项目录
`vertical/fingerprintjs/src/sources/` 即公开版检测项全集（fonts/domBlockers/audio/canvas 双图/screenFrame/osCpu/plugins/touchSupport…）。CreepJS（`vertical/creepjs`）在其上加了关键一层——**prototype lies 检测**（`src/lies/`）：`Function.prototype.toString` 是否 `[native code]`、getter descriptor 是否被移到实例、非法调用是否抛与原生一致的 TypeError、Proxy 检测、跨 iframe reference identity、Worker scope 重算比对。

### 4.2 谎言检测清单（一致性检查，按类别）
- UA vs `platform`/`oscpu`/`userAgentData.platform` vs WebGL renderer vs `canPlayType` vs `sec-ch-ua*` 头四方一致；
- timezone vs IP geo；`navigator.languages` vs `Accept-Language` 头；`Etc/Unknown` 是已知代理标记；
- `screen.*` vs `avail*` vs `outer/inner*` 算术一致（hasLiedResolution 原型）；
- **CDP 痕迹**（2026 现状）：`Runtime.enable` console.debug getter 泄漏**已于 2025-05 V8 value-mirror.cc 修复后失效**（rebrowser 披露）→ 行业转向 `Input.dispatch*` 坐标泄漏（crbug#1477537，`screenX==pageX`、无 CoalescedEvents；Chrome v142+ 已修）、sourceURL 泄漏、`cdc_*`/自动化全局变量、webdriver 属性语义（打 false 反而更糟——真浏览器是 undefined）；
- headless 老信号（plugins 空表、hairline、Notification.permission 矛盾）基本全死——new headless 指纹"近乎完美"（Vastel 2023，时任 DataDome VP Research），检测已转到运行时侧信道。

### 4.3 经验法则
- 注入式伪装（JS shim/stealth 补丁）天生在 CreepJS lies 检测面下有暴露风险：能下沉到引擎/宿主层就不在页面层打补丁；必须页面层打时，补丁形态要对齐原生（descriptor 位置、toString、错误类型）。
- 我们的 `__py_*`/`__PyWebSocket` 桥接全局属于已知暴露面，引擎层 Private 位是正确解。
- 服务端动态下发混淆探测码（DDoS-Guard WS 财报帧、Kasada 私有 bytecode VM、DataDome 日更重编译）意味着**静态还原注定落后**；正确姿势是"执行下发码+值域契约回放测试"，断言值域而非逐字节。

## 5. 判定引擎形态（重要认知纠偏）

**判定从来不是"指纹精确比对"，是多层信号→概率化评分**：

| 厂商 | 判定形态（公开证据级） |
|---|---|
| Cloudflare | Heuristics（静态规则）+ ML 引擎（输出"是人类概率"→1-99 bot score）+ Anomaly Detection 三层；JA3/JA4 是确认使用的信号（ja4Signals 官博 2024-08） |
| DataDome | Signature（TLS/h2 指纹）+ Behavioral + Reputational + VulnScanner 四类 ML；同步 <2ms + 异步双层 |
| Akamai | transparent（头序/UA-JA4 矛盾等几十项异常→风险分）+ active（bmak sensor_data ~100 信号）+ behavioral；Bot Score 0-100 |
| Kasada | 客户端 bytecode VM 跑 Proof-of-Execution + 数百命名规则探测 + PoW → token；服务端加权分+异常模型 |
| Imperva | 递进链：cookie→JS challenge→reese84→CAPTCHA；`___utmvc` RC4（密钥在页面里=混淆非保密） |
| DDoS-Guard | 官方仅确认 JS Cookie Challenge 形态；WS 下发探测帧为实战观测（公开资料未验证）；`__ddg2` 社区曾发现任意值可过（该层强度低，真判定在别处） |

**贝叶斯网络问题的诚实回答**：检测侧**无公开证据**任何主流厂商用贝叶斯网络（Cloudflare 明示是监督学习概率输出）；**生成侧贝叶斯网络是标准做法**——Apify `fingerprint-suite/generative-bayesian-network`、browserforge、Rust 版 veilus 都用 PGM 采样保证属性联合一致（UA/platform/字体同分布）。攻防双方对"一致性"建的是同一张图。

## 6. 对拍 Oracle（自测闭环）

| 用途 | 端点 |
|---|---|
| 传输层全能 | `tls.peet.ws/api/all`（JA3/JA4/Akamai h2/PeetPrint/头序，事实标准）、`tls.browserleaks.com/json`、Scrapfly fp API（`tools.scrapfly.io/api/fp/ja3`） |
| QUIC | `quic.tlsfingerprint.io`、Scrapfly h3 检测页 |
| JS 环境 | `creepjs.org`（trust score + lies 清单）、`bot.incolumitas.com`（30+ 项 JSON 输出，适合脚本化回归）、`kaliiiiiiiiii.github.io/brotector`（自动化框架反测）、`bot.sannysoft.com`（基线）、`pixelscan.net`/`browserscan.net`（一致性快查） |
| 地面真值 | Wireshark + JA4 插件抓真机包 |

回归建议三轴：`creepjs`（原型谎言）+ `bot.incolumitas.com`（环境-网络一致性）+ `brotector`（自动化痕迹）。注意 ja3er.com 已死（2022 起宕机）。

## 7. Compose

```
antibot-fingerprint-paradigm（本包：分层认知 + 选型 + 判定形态）
+ reverse 领域 skill（js-reverse/protocol-reverse 执行逆向）
+ testing-core-oracle（oracle 是证据非真理；值域断言而非字节断言）
+ contract-core-paradigm（回放契约、schema 演进）
+ ui-oracle-protocol（UI 操作→请求映射做参数时机 oracle）
```

垂直参考联动：指纹生成侧看 `apify/fingerprint-suite`（贝叶斯网联合采样，未收编 96MB monorepo，在线引用）；注入侧看 `vertical/pjstealth`/`vertical/FingerPrintJSBrowser`；浏览器级看 `vertical/camoufox-cli`。

## 8. 红线

- **UA 版本必须和 impersonate 目标对齐**（chrome150 配 Chrome/15x UA）；错位本身是矛盾点。
- 挑战 cookie 绑出口 IP：mark/WS/重试必须同一会话同一出口，代理池按 IP 分组。
- 判指纹差异先怀疑传输层再怀疑 JS 数据——反过来的排查顺序会浪费数天。
- 伦理边界：指纹对抗用于授权逆向与自有系统防护验证；不用于攻击无关目标。
