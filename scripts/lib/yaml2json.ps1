param([Parameter(Mandatory)][string]$Path)
# 通用 yaml-lite → JSON 桥（check-boundaries.mjs 等 mjs 工具消费 .yaml 声明面用）
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
. (Join-Path $PSScriptRoot 'yaml-lite.ps1')
try {
    ConvertFrom-YamlLite (Get-Content -Raw -Encoding UTF8 $Path) | ConvertTo-Json -Depth 30 -Compress
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
