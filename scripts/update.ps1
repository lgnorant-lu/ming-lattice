# update.ps1 v2 — 版本检测（缓存优先 + 显式网络检查）
# 设计目标: "获取一次后快速响应, 不每次全量计算"
#   1. 缓存命中: registry 条目 checkCache.lastCheckedAt 在 updatePolicy.ttlDays 内
#      且 lastRemoteHead == 本地 HEAD → 零网络, 直接判定无更新
#   2. 缓存过期且未使用 DryRun: 有 .git 的仓库 → git fetch --depth 1（增量传输 commit/tree, blob:none）
#                无 .git 的仓库 → git ls-remote（仅元数据）
#   3. 非 DryRun 检测后回写 registry 的 checkCache（lastCheckedAt / lastRemoteHead）
#   4. 只检测与提示, 不自动更新。确认后手动应用:
#      base:    cd base/reverse-skill && git pull --rebase   （或 checkout 新 tag）
#      vertical: git -C vertical/<name> fetch --depth 1 origin main && git checkout FETCH_HEAD
#
# 用法:
#   pwsh scripts/update.ps1                  # 全量检测
#   pwsh scripts/update.ps1 -Force           # 忽略缓存并执行网络检测
#   pwsh scripts/update.ps1 -Force -DryRun   # 只生成未联网预览
#   pwsh scripts/update.ps1 -Name hello-js   # 只看指定条目（模糊匹配）

param(
    [string]$RegistryPath = (Join-Path (Split-Path $PSScriptRoot -Parent) 'registry.yaml'),
    [string]$RepoRoot = (Split-Path $PSScriptRoot -Parent),
    [string[]]$Name = @(),
    [switch]$Force,
    [switch]$Quiet,
    [Alias('DryRun')][switch]$WhatIf
)

$ErrorActionPreference = 'Stop'
# 远端要凭证时 git 立即失败而非在 stdin 提示上永久挂起（与 fetch.mjs 同防护）
$env:GIT_TERMINAL_PROMPT = '0'
. (Join-Path $PSScriptRoot 'lib/registry.ps1')

$reg = Read-SkillRegistry -RegistryPath $RegistryPath
# ttlDays 硬校验：负值/非数会静默改写 TTL 语义或抛隐晦转型错——先拦出明确消息
$ttlDays = 7
if ($null -ne $reg.updatePolicy.ttlDays) {
    $parsed = 0
    if (-not [int]::TryParse("$($reg.updatePolicy.ttlDays)", [ref]$parsed) -or $parsed -lt 1 -or $parsed -gt 365) {
        throw "updatePolicy.ttlDays 非法值: $($reg.updatePolicy.ttlDays)（须 1-365 整数；缺省 7）"
    }
    $ttlDays = $parsed
}
$today = (Get-Date).ToString('yyyy-MM-dd')
$report = @()
$stats = @{ cache = 0; net = 0; updated = 0; skip = 0; gone = 0 }
$namePattern = if ($Name.Count -gt 0) { ($Name | ForEach-Object { [regex]::Escape($_) }) -join '|' } else { $null }

# ---------- 工具函数 ----------
function Get-LocalHead($path) {
    # vendored 仓库 HEAD 可能 unborn（只 update-ref 未 checkout）, 用 refs/heads/main|master
    foreach ($br in @('refs/heads/main', 'refs/heads/master')) {
        $h = git -C $path rev-parse --short $br 2>$null
        if ($LASTEXITCODE -eq 0 -and $h) { return $h }
    }
    $h = git -C $path rev-parse --short HEAD 2>$null
    if ($LASTEXITCODE -eq 0 -and $h) { return $h }
    return $null
}

function Test-CacheFresh($entry, $localHead) {
    # 返回 $true = 缓存新鲜（零网络判定）
    if ($Force) { return $false }
    if ($null -eq $entry.checkCache) { return $false }
    $lastHead = $entry.checkCache.lastRemoteHead
    $lastAt = $entry.checkCache.lastCheckedAt
    if ([string]::IsNullOrWhiteSpace($lastHead) -or [string]::IsNullOrWhiteSpace($lastAt)) { return $false }
    if ($lastHead -ne $localHead) { return $false }   # 本地内容已变（可能手动改过）→ 重新检测
    try {
        $age = ((Get-Date) - (Get-Date $lastAt)).TotalDays
    } catch { return $false }
    return $age -le $ttlDays
}

