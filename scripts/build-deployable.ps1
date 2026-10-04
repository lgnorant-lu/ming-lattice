# build-deployable.ps1 — 构建 deployable 部署层（一次性/可重复执行）
# 原理: deployable/<name>/SKILL.md 是改写件(frontmatter/description 可控);
#       其余内容(子目录)用符号链接指向源 — 单一事实源, 不复制内容
# 边表即 registry: mirror 件经 source: 字段声明上游源目录 (registry.yaml 唯一事实源,
#       禁止在脚本内另立映射——5 件手工镜像曾因此脱离构建面)
# 用法: pwsh scripts/build-deployable.ps1 [-Module a,b] [-WhatIf]

[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$RepoRoot = (Split-Path $PSScriptRoot -Parent),
    [string[]]$Module = @()
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib/registry.ps1')
$root = $RepoRoot
$dep = Join-Path $root 'deployable'

$reg = Read-SkillRegistry -RegistryPath (Join-Path $root 'registry.yaml')
# 边表: deployable 名 -> source 上游源目录（registry.yaml SoT）
$map = [ordered]@{}
foreach ($item in @($reg.deployable)) {
    if (-not $item.source) { continue }
    $map[$item.name] = [string]$item.source
}

foreach ($name in $Module) {
    if (-not $map.Contains($name)) {
        throw "unknown_deployable_module: $name（registry deployable 无 source 声明）"
    }
}
foreach ($name in $map.Keys) {
    if ($Module.Count -gt 0 -and $name -notin $Module) { continue }
    $item = @($reg.deployable | Where-Object { $_.name -eq $name })[0]
    if ($item.family -eq 'authored' -and $name -eq 'rs-js-reverse') { continue }  # 过滤拷贝件走下方特判
    $src = Join-Path $root ($map[$name] -replace '/', [IO.Path]::DirectorySeparatorChar)
    $dst = Join-Path $dep $name
    if (-not (Test-Path -LiteralPath (Join-Path $src 'SKILL.md') -PathType Leaf)) { throw "missing_deployable_source: $name ($($map[$name]))" }

    # Existing wrappers are maintained content, not disposable build output.
    if ($PSCmdlet.ShouldProcess($dst, "创建 deployable/$name")) {
        New-Item -ItemType Directory -Force -Path $dst | Out-Null
    }

    # SKILL.md: 复制原件（改写由 patch-deployable 步骤处理）
    if (-not (Test-Path (Join-Path $dst 'SKILL.md'))) {
        if ($PSCmdlet.ShouldProcess((Join-Path $dst 'SKILL.md'), '复制 SKILL.md')) {
            Copy-Item (Join-Path $src 'SKILL.md') (Join-Path $dst 'SKILL.md')
        }
    }

    # mirror 才有兄弟链接义；authored+source 仅 SKILL.md 抄本溯源（源其余件不入部署面）
    if ($item.family -ne 'mirror') { Write-Host "[OK] $name -> $($map[$name]) (SKILL.md)"; continue }
    # 其余顶层条目: 目录和文件都建符号链接（保持 SKILL.md 引用同级路径可解析; 单一事实源）
    foreach ($ent in (Get-ChildItem $src -Force | Where-Object { $_.Name -ne 'SKILL.md' -and $_.Name -ne '.git' })) {
        $link = Join-Path $dst $ent.Name
        if (Get-Item -LiteralPath $link -Force -ErrorAction SilentlyContinue) { continue }
        if (-not $PSCmdlet.ShouldProcess($link, "符号链接 -> $($ent.FullName)")) { continue }
        try {
            New-Item -ItemType SymbolicLink -Path $link -Target $ent.FullName -ErrorAction Stop | Out-Null
        } catch {
            throw "deployable_link_failed: $name/$($ent.Name): $($_.Exception.Message)"
        }
    }
    Write-Host "[OK] $name -> $($map[$name])"
}

# 特殊: rs-js-reverse（authored, references 只拷贝子集: RS 专项 + anti-patterns, 过滤面非全量镜像）
$rsItem = @($reg.deployable | Where-Object { $_.name -eq 'rs-js-reverse' })[0]
$rsSrc = if ($rsItem.source) { Join-Path $root ($rsItem.source -replace '/', [IO.Path]::DirectorySeparatorChar) } else { $null }
$rsDst = Join-Path $dep 'rs-js-reverse\references'
if ($rsSrc -and (Test-Path $rsSrc) -and ($Module.Count -eq 0 -or 'rs-js-reverse' -in $Module)) {
    if ($PSCmdlet.ShouldProcess($rsDst, '创建 rs-js-reverse/references')) {
        New-Item -ItemType Directory -Force -Path $rsDst | Out-Null
    }
    Get-ChildItem $rsSrc -File | Where-Object { $_.Name -match 'rs-|anti-patterns|request-chain' } | ForEach-Object {
        if (-not (Test-Path (Join-Path $rsDst $_.Name))) {
            if ($PSCmdlet.ShouldProcess((Join-Path $rsDst $_.Name), '复制 reference')) {
                Copy-Item $_.FullName (Join-Path $rsDst $_.Name)
            }
        }
        Write-Host "[OK] rs-js-reverse/references/$($_.Name)"
    }
}
elseif ($Module -contains 'rs-js-reverse') {
    throw 'missing_deployable_source: rs-js-reverse'
}

$depCount = (Test-Path $dep) ? @(Get-ChildItem $dep -Directory).Count : 0
Write-Host "`ndeployable 构建完成: $depCount 个条目"
