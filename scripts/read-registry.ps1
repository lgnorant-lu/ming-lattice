param([string]$RegistryPath = (Join-Path (Split-Path $PSScriptRoot -Parent) 'registry.yaml'))

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
. (Join-Path $PSScriptRoot 'lib/registry.ps1')
try {
    Read-SkillRegistry -RegistryPath $RegistryPath | ConvertTo-Json -Depth 30
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