foreach ($sectionName in @('base', 'vertical')) {
    foreach ($item in @($reg.$sectionName)) {
        if (-not $item.enabled) { continue }
        if ($namePattern -and $item.name -notmatch $namePattern) { continue }
        if ([string]::IsNullOrWhiteSpace($item.repo)) { continue }
        # sourceGone 单独计数——"有意零网络跳过"≠"检测失败"，同桶会让真失联
        # 淹没在孤本基数里看不见（报告面语义分层）
        if ($item.sourceGone) { $stats.gone++; continue }
        $path = Join-Path $RepoRoot $item.path
        $hasGit = Test-Path (Join-Path $path '.git')
        if (-not $hasGit) {
            # 无 .git 的纯文件条目: 非 DryRun 时用 ls-remote 检测（低频）
        }

        $entry = [ordered]@{ name = $item.name; type = $sectionName; mode = ''; local = ''; remote = ''; updated = $false; summary = @() }
        if ($WhatIf) {
            $entry.mode = 'dry-run'
            $entry.local = $item.pin
            $entry.remote = 'NOT_CHECKED'
            $report += $entry
            continue
        }
        $localHead = if ($hasGit) { Get-LocalHead $path } else { $item.pin }

        # ── 快速路径: 缓存命中 → 零网络 ──
        if ($hasGit -and (Test-CacheFresh $item $localHead)) {
            $entry.mode = 'cache'
            $entry.local = $localHead
            $entry.remote = $item.checkCache.lastRemoteHead
            $stats.cache++
            $report += $entry
            continue
        }

        # ── 网络路径: 增量检测 ──
        $entry.mode = if ($hasGit) { 'fetch' } else { 'ls-remote' }
        $entry.local = $localHead
        $remoteHead = $null
        if ($hasGit) {
            # 依次试 main/master（避免 ls-remote 额外网络请求）; 用 $LASTEXITCODE 判断, 勿用 if(git)（stdout 为空会被判假）
            # 网络停滞有界化：传输速率 <1KB/s 持续 90s 即 abort（凭证提示已由 GIT_TERMINAL_PROMPT 拒）
            foreach ($branch in @('main', 'master')) {
                git -C $path -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=90 fetch --depth 1 --filter=blob:none origin $branch 2>$null | Out-Null
                if ($LASTEXITCODE -eq 0) {
                    $remoteHead = git -C $path rev-parse --short FETCH_HEAD 2>$null
                    if ($remoteHead) { break }
                }
            }
            if (-not $remoteHead) {
                # 兜底：非标准默认分支（develop/trunk 等）——symref 探一次真实
                # 默认分支再定向 fetch（仅 main/master 双失时付这一程网络成本）
                $symref = git -C $path -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=90 ls-remote --symref origin HEAD 2>$null |
                    Select-Object -First 1
                if ($symref -match 'refs/heads/(\S+)\s+HEAD') {
                    git -C $path -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=90 fetch --depth 1 --filter=blob:none origin $Matches[1] 2>$null | Out-Null
                    if ($LASTEXITCODE -eq 0) { $remoteHead = git -C $path rev-parse --short FETCH_HEAD 2>$null }
                }
            }
        } else {
            # registry 值进 git argv 前必须校验：ls-remote 支持
            # --upload-pack=<bin>（远端侧任意执行）——'-' 前缀即选项注入面
            if ($item.repo.TrimStart().StartsWith('-')) {
                Write-Host "  [SKIP] $($item.name): registry repo 值非法（'-' 前缀，选项注入面）" -ForegroundColor Yellow
                $entry.remote = 'DETECT-FAIL'
                $stats.skip++
                $report += $entry
                continue
            }
            $ls = git -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=90 ls-remote $item.repo HEAD 2>$null | Select-Object -First 1
            if ($ls) { $remoteHead = (($ls -split '\s+')[0]).Substring(0, 7) }
        }

        if ($remoteHead) {
            # 回写缓存
            $item.checkCache = [ordered]@{ lastCheckedAt = $today; lastRemoteHead = $remoteHead }
            $entry.remote = $remoteHead
            $stats.net++
            if ($remoteHead -ne $localHead) {
                $entry.updated = $true
                $stats.updated++
                if ($hasGit) {
                    # 远端 commit subject 是不可信输入——剥离控制字符（ESC/C0-C1），防终端转义注入
                    $logs = git -C $path log --oneline "$localHead..FETCH_HEAD" 2>$null | Select-Object -First 10 |
                        ForEach-Object { $_ -replace '[\x00-\x1f\x7f-\x9f]', '' }
                    if ($logs) { $entry.summary = @($logs) }
                    elseif ((git -C $path rev-parse --is-shallow-repository 2>$null) -eq 'true') {
                        # depth-1 克隆：localHead 在浅边界外时 log 静默空——如实标记而非"无变更"假象
                        $entry.summary = @('(shallow 克隆边界——提交列表不可得，仅 HEAD 差异可证有更新)')
                    }
                }
            }
        } else {
            $entry.remote = 'DETECT-FAIL'
            $stats.skip++
        }
        $report += $entry
    }
}

