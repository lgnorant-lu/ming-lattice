# 2026-08-26 微信小程序 wxapkg 解包 + 签名逆向（三星堆 mini.sxd.cn）

## 场景分类
JS签名 / 小程序逆向 / 抓包分析

## 目标概述
微信小程序后端接口带 ts+nonce+sign(MD5) 签名无法重放；通过 PC 微信本地 wxapkg 解包（V1MMWXH 加密）提取签名密钥，实现全量数据采集。

## Scope 摘要（脱敏）
- auth_basis: 官方公开数据采集（景区导览讲解词），小程序为公开渠道
- network_profile: 直连 + 已授权抓包
- asset_types: [wxapkg, HTTP API]

## 角色
- lead_role: lead
- specialists: [js-reverse]

## 完整执行链路

1. **抓包**：微信 PC（RadiumWMPF）小程序流量 HAR（referer `servicewechat.com/<appid>/<ver>/page-frame.html` 是 PC 微信小程序特征）。
2. **识别签名门禁**：接口请求头 `ts`(秒时间戳)+`nonce`(16 位随机串)+`sign`(MD5)+`app`；无签名 code=2"签名参数异常"；**原样重放也失败 → ts 有时效校验**，必须本地生成签名。
3. **穷举失败**：ts/nonce/app/body/path 各顺序拼接 MD5 全部不中 → 存在服务端密钥，需要 JS 源码。
4. **找小程序包（关键路径）**：
   - 微信 3.x 数据目录不在默认位置：`--wechat-files-path` 参数暴露真实路径（`D:\Communications\WeXin\WeChat Files\Applet\<appid>\<ver>\*.wxapkg`）。
   - 误找过 `AppData\Roaming\Tencent\xwechat\radium\Applet`（微信 4.0 目录）— 版本错位。
5. **wxapkg 格式**：老版无加密（name+offset+size 索引）可直接解；新版 **V1MMWXH 魔数头 + 密文**，手动解析失败。
6. **Go 解包工具**：GitHub 搜 `wxapkg language:go` → **25smoking/Gwxapkg**（GO，支持自动扫描/解密/反编译，V1MMWXH 自动解密）。GitHub 直连被墙 → ghfast.top 镜像下载 Windows exe。
   - 用法：`gwxapkg.exe -id=<appid> -in=<__APP__.wxapkg> -out=<dir> -fast` → 还原工程目录（services/pages/utils）。
7. **签名提取**：解包后 `services/request.js` 的 getHeader 直接给出算法：
   `sign = MD5("san" + ts + "<16位密钥>" + nonce)`（密钥明文在 JS 里）。
8. **验证**：用 HAR 内 3 组 (ts, nonce, sign) 样本复算 3/3 匹配 → 算法 100% 确认。
9. **全量采集**：带自算签名重放分页接口（如 exhibit/search 1100 条 → exhibit/info 批量详情）。

## Evidence 链摘要（脱敏）
| E-id | severity | status | source_type | 可复用命令模式 | 关联 Finding |
|------|----------|--------|-------------|----------------|--------------|
| E-001 | high | validated | command | `md5("san"+ts+KEY+nonce)` 复算 HAR 样本 3/3 | F-001 |
| E-002 | info | observed | command | `gwxapkg.exe -id=<appid> -in=<wxapkg> -out=<dir> -fast` | F-001 |
| E-003 | info | observed | command | `Get-CimInstance Win32_Process -Filter "Name='WeChatAppEx.exe'"` 找 `--wechat-files-path` | F-002 |

## Finding / Path 摘要
- top_finding: 小程序后端签名密钥常明文存于解包 JS；wxapkg 新版加密用现成 Go 工具自动解密，无需手工破解
- path_type: callflow
- path_one_liner: HAR 签名样本 → 微信进程命令行定位包路径 → Gwxapkg 解包 → JS 读密钥 → 本地复算签名 → 全量重放
- 复用要点：
  1. 微信 3.x 小程序缓存路径从 `WeChatAppEx.exe` 命令行 `--wechat-files-path` 拿（勿猜 Documents）
  2. V1MMWXH 加密包 → Gwxapkg（Go）自动解密，勿手工 AES
  3. 签名密钥多在前端 request 封装 getHeader/拦截器，解包后 grep `nonce|sign|md5`
  4. GitHub 下载被墙 → ghfast.top/gh-proxy.com 镜像
  5. 带签名重放失败且常见组合不中 = 有密钥 → 直接找包，别在拼接组合上耗时间

## 相关
- 工具：Gwxapkg v2.8.1（25smoking，已 star）
- 同思路先例：[[2026-08-26_微信小程序抓包平台归并]]（同批任务的 HAR 平台分析）
