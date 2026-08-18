---
name: ui-oracle-protocol
description: 将安卓 UI 控件自动化作为协议逆向的 oracle（时间戳对齐+流量窗口切片）。当需要验证抓包参数猜测、还原加密参数生成时机、确认某个 UI 操作触发了哪些网络请求、对比重放结果、生成"操作→请求"映射表时使用。依赖 appium-mcp MCP server（NO_UI=true）、mitmproxy（时间戳脚本）、frida（unpinning）。目标为安卓真机/模拟器上的真实 App。
---

# UI-Oracle Protocol — 控件自动化作为协议逆向的预言机

> 自研方法论（2026-08-18）。核心思想：**时间戳对齐 + 单步操作 + 流量窗口切片**，把"UI 操作"与"网络请求"建立一一映射，作为协议逆向的基准答案。
> 工具选型依据：appium/appium-mcp（官方 MCP server，v1.92+，454★）—— 原生 MCP、Windows 可用、NO_UI 模式省 token 60-90%。Repey（腾讯）查无公开仓库，勿引用。

## 环境就绪（一次配置）

```bash
# 1. MCP 接入（Claude Code）
claude mcp add appium-mcp -- npx -y appium-mcp@latest
# 环境变量: NO_UI=true（省 token）、SCREENSHOTS_DIR=<工作目录>、ANDROID_HOME

# 2. 前置
# Node 22+ / JDK 8+ / Android SDK / adb 设备（Appium 2.x 内置 uiautomator2 驱动, 无需全局 server）

# 3. mitmproxy 时间戳脚本（scripts/timestamper.py）
mitmdump -s scripts/timestamper.py -p 8080

# 4. frida unpinning spawn 目标 App（现有 xfqtrace-kit 或 frida 栈）
```

## 工作流（8 步）

1. **环境自检与时间基准**：`adb devices` → appium-mcp `select_device` + 创建 android session → mitmproxy 时间戳脚本启动（每个 flow 打单调递增时间戳）→ frida unpinning spawn App。记录 `t0`。
2. **基线采集**：冷启动 → 等网络静默（1-2s 无新 flow），记录启动期请求集合为**基线**；后续操作触发的判定都对基线做差集——避免定时器/启动上报误判为操作结果。
3. **单步语义化操作**：每个 oracle 动作 = 一次 `appium_find_element`（accessibility id 优先）+ 一次 `appium_gesture`（tap / `set_value` 输入 / `scroll_to_element`）。操作前记录当前最新 flow 时间戳为窗口起点，操作描述（如"点击登录按钮"）作动作 ID。
4. **流量窗口切片**：操作后等静默，切出 `(窗口起点, 静默点]` 内的新 flow → 生成**操作→请求映射表**（动作 ID → URL/方法/参数/响应码），写 JSON。滚动用 `scroll_to_element` 天然分页，逐页切窗。
5. **生成时机还原**：对带签名/加密字段的请求，Frida hook 参数构造入口（OkHttp Interceptor / 加密工具类 / JNI 桥）打调用栈——判定参数是"操作时动态生成"（每次点击值变）还是"登录态持久"（会话内不变）。**这是 oracle 对"生成时机"问题的基准答案**。
6. **猜测验证（交叉证据）**：对可疑参数给假设（如"sig = md5(params+盐)"）→ 静态剧本（jadx 定位字段）→ hook 按快门（打印值）→ 抓包留遗照（过滤关键字）——三点值对齐即证实调用链。
7. **重放对比（闭环）**：mitmproxy replay / curl 重放（可篡改）请求 → 回 UI 观察 App 行为（列表刷新/toast/报错/数据变化）→ 判断参数是否被服务端接受、重放是否幂等。**UI 自动化在这里充当"服务端是否认这笔请求"的判官**——纯抓包无法回答的问题。
8. **产物沉淀**：`api_inventory.json`（endpoint/参数表/触发操作/生成时机/依赖状态）+ 可重复执行的操作脚本（供回归验证）。

## 操作→请求映射表 schema

```json
{
  "session": "2026-08-18T20:00:00Z",
  "t0": 1789984800000,
  "actions": [
    {
      "id": "A001",
      "desc": "点击登录按钮",
      "window": {"start": 1789984805000, "end": 1789984809000},
      "flows": [
        {"url": "https://api.example.com/login", "method": "POST",
         "params": {"sig": "9f2c..."}, "status": 200,
         "sig_timing": "dynamic-per-click", "evidence": ["frida-stack-okhttp", "jadx-line-142"]}
      ]
    }
  ]
}
```

## 注意事项

- **时间戳校准**：mitmproxy 的 flow 时间戳（宿主机）与 Frida hook 日志（设备端）统一到同一毫秒级时钟，必要时校准——映射表失真根因。
- **目标对抗**：App 可能带 root/frida/代理检测，先跑反检测 hook（xfqtrace-hide.kpm / unpinning）；真机与模拟器行为有差异（证书、驱动兼容），结果以真机为准。
- **合规**：仅授权研究目标；抓包/重放遵守目标平台条款。
- 备选栈：uiautomator2 3.7.0（Python 轻量，无 MCP 需 FastMCP 自包）或 LAMDA（root 全家桶，UI+MITM+Frida 一体，8.2k★）——场景需要时再换。
