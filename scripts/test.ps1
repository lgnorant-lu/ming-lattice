# scripts/test.ps1 — 一键运行 ming-skills 全量自动化测试套件
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent

node (Join-Path $repoRoot 'tests/run.mjs')
exit $LASTEXITCODE
