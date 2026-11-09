<#
.SYNOPSIS
    Installs dsh-plugin-figma into a DeepSeek Harness profile.

.DESCRIPTION
    Links the plugin bundle into the profile, enables it in dsh.profile.bundles,
    copies Figma's Agent Skills into the harness home, and creates figma.yml for
    the Figma OAuth access token.

.PARAMETER Profile
    dsh profile name. Defaults to "web" (or DSH_PROFILE).

.PARAMETER DshHome
    Harness home. Defaults to DSH_HOME or ~/.dsh.

.PARAMETER Dsh
    dsh executable. Defaults to DSH_BIN or "dsh" on PATH.

.PARAMETER Uninstall
    Remove the bundle, the profile link and the installed skills.

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Profile acp
    powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Uninstall
#>
# Required Notice: Copyright (c) 2026 Gennady Artamonov
[CmdletBinding()]
param(
    [string]$Profile = '',
    [string]$DshHome = '',
    [string]$Dsh = '',
    [switch]$Uninstall,
    [switch]$Help
)

$ErrorActionPreference = 'Stop'

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Error 'node was not found in PATH. DeepSeek Harness runs on Node.js; install Node 22.3 or newer.'
    exit 1
}

$nodeArgs = @((Join-Path $PSScriptRoot 'scripts\install.mjs'))
if ($Profile) { $nodeArgs += @('--profile', $Profile) }
if ($DshHome) { $nodeArgs += @('--dsh-home', $DshHome) }
if ($Dsh) { $nodeArgs += @('--dsh', $Dsh) }
if ($Uninstall) { $nodeArgs += '--uninstall' }
if ($Help) { $nodeArgs += '--help' }

& $node.Source @nodeArgs
exit $LASTEXITCODE
