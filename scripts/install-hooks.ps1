# scripts/install-hooks.ps1 — 一键安装与配置 ming-skills Git Hooks 门禁体系
# 行为: 配置 git core.hooksPath 指向 .githooks 目录
#   默认        —— 本仓安装
#   -Target <p> —— 脚手架模式：把门禁引擎 kit 铺进目标仓（第二采纳者路径）

[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$Target = '',
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent

# ── 脚手架模式：kit 移植到目标仓 ──
if ($Target) {
    $dest = Resolve-Path $Target -ErrorAction Stop
    if (-not (Test-Path (Join-Path $dest '.git'))) {
        throw "目标不是 git 仓根: $dest"
    }
    Write-Host "[scaffold] 门禁引擎 kit -> $dest" -ForegroundColor Cyan

    # 0. 既有门禁检测——重指 hooksPath 会顶掉旧体系（blog-tui 事故的制度化防线）
    $oldPath = (git -C $dest config core.hooksPath 2>$null)
    $oldPath = "$oldPath".Trim()
    if ($oldPath -and $oldPath -ne '.githooks') {
        $oldDir = Join-Path $dest $oldPath
        $oldHooks = (Test-Path $oldDir) ? @(Get-ChildItem $oldDir -File | Select-Object -ExpandProperty Name) : @()
        Write-Host "[scaffold] [警告] 目标已有 core.hooksPath=$oldPath（$(@($oldHooks).Count) 个 hook: $($oldHooks -join ', ')）" -ForegroundColor Yellow
        Write-Host "[scaffold]        切换将停用旧体系——请先把其检查平移为 scripts/hooks/gates.local/*.mjs" -ForegroundColor Yellow
        if (-not $Force) { throw "存在既有 hooksPath——确认迁移方案后用 -Force 重试（或先平移旧检查到 gates.local）" }
    }

    # 1. scripts/hooks/ 整目录（engine+gates+lib+validate 依赖件一并带；
    #    gates.local/ 显式排除——该目录=采纳侧私有住所，永不属 kit）
    $srcHooks = Join-Path $repoRoot 'scripts/hooks'
    $dstHooks = Join-Path $dest 'scripts/hooks'
    if ($PSCmdlet.ShouldProcess($dstHooks, '复制 scripts/hooks 整目录')) {
        New-Item -ItemType Directory -Path $dstHooks -Force | Out-Null
        Get-ChildItem $srcHooks | Where-Object { $_.Name -ne 'gates.local' } |
            Copy-Item -Destination $dstHooks -Recurse -Force
    }

    # 2. .githooks/ shims
    $dstShims = Join-Path $dest '.githooks'
    if ($PSCmdlet.ShouldProcess($dstShims, '复制 .githooks shim')) {
        New-Item -ItemType Directory -Path $dstShims -Force | Out-Null
        Copy-Item (Join-Path $repoRoot '.githooks/*') $dstShims -Force
    }

    # 3. .hooksrc：不存在才铺模板（不覆盖目标仓已有配置）
    $dstRc = Join-Path $dest '.hooksrc'
    if (-not (Test-Path $dstRc)) {
        if ($PSCmdlet.ShouldProcess($dstRc, '铺入 .hooksrc 模板')) {
            Copy-Item (Join-Path $repoRoot '.hooksrc.tmpl') $dstRc
            Write-Host "[scaffold] .hooksrc <- .hooksrc.tmpl（按需裁改）" -ForegroundColor Gray
        }
    } else {
        Write-Host "[scaffold] .hooksrc 已存在，跳过（-Force 不覆盖配置是刻意的）" -ForegroundColor Yellow
    }

    # 4. .gitignore 追加 .hooksrc.local（不重复追加）
    $dstIgnore = Join-Path $dest '.gitignore'
    $gi = (Test-Path $dstIgnore) ? (Get-Content $dstIgnore -Raw) : ''
    if ($gi -notmatch '(?m)^\.hooksrc\.local\s*$') {
        if ($PSCmdlet.ShouldProcess($dstIgnore, '追加 .hooksrc.local 到 .gitignore')) {
            Add-Content $dstIgnore "`n# 门禁引擎个人覆盖层`n.hooksrc.local`n"
            Write-Host "[scaffold] .gitignore += .hooksrc.local" -ForegroundColor Gray
        }
    }

    # 5. hooksPath + integrity 存值（+ commit.template 文件约定：目标仓有 .gitmessage 即指向）
    if ($PSCmdlet.ShouldProcess($dest, 'git config core.hooksPath=.githooks')) {
        git -C $dest config core.hooksPath .githooks
        if (Test-Path (Join-Path $dest '.gitmessage')) {
            git -C $dest config commit.template .gitmessage
        }
        $node = Get-Command node -ErrorAction SilentlyContinue
        if ($node) {
            # Push-Location 必做：engine repoRoot() 按 cwd 解析——不带 cwd 会把 trust
            # 写进源仓 state（实测缺陷：目标仓 gatesHash 留旧值，首跑即误报）
            try {
                Push-Location $dest
                node (Join-Path $dstHooks 'engine.mjs') trust 2>$null | Out-Null
            } catch { } finally { Pop-Location }
        }
    }

    # 6. 采纳元数据——目标仓被动记录：铺的是哪版引擎（engine list 落后对账依据）
    if ($PSCmdlet.ShouldProcess($dest, '写入采纳元数据')) {
        $gitDir = (git -C $dest rev-parse --absolute-git-dir 2>$null)
        if ($gitDir) {
            $stateFile = Join-Path $gitDir 'hook-engine-state.json'
            $state = @{}
            if (Test-Path $stateFile) {
                try { $state = Get-Content $stateFile -Raw | ConvertFrom-Json -AsHashtable } catch { $state = @{} }
            }
            $state['adoption'] = @{
                sourceRepo = $repoRoot
                sourceRev  = (git -C $repoRoot rev-parse HEAD 2>$null)
                adoptedAt  = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'")
            }
            ($state | ConvertTo-Json -Depth 6) | Set-Content $stateFile -Encoding UTF8
        }
    }

    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host "  门禁引擎已铺入 $(Split-Path $dest -Leaf)" -ForegroundColor Green
    Write-Host "  - 按需裁 .hooksrc（impact-test/pre-push-verify 可用 gate.<id>.command 配仓级命令；未配且无对应件自动缺席）" -ForegroundColor Gray
    Write-Host "  - 棕场接入建议先跑: node scripts/hooks/engine.mjs baseline --dry-run" -ForegroundColor Gray
    Write-Host "========================================================" -ForegroundColor Cyan
    return
}

# ── 本仓安装模式 ──
$hooksDir = Join-Path $repoRoot '.githooks'

if (-not (Test-Path $hooksDir)) {
    if ($PSCmdlet.ShouldProcess($hooksDir, '创建 .githooks 目录')) {
        New-Item -ItemType Directory -Path $hooksDir -Force | Out-Null
    }
}

# 配置 git hooksPath（+ commit.template 文件约定：.gitmessage 存在即指向）
if ($PSCmdlet.ShouldProcess($repoRoot, 'git config core.hooksPath=.githooks')) {
    git -C $repoRoot config core.hooksPath .githooks
    if (Test-Path (Join-Path $repoRoot '.gitmessage')) {
        git -C $repoRoot config commit.template .gitmessage
    }

    # 写入 gates/ 完整性存值（若 node 可用；失败不阻断安装）
    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($node) {
        try {
            node (Join-Path $repoRoot 'scripts/hooks/engine.mjs') trust 2>$null | Out-Null
        } catch { }
    }
}

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  ming-skills Git Hooks 门禁体系安装成功！" -ForegroundColor Green
Write-Host "  - core.hooksPath = .githooks" -ForegroundColor Gray
Write-Host "  - commit-msg     : 强制 Conventional Commits 格式 + 禁 Emoji" -ForegroundColor Gray
Write-Host "  - pre-commit     : 编码防乱码 + 密钥防泄漏 + 大文件 + lint.ps1 验证" -ForegroundColor Gray
Write-Host "  - post-merge     : chores 提醒（registry/submodule/hooks 变更）" -ForegroundColor Gray
Write-Host "========================================================" -ForegroundColor Cyan
