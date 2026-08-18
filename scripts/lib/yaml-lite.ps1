# yaml-lite.ps1 — 极简 YAML 子集解析器（零依赖, 仅支撑 registry.yaml 的固定结构）
# 支持: 注释(#)、map、list-of-scalar、list-of-map（`- key: value` 行 + 缩进子项）、内联 list [a, b]、{} 空 map
# 不支持: 引号转义、多行块、锚点、类型标记 —— registry.yaml 用不到, 故意不做。
# 输出: [ordered] hashtable / array 嵌套结构
# 用法: . "$PSScriptRoot/yaml-lite.ps1"; $doc = ConvertFrom-YamlLite (Get-Content -Raw path)

function ConvertFrom-YamlLite {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Text)

    $lines = ($Text -replace "^`u{FEFF}", "") -split "`r?`n"
    $stack = [System.Collections.Generic.Stack[object]]::new()  # 元素: [ordered]@{ indent; kind(pending|list|listitem); obj; parentObj; lastKey }
    $root = [ordered]@{}

    foreach ($raw in $lines) {
        $line = $raw.TrimEnd()
        if ($line.Trim() -eq '' -or $line -match '^\s*#') { continue }

        $indent = 0
        while ($indent -lt $line.Length -and $line[$indent] -eq ' ') { $indent++ }
        $content = $line.Substring($indent)
        $isListItem = $content.StartsWith('-')

        # 弹栈: 仅当"当前行是 list 项且栈顶是同级 list"时保留（追加场景），其余 indent>=当前 的容器一律视为已结束
        while ($stack.Count -gt 0) {
            $t = $stack.Peek()
            if ($t.indent -lt $indent) { break }
            if ($isListItem -and $t.kind -eq 'list' -and $t.indent -eq $indent) { break }
            [void]$stack.Pop()
        }
        $parent = if ($stack.Count -gt 0) { $stack.Peek() } else { $null }

        if ($content -match '^-\s+(.+)$') {
            # ---------- list 项 ----------
            if ($parent -eq $null) { throw "yaml-lite: 顶层 list 不支持: $line" }
            if ($parent.kind -in @('map', 'pending')) {
                if ($null -eq $parent.lastKey) { throw "yaml-lite: list 缺少挂载 key: $line" }
                $listObj = [System.Collections.ArrayList]::new()   # ArrayList: 可变引用（+= 会换数组, 栈内引用失效）
                $parent.parentObj[$parent.lastKey] = $listObj   # 在父容器槽位替换预建的 pending 容器
                $stack.Push([ordered]@{ indent = $indent; kind = 'list'; obj = $listObj; parentObj = $null; lastKey = $null })
                $listObj = $null
            }
            elseif ($parent.kind -ne 'list') { throw "yaml-lite: list 出现在不支持的位置: $line" }
            $listObj = $stack.Peek().obj

            $itemText = $Matches[1]
            if ($itemText -match '^([^:]+):\s*(.*)$') {
                # list-of-map: 创建元素 map 并压栈（子项挂它）
                $k = $Matches[1].Trim(); $v = $Matches[2].Trim()
                $itemMap = [ordered]@{}
                [void]$listObj.Add($itemMap)
                if ($v -ne '') { $itemMap[$k] = ConvertFrom-YamlScalar $v }
                $stack.Push([ordered]@{ indent = $indent; kind = 'listitem'; obj = $itemMap; parentObj = $listObj; lastKey = $null })
            }
            else {
                [void]$listObj.Add((ConvertFrom-YamlScalar $itemText))
            }
        }
        elseif ($content -match '^([^:]+):\s*(.*)$') {
            # ---------- map 项 ----------
            $key = $Matches[1].Trim(); $val = $Matches[2].Trim()
            if ($parent -eq $null) { $target = $root }
            elseif ($parent.kind -in @('map', 'pending', 'listitem')) { $target = $parent.obj }
            else { throw "yaml-lite: 意外的 map key 在 list 下: $line" }

            if ($val -eq '') {
                # pending: 先建空容器。子 key 挂 obj（容器自身）; 若后续出现 list 项, list 分支写 parentObj[lastKey] 替换
                $target[$key] = [ordered]@{}
                $stack.Push([ordered]@{ indent = $indent; kind = 'pending'; obj = $target[$key]; parentObj = $target; lastKey = $key })
            }
            else {
                $target[$key] = ConvertFrom-YamlScalar $val
            }
        }
        else {
            throw "yaml-lite: 无法解析行: $line"
        }
    }
    return $root
}

function ConvertFrom-YamlScalar {
    param([string]$Value)
    # 剥离行内注释（值后的 " #..."）
    $Value = ($Value -split '\s+#', 2)[0].TrimEnd()
    if ($Value -eq 'null' -or $Value -eq '~') { return $null }
    if ($Value -eq 'true') { return $true }
    if ($Value -eq 'false') { return $false }
    if ($Value -eq '{}') { return [ordered]@{} }
    if ($Value -match '^[+-]?\d+$') { return [int]$Value }
    if ($Value -match '^[+-]?\d+\.\d+$') { return [double]$Value }
    if ($Value -match '^\[(.*)\]$') {  # 内联 list（仅字符串元素）
        $items = @()
        foreach ($part in ($Matches[1] -split ',')) {
            $t = $part.Trim()
            if ($t -ne '') { $items += $t.Trim('"') }
        }
        return , $items   # 逗号包裹: 防止单元素数组被 PowerShell 展开为标量
    }
    return $Value.Trim('"')
}
