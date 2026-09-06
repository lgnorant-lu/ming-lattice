. (Join-Path $PSScriptRoot 'yaml-lite.ps1')

function Get-SkillDescription {
    param([string]$Frontmatter)
    $value = [regex]::Match($Frontmatter, '(?m)^description:[\t ]*([^\r\n]*)').Groups[1].Value.Trim()
    if ($value -match '^[>|]') {
        return [regex]::Match($Frontmatter, '(?m)^description:[^\r\n]*\r?\n((?:[\t ]+[^\r\n]*(?:\r?\n|$))+)').Groups[1].Value.Trim()
    }
    return $value.Trim('"', "'").Trim()
}

function Read-SkillRegistry {
    param([Parameter(Mandatory)][string]$RegistryPath)

    $reg = ConvertFrom-YamlLite (Get-Content -LiteralPath $RegistryPath -Raw -Encoding UTF8)
    if ($reg.targets -isnot [System.Collections.IDictionary]) { throw 'registry_invalid_targets' }
    $deployments = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    $allNames = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    foreach ($section in @('base', 'vertical', 'deployable', 'private')) {
        $names = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
        foreach ($item in @($reg[$section])) {
            if ($null -eq $item) { continue }
            if ($item -isnot [System.Collections.IDictionary] -or $item.name -notmatch '^[A-Za-z0-9][A-Za-z0-9_.-]*$') {
                throw "registry_invalid_name: $section"
            }
            $isReference = $section -eq 'vertical' -and -not @($item.deploy.Keys | Where-Object { $item.deploy[$_] -eq $true }).Count
            if (-not $names.Add($item.name) -or (-not $isReference -and -not $allNames.Add($item.name))) { throw "registry_duplicate_name: $section/$($item.name)" }
            if ($item.enabled -isnot [bool]) { throw "registry_invalid_enabled: $($item.name)" }
            if ([string]::IsNullOrWhiteSpace($item.path) -or [IO.Path]::IsPathRooted($item.path) -or $item.path -match '(^|[\\/])\.\.([\\/]|$)|:') {
                throw "registry_invalid_path: $($item.name)"
            }
            $clientsByName = [ordered]@{}
            if ($section -eq 'base') {
                if ($item.modules -isnot [System.Collections.IDictionary]) { throw "registry_invalid_modules: $($item.name)" }
                foreach ($name in $item.modules.Keys) {
                    if ($name -notmatch '^[a-z0-9]+(?:-[a-z0-9]+)*$') { throw "registry_invalid_skill_name: $name" }
                    $clientsByName[$name] = @($item.modules[$name])
                    $invalidTargets = @($clientsByName[$name] | Where-Object { $_ -isnot [string] })
                    if ($clientsByName[$name].Count -eq 0 -or $invalidTargets.Count -gt 0) {
                        throw "registry_invalid_module_targets: $name"
                    }
                }
            } else {
                if ($item.deploy -isnot [System.Collections.IDictionary]) { throw "registry_invalid_deploy: $($item.name)" }
                foreach ($client in $item.deploy.Keys) {
                    if ($item.deploy[$client] -isnot [bool]) { throw "registry_invalid_deploy_flag: $($item.name)/$client" }
                }
                $clientsByName[$item.name] = @($item.deploy.Keys | Where-Object { $item.deploy[$_] -eq $true })
            }
            foreach ($name in $clientsByName.Keys) {
                foreach ($client in $clientsByName[$name]) {
                    if (-not $reg.targets.Contains($client) -or [string]::IsNullOrWhiteSpace($reg.targets[$client])) {
                        throw "registry_unknown_client: $name/$client"
                    }
                    if ($item.enabled -and -not $deployments.Add("$client/$name")) { throw "registry_duplicate_deployment: $client/$name" }
                }
            }
        }
    }
    return $reg
}
