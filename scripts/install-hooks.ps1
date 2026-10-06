# scripts/install-hooks.ps1 — 一键安装与配置 ming-skills Git Hooks 门禁体系
# 行为: 配置 git core.hooksPath 指向 .githooks 目录
#   默认        —— 本仓安装
#   -Target <p> —— 脚手架模式：把门禁引擎 kit 铺进目标仓（第二采纳者路径）

[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$Target = '',
    [switch]$Force,
    [switch]$WithBoundary   # 连同 ming-boundary 组件+门+契约模板一起铺（边界断言采纳面）
)

$ErrorActionPreference = 'Stop'
# 管道/spawn 调用面输出统一 UTF-8——中文 Windows 控制台默认 GBK，
# Node spawnSync pipe 收到 GBK 字节即乱码（scaffold-repo 编排调用实证）
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
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

    # 2. .githooks/ shims——字节级 LF 归一化：源工作区在 autocrlf 机上可能是
    #    CRLF，Copy-Item 原样拷贝即传染，采纳仓 POSIX 克隆 shebang 失效
    $dstShims = Join-Path $dest '.githooks'
    if ($PSCmdlet.ShouldProcess($dstShims, '复制 .githooks shim')) {
        New-Item -ItemType Directory -Path $dstShims -Force | Out-Null
        Get-ChildItem (Join-Path $repoRoot '.githooks') -File | ForEach-Object {
            $bytes = [IO.File]::ReadAllText($_.FullName) -replace "`r`n", "`n"
            [IO.File]::WriteAllText((Join-Path $dstShims $_.Name), $bytes, [Text.UTF8Encoding]::new($false))
        }
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

    # 4.1 EOL/编辑器基线——.gitattributes/.editorconfig 缺席才铺基线模板；
    #     已存在只补 shebang 钉（wildcard 不注入存量文件——契约归采纳侧）。
    #     基线件同 shim 字节纪律：源工作区 CRLF 拷贝须 LF 化（-replace 去 \r\n）。
    $tplDir = Join-Path $repoRoot 'scripts/hooks/templates'
    $utf8NoBom = [Text.UTF8Encoding]::new($false)
    $dstAttr = Join-Path $dest '.gitattributes'
    if (-not (Test-Path $dstAttr)) {
        if ($PSCmdlet.ShouldProcess($dstAttr, '铺入 .gitattributes 基线模板')) {
            $tpl = (Get-Content (Join-Path $tplDir 'gitattributes.baseline') -Raw) -replace "`r`n", "`n"
            [IO.File]::WriteAllText($dstAttr, $tpl, $utf8NoBom)
            Write-Host "[scaffold] .gitattributes <- 基线模板" -ForegroundColor Gray
        }
    } else {
        $ga = Get-Content $dstAttr -Raw
        foreach ($pin in '.githooks/* text eol=lf', '*.sh text eol=lf') {
            $pat = [regex]::Escape(($pin -split ' ')[0])
            if ($ga -notmatch "(?m)^$pat\s+text\s+eol=lf\s*$") {
                if ($PSCmdlet.ShouldProcess($dstAttr, "追加 $pin 到 .gitattributes")) {
                    Add-Content $dstAttr "`n# hook shim/POSIX 入口必须 LF——CRLF 让 shebang 失效`n$pin`n"
                    Write-Host "[scaffold] .gitattributes += $pin" -ForegroundColor Gray
                }
            }
        }
    }
    $dstEc = Join-Path $dest '.editorconfig'
    if (-not (Test-Path $dstEc)) {
        if ($PSCmdlet.ShouldProcess($dstEc, '铺入 .editorconfig 基线模板')) {
            $tpl = (Get-Content (Join-Path $tplDir 'editorconfig.baseline') -Raw) -replace "`r`n", "`n"
            [IO.File]::WriteAllText($dstEc, $tpl, $utf8NoBom)
            Write-Host "[scaffold] .editorconfig <- 基线模板" -ForegroundColor Gray
        }
    }

    # 4.2 .gitignore 白名单补偿：采纳侧用 `**/.*`/`.*` 全拦截时，基线两件会被静默吞
    $giNow = (Test-Path $dstIgnore) ? (Get-Content $dstIgnore -Raw) : ''
    if ($giNow -match '(?m)^\s*\*\*/\.\*|^\s*\.\*\s*$') {
        foreach ($wl in '!.gitattributes', '!.editorconfig') {
            $wlRe = '^!' + [regex]::Escape($wl.Substring(1)) + '\s*$'
            if ($giNow -notmatch "(?m)$wlRe") {
                if ($PSCmdlet.ShouldProcess($dstIgnore, "追加 $wl 白名单")) {
                    Add-Content $dstIgnore "$wl`n"
                    Write-Host "[scaffold] .gitignore += $wl" -ForegroundColor Gray
                }
            }
        }
    }

    # 4.5 ming-boundary 采纳面（-WithBoundary）：组件子树 + gates.local 门 +
    #     yaml 桥依赖 + 契约起始模板。门自含"无 boundaries.yaml 静默跳过"，
    #     但模板铺入即激活——不想要契约就别加开关。
    if ($WithBoundary) {
        # 4.5a 组件运行面（extractor/checker/lib+adapters——references/SKILL 不随 kit 走）
        $mbSrc = Join-Path $repoRoot 'private/engineering/ming-boundary/scripts'
        $mbDst = Join-Path $dest 'private/engineering/ming-boundary/scripts'
        if ($PSCmdlet.ShouldProcess($mbDst, '铺入 ming-boundary 组件运行面')) {
            New-Item -ItemType Directory -Path $mbDst -Force | Out-Null
            Copy-Item (Join-Path $mbSrc '*') $mbDst -Recurse -Force
        }

        # 4.5b yaml 桥两件套（check-boundaries 解析 .yaml 契约的仓级依赖；
        #     已存且不同名同内容时警告不覆盖——可能是宿主自有件）
        $libDst = Join-Path $dest 'scripts/lib'
        foreach ($f in 'yaml-lite.ps1', 'yaml2json.ps1') {
            $src = Join-Path $repoRoot "scripts/lib/$f"
            $dst = Join-Path $libDst $f
            if (Test-Path $dst) {
                if ((Get-FileHash $src).Hash -ne (Get-FileHash $dst).Hash) {
                    Write-Host "[scaffold] [警告] $f 已存在且内容不同——不覆盖，请手工对齐" -ForegroundColor Yellow
                }
                continue
            }
            if ($PSCmdlet.ShouldProcess($dst, "铺入 $f")) {
                New-Item -ItemType Directory -Path $libDst -Force | Out-Null
                Copy-Item $src $dst -Force
            }
        }

        # 4.5c 边界门文件（kit 作者件——铺进采纳侧私有住所 gates.local/，升级随 -Force 覆盖流）
        $gateSrc = Join-Path $repoRoot 'scripts/hooks/gates.local/boundary-edge.mjs'
        $gateDst = Join-Path $dest 'scripts/hooks/gates.local/boundary-edge.mjs'
        if ($PSCmdlet.ShouldProcess($gateDst, '铺入 boundary-edge 门')) {
            New-Item -ItemType Directory -Path (Split-Path $gateDst) -Force | Out-Null
            Copy-Item $gateSrc $gateDst -Force
        }

        # 4.5d 契约起始模板——已存在永不覆盖（契约是采纳侧资产，不是 kit 资产）
        $byDst = Join-Path $dest 'boundaries.yaml'
        if (-not (Test-Path $byDst)) {
            if ($PSCmdlet.ShouldProcess($byDst, '铺入 boundaries.yaml 起始模板')) {
                Copy-Item (Join-Path $repoRoot 'private/engineering/ming-boundary/assets/boundaries.starter.yaml') $byDst
                Write-Host "[scaffold] boundaries.yaml <- 起始模板（domains 按本仓拓扑裁改后生效）" -ForegroundColor Gray
            }
        } else {
            Write-Host "[scaffold] boundaries.yaml 已存在——跳过（契约归采纳侧）" -ForegroundColor Yellow
        }

        # 4.5e 自定义消费方约定区——仅建位+README 种子，永不覆盖用户文件
        $consDir = Join-Path $dest 'boundary.consumers'
        $consReadme = Join-Path $consDir 'README.md'
        if (-not (Test-Path $consReadme)) {
            if ($PSCmdlet.ShouldProcess($consReadme, '铺入 boundary.consumers 约定说明')) {
                New-Item -ItemType Directory -Path $consDir -Force | Out-Null
                @'
# boundary.consumers/ — 自定义消费方约定区

此目录文件**不会被 install-hooks 覆盖**（用户资产面，同 gates.local/ 语义）。

- 文件名即消费方 id：`boundary.consumers/<id>.mjs`
- 在 `boundaries.yaml` 的 `consumers:` 段**显式列名**才激活——目录内有文件不自动跑
- 契约（消费方协议 v1）：`node <id>.mjs --facts <jsonl> --root <root> --config <json> [--apply]`
  - `outputs: findings` → stdout 逐行 JSONL `{rule,severity,unit,expect,observed,fix}`
  - `outputs: report` → stdout 自由文本
  - `outputs: files` → stdout JSON `{planned,written,preview?}`，须声明 `mutates: true`
- 参考实现：`private/engineering/ming-boundary/scripts/consumers/`
'@ | Set-Content -Path $consReadme -Encoding utf8
                Write-Host "[scaffold] boundary.consumers/ <- 约定区+说明（自定义消费方住所）" -ForegroundColor Gray
            }
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
    if ($WithBoundary) {
        Write-Host "  - ming-boundary 已铺：裁 boundaries.yaml 的 domains 后 extract+check 即生效；建议 ast-grep 在位（缺席降 regex 档）" -ForegroundColor Gray
    }
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
