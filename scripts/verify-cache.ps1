# verify-cache.ps1 — 校验 registry 各条目的 checkCache 完整性（update.ps1 回写验证用）
param(
    [string]$RegistryPath = (Join-Path (Split-Path $PSScriptRoot -Parent) 'registry.yaml'),
    [switch]$Strict
)
. (Join-Path $PSScriptRoot 'lib\yaml-lite.ps1')
$d = ConvertFrom-YamlLite (Get-Content $RegistryPath -Raw)
$ok = 0; $missing = @(); $stale = @()
foreach ($s in @('base', 'vertical')) {
    foreach ($i in @($d.$s)) {
        if ($null -eq $i) { continue }
        if ($null -eq $i.checkCache) { $missing += $i.name; continue }
        $ok++
        # lastRemoteHead 须为字符串标量——裸 `key:` 在 yaml-lite 下解析为嵌套 map,
        # IsNullOrWhiteSpace 对 map 恒 false,畸形值会静默逃逸校验
        $head = $i.checkCache.lastRemoteHead
        if ($head -isnot [string] -or [string]::IsNullOrWhiteSpace($head)) { $stale += "$($i.name)(bad head)" }
    }
}
Write-Host "checkCache 已写: $ok"
if ($missing.Count) { Write-Host "缺失: $($missing -join ', ')" -ForegroundColor Yellow }
if ($stale.Count) { Write-Host "异常: $($stale -join ', ')" -ForegroundColor Yellow }
if ($missing.Count -eq 0 -and $stale.Count -eq 0) { Write-Host "全部完好" -ForegroundColor Green }
elseif ($Strict) { exit 1 }
