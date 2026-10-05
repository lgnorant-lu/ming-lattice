# tests/unit/test-update-policy.test.ps1 — update.ps1 updatePolicy.ttlDays 硬校验矩阵
# 契约: 缺席→默认 7 放行；1/365 边界放行；0/负/非数/小数/超界→明确报错非零退出
$ErrorActionPreference = 'Continue'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$update = Join-Path $root 'scripts/update.ps1'
$tmp = Join-Path ([IO.Path]::GetTempPath()) "upd-pol-$PID"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

$fail = 0
function Write-Fixture($ttl) {
    $body = "targets:`n  claude: `%USERPROFILE%`/.claude/skills`nvertical: []`ndeployable: []`nprivate: []`ncandidates:`n"
    if ($null -ne $ttl) { $body += "updatePolicy:`n  ttlDays: $ttl`n" }
    $f = Join-Path $tmp "reg-$([guid]::NewGuid().ToString('N')).yaml"
    [IO.File]::WriteAllText($f, $body)
    return $f
}
function Assert-Case($label, $ttl, $expectOk) {
    $f = Write-Fixture $ttl
    $out = pwsh -NoProfile -File $update -RegistryPath $f -DryRun 2>&1 | Out-String
    $ok = $LASTEXITCODE -eq 0
    if ($ok -ne $expectOk) {
        Write-Host "  [FAIL] $label (ttl=$ttl, exit=$LASTEXITCODE): $($out.Trim().Split("`n")[-1])" -ForegroundColor Red
        $script:fail++
    } elseif (-not $expectOk -and $out -notmatch 'ttlDays') {
        Write-Host "  [FAIL] $label 报错未点名 ttlDays: $($out.Trim().Split("`n")[-1])" -ForegroundColor Red
        $script:fail++
    } else { Write-Host "  [ok] $label" }
}

Write-Host '[TEST UNIT] update.ps1 ttlDays 校验矩阵...'
Assert-Case '缺席→默认7'   $null  $true
Assert-Case '下界 1'       1      $true
Assert-Case '上界 365'     365    $true
Assert-Case '零'           0      $false
Assert-Case '负值'        -3      $false
Assert-Case '非数'        'abc'   $false
Assert-Case '小数'        1.5     $false
Assert-Case '超界 400'     400    $false

Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
if ($fail -gt 0) { Write-Host "[FAIL] $fail 例"; exit 1 }
Write-Host '  -> ttlDays 8 例全过'
exit 0
