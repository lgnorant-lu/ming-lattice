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
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
. (Join-Path $PSScriptRoot 'lib/registry.ps1')
$startedAt = [Diagnostics.Stopwatch]::StartNew()

try {
    $reg = Read-SkillRegistry -RegistryPath $RegistryPath
} catch {
    $eventSpec = [ordered]@{
        event = 'lint.checked'
        duration = $startedAt.Elapsed.TotalMilliseconds
        ok = $false
        errorCode = 'lint_failed'
        fields = [ordered]@{ sources_checked = 0; error_count = 1; warn_count = 0; info_count = 0 }
    }
    try { $emitErr = $eventSpec | ConvertTo-Json -Compress -Depth 5 | & node (Join-Path $PSScriptRoot 'emit-operational-event.mjs') 2>&1 | Out-String; if ($emitErr.Trim()) { Write-Host "[telemetry] $($emitErr.Trim())" -ForegroundColor DarkGray } } catch { }
    if ($Json) {
        ConvertTo-Json -InputObject @([ordered]@{ level = 'E'; name = 'registry'; msg = $_.Exception.Message; file = $RegistryPath })
    } else {
        [Console]::Error.WriteLine($_.Exception.Message)
    }
    exit 1
}

# ---------- 收集全部候选源（含未启用的条目, 便于提前发现待修复/待采集项） ----------
$sources = @()
foreach ($base in @($reg.base)) {
    if ($null -eq $base) { continue }
    foreach ($modName in @($base.modules.Keys)) {
        $sources += [ordered]@{ name = $modName; src = Join-Path $RepoRoot (Join-Path $base.path "skills\$modName"); enabled = $base.enabled; kind = 'module' }
    }
}
foreach ($sectionName in @('vertical', 'deployable', 'private')) {
    foreach ($item in @($reg.$sectionName)) {
        if ($null -eq $item) { continue }
        $kind = if ($sectionName -eq 'vertical' -and @($item.deploy.Values | Where-Object { $_ -eq $true }).Count -eq 0) { 'ref' } else { 'module' }
        $sources += [ordered]@{ name = $item.name; src = Join-Path $RepoRoot $item.path; enabled = $item.enabled; kind = $kind; repo = $item.repo; gone = $item.sourceGone }
    }
}

$issues = @()  # [ordered]@{ level; name; msg; file }

# ---------- registry 语义对账：weight 封闭词表 ----------
# deploy 客户名⊆targets 已由 registry.ps1 载入期 registry_unknown_client 兜底；
# weight 错拼（如 hevy）会静默按 core 并入默认物化面——危险向 fail-open，lint 先拦
foreach ($sectionName in @('vertical', 'deployable', 'private')) {
    foreach ($item in @($reg.$sectionName)) {
        if ($null -eq $item) { continue }
        if ($item.weight -and @('core', 'heavy') -notcontains $item.weight) {
            $issues += [ordered]@{ level = 'E'; name = $item.name; msg = "weight=$($item.weight) 出封闭词表 {core|heavy}（错拼会静默并入默认物化面）"; file = $RegistryPath }
        }
    }
}

