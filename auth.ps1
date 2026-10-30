<#
.SYNOPSIS
    Authorizes dsh-plugin-figma against the Figma remote MCP server.

.DESCRIPTION
    Opens the browser, completes the OAuth flow and saves the OAuth access token
    to $DSH_HOME/figma.yml (access_token). Use -Refresh to renew an expired token
    and -Status to inspect the saved one.

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File .\auth.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File .\auth.ps1 -Refresh
    powershell -NoProfile -ExecutionPolicy Bypass -File .\auth.ps1 -Status
#>
[CmdletBinding()]
param(
    [string]$DshHome = '',
    [string]$ClientName = '',
    [switch]$NoBrowser,
    [switch]$Refresh,
    [switch]$Status,
    [switch]$Help
)

$ErrorActionPreference = 'Stop'

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Error 'node was not found in PATH. DeepSeek Harness runs on Node.js; install Node 22.3 or newer.'
    exit 1
}

$nodeArgs = @((Join-Path $PSScriptRoot 'scripts\auth.mjs'))
if ($DshHome) { $nodeArgs += @('--dsh-home', $DshHome) }
if ($ClientName) { $nodeArgs += @('--client-name', $ClientName) }
if ($NoBrowser) { $nodeArgs += '--no-browser' }
if ($Refresh) { $nodeArgs += '--refresh' }
if ($Status) { $nodeArgs += '--status' }
if ($Help) { $nodeArgs += '--help' }

& $node.Source @nodeArgs
exit $LASTEXITCODE
