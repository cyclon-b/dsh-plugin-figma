<#
.SYNOPSIS
    Removes dsh-plugin-figma from a DeepSeek Harness profile.

.DESCRIPTION
    Removes the bundle from dsh.profile.bundles, deletes the profile link, and
    restores or removes the installed Agent Skills. The figma.yml token file is
    kept.

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File .\uninstall.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File .\uninstall.ps1 -Profile acp
#>
# Required Notice: Copyright (c) 2026 Gennady Artamonov
[CmdletBinding()]
param(
    [string]$Profile = '',
    [string]$DshHome = '',
    [switch]$Help
)

$ErrorActionPreference = 'Stop'

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Error 'node was not found in PATH. DeepSeek Harness runs on Node.js; install Node 22.3 or newer.'
    exit 1
}

$nodeArgs = @((Join-Path $PSScriptRoot 'scripts\install.mjs'), '--uninstall')
if ($Profile) { $nodeArgs += @('--profile', $Profile) }
if ($DshHome) { $nodeArgs += @('--dsh-home', $DshHome) }
if ($Help) { $nodeArgs += '--help' }

& $node.Source @nodeArgs
exit $LASTEXITCODE
