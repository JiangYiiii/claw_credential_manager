# Cookie Keeper Native Messaging Host installer (Windows).
# Usage: install.ps1 -ExtId <chrome-extension-id>

param(
  [Parameter(Mandatory=$true)] [string] $ExtId
)

$ErrorActionPreference = 'Stop'

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) { throw "node not found in PATH" }
$ver = & node -e "process.stdout.write(String(process.versions.node.split('.')[0]))"
if ([int]$ver -lt 18) { throw "node >= 18 required (current: $(& node --version))" }

$skillRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$hostDir = Join-Path $env:USERPROFILE '.agents\cookie-keeper\host'
New-Item -ItemType Directory -Force -Path $hostDir | Out-Null
Copy-Item -Recurse -Force (Join-Path $skillRoot 'host-payload\*') $hostDir

# Bake the absolute node path into host.cmd so Chrome's clean spawn env
# finds node even when PATH is not inherited. Replace the entire NODE_BIN
# line (anchored by sentinel) to avoid accidental substring matches.
$nodeAbs = $nodeCmd.Source
$hostCmd = Join-Path $hostDir 'host.cmd'
$lines = Get-Content $hostCmd
$rewritten = foreach ($line in $lines) {
  if ($line -match 'COOKIE_KEEPER_NODE_BIN_ANCHOR') {
    'set "NODE_BIN=' + $nodeAbs + '"  REM COOKIE_KEEPER_NODE_BIN_ANCHOR'
  } else { $line }
}
$rewritten | Set-Content -Path $hostCmd -Encoding ASCII

$manifest = @{
  name = 'com.fintopia.cookie_keeper'
  description = 'Cookie Keeper Native Host'
  path = (Join-Path $hostDir 'host.cmd')
  type = 'stdio'
  allowed_origins = @("chrome-extension://$ExtId/")
} | ConvertTo-Json -Depth 4

$manifestPath = Join-Path $hostDir 'com.fintopia.cookie_keeper.json'
Set-Content -Path $manifestPath -Value $manifest -Encoding UTF8

$regKey = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.fintopia.cookie_keeper'
New-Item -Path $regKey -Force | Out-Null
Set-ItemProperty -Path $regKey -Name '(default)' -Value $manifestPath

Write-Host "installed:"
Write-Host "  host: $hostDir"
Write-Host "  manifest: $manifestPath"
Write-Host "  registry: $regKey"
Write-Host ""
Write-Host "now: open chrome://extensions, reload Cookie Keeper, switch sync mode to 'auto'."