# 缓存回写 registry 文件（updatePolicy 之外仅更新 checkCache 段）
# 回写 registry: 用 [regex]::Match（Select-String 逐行, 不支持跨行块匹配）
$opt = [System.Text.RegularExpressions.RegexOptions]::Singleline
$regText = Get-Content $RegistryPath -Raw
$regTextBaseline = $regText   # TOCTOU 锚：写前复检外部是否动过文件
foreach ($item in @($reg.base) + @($reg.vertical)) {
    if ($null -eq $item.checkCache) { continue }
    # 块边界: 下一个 "- name:" 条目行 / 非缩进行(段结束) / 文本尾 —— 不能用 ^\S(段内都是缩进行会吞整段)
    # 名边界: 名后必须行尾（允许尾空白+注释）——否则前缀名(foo)会劫持更早出现的长名(foo-extended)块
    $re = "(?m)^(\s+-\s+name: " + [regex]::Escape($item.name) + "(?=[^\S\n]*(?:#[^\n]*)?$).*?)(?=\n\s+-\s+name:|\n\S|\z)"
    $m = [regex]::Match($regText, $re, $opt)
    if (-not $m.Success) { continue }
    $block = $m.Groups[1].Value
    if ($block -match 'checkCache:') {
        $newBlock = $block -replace '(?m)^(\s+)lastCheckedAt:.*$', "`$1lastCheckedAt: $($item.checkCache.lastCheckedAt)" `
                                 -replace '(?m)^(\s+)lastRemoteHead:.*$', "`$1lastRemoteHead: $($item.checkCache.lastRemoteHead)"
        $regText = $regText.Replace($block, $newBlock)
    } else {
        # 无 checkCache 段 → 追加到条目块末尾（条目字段统一 4 空格缩进, 固定格式插入）
        $insert = "`n    checkCache:`n      lastCheckedAt: $($item.checkCache.lastCheckedAt)`n      lastRemoteHead: $($item.checkCache.lastRemoteHead)"
        $regText = $regText.Replace($block.TrimEnd(), $block.TrimEnd() + $insert)
    }
}
if (-not $WhatIf) {
    # TOCTOU 守卫：检测期间文件被外部改动则放弃回写——checkCache 是易再生
    # 缓存值，覆盖他人手编/其他写器的代价远高于"重跑一次 update"
    if ((Get-Content $RegistryPath -Raw) -cne $regTextBaseline) {
        Write-Host "[WARN] registry.yaml 检测期间被外部修改——checkCache 回写放弃（防覆盖他人写入），重跑即可" -ForegroundColor Yellow
    } else {
        [System.IO.File]::WriteAllText($RegistryPath, $regText, [System.Text.UTF8Encoding]::new($false))
    }
} else {
    Write-Host "[DryRun 演练模式] 已跳过 registry.yaml 缓存回写" -ForegroundColor DarkCyan
}

# ---------- 输出 ----------
$updated = @($report | Where-Object { $_.updated })
$current = @($report | Where-Object { -not $_.updated -and $_.remote -notin @('NOT_CHECKED', 'DETECT-FAIL') })
$unverified = @($report | Where-Object { $_.remote -in @('NOT_CHECKED', 'DETECT-FAIL') })

if (-not $Quiet) {
    Write-Host "=== 可更新 ($($updated.Count)) ==="
    if ($updated.Count -eq 0) { Write-Host "  本次未确认可更新项" -ForegroundColor Green }
    foreach ($e in $updated) {
        Write-Host ""
        Write-Host "[$($e.type)] $($e.name) ($($e.mode))" -ForegroundColor Yellow
        Write-Host "  本地: $($e.local)  远端: $($e.remote)"
        foreach ($s in $e.summary) { Write-Host "    $s" }
        if ($e.type -eq 'base') {
            Write-Host "  应用: git -C base/reverse-skill pull --rebase   # 或 git checkout <新tag>"
        } else {
            Write-Host "  应用: git -C vertical/$($e.name) fetch --depth 1 origin main && git checkout FETCH_HEAD"
        }
    }
    Write-Host ""
    Write-Host "=== 已是最新 ($($current.Count)) ==="
    foreach ($e in $current) {
        $tag = ''
        Write-Host "  [OK] $($e.name) [$($e.mode)]: $($e.local)" -ForegroundColor DarkGray
    }
    foreach ($e in $unverified) { Write-Host "  [UNVERIFIED] $($e.name): $($e.remote)" -ForegroundColor Yellow }
    Write-Host ""
    $networkLabel = if ($WhatIf) { '网络检测=0 (DryRun)' } else { "网络检测=$($stats.net)" }
    Write-Host "[update] 缓存命中=$($stats.cache) $networkLabel 可更新=$($stats.updated) 未验证=$($stats.skip) 孤本零网络=$($stats.gone) (TTL=$ttlDays 天)"
}

# ---------- 上游金数据漂移（ming-boundary langs pin ↔ HEAD） ----------
# 报告面非门禁：DRIFT 不拦 update 退出码；升 pin 是人审+重生成事（同上 registry 哲学）
if (-not $WhatIf) {
    $syncLangs = Join-Path $PSScriptRoot '../private/engineering/ming-boundary/scripts/sync-langs.mjs'
    if (Test-Path $syncLangs) {
        $headsOut = & node $syncLangs --heads 2>&1
        $drifted = @($headsOut | Where-Object { $_ -match 'DRIFT' })
        if ($drifted.Count -gt 0) {
            Write-Host ""
            Write-Host "=== langs 上游漂移 ($($drifted.Count)) ===" -ForegroundColor Yellow
            foreach ($d in $drifted) { Write-Host "  $d" }
            Write-Host "  应用: 人审 upstream.yaml 升 pin → node sync-langs.mjs 重生成 → 提交 diff"
        }
    }
}
exit 0
