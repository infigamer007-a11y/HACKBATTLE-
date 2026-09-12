# stop-tunnel.ps1 - Stop TrueVoice Backend, Frontend, Gateway, and Tunnels
$ErrorActionPreference = "SilentlyContinue"

$workspaceRoot = $PSScriptRoot
$pidsFile = Join-Path $workspaceRoot "logs\pids.json"

if (Test-Path $pidsFile) {
    $pids = Get-Content $pidsFile | ConvertFrom-Json
    Write-Host "Stopping TrueVoice processes..." -ForegroundColor Yellow
    if ($pids.Backend) { Stop-Process -Id $pids.Backend -Force -ErrorAction SilentlyContinue }
    if ($pids.Frontend) { Stop-Process -Id $pids.Frontend -Force -ErrorAction SilentlyContinue }
    if ($pids.Gateway) { Stop-Process -Id $pids.Gateway -Force -ErrorAction SilentlyContinue }
    if ($pids.Tunnel) { Stop-Process -Id $pids.Tunnel -Force -ErrorAction SilentlyContinue }
    Remove-Item $pidsFile -Force -ErrorAction SilentlyContinue
}

# Also ensure any lingering uvicorn, node, or ssh tunnel processes for this project are killed
Get-Process -Name "uvicorn" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host "All TrueVoice processes and tunnels have been stopped." -ForegroundColor Green
