# patch-deployable.ps1 — deployable 层 SKILL.md frontmatter 投影写器（所有权: frontmatter 终态）
# 所有权边界: build-deployable 管结构(目录/符号链接/SKILL.md 引导字节，"存在即维护件不覆写");
#             本脚本管 frontmatter 投影(name=目录名恒等 + description=registry desc 声明),
#             每轮重写 frontmatter 字段。两写器不同层, 勿合并——build 的维护件保护语义
#             与本件的每轮投影语义不兼容。
# 数据来源: description 精要文本归 registry.yaml deployable.<name>.desc (单一事实源,
#           脚本内不再另立改写表——原 Set-NameDesc 硬编码表已迁出)
# 规则:
#   1. frontmatter name 唯一化/恒等化（name 契约恒等于目录名）
#   2. description 精要化（registry desc 声明驱动; 未声明条目不动 description）
#   3. 已知问题修复: ${CLAUDE_PLUGIN_ROOT} 替换 / 硬编码他人路径（变换规则留本件, 属投影非条目数据）
# 用法: pwsh scripts/patch-deployable.ps1 [-WhatIf] [-DeployableDir <dir>]

[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$DeployableDir = (Join-Path (Split-Path $PSScriptRoot -Parent) 'deployable'),
    [string]$RepoRoot = (Split-Path $PSScriptRoot -Parent)
)

$ErrorActionPreference = 'Continue'
$dep = $DeployableDir
if (-not (Test-Path $dep)) { Write-Host "[ERROR] deployable 目录不存在: $dep" -ForegroundColor Red; exit 1 }
. (Join-Path $PSScriptRoot 'lib/registry.ps1')
$reg = Read-SkillRegistry -RegistryPath (Join-Path $RepoRoot 'registry.yaml')

function Set-NameDesc($dir, $newName, $newDesc) {
    $f = Join-Path $dep "$dir\SKILL.md"
    if (-not (Test-Path $f)) { Write-Host "[WARN] 无 SKILL.md: $dir" -ForegroundColor Yellow; return }
    $t = Get-Content $f -Raw
    if ($t -match '(?ms)^---\s*\n(.*?)\n---') {
        $fm = $Matches[1]
        $body = $t.Substring($Matches[0].Length)
        # description 多行块（| 或 >）: 整块替换（可能吃掉后续 name 行, 需重建）
        if ($fm -match '(?ms)description\s*:\s*[|>]') {
            $fm = [regex]::Replace($fm, '(?ms)^description\s*:.*?(?=^\S|\z)', "description: $newDesc")
        }
        # name: 有则替换, 无则插入到 frontmatter 顶部（避免 description 块吞掉）
        if ($fm -match '(?m)^name\s*:') {
            $fmNew = ($fm -replace '(?m)^name\s*:.*$', "name: $newName") -replace '(?m)^description\s*:.*$', "description: $newDesc"
        } else {
            $fmNew = "name: $newName`n" + ($fm -replace '(?m)^description\s*:.*$', "description: $newDesc")
        }
        if ($PSCmdlet.ShouldProcess($f, "改写 frontmatter name=$newName")) {
            Set-Content -Path $f -Value ("---`n" + $fmNew + "`n---" + $body) -Encoding UTF8
            Write-Host "[OK] $dir -> name: $newName"
        }
    } else {
        Write-Host "[WARN] 无 frontmatter: $dir" -ForegroundColor Yellow
    }
}

function Fix-Paths($dir, $pattern, $replacement) {
    foreach ($f in @(Get-Item -LiteralPath (Join-Path $dep "$dir/SKILL.md") -ErrorAction SilentlyContinue)) {
        $t = Get-Content $f.FullName -Raw -ErrorAction SilentlyContinue
        if ($t -and $t -match $pattern) {
            $t2 = $t -replace $pattern, $replacement
            if ($t2 -ne $t -and $PSCmdlet.ShouldProcess($f.FullName, "路径修复 $pattern")) {
                Set-Content -Path $f.FullName -Value $t2 -Encoding UTF8
                Write-Host "[FIX] $($f.FullName.Replace($dep, '.'))"
            }
        }
    }
}

# ── 1. name 恒等 + description 精要（registry desc 声明驱动，无硬编码表）──────
foreach ($item in @($reg.deployable)) {
    if (-not $item.desc) { continue }
    Set-NameDesc ([string]$item.name) ([string]$item.name) ([string]$item.desc)
}

# ── 2. 路径修复 ────────────────────────────────────────────────
# Resolve SKILL_ROOT through the host; never rewrite linked upstream resources.
Fix-Paths 'android-reverse' '\$\{CLAUDE_PLUGIN_ROOT\}/skills/android-reverse-engineering' '$$SKILL_ROOT'
Fix-Paths 'ios-reverse' '\$\{CLAUDE_PLUGIN_ROOT\}/skills/ios-reverse-engineering' '$$SKILL_ROOT'
foreach ($name in @('android-reverse', 'ios-reverse')) {
    Fix-Paths $name 'bash (\$SKILL_ROOT/scripts/[A-Za-z0-9_.-]+)' 'bash "$1"'
}
# xbs 硬编码他人路径 → 说明性占位
Fix-Paths 'xbs-ast-deobfuscation' 'C:\\Users\\25198\\(?:\\[\w.-]+)*' '%USERPROFILE%\\.codex\\skills'

# ── 3. name 恒等扫（自动面——name 契约恒等于目录名, 新 mirror 无需再登表）─────
# description 精要化是编辑判断留在上表；name 对齐是纯机械规则, 全覆盖 deployable/*
foreach ($dirItem in Get-ChildItem $dep -Directory) {
    $f = Join-Path $dirItem.FullName 'SKILL.md'
    if (-not (Test-Path $f)) { continue }
    $t = Get-Content $f -Raw
    if ($t -notmatch '(?ms)^---\s*\n(.*?)\n---') { continue }
    $fm = $Matches[1]
    $cur = [regex]::Match($fm, '(?m)^name\s*:\s*([^\r\n]+)')
    if ($cur.Success -and $cur.Groups[1].Value.Trim().Trim('"', "'") -ne $dirItem.Name) {
        $fmNew = $fm -replace '(?m)^name\s*:.*$', "name: $($dirItem.Name)"
        $body = $t.Substring($Matches[0].Length)
        if ($PSCmdlet.ShouldProcess($f, "name 对齐目录名 $($dirItem.Name)")) {
            Set-Content -Path $f -Value ("---`n" + $fmNew + "`n---" + $body) -Encoding UTF8
            Write-Host "[FIX-NAME] $($dirItem.Name)"
        }
    }
}

Write-Host "`npatch 完成"
