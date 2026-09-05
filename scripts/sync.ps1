# sync.ps1 — 按 registry.yaml 把启用的 skill 部署到各客户端目录
# 链路: skills-collection/ →(symlink 或 copy fallback)→ 目标客户端 skills 目录（如 .cc-switch/skills → cc-switch 再分发到 ~/.claude/skills）
#
# 用法:
#   powershell -File scripts/sync.ps1                # 全量部署
#   powershell -File scripts/sync.ps1 -WhatIf        # 演练（不实际改动）
#   powershell -File scripts/sync.ps1 -Module ida-reverse   # 只部署某模块
#
# 行为:
#   - 目标已存在且来源不同 → 移入 .trash/<名称> 备份后重建
#   - 链接模式: 目录符号链接（跨卷 OK）；无权限时自动 fallback 为 robocopy 复制（mode: copy）
#   - 不删除 registry 中未启用条目的旧部署（由用户自行决定清理）

param(
    [string]$RegistryPath = (Join-Path (Split-Path $PSScriptRoot -Parent) 'registry.yaml'),
    [string]$RepoRoot = (Split-Path $PSScriptRoot -Parent),
    [Alias('DryRun')][switch]$WhatIf,
    [string[]]$Module = @()
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
. (Join-Path $PSScriptRoot 'lib\yaml-lite.ps1')

if (-not (Test-Path $RegistryPath)) { throw "registry 不存在: $RegistryPath" }
$reg = ConvertFrom-YamlLite (Get-Content $RegistryPath -Raw)
$targets = $reg.targets
$trash = Join-Path $RepoRoot '.trash'

# ---------- 收集部署单元 ----------
# 单元: [ordered]@{ name; src; clients = @('claude',...) ; source = 'base|vertical|private' }
$units = @()

foreach ($base in @($reg.base)) {
    if (-not $base.enabled) { continue }
    if ($Module.Count -gt 0) { $only = $Module } else { $only = $null }
    foreach ($modName in @($base.modules.Keys)) {
        if ($only -and $modName -notin $only) { continue }
        $clients = @($base.modules.$modName)
        if ($clients.Count -eq 0) { continue }
        $units += [ordered]@{
            name   = $modName
            src    = Join-Path $RepoRoot (Join-Path $base.path "skills\$modName")
            clients = $clients
            source = 'base'
        }
    }
}

foreach ($sectionName in @('vertical', 'deployable', 'private')) {
    foreach ($item in @($reg.$sectionName)) {
        if (-not $item.enabled) { continue }
        if ($Module.Count -gt 0 -and $item.name -notin $Module) { continue }
        $clients = @($item.deploy.Keys | Where-Object { $item.deploy.$_ -eq $true })  # 用 Keys 遍历, 避免枚举字典内置属性(Count 等)
        if ($clients.Count -eq 0) { continue }
        $units += [ordered]@{
            name    = $item.name
            src     = Join-Path $RepoRoot $item.path
            clients = $clients
            source  = $sectionName
        }
    }
}

if ($units.Count -eq 0) { Write-Host "[sync] 无部署单元（registry 为空或全部未启用）"; exit 0 }

# ---------- 部署 ----------
$modeStat = @{ link = 0; copy = 0; skip = 0; backup = 0 }
foreach ($u in $units) {
    if (-not (Test-Path $u.src)) {
        Write-Host "[sync][WARN] 源不存在, 跳过: $($u.src)" -ForegroundColor Yellow
        continue
    }
    foreach ($client in $u.clients) {
        if (-not $targets.PSObject.Properties.Name -contains $client) {
            Write-Host "[sync][WARN] 未定义的客户端 '$client'（registry targets 中不存在）" -ForegroundColor Yellow
            continue
        }
        $targetRoot = $targets.$client
        if ([string]::IsNullOrWhiteSpace($targetRoot)) { continue }
        $dst = Join-Path $targetRoot $u.name
        Write-Host "[sync] $($u.source)/$($u.name) -> $dst"

        if ($WhatIf) { Write-Host "        (演练) 链接或复制: $($u.src)"; continue }

        # 目标已存在 (含悬空符号链接)
        $existing = Get-Item -LiteralPath $dst -Force -ErrorAction SilentlyContinue
        if ($existing) {
            $same = $false
            try {
                if ($existing.LinkType -and $existing.Target) { 
                    $same = ($existing.Target -eq $u.src) -or ($existing.Target -eq (Resolve-Path $u.src -ErrorAction SilentlyContinue).Path)
                }
            } catch { $same = $false }
            if ($same) {
                Write-Host "        (跳过) 已链接同源" -ForegroundColor DarkGray
                $modeStat.skip++
                continue
            }
            # 若为旧符号链接/重解析点，直接删除重建；若为真实物理目录，备份到 .trash
            if ($existing.LinkType -or ($existing.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
                $existing.Delete()
                Write-Host "        (更新) 移除旧符号链接" -ForegroundColor DarkGray
            } else {
                $backup = Join-Path $trash $u.name
                $n = 1
                while (Test-Path $backup) { $backup = Join-Path $trash "$($u.name).$n"; $n++ }
                New-Item -ItemType Directory -Force -Path (Split-Path $backup -Parent) | Out-Null
                Move-Item $dst $backup -Force
                Write-Host "        (备份) 旧目标已移入 .trash\$($u.name)" -ForegroundColor DarkGray
                $modeStat.backup++
            }
        }

        # 建链接: symlink → fallback robocopy
        $linked = $false
        try {
            New-Item -ItemType SymbolicLink -Path $dst -Target $u.src -ErrorAction Stop | Out-Null
            $linked = $true
        } catch {
            Write-Host "        (fallback) 符号链接失败(需管理员/开发者模式), 改用复制: $($_.Exception.Message)" -ForegroundColor Yellow
        }
        if ($linked) {
            Write-Host "        (链接) symlink -> $($u.src)" -ForegroundColor Green
            $modeStat.link++
        } else {
            robocopy $u.src $dst /E /NFL /NDL /NJH /NJS /NP | Out-Null
            if ($LASTEXITCODE -lt 8) {
                Write-Host "        (复制) robocopy 完成" -ForegroundColor Green
                $modeStat.copy++
            } else {
                Write-Host "        [ERROR] robocopy 失败 (code=$LASTEXITCODE)" -ForegroundColor Red
            }
        }
    }
}

Write-Host ""
Write-Host "[sync] 完成: 链接=$($modeStat.link) 复制=$($modeStat.copy) 跳过=$($modeStat.skip) 备份=$($modeStat.backup)"
if ((Get-ChildItem $trash -ErrorAction SilentlyContinue | Measure-Object).Count -gt 0) {
    Write-Host "[sync] 提示: .trash 中有备份, 确认无误后可手动删除 (Remove-Item .trash -Recurse)"
}
