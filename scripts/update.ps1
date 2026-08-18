# update.ps1 v2 — 版本检测（缓存优先 + 增量 fetch）
# 设计目标: "获取一次后快速响应, 不每次全量计算"
#   1. 缓存命中: registry 条目 checkCache.lastCheckedAt 在 updatePolicy.ttlDays 内
#      且 lastRemoteHead == 本地 HEAD → 零网络, 直接判定无更新
#   2. 缓存过期: 有 .git 的仓库 → git fetch --depth 1（增量传输 commit/tree, blob:none）
#                无 .git 的仓库 → git ls-remote（仅元数据）
#   3. 检测后回写 registry 的 checkCache（lastCheckedAt / lastRemoteHead）
#   4. 只检测与提示, 不自动更新。确认后手动应用:
#      base:    cd base/reverse-skill && git pull --rebase   （或 checkout 新 tag）
#      vertical: git -C vertical/<name> fetch --depth 1 origin main && git checkout FETCH_HEAD
#
# 用法:
#   pwsh scripts/update.ps1                  # 全量检测
#   pwsh scripts/update.ps1 -Force           # 忽略缓存强制网络检测
#   pwsh scripts/update.ps1 -Name hello-js   # 只看指定条目（模糊匹配）

param(
    [string]$RegistryPath = (Join-Path (Split-Path $PSScriptRoot -Parent) 'registry.yaml'),
    [string]$RepoRoot = (Split-Path $PSScriptRoot -Parent),
    [string[]]$Name = @(),
    [switch]$Force,
    [switch]$Quiet
)

$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot 'lib\yaml-lite.ps1')

$reg = ConvertFrom-YamlLite (Get-Content $RegistryPath -Raw)
$ttlDays = [int]$reg.updatePolicy.ttlDays
if ($ttlDays -lt 1) { $ttlDays = 7 }
$today = (Get-Date).ToString('yyyy-MM-dd')
$report = @()
$stats = @{ cache = 0; net = 0; updated = 0; skip = 0 }

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
        if ($Name.Count -gt 0 -and $item.name -notmatch ($Name -join '|')) { continue }
        if ([string]::IsNullOrWhiteSpace($item.repo)) { continue }
        if ($item.sourceGone) { $stats.skip++; continue }   # 上游已下架/私有化: 零网络跳过
        $path = Join-Path $RepoRoot $item.path
        $hasGit = Test-Path (Join-Path $path '.git')
        if (-not $hasGit) {
            # 无 .git 的纯文件条目: 仍可用 ls-remote 检测（低频）
        }

        $entry = [ordered]@{ name = $item.name; type = $sectionName; mode = ''; local = ''; remote = ''; updated = $false; summary = @() }
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
            foreach ($branch in @('main', 'master')) {
                git -C $path fetch --depth 1 --filter=blob:none origin $branch 2>$null | Out-Null
                if ($LASTEXITCODE -eq 0) {
                    $remoteHead = git -C $path rev-parse --short FETCH_HEAD 2>$null
                    if ($remoteHead) { break }
                }
            }
        } else {
            $ls = git ls-remote $item.repo HEAD 2>$null | Select-Object -First 1
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
                    $logs = git -C $path log --oneline "$localHead..FETCH_HEAD" 2>$null | Select-Object -First 10
                    if ($logs) { $entry.summary = @($logs) }
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
$regText = Get-Content $RegistryPath -Raw
foreach ($item in @($reg.base) + @($reg.vertical)) {
    if ($null -eq $item.checkCache) { continue }
    if ($item.checkCache.lastRemoteHead -eq $item.pin) {
        # pin 未变时无需回写（缓存值 == pin, 下次读取时新鲜度由日期判断）
    }
}
# 回写 registry: 用 [regex]::Match（Select-String 逐行, 不支持跨行块匹配）
$opt = [System.Text.RegularExpressions.RegexOptions]::Singleline
foreach ($item in @($reg.base) + @($reg.vertical)) {
    if ($null -eq $item.checkCache) { continue }
    # 块边界: 下一个 "- name:" 条目行 / 非缩进行(段结束) / 文本尾 —— 不能用 ^\S(段内都是缩进行会吞整段)
    $re = "(?m)^(\s+-\s+name: " + [regex]::Escape($item.name) + ".*?)(?=\n\s+-\s+name:|\n\S|\z)"
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
Set-Content -Path $RegistryPath -Value $regText -Encoding UTF8

# ---------- 输出 ----------
$updated = @($report | Where-Object { $_.updated })
$current = @($report | Where-Object { -not $_.updated })

if (-not $Quiet) {
    Write-Host "=== 可更新 ($($updated.Count)) ==="
    if ($updated.Count -eq 0) { Write-Host "  全部为最新" -ForegroundColor Green }
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
    Write-Host ""
    Write-Host "[update] 缓存命中=$($stats.cache) 网络检测=$($stats.net) 可更新=$($stats.updated) 失败=$($stats.skip) (TTL=$ttlDays 天)"
}
exit 0
