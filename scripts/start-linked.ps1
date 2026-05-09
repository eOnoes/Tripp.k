$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$bridgePort = $env:TRIPP_BRIDGE_PORT
if (-not $bridgePort) { $bridgePort = "4317" }

$appPort = $env:PORT
if (-not $appPort) { $appPort = "4177" }

$env:TRIPP_BACKEND_URL = "http://127.0.0.1:$bridgePort"
$env:TRIPP_ENABLE_BACKEND_REPLY = "true"

Start-Process -WindowStyle Hidden -FilePath node -ArgumentList "tripp-bridge.mjs" -WorkingDirectory $root
Start-Sleep -Milliseconds 500
Start-Process -WindowStyle Hidden -FilePath node -ArgumentList "server.mjs" -WorkingDirectory $root

Write-Host "Tripp bridge: http://127.0.0.1:$bridgePort/"
Write-Host "Tripp app:    http://127.0.0.1:$appPort/"
