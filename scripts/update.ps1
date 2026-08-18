# update.ps1 — 遍历 registry 中所有有 upstream 的条目, 检测上游更新
# 输出: 每个仓库的 本地版本 vs 远端版本 + 变更摘要（commit 列表 / CHANGELOG）
# 行为: 只检测与提示, 不自动更新。确认后手动应用:
#   base (submodule):  cd base/reverse-skill && git pull --rebase  （或 git checkout <tag>）
#   vertical (vendored):  cd vertical/<name> && git pull
#
# 用法:
#   powershell -File scripts/update.ps1            # 全量检测
#   powershell -File scripts/update.ps1 -CheckOnly  # 同默认
#   powershell -File scripts/update.ps1 -Name reverse-skill   # 只看指定条目

param(
    [string]$RegistryPath = (Join-Path (Split-Path $PSScriptRoot -Parent) 'registry.yaml'),
    [string]$RepoRoot = (Split-Path $PSScriptRoot -Parent),
    [string[]]$Name = @(),
    [switch]$Quiet
)

$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot 'lib\yaml-lite.ps1')

$reg = ConvertFrom-YamlLite (Get-Content $RegistryPath -Raw)
$report = @()  # [ordered]@{ name; type; local; remote; tag; updated; summary[] }

foreach ($sectionName in @('base', 'vertical')) {
    foreach ($item in @($reg.$sectionName)) {
        if (-not $item.enabled) { continue }
        if ($Name.Count -gt 0 -and $item.name -notin $Name) { continue }
        if ([string]::IsNullOrWhiteSpace($item.repo)) { continue }
        $path = Join-Path $RepoRoot $item.path
        if (-not (Test-Path (Join-Path $path '.git'))) {
            Write-Host "[update][WARN] $($item.name): $path 不是 git 仓库, 跳过" -ForegroundColor Yellow
            continue
        }

        $entry = [ordered]@{ name = $item.name; type = $sectionName; local = ''; remote = ''; tag = $null; updated = $false; summary = @() }

        # 本地状态
        $entry.local = (git -C $path rev-parse --short HEAD 2>$null)
        $tag = (git -C $path describe --tags --abbrev=0 2>$null)
        if ($LASTEXITCODE -eq 0 -and $tag) { $entry.tag = $tag }

        # 远端默认分支
        $head = (git -C $path ls-remote --symref origin HEAD 2>$null | Select-String 'refs/heads/(\S+)' | Select-Object -First 1)
        $branch = $null
        if ($head -and $head.Matches.Count -gt 0) { $branch = $head.Matches[0].Groups[1].Value }
        if (-not $branch) { $branch = 'main' }

        # 远端 HEAD commit
        $entry.remote = (git -C $path ls-remote origin $branch 2>$null | ForEach-Object { ($_ -split '\s+')[0].Substring(0, 7) })

        if ($entry.remote -and $entry.remote -ne $entry.local) {
            $entry.updated = $true
            # fetch 拿变更列表
            git -C $path fetch origin $branch --quiet 2>$null
            $logs = git -C $path log --oneline "$($entry.local)..origin/$branch" 2>$null | Select-Object -First 12
            if ($logs) {
                $entry.summary = @($logs)
                # 检查 CHANGELOG 是否有新条目
                $cl = Join-Path $path 'CHANGELOG.md'
                if (Test-Path $cl) {
                    $remoteCl = (git -C $path show "origin/$branch`:CHANGELOG.md" 2>$null | Select-Object -First 8)
                    $localCl = (Get-Content $cl -TotalCount 8 -ErrorAction SilentlyContinue)
                    if ($remoteCl -and (-not $localCl -or ($remoteCl -join "`n") -ne ($localCl -join "`n"))) {
                        $entry.summary += '  (CHANGELOG.md 有更新, 见远端头部条目)'
                    }
                }
            }
        }
        $report += $entry
    }
}

# ---------- 输出 ----------
$updated = @($report | Where-Object { $_.updated })
$current = @($report | Where-Object { -not $_.updated })

if (-not $Quiet) {
    Write-Host "=== 可更新 ($($updated.Count)) ==="
    if ($updated.Count -eq 0) { Write-Host "  全部为最新" -ForegroundColor Green }
    foreach ($e in $updated) {
        Write-Host ""
        Write-Host "[$($e.type)] $($e.name)" -ForegroundColor Yellow
        Write-Host "  本地: $($e.local)$(if ($e.tag) { " ($($e.tag))" })  远端: $($e.remote)"
        Write-Host "  变更:"
        foreach ($s in $e.summary) { Write-Host "    $s" }
        if ($e.type -eq 'base') {
            Write-Host "  应用: cd $($e.name -replace '^.*$', (Join-Path $RepoRoot $item.path)) ; git pull --rebase   # 或 git checkout <新tag>"
        } else {
            Write-Host "  应用: git -C <path> pull"
        }
    }
    Write-Host ""
    Write-Host "=== 已是最新 ($($current.Count)) ==="
    foreach ($e in $current) {
        Write-Host "  [OK] $($e.name): $($e.local)$(if ($e.tag) { " ($($e.tag))" })" -ForegroundColor DarkGray
    }
}
exit 0
