# install.ps1 — host-tools 部署链（pwsh 7）
# 部署：shims → ~/.local/bin（PATH 已居最前，免疫 Git 升级）；hints → ~/.bashrc 托管块；tools → ~/.local/bin/tools
# .bashrc 若是 UTF-16（逐行解析全灭）原位修复为 UTF-8（先备份 .bashrc.bak）
# -WhatIf 预览不落盘；-Uninstall 拆除部署件
[CmdletBinding(SupportsShouldProcess)]
param([switch]$Uninstall)

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$home_ = if ($env:HT_HOME) { $env:HT_HOME } else { $HOME }
$binDir = Join-Path $home_ '.local\bin'
$bashrc = Join-Path $home_ '.bashrc'

$shims = Get-ChildItem (Join-Path $here 'shims') -File

if ($Uninstall) {
  foreach ($s in $shims) {
    $dst = Join-Path $binDir $s.Name
    if (Test-Path $dst) { Remove-Item $dst -WhatIf:$WhatIfPreference; Write-Host "removed $dst" }
  }
  $toolsLink = Join-Path $binDir 'tools'
  if (Test-Path $toolsLink) { Remove-Item $toolsLink -WhatIf:$WhatIfPreference; Write-Host "removed $toolsLink" }
  Write-Host 'bashrc 托管块请手动删除（>>> ming host-tools hints 段）——不动用户配置手改区'
  exit 0
}

New-Item -ItemType Directory -Force -Path $binDir | Out-Null
foreach ($s in $shims) {
  $dst = Join-Path $binDir $s.Name
  $body = [IO.File]::ReadAllText($s.FullName) -replace "`r`n", "`n"  # shim 须 LF（MSYS2 shebang）
  if ($PSCmdlet.ShouldProcess($dst, 'write shim')) {
    [IO.File]::WriteAllText($dst, $body, (New-Object Text.UTF8Encoding $false))
    Write-Host "shim -> $dst"
  }
}

# fallback 位同步：mingw64/bin 在 Windows 层 PATH 序里可能先于用户 bin
# （非 login shell/子进程视角）——旧版守卫若留在那会绕过 TTY 修复，best-effort 同步
$fallback = 'C:\Program Files\Git\mingw64\bin'
foreach ($s in $shims) {
  $dst = Join-Path $fallback $s.Name
  try {
    $body = [IO.File]::ReadAllText($s.FullName) -replace "`r`n", "`n"
    if ($PSCmdlet.ShouldProcess($dst, 'write fallback shim')) {
      [IO.File]::WriteAllText($dst, $body, (New-Object Text.UTF8Encoding $false))
      Write-Host "fallback shim -> $dst"
    }
  } catch [UnauthorizedAccessException], [IO.IOException] {
    Write-Host "fallback 位无写权限（需提权），跳过: $dst" -ForegroundColor Yellow
  }
}

# tools 入口（bash 可调）
$toolsEntry = @"
#!/usr/bin/env bash
exec node "$($here -replace '\\','/')/tools.mjs" "`$@"
"@
$toolsDst = Join-Path $binDir 'tools'
if ($PSCmdlet.ShouldProcess($toolsDst, 'write tools entry')) {
  [IO.File]::WriteAllText($toolsDst, $toolsEntry, (New-Object Text.UTF8Encoding $false))
  Write-Host "tools -> $toolsDst"
}

# .bashrc：UTF-16 修复 + hints 托管块幂等挂载
$hints = (node (Join-Path $here 'tools.mjs') gen-hints) -join "`n"
if (Test-Path $bashrc) {
  $bytes = [IO.File]::ReadAllBytes($bashrc)
  if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    if ($PSCmdlet.ShouldProcess($bashrc, '剥 UTF-8 BOM')) {
      [IO.File]::WriteAllBytes($bashrc, $bytes[3..($bytes.Length - 1)])
      Write-Host '.bashrc UTF-8 BOM 已剥'
    }
    $bytes = [IO.File]::ReadAllBytes($bashrc)
  }
  if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) {
    if ($PSCmdlet.ShouldProcess($bashrc, 'UTF-16 -> UTF-8 修复（备份 .bak）')) {
      Copy-Item $bashrc "$bashrc.bak" -Force
      # GetString 会把 FFFE 头解成 U+FEFF 字符——须剥，否则落成 UTF-8 BOM bash 仍报错
      $text = [Text.Encoding]::Unicode.GetString($bytes).TrimStart([char]0xFEFF)
      [IO.File]::WriteAllText($bashrc, $text, (New-Object Text.UTF8Encoding $false))
      Write-Host ".bashrc UTF-16 已修（备份 $bashrc.bak）"
    }
  }
}
$cur = if (Test-Path $bashrc) { [IO.File]::ReadAllText($bashrc) } else { '' }
if ($cur -notmatch [regex]::Escape('>>> ming host-tools hints')) {
  if ($PSCmdlet.ShouldProcess($bashrc, 'append hints block')) {
    [IO.File]::AppendAllText($bashrc, "`n$hints`n", (New-Object Text.UTF8Encoding $false))
    Write-Host '.bashrc 挂载 hints 托管块'
  }
} else {
  # 已挂则原位换块（改表重生成幂等）——索引切割避免 regex 转义坑
  $startMark = '# >>> ming host-tools hints >>>'
  $endMark = '# <<< ming host-tools hints <<<'
  $si = $cur.IndexOf($startMark); $ei = $cur.IndexOf($endMark)
  if ($si -ge 0 -and $ei -gt $si) {
    $new = $cur.Substring(0, $si) + $hints + $cur.Substring($ei + $endMark.Length)
    if ($new -ne $cur -and $PSCmdlet.ShouldProcess($bashrc, 'refresh hints block')) {
      [IO.File]::WriteAllText($bashrc, $new, (New-Object Text.UTF8Encoding $false))
      Write-Host '.bashrc hints 块已刷新'
    }
  }
}
Write-Host '完成。tools doctor 验证部署健康度'
