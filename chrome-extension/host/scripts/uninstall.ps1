$ErrorActionPreference = 'Stop'

$hostDir = Join-Path $env:USERPROFILE '.agents\cookie-keeper\host'
$regKey = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.fintopia.cookie_keeper'

# Kill any running host.js process Chrome may have spawned. Without
# this step, the extension keeps talking to it through stdio pipes
# even after we delete the manifest — registry deletion only affects
# the NEXT connectNative call.
$hostScript = Join-Path $hostDir 'host.js'
$matched = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -and $_.CommandLine -like "*$hostScript*" }
foreach ($p in $matched) {
  try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop; Write-Host "killed pid $($p.ProcessId)" } catch {}
}

if (Test-Path $hostDir) { Remove-Item -Recurse -Force $hostDir; Write-Host "removed: $hostDir" }
if (Test-Path $regKey) { Remove-Item -Recurse -Force $regKey; Write-Host "removed registry key: $regKey" }

Write-Host "kept (your data):"
Write-Host "  $env:USERPROFILE\.agents\cookie-keeper\all-cookies.json"
Write-Host "  $env:USERPROFILE\.agents\cookie-keeper\host.log"
Write-Host ""
Write-Host "now: chrome://extensions to remove the extension itself."