# ---------- .gitignore ↔ sourceGone 孤本白名单双向对账 ----------
# vertical/ 默认全忽略——孤本入库靠 .gitignore `!vertical/<name>/` 放行。
# 两处手工同步必漂：registry 标了 sourceGone 忘改 .gitignore → 字节被默认拦截
# 永不可提交；.gitignore 放行了 registry 没标 → 白名单悬空语义不清。
$gitignorePath = Join-Path $RepoRoot '.gitignore'
if (Test-Path $gitignorePath) {
    $unignored = @((Get-Content $gitignorePath) | ForEach-Object {
        # 仅字面叶子目录名才算孤本放行——!vertical/** 类通配属点文件豁免轴，
        # 与 sourceGone 白名单语义不同轴，不参与对账
        if ($_ -match '^!vertical/([A-Za-z0-9._-]+)/?\s*$') { $Matches[1] }
    })
    $goneLeaves = @()
    foreach ($item in @($reg.vertical)) {
        if ($item.sourceGone -ne $true) { continue }
        $leaf = (($item.path -replace '\\', '/') -replace '^vertical/', '') -replace '/$', ''
        $goneLeaves += $leaf
        if ($leaf -notin $unignored) {
            $issues += [ordered]@{ level = 'E'; name = $item.name; msg = "sourceGone 孤本未在 .gitignore 放行（需 !vertical/$leaf/）——字节被默认拦截不可提交"; file = $gitignorePath }
        }
    }
    foreach ($leaf in $unignored) {
        if ($leaf -notin $goneLeaves) {
            $issues += [ordered]@{ level = 'W'; name = "vertical/$leaf"; msg = '.gitignore 放行但 registry 无 sourceGone:true——白名单悬空（漏标或残留）'; file = $gitignorePath }
        }
    }
}

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
        # 物化区缺席容忍: vertical ref 条目目录不存在且有 repo → 远端仅存索引, 字节由 fetch 物化
        if (-not (Test-Path $s.src)) {
            if ($s.repo -and $s.gone -ne $true) {
                $issues += [ordered]@{ level = 'I'; name = $s.name; msg = '未物化（远端仅索引, node scripts/fetch.mjs 待跑）'; file = $skillMd }
                continue
            }
            if ($s.gone -eq $true) {
                $issues += [ordered]@{ level = 'E'; name = $s.name; msg = '孤本目录缺失（sourceGone 条目必须入库承载字节）'; file = $skillMd }
                continue
            }
        }
        # 参考源: 宽松——递归找 SKILL.md 或 CLAUDE.md/README.md（排除 .git）
        $nestedSkill = Get-ChildItem $s.src -Recurse -Depth 2 -Filter 'SKILL.md' -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '\\\.git\\' } | Select-Object -First 1
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

    $content = Get-Content -LiteralPath $skillMd -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
    if ([string]::IsNullOrWhiteSpace($content)) {
        $issues += [ordered]@{ level = 'E'; name = $s.name; msg = 'SKILL.md 为空'; file = $skillMd }
        continue
    }

    # frontmatter
    if ($content -match '(?s)^---\s*\n(.*?)\n---') {
        $fm = $Matches[1]
        $level = if ($s.kind -eq 'module' -and $s.enabled) { 'E' } else { 'W' }
        if ($fm -notmatch '(?m)^name\s*:') { $issues += [ordered]@{ level = $level; name = $s.name; msg = 'frontmatter 缺 name'; file = $skillMd } }
        elseif ($s.kind -eq 'module') {
            $declared = [regex]::Match($fm, '(?m)^name\s*:\s*([^\r\n]+)').Groups[1].Value.Trim().Trim('"', "'")
            if ($declared -cne $s.name) { $issues += [ordered]@{ level = $level; name = $s.name; msg = "skill_name_mismatch: $declared"; file = $skillMd } }
        }
        if ($fm -notmatch '(?m)^description\s*:') { $issues += [ordered]@{ level = $level; name = $s.name; msg = 'frontmatter 缺 description'; file = $skillMd } }
        else {
            # description 质量检查（第一层路由依据）
            $desc = Get-SkillDescription -Frontmatter $fm
            if ([string]::IsNullOrWhiteSpace($desc)) {
                $issues += [ordered]@{ level = $level; name = $s.name; msg = 'description 为空'; file = $skillMd }
            }
            elseif ($desc.Length -lt 20) {
                $issues += [ordered]@{ level = 'W'; name = $s.name; msg = "description 过短($($desc.Length) 字符), 路由触发会不准: $desc"; file = $skillMd }
            }
            elseif ($desc -match '使用\s+\S+(-mcp|-server)|when using|requires? the') {
                $issues += [ordered]@{ level = 'I'; name = $s.name; msg = "description 绑定具体工具名(工具不在则漏触发): $desc"; file = $skillMd }
            }
        }
    } else {
        $level = if ($s.kind -eq 'module' -and $s.enabled) { 'E' } else { 'W' }
        $issues += [ordered]@{ level = $level; name = $s.name; msg = '无 frontmatter（--- 块缺失）'; file = $skillMd }
    }

    # 相对引用检查（排除 http/mailto/锚点）——先剥代码围栏：map['a'](1, 2) 类代码不是链接（audit-domains 同族缺陷）
    $linkLines = @(); $inFence = $false
    foreach ($l in ($content -split "`r?`n")) {
        if ($l -match '^\s*(```|~~~)') { $inFence = -not $inFence; continue }
        # 行内 code-span 同样剥除——`[x](y)` 文档样例不是链接（ming-boundary
        # 自文档化陷阱面；自身踩中即 dogfooding 证据）
        if (-not $inFence) { $linkLines += ($l -replace '``[^`]*``|`[^`]*`', '') }
    }
    $linkContent = $linkLines -join "`n"
    foreach ($m in [regex]::Matches($linkContent, '\]\(([^)]+)\)')) {
        $ref = $m.Groups[1].Value
        if ($ref -match '^(https?://|mailto:|#)') { continue }
        $refPath = ($ref -split '#')[0]
        if ($refPath -eq '' -or $refPath -match '^[A-Za-z]:[\\/]') { continue }  # 空引用 / 绝对盘符路径跳过
        if ($refPath -match '^(url|text|alt|link|path|file|xxx|example)$') { continue }  # markdown 语法示例占位符
        $full = Join-Path (Split-Path $skillMd -Parent) ($refPath -replace '/', '\')
        # 越包链接判据：整包符号链接部署后，'..' 出包即指向客户端目录——
        # 本地仓内存在的目标在部署端必是断链（false-green 缺口类）
        $resolved = [IO.Path]::GetFullPath($full)
        $srcRoot = [IO.Path]::GetFullPath($s.src).TrimEnd('\', '/')
        if (-not $resolved.StartsWith($srcRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
            $issues += [ordered]@{ level = 'W'; name = $s.name; msg = "链接越出包根(部署后断链): $ref"; file = $skillMd }
        } elseif (-not (Test-Path $full)) {
            $issues += [ordered]@{ level = 'W'; name = $s.name; msg = "引用的文件不存在: $ref"; file = $skillMd }
        }
    }

    # 硬编码绝对路径（他人机器特征）: Windows 用户目录 = W; Linux /home//root = I(CTF 题目路径常见)
    if ($content -match 'C:\\Users\\[^\\]+\\') {
        $issues += [ordered]@{ level = 'W'; name = $s.name; msg = "含硬编码 Windows 用户路径: $($Matches[0])"; file = $skillMd }
    }
    elseif ($content -match '/home/[^/]+/|/root/') {
        $issues += [ordered]@{ level = 'I'; name = $s.name; msg = "含 Linux 路径(可能为题目示例): $($Matches[0])"; file = $skillMd }
    }
    foreach ($scriptFile in (Get-ChildItem (Join-Path $s.src 'scripts') -File -ErrorAction SilentlyContinue)) {
        $sc = Get-Content $scriptFile.FullName -Raw -ErrorAction SilentlyContinue
        if ($sc -and $sc -match 'C:\\Users\\[^\\]+\\') {
            $issues += [ordered]@{ level = 'W'; name = $s.name; msg = "scripts 含硬编码绝对路径: $($Matches[0])"; file = $scriptFile.Name }
        }
    }

    # 空壳检测: 目录内除 SKILL.md 外没有任何内容（排除 .git）
    $otherFiles = @(Get-ChildItem $s.src -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne 'SKILL.md' -and $_.FullName -notmatch '\\\.git\\' })
    if ($otherFiles.Count -eq 0) {
        $issues += [ordered]@{ level = 'I'; name = $s.name; msg = '单文件 skill（无 references/scripts），检查是否够用'; file = $skillMd }
    }
}

# ---------- SoT 配置面：registry.yaml/.hooksrc 等治理配置的硬编码用户路径 ----------
# 背景: registry targets 曾烙 C:\Users\xxx 本机路径（已改 %USERPROFILE% 占位）——
# SKILL.md/scripts 扫描面不覆盖 SoT 配置，此类缺陷漏网过，须独立断言防回归
$sotFiles = @($RegistryPath, (Join-Path $RepoRoot '.hooksrc'), (Join-Path $RepoRoot '.hooksrc.tmpl'))
# .ming/ 命名域配置同属 SoT 面（state/ 本机态除外——gitignored 不审）
$sotFiles += @(Get-ChildItem (Join-Path $RepoRoot '.ming') -Recurse -Filter '*.yaml' -File -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch '[\\/]state[\\/]' } | ForEach-Object { $_.FullName })
foreach ($sotFile in $sotFiles) {
    if (-not (Test-Path -LiteralPath $sotFile -PathType Leaf)) { continue }
    $sotContent = Get-Content -LiteralPath $sotFile -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
    if ([string]::IsNullOrWhiteSpace($sotContent)) { continue }
    $sotName = Split-Path $sotFile -Leaf
    if ($sotContent -match 'C:\\Users\\[^\\]+\\') {
        $issues += [ordered]@{ level = 'E'; name = $sotName; msg = "SoT 配置含硬编码用户路径(应改 %USERPROFILE% 等环境占位): $($Matches[0])"; file = $sotFile }
    }
    else {
        # 注释行豁免——# 开头行是文档（如 pii 门规则自述提及 /home/），非真实配置值
        $sotActive = @($sotContent -split "`r?`n" | Where-Object { $_ -notmatch '^\s*#' }) -join "`n"
        if ($sotActive -match '/home/[^/]+/|/root/') {
            $issues += [ordered]@{ level = 'W'; name = $sotName; msg = "SoT 配置含 Linux 绝对路径: $($Matches[0])"; file = $sotFile }
        }
    }
}

