# build-deployable.ps1 — 构建 deployable 部署层（一次性/可重复执行）
# 原理: deployable/<name>/SKILL.md 是改写件(frontmatter/description 可控);
#       其余内容(子目录)用符号链接指向 vertical 源 — 单一事实源, 不复制内容
# 用法: pwsh scripts/build-deployable.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$dep = Join-Path $root 'deployable'
$ver = Join-Path $root 'vertical'

# 映射表: deployable 名 -> 源目录（vertical 相对路径, null = 特殊处理）
$map = [ordered]@{
    'hello-js-reverse'       = 'hello-js-reverse-skill'
    'rust-reverse'           = 'rust-reverse-engineering-skill/skills/rust-reverse-engineering'
    'android-reverse'        = 'android-reverse-claude-skill/plugins/android-reverse-engineering/skills/android-reverse-engineering'
    'ios-reverse'            = 'ios-reverse-claude-skill/skills/ios-reverse-engineering'
    'ctf-pwn'                = 'ctf-skills/ctf-pwn'
    'ctf-web'                = 'ctf-skills/ctf-web'
    'ctf-reverse'            = 'ctf-skills/ctf-reverse'
    'ctf-crypto'             = 'ctf-skills/ctf-crypto'
    'ctf-misc'               = 'ctf-skills/ctf-misc'
    'ctf-forensics'          = 'ctf-skills/ctf-forensics'
    'xbs-ast-deobfuscation'  = 'xbs-reverse-skill/ast-deobfuscation'
    'xbs-verify-patcher'     = 'xbs-reverse-skill/web-verify-patcher'
    'areclaw-analyze-apk'    = 'areclaw/.claude/skills/analyze-apk'
    'areclaw-compare-versions' = 'areclaw/.claude/skills/compare-versions'
    'areclaw-find-api'       = 'areclaw/.claude/skills/find-api'
    'areclaw-intercept'      = 'areclaw/.claude/skills/intercept'
    'areclaw-register'       = 'areclaw/.claude/skills/register'
}

foreach ($name in $map.Keys) {
    $src = Join-Path $ver ($map[$name] -replace '/', '\')
    $dst = Join-Path $dep $name
    if (-not (Test-Path $src)) { Write-Host "[WARN] 源不存在: $src" -ForegroundColor Yellow; continue }

    # 重建目标目录（保留已有 SKILL.md? 不——SKILL.md 也是重新复制, 之后的改写步骤在另一个脚本）
    if (Test-Path $dst) { Remove-Item $dst -Recurse -Force -Confirm:$false }
    New-Item -ItemType Directory -Force -Path $dst | Out-Null

    # SKILL.md: 复制原件（改写由 patch-deployable 步骤处理）
    if (Test-Path (Join-Path $src 'SKILL.md')) {
        Copy-Item (Join-Path $src 'SKILL.md') (Join-Path $dst 'SKILL.md')
    }

    # 其余顶层条目: 目录和文件都建符号链接（保持 SKILL.md 引用同级路径可解析; 单一事实源）
    foreach ($item in (Get-ChildItem $src -Force | Where-Object { $_.Name -ne 'SKILL.md' -and $_.Name -ne '.git' })) {
        $link = Join-Path $dst $item.Name
        try {
            New-Item -ItemType SymbolicLink -Path $link -Target $item.FullName -ErrorAction Stop | Out-Null
        } catch {
            Write-Host "[WARN] 链接失败 $name/$($item.Name): $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
    Write-Host "[OK] $name -> $($map[$name])"
}

# 特殊: rs-js-reverse（复制 4 份 RS 专项 + anti-patterns, 自写 SKILL.md 由后续步骤处理）
$rsSrc = Join-Path $ver 'js-reverse-715494637\jsr-reverse\references'
$rsDst = Join-Path $dep 'rs-js-reverse\references'
if (Test-Path $rsSrc) {
    New-Item -ItemType Directory -Force -Path $rsDst | Out-Null
    Get-ChildItem $rsSrc -File | Where-Object { $_.Name -match 'rs-|anti-patterns|request-chain' } | ForEach-Object {
        Copy-Item $_.FullName (Join-Path $rsDst $_.Name)
        Write-Host "[OK] rs-js-reverse/references/$($_.Name)"
    }
}

# 特殊: malware-ioc-extraction（复制 schema）
$iocSrc = Join-Path $ver 'malware-re-skills\.agents\skills\re-ioc-extraction'
$iocDst = Join-Path $dep 'malware-ioc-extraction'
if (Test-Path (Join-Path $iocSrc 'SKILL.md')) {
    New-Item -ItemType Directory -Force -Path $iocDst | Out-Null
    Copy-Item (Join-Path $iocSrc 'SKILL.md') (Join-Path $iocDst 'SKILL.md')
    Write-Host "[OK] malware-ioc-extraction (SKILL.md 复制)"
}

Write-Host "`ndeployable 构建完成: $((Get-ChildItem $dep -Directory).Count) 个条目"
