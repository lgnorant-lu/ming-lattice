# lint.ps1 — 校验 registry 中所有部署单元的结构完整性
# 检查项:
#   [E] SKILL.md 缺失
#   [W] frontmatter 缺 name / description
#   [W] SKILL.md 中引用的相对文件不存在（references/、scripts/ 等）
#   [W] SKILL.md / scripts 中硬编码了他人机器的绝对路径（如 C:\Users\xxx\）
#   [I] 空壳目录（有名字无实质内容）
# 退出码: 0=无错误  1=存在 ERROR
#
# 用法: powershell -File scripts/lint.ps1

param(
    [string]$RegistryPath = (Join-Path (Split-Path $PSScriptRoot -Parent) 'registry.yaml'),
    [string]$RepoRoot = (Split-Path $PSScriptRoot -Parent),
    [switch]$Json      # 输出机器可读 JSON（供 CI / 自动化）
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\yaml-lite.ps1')

$reg = ConvertFrom-YamlLite (Get-Content $RegistryPath -Raw)

# ---------- 收集全部候选源（含未启用的条目, 便于提前发现待修复/待采集项） ----------
$sources = @()
foreach ($base in @($reg.base)) {
    foreach ($modName in @($base.modules.Keys)) {
        $sources += [ordered]@{ name = $modName; src = Join-Path $RepoRoot (Join-Path $base.path "skills\$modName"); enabled = $base.enabled; kind = 'module' }
    }
}
foreach ($sectionName in @('vertical', 'private')) {
    foreach ($item in @($reg.$sectionName)) {
        $sources += [ordered]@{ name = $item.name; src = Join-Path $RepoRoot $item.path; enabled = $item.enabled; kind = 'ref' }
    }
}

$issues = @()  # [ordered]@{ level; name; msg; file }

foreach ($s in $sources) {
    $skillMd = Join-Path $s.src 'SKILL.md'
    if (-not (Test-Path $skillMd)) {
        if (-not $s.enabled) {
            $issues += [ordered]@{ level = 'I'; name = $s.name; msg = '未采集（registry 登记, enabled=false）'; file = $skillMd }
            continue
        }
        if ($s.kind -eq 'module') {
            $issues += [ordered]@{ level = 'E'; name = $s.name; msg = 'SKILL.md 缺失（部署模块必须）'; file = $skillMd }
            continue
        }
        # 参考源: 宽松——递归找 SKILL.md 或 CLAUDE.md/README.md
        $nestedSkill = Get-ChildItem $s.src -Recurse -Depth 2 -Filter 'SKILL.md' -File -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($nestedSkill) {
            $issues += [ordered]@{ level = 'I'; name = $s.name; msg = "参考型: 子目录 SKILL.md ($($nestedSkill.FullName.Replace($s.src, '.')))"; file = $nestedSkill.FullName }
            $skillMd = $nestedSkill.FullName
        } elseif ((Test-Path (Join-Path $s.src 'CLAUDE.md')) -or (Test-Path (Join-Path $s.src 'README.md')) -or (Test-Path (Join-Path $s.src 'AGENTS.md'))) {
            $issues += [ordered]@{ level = 'I'; name = $s.name; msg = '参考型: 无 SKILL.md, 有 CLAUDE.md/README.md/AGENTS.md'; file = $skillMd }
            continue
        } else {
            $issues += [ordered]@{ level = 'E'; name = $s.name; msg = '空壳（无 SKILL.md 也无 README/CLAUDE/AGENTS）'; file = $skillMd }
            continue
        }
    }

    $content = Get-Content $skillMd -Raw -ErrorAction SilentlyContinue
    if ([string]::IsNullOrWhiteSpace($content)) {
        $issues += [ordered]@{ level = 'E'; name = $s.name; msg = 'SKILL.md 为空'; file = $skillMd }
        continue
    }

    # frontmatter
    if ($content -match '(?s)^---\s*\n(.*?)\n---') {
        $fm = $Matches[1]
        if ($fm -notmatch '(?m)^name\s*:') { $issues += [ordered]@{ level = 'W'; name = $s.name; msg = 'frontmatter 缺 name'; file = $skillMd } }
        if ($fm -notmatch '(?m)^description\s*:') { $issues += [ordered]@{ level = 'W'; name = $s.name; msg = 'frontmatter 缺 description'; file = $skillMd } }
    } else {
        $issues += [ordered]@{ level = 'W'; name = $s.name; msg = '无 frontmatter（--- 块缺失）'; file = $skillMd }
    }

    # 相对引用检查（排除 http/mailto/锚点）
    foreach ($m in [regex]::Matches($content, '\]\(([^)]+)\)')) {
        $ref = $m.Groups[1].Value
        if ($ref -match '^(https?://|mailto:|#)') { continue }
        $refPath = ($ref -split '#')[0]
        if ($refPath -eq '' -or $refPath -match '^[A-Za-z]:[\\/]') { continue }  # 空引用 / 绝对盘符路径跳过
        if ($refPath -match '^(url|text|alt|link|path|file|xxx|example)$') { continue }  # markdown 语法示例占位符
        $full = Join-Path (Split-Path $skillMd -Parent) ($refPath -replace '/', '\')
        if (-not (Test-Path $full)) {
            $issues += [ordered]@{ level = 'W'; name = $s.name; msg = "引用的文件不存在: $ref"; file = $skillMd }
        }
    }

    # 硬编码绝对路径（他人机器特征）
    if ($content -match 'C:\\Users\\[^\\]+\\|/home/[^/]+/|/root/') {
        $issues += [ordered]@{ level = 'W'; name = $s.name; msg = "含硬编码绝对路径（疑似他人机器）: $($Matches[0])"; file = $skillMd }
    }
    foreach ($scriptFile in (Get-ChildItem (Join-Path $s.src 'scripts') -File -ErrorAction SilentlyContinue)) {
        $sc = Get-Content $scriptFile.FullName -Raw -ErrorAction SilentlyContinue
        if ($sc -and $sc -match 'C:\\Users\\[^\\]+\\') {
            $issues += [ordered]@{ level = 'W'; name = $s.name; msg = "scripts 含硬编码绝对路径: $($Matches[0])"; file = $scriptFile.Name }
        }
    }

    # 空壳检测: 目录内除 SKILL.md 外没有任何内容
    $otherFiles = @(Get-ChildItem $s.src -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne 'SKILL.md' })
    if ($otherFiles.Count -eq 0) {
        $issues += [ordered]@{ level = 'I'; name = $s.name; msg = '单文件 skill（无 references/scripts），检查是否够用'; file = $skillMd }
    }
}

# ---------- 输出 ----------
if ($Json) {
    $issues | ConvertTo-Json -Depth 4
} else {
    $e = 0; $w = 0; $i = 0
    foreach ($iss in $issues) {
        switch ($iss.level) { 'E' { $e++; Write-Host "[E] $($iss.name): $($iss.msg)" -ForegroundColor Red }
                              'W' { $w++; Write-Host "[W] $($iss.name): $($iss.msg)" -ForegroundColor Yellow }
                              'I' { $i++; Write-Host "[I] $($iss.name): $($iss.msg)" -ForegroundColor Cyan } }
    }
    Write-Host ""
    Write-Host "[lint] 检查 $($sources.Count) 个源 → ERROR=$e WARN=$w INFO=$i"
}
if ($e -gt 0) { exit 1 } else { exit 0 }
