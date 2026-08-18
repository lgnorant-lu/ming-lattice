# patch-deployable.ps1 — 改写 deployable 层各 SKILL.md（frontmatter 唯一化 + description 精要化 + 路径修复）
# 规则:
#   1. frontmatter name 唯一化（避开基座模块/彼此冲突）
#   2. description 精要化（触发词优先, 不绑定具体 MCP 名）
#   3. 已知问题修复: ${CLAUDE_PLUGIN_ROOT} 替换 / 硬编码他人路径
# 用法: pwsh scripts/patch-deployable.ps1

$ErrorActionPreference = 'Continue'
$dep = Join-Path (Split-Path $PSScriptRoot -Parent) 'deployable'

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
        Set-Content -Path $f -Value ("---`n" + $fmNew + "`n---" + $body) -Encoding UTF8
        Write-Host "[OK] $dir -> name: $newName"
    } else {
        Write-Host "[WARN] 无 frontmatter: $dir" -ForegroundColor Yellow
    }
}

function Fix-Paths($dir, $pattern, $replacement) {
    foreach ($f in @(Get-ChildItem (Join-Path $dep $dir) -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '\\\.git\\' })) {
        $t = Get-Content $f.FullName -Raw -ErrorAction SilentlyContinue
        if ($t -and $t -match $pattern) {
            $t2 = $t -replace $pattern, $replacement
            if ($t2 -ne $t) { Set-Content -Path $f.FullName -Value $t2 -Encoding UTF8; Write-Host "[FIX] $($f.FullName.Replace($dep, '.'))" }
        }
    }
}

# ── 1. 唯一化 name + description 精要 ───────────────────────────
Set-NameDesc 'hello-js-reverse' 'hello-js-reverse' 'Web JS 逆向实战（JSVMP 双路径: 算法追踪/环境伪装, 反爬三分法, 红线纪律）。适用于前端签名、加密参数、动态 Cookie、WASM 逆向, 尤其是混淆/JSVMP 类目标。'
Set-NameDesc 'rust-reverse' 'rust-reverse' 'Rust 二进制逆向专项（指纹识别→rustfilt 去符号→crate 命名空间恢复→Ghidra 伪代码导出, Phase 0-5）。适用于 Rust 编写的 exe/so/ELF/Mach-O。'
Set-NameDesc 'android-reverse' 'android-reverse' 'Android APK 全流程逆向（jadx 反编译/API 提取/自适应 Frida 绕过/Fragment 注入检测/Firebase 测试矩阵）。适用于 APK 接口提取、防护绕过、安全测试。'
Set-NameDesc 'ios-reverse' 'ios-reverse' 'iOS IPA/Mach-O 静态逆向（提取/API 提取/凭据扫描/r2-Ghidra 二进制/反篡改检测/漏洞审计）。适用于 iOS App 逆向分析。'
Set-NameDesc 'xbs-ast-deobfuscation' 'xbs-ast-deobfuscation' 'AST 反混淆流水线（可运行脚本 + 站点混淆家族专档: reese84/顶象/极验4/网易易盾/同花顺/小红书等）。适用于混淆 JS 还原。'
Set-NameDesc 'xbs-verify-patcher' 'xbs-verify-patcher' '验证码识别与求解编排（极验/易盾/腾讯/hCaptcha 等厂商流程）。适用于验证码场景逆向。'
Set-NameDesc 'areclaw-analyze-apk' 'areclaw-analyze-apk' 'Android APK 分析（5 阶段流程: 框架判定 Flutter/RN/IL2CPP/加壳 → 定向分析）。'
Set-NameDesc 'areclaw-compare-versions' 'areclaw-compare-versions' 'Android APK 版本对比（差异定位/更新链分析）。'
Set-NameDesc 'areclaw-find-api' 'areclaw-find-api' 'Android App API 定位（端点/接口提取）。'
Set-NameDesc 'areclaw-intercept' 'areclaw-intercept' 'Frida 拦截/抓包（Hook 注入/流量拦截, Windows 优先环境）。'
Set-NameDesc 'areclaw-register' 'areclaw-register' 'Android 注册/登录流程分析与绕过（安全测试）。'
Set-NameDesc 'malware-ioc-extraction' 'malware-ioc-extraction' '证据驱动 IOC 提取与规范化（严格 YAML schema/置信度词汇/verbatim 证据）。适用于恶意样本分析报告与 IOC 沉淀。'

# ── 2. 路径修复 ────────────────────────────────────────────────
# android/ios 的 ${CLAUDE_PLUGIN_ROOT} → 实际仓库路径（skills 可独立运行）
$root = Split-Path $PSScriptRoot -Parent
Fix-Paths 'android-reverse' '\$\{CLAUDE_PLUGIN_ROOT\}' ($root + '\vertical\android-reverse-claude-skill\plugins\android-reverse-engineering'.Replace('\', '\\'))
Fix-Paths 'ios-reverse' '\$\{CLAUDE_PLUGIN_ROOT\}' ($root + '\vertical\ios-reverse-claude-skill'.Replace('\', '\\'))
# xbs 硬编码他人路径 → 说明性占位
Fix-Paths 'xbs-ast-deobfuscation' 'C:\\Users\\25198\\(?:\\[\w.-]+)*' '%USERPROFILE%\\.codex\\skills'

Write-Host "`npatch 完成"
