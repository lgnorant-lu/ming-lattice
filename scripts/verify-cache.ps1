# verify-cache.ps1 — 校验 registry 各条目的 checkCache 完整性（update.ps1 回写验证用）
param(
    [string]$RegistryPath = (Join-Path (Split-Path $PSScriptRoot -Parent) 'registry.yaml')
)
. (Join-Path $PSScriptRoot 'lib\yaml-lite.ps1')
$d = ConvertFrom-YamlLite (Get-Content $RegistryPath -Raw)
$ok = 0; $missing = @(); $stale = @()
foreach ($s in @('base', 'vertical')) {
    foreach ($i in @($d.$s)) {
        if ($null -eq $i.checkCache) { $missing += $i.name; continue }
        $ok++
        if ([string]::IsNullOrWhiteSpace($i.checkCache.lastRemoteHead)) { $stale += "$($i.name)(empty head)" }
    }
}
Write-Host "checkCache 已写: $ok"
if ($missing.Count) { Write-Host "缺失: $($missing -join ', ')" -ForegroundColor Yellow }
if ($stale.Count) { Write-Host "异常: $($stale -join ', ')" -ForegroundColor Yellow }
if ($missing.Count -eq 0 -and $stale.Count -eq 0) { Write-Host "全部完好" -ForegroundColor Green }
