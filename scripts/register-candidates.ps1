# register-candidates.ps1 — LoseNine 候选轮 4 项注册
$ErrorActionPreference = 'Stop'
$reg = 'D:\dogepy\skills-collection\registry.yaml'
$t = Get-Content $reg -Raw

$block = @'

  # ── LoseNine 候选轮 2026-08-18(下架进行时: Restore-JS/Crack-JS-Spider 已 404) ──
  - name: AI_JS_DEBUGGER
    repo: https://github.com/Valerian7/AI_JS_DEBUGGER.git
    path: vertical/AI_JS_DEBUGGER
    pin: e748a44
    acquiredAt: 2026-08-18
    enabled: true
    domain: js
    note: CDP AI 自动 JS 逆向工具 v0.4.0(断点/XHR 回溯/AES RSA 密钥 hook/报告+mitmproxy 脚本生成, web UI, OpenAI 兼容), LoseNine 系 fork
    deploy: {}
    checkCache:
      lastCheckedAt: 2026-08-18
      lastRemoteHead: e748a44
  - name: devtools-detecter
    repo: https://github.com/LoseNine/devtools-detecter.git
    path: vertical/devtools-detecter
    pin: c72cac0
    acquiredAt: 2026-08-18
    enabled: true
    domain: js
    note: 定时性能采样 DevTools 检测 JS 库(对抗面研究参考)
    deploy: {}
    checkCache:
      lastCheckedAt: 2026-08-18
      lastRemoteHead: c72cac0
  - name: pjstealth
    repo: https://github.com/LoseNine/pjstealth.git
    path: vertical/pjstealth
    pin: 420c8cb
    acquiredAt: 2026-08-18
    enabled: true
    domain: web
    note: 浏览器特征抹除+指纹随机化 Python 库(反检测研究)
    deploy: {}
    checkCache:
      lastCheckedAt: 2026-08-18
      lastRemoteHead: 420c8cb
  - name: FingerPrintJSBrowser
    repo: https://github.com/LoseNine/FingerPrintJSBrowser.git
    path: vertical/FingerPrintJSBrowser
    pin: 7edbc74
    acquiredAt: 2026-08-18
    enabled: true
    domain: web
    note: 过 FingerPrintJS 的定制 chromium 141 指纹浏览器(闭源 release, 单 README 说明页)
    deploy: {}
    checkCache:
      lastCheckedAt: 2026-08-18
      lastRemoteHead: 7edbc74
'@

$t = [regex]::Replace($t, '^deployable:', ($block + "`ndeployable:"), [Text.RegularExpressions.RegexOptions]::Multiline)
Set-Content $reg $t -Encoding UTF8
Write-Host '4 项注册完成'
