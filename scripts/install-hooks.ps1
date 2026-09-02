# scripts/install-hooks.ps1 — 一键安装与配置 ming-skills Git Hooks 门禁体系
# 行为: 配置 git core.hooksPath 指向 .githooks 目录

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$hooksDir = Join-Path $repoRoot '.githooks'

if (-not (Test-Path $hooksDir)) {
    New-Item -ItemType Directory -Path $hooksDir -Force | Out-Null
}

# 配置 git hooksPath
git -C $repoRoot config core.hooksPath .githooks

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  ming-skills Git Hooks 门禁体系安装成功！" -ForegroundColor Green
Write-Host "  - core.hooksPath = .githooks" -ForegroundColor Gray
Write-Host "  - commit-msg     : 强制 Conventional Commits 格式 + 禁 Emoji" -ForegroundColor Gray
Write-Host "  - pre-commit     : 编码防乱码 + 密钥防泄漏 + 大文件 + lint.ps1 验证" -ForegroundColor Gray
Write-Host "========================================================" -ForegroundColor Cyan
