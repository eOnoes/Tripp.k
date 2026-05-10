$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$bridgePort = $env:TRIPP_BRIDGE_PORT
if (-not $bridgePort) { $bridgePort = "4317" }

$appPort = $env:PORT
if (-not $appPort) { $appPort = "4177" }

function Stop-TrippPort {
  param([string]$Port)

  $listeners = netstat -ano | Select-String "127.0.0.1:$Port\s+.*LISTENING"
  foreach ($listener in $listeners) {
    $parts = ($listener.ToString() -split "\s+") | Where-Object { $_ }
    $pidValue = $parts[-1]
    if ($pidValue -and $pidValue -match "^\d+$") {
      Stop-Process -Id ([int]$pidValue) -Force -ErrorAction SilentlyContinue
    }
  }
}

Stop-TrippPort $bridgePort
Stop-TrippPort $appPort
Start-Sleep -Milliseconds 300

$env:TRIPP_BACKEND_URL = "http://127.0.0.1:$bridgePort"
$env:TRIPP_ENABLE_BACKEND_REPLY = "true"

Start-Process -WindowStyle Hidden -FilePath node -ArgumentList "tripp-bridge.mjs" -WorkingDirectory $root
Start-Sleep -Milliseconds 500
Start-Process -WindowStyle Hidden -FilePath node -ArgumentList "server.mjs" -WorkingDirectory $root

Write-Host "Tripp bridge: http://127.0.0.1:$bridgePort/"
Write-Host "Tripp app:    http://127.0.0.1:$appPort/"