# ---------- 反向孤儿：fs 有目录但 registry 无条目（命名空间容器豁免） ----------
$registeredPaths = @{}
foreach ($base in @($reg.base)) {
    if ($null -eq $base) { continue }
    $registeredPaths[($base.path -replace '\\','/')] = $true
}
foreach ($sectionName in @('vertical', 'deployable', 'private')) {
    foreach ($item in @($reg.$sectionName)) {
        if ($null -eq $item -or -not $item.path) { continue }
        $registeredPaths[($item.path -replace '\\','/')] = $true
    }
}
# 浅层枚举：vertical/*/deployable/*/private/* ~ private/*/*/*（命名空间最多两层；
# 已登记包/含 SKILL.md 的目录不下钻——包内 references/scripts 是包的内容不是孤儿）
$orphanScanDirs = @()
foreach ($r in @('vertical', 'deployable', 'private')) {
    $abs = Join-Path $RepoRoot $r
    if (Test-Path $abs) { $orphanScanDirs += @(Get-ChildItem $abs -Directory -ErrorAction SilentlyContinue) }
}
foreach ($p1 in @(Get-ChildItem (Join-Path $RepoRoot 'private') -Directory -ErrorAction SilentlyContinue)) {
    $rel1 = $p1.FullName.Substring($RepoRoot.Length).TrimStart('\', '/').Replace('\', '/')
    if ($registeredPaths.ContainsKey($rel1) -or (Test-Path (Join-Path $p1.FullName 'SKILL.md'))) { continue }
    $orphanScanDirs += @(Get-ChildItem $p1.FullName -Directory -ErrorAction SilentlyContinue)
    foreach ($p2 in @(Get-ChildItem $p1.FullName -Directory -ErrorAction SilentlyContinue)) {
        $rel2 = $p2.FullName.Substring($RepoRoot.Length).TrimStart('\', '/').Replace('\', '/')
        if ($registeredPaths.ContainsKey($rel2) -or (Test-Path (Join-Path $p2.FullName 'SKILL.md'))) { continue }
        $orphanScanDirs += @(Get-ChildItem $p2.FullName -Directory -ErrorAction SilentlyContinue)
    }
}
foreach ($d in $orphanScanDirs) {
    $rel = $d.FullName.Substring($RepoRoot.Length).TrimStart('\', '/').Replace('\', '/')
    if ($registeredPaths.ContainsKey($rel)) { continue }
    if ($d.Name -match '^[._]') { continue }                       # .claude/_proposals 等惯例目录
    if (Test-Path (Join-Path $d.FullName 'SKILL.md')) {
        $issues += [ordered]@{ level = 'W'; name = $d.Name; msg = "孤儿目录：$rel 有 SKILL.md 但 registry 无条目（漏登记）"; file = $d.FullName }
        continue
    }
    # 命名空间容器豁免：某后代已登记或含 SKILL.md 包
    $isNamespace = $false
    foreach ($k in $registeredPaths.Keys) { if ($k.StartsWith("$rel/")) { $isNamespace = $true; break } }
    if (-not $isNamespace) {
        $isNamespace = [bool](Get-ChildItem $d.FullName -Directory -ErrorAction SilentlyContinue | Where-Object { Test-Path (Join-Path $_.FullName 'SKILL.md') } | Select-Object -First 1)
    }
    if (-not $isNamespace -and $rel -match '^vertical/') {
        $issues += [ordered]@{ level = 'W'; name = $d.Name; msg = "孤儿物化目录：$rel 存在但 registry 无条目（残留，可删可补登）"; file = $d.FullName }
    } elseif (-not $isNamespace) {
        $issues += [ordered]@{ level = 'W'; name = $d.Name; msg = "孤儿目录：$rel 存在但 registry 无条目"; file = $d.FullName }
    }
}

# ---------- 输出 ----------
$e = @($issues | Where-Object { $_.level -eq 'E' }).Count
$w = @($issues | Where-Object { $_.level -eq 'W' }).Count
$i = @($issues | Where-Object { $_.level -eq 'I' }).Count
if ($Json) {
    ConvertTo-Json -InputObject @($issues) -Depth 4
} else {
    foreach ($iss in $issues) {
        switch ($iss.level) { 'E' { Write-Host "[E] $($iss.name): $($iss.msg)" -ForegroundColor Red }
                              'W' { Write-Host "[W] $($iss.name): $($iss.msg)" -ForegroundColor Yellow }
                              'I' { Write-Host "[I] $($iss.name): $($iss.msg)" -ForegroundColor Cyan } }
    }
    Write-Host ""
    Write-Host "[lint] 检查 $($sources.Count) 个源 → ERROR=$e WARN=$w INFO=$i"
}
$eventSpec = [ordered]@{
    event = 'lint.checked'
    duration = $startedAt.Elapsed.TotalMilliseconds
    ok = ($e -eq 0)
    errorCode = if ($e -gt 0) { 'lint_failed' } else { $null }
    fields = [ordered]@{ sources_checked = $sources.Count; error_count = $e; warn_count = $w; info_count = $i }
}
try { $emitErr = $eventSpec | ConvertTo-Json -Compress -Depth 5 | & node (Join-Path $PSScriptRoot 'emit-operational-event.mjs') 2>&1 | Out-String; if ($emitErr.Trim()) { Write-Host "[telemetry] $($emitErr.Trim())" -ForegroundColor DarkGray } } catch { }
if ($e -gt 0) { exit 1 } else { exit 0 }
