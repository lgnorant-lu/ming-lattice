# register-ruyi.ps1 — Ruyi 生态注册（vertical 8 条 + deployable 1 条）
$ErrorActionPreference = 'Stop'
$reg = 'D:\dogepy\skills-collection\registry.yaml'
$t = Get-Content $reg -Raw

$verticalBlock = @'

  # ── Ruyi(如意)生态 2026-08-18 ─────────────────────────────
  - name: ruyipage
    repo: https://github.com/LoseNine/ruyipage.git
    path: vertical/ruyipage
    pin: 9444997
    acquiredAt: 2026-08-18
    enabled: true
    domain: ruyi/web
    note: ruyiPage 自动化框架(★1744 活跃), BiDi 过检测 Firefox 内核
    deploy: {}
    checkCache:
      lastCheckedAt: 2026-08-18
      lastRemoteHead: 9444997
  - name: ruyipage-skill
    repo: https://github.com/LoseNine/ruyipage-skill.git
    path: vertical/ruyipage-skill
    pin: 5f00b6d
    acquiredAt: 2026-08-18
    enabled: true
    domain: ruyi/web
    note: 官方 skill v1.2(BiDi 优先/人机化/指纹浏览器), deployable 已包装
    deploy: {}
    checkCache:
      lastCheckedAt: 2026-08-18
      lastRemoteHead: 5f00b6d
  - name: ruyi-trace-analyzer
    repo: https://github.com/LoseNine/Firefox-FingerPrint-Analyzer.git
    path: vertical/ruyi-trace-analyzer
    pin: c32bf8a
    acquiredAt: 2026-08-18
    enabled: true
    domain: ruyi/web
    note: RuyiTrace 文档仓库(内核闭源发行), NDJSON 格式+AI 提示词+12 防护案例
    deploy: {}
    checkCache:
      lastCheckedAt: 2026-08-18
      lastRemoteHead: c32bf8a
  - name: firefox-fingerprintBrowser
    repo: https://github.com/LoseNine/firefox-fingerprintBrowser.git
    path: vertical/firefox-fingerprintBrowser
    pin: 401a2d2
    acquiredAt: 2026-08-18
    enabled: true
    domain: ruyi/web
    note: ruyiPage release 配套指纹 Firefox 说明页
    deploy: {}
    checkCache:
      lastCheckedAt: 2026-08-18
      lastRemoteHead: 401a2d2
  - name: ruyipage-js
    repo: https://github.com/LoseNine/ruyipage-js.git
    path: vertical/ruyipage-js
    pin: gone-2026-08-18
    acquiredAt: 2026-08-18
    enabled: true
    sourceGone: true
    domain: ruyi/web
    note: ruyiPage JS 库(77 files), 上游仓库已下架/私有化, 内容已采集
    deploy: {}
  - name: ruyipage-go
    repo: https://github.com/LoseNine/ruyipage-go.git
    path: vertical/ruyipage-go
    pin: gone-2026-08-18
    acquiredAt: 2026-08-18
    enabled: true
    sourceGone: true
    domain: ruyi/web
    note: ruyiPage Go 库(189 files), 上游已下架, 内容已采集
    deploy: {}
  - name: ruyipage-dev
    repo: https://github.com/LoseNine/ruyipage-dev.git
    path: vertical/ruyipage-dev
    pin: gone-2026-08-18
    acquiredAt: 2026-08-18
    enabled: true
    sourceGone: true
    domain: ruyi/web
    note: ruyiPage 开发文档仓库(含 SKILL.md/agents/references, 15MB), 上游已下架
    deploy: {}
  - name: ruyi-mcp
    repo: https://github.com/LoseNine/ruyi-mcp.git
    path: vertical/ruyi-mcp
    pin: gone-2026-08-18
    acquiredAt: 2026-08-18
    enabled: true
    sourceGone: true
    domain: ruyi/web
    note: ruyiPage MCP 桥接(98 files), 上游已下架, 内容已采集
    deploy: {}
'@

# 插入到 vertical 区块末尾（deployable: 行之前）
$t = [regex]::Replace($t, '^deployable:', ($verticalBlock + "`ndeployable:"), [Text.RegularExpressions.RegexOptions]::Multiline)

$deployableBlock = @'
  - name: ruyipage-skill
    path: deployable/ruyipage-skill
    enabled: true
    domain: ruyi/web
    note: ruyiPage 官方 skill v1.2(BiDi 原生/人机化/指纹浏览器/反爬)
    deploy:
      claude: true
'@

# 插入到 deployable 区块末尾（private: 行之前）
$t = [regex]::Replace($t, '^private:', ($deployableBlock + "`nprivate:"), [Text.RegularExpressions.RegexOptions]::Multiline)

Set-Content $reg $t -Encoding UTF8
Write-Host 'registry 注册完成'
