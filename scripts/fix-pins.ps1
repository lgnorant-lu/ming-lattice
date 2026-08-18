# fix-pins.ps1 — 一次性修复 pin 错位/过期（sed 批量替换的坑）
$t = Get-Content 'D:\dogepy\skills-collection\registry.yaml' -Raw

# 1. 交换 view8 与 js-deobfuscator 的 name（恢复正确对应）
$t = $t.Replace('  - name: js-deobfuscator', '  - name: __TMP__')
$t = $t.Replace('  - name: view8', '  - name: js-deobfuscator')
$t = $t.Replace('  - name: __TMP__', '  - name: view8')

# 2. 修正各条目 pin（正则精确匹配条目块内的 pin 行）
$fixes = @(
    @{ name = 'view8';           pin = '4a27e9b' },
    @{ name = 'js-deobfuscator'; pin = '21598ad' },
    @{ name = 'awesome-re-mcp';  pin = '17c9654' },
    @{ name = 'r2garlic';        pin = 'a429871' }
)
foreach ($f in $fixes) {
    $re = "(?ms)^(  - name: $($f.name)\r?\n(?:.*?\r?\n)*?^    pin: ).*?(\r?\n)"
    $t = [regex]::Replace($t, $re, "`${1}$($f.pin)`${2}")
}

Set-Content 'D:\dogepy\skills-collection\registry.yaml' $t -Encoding UTF8
Write-Host 'pins 修正完成'
