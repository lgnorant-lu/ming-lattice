# tests/unit/test-yaml-lite.test.ps1
# 单元测试: scripts/lib/yaml-lite.ps1
# 覆盖: YAML 解析器结构还原, 键值解析, 列表对象, 嵌套字段, 空值与注释容错

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$yamlLitePath = Join-Path $repoRoot 'scripts/lib/yaml-lite.ps1'

. $yamlLitePath

Write-Host "[TEST UNIT] scripts/lib/yaml-lite.ps1..."

# 1. 基础标量与字典解析
$sample1 = @"
schemaVersion: "1.1"
description: "测试事实源"
updatePolicy:
  ttlDays: 7
  fetchMode: blob:none
"@

$parsed1 = ConvertFrom-YamlLite $sample1
if ($parsed1.schemaVersion -ne '1.1') { throw "schemaVersion 解析失败: $($parsed1.schemaVersion)" }
if ($parsed1.updatePolicy.ttlDays -ne 7) { throw "ttlDays 解析失败: $($parsed1.updatePolicy.ttlDays)" }

# 2. 列表对象与布尔值解析
$sample2 = @"
private:
  - name: testing-core-oracle
    path: private/testing-core-oracle
    enabled: true
    note: "测试元规则"
  - name: blog-content
    path: private/blog-content
    enabled: false
"@

$parsed2 = ConvertFrom-YamlLite $sample2
if ($parsed2.private.Count -ne 2) { throw "private 列表项数量不符: $($parsed2.private.Count)" }
if ($parsed2.private[0].name -ne 'testing-core-oracle') { throw "条目 0 名称不符" }
if ($parsed2.private[0].enabled -ne $true) { throw "条目 0 enabled 解析不符" }
if ($parsed2.private[1].enabled -ne $false) { throw "条目 1 enabled 解析不符" }

# 3. 真实 registry.yaml 全文解析测试
$regPath = Join-Path $repoRoot 'registry.yaml'
$rawReg = Get-Content -Path $regPath -Raw -Encoding UTF8
$regObj = ConvertFrom-YamlLite $rawReg

if ($null -eq $regObj.targets) { throw "targets 节点缺失" }
if ($null -eq $regObj.base) { throw "base 节点缺失" }
if ($null -eq $regObj.vertical) { throw "vertical 节点缺失" }
if ($null -eq $regObj.private) { throw "private 节点缺失" }

# 验证 testing 规范族是否能从 registry 正确读出
$testingOracle = $regObj.private | Where-Object { $_.name -eq 'testing-core-oracle' }
if ($null -eq $testingOracle) { throw "未在 registry 中解析到 testing-core-oracle" }
if ($testingOracle.enabled -ne $true) { throw "testing-core-oracle 未启用" }

Write-Host "  -> yaml-lite.ps1 全部断言通过！" -ForegroundColor Green
exit 0
