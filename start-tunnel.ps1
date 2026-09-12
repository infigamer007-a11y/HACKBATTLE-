# start-tunnel.ps1 - Launch TrueVoice Backend, Frontend, Unified Gateway, and Public Tunnel
$ErrorActionPreference = "Stop"

$workspaceRoot = $PSScriptRoot
$logsDir = Join-Path $workspaceRoot "logs"
if (!(Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Starting TrueVoice Unified Stack with Public HTTPS/WSS" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Start FastAPI Backend on Port 8000
Write-Host "[1/4] Starting FastAPI backend on http://127.0.0.1:8000..." -ForegroundColor Yellow
$backendEnv = Join-Path $workspaceRoot "backend\.env"
if (!(Test-Path $backendEnv)) {
    Copy-Item (Join-Path $workspaceRoot "backend\.env.example") $backendEnv
}

$backendLog = Join-Path $logsDir "backend.log"
$backendProc = Start-Process -FilePath "uv" `
    -ArgumentList "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000" `
    -WorkingDirectory (Join-Path $workspaceRoot "backend") `
    -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput $backendLog -RedirectStandardError (Join-Path $logsDir "backend-err.log")

Start-Sleep -Seconds 2

# 2. Start Next.js Frontend on Port 3001
Write-Host "[2/4] Starting Next.js frontend on http://127.0.0.1:3001..." -ForegroundColor Yellow
$frontendLog = Join-Path $logsDir "frontend.log"
$frontendProc = Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c", "npm run start -- -p 3001" `
    -WorkingDirectory (Join-Path $workspaceRoot "frontend") `
    -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput $frontendLog -RedirectStandardError (Join-Path $logsDir "frontend-err.log")

Start-Sleep -Seconds 2

# 3. Start Unified Gateway on Port 3000
Write-Host "[3/4] Starting Unified Gateway on http://127.0.0.1:3000..." -ForegroundColor Yellow
$gatewayLog = Join-Path $logsDir "gateway.log"
$gatewayProc = Start-Process -FilePath "node" `
    -ArgumentList "gateway.mjs" `
    -WorkingDirectory (Join-Path $workspaceRoot "frontend") `
    -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput $gatewayLog -RedirectStandardError (Join-Path $logsDir "gateway-err.log")

Start-Sleep -Seconds 2

# 4. Start Pinggy Public Tunnel on Port 3000
Write-Host "[4/4] Establishing public HTTPS & WSS tunnel..." -ForegroundColor Yellow
$tunnelLog = Join-Path $logsDir "tunnel.log"
if (Test-Path $tunnelLog) { Remove-Item $tunnelLog -Force }

$tunnelProc = Start-Process -FilePath "ssh" `
    -ArgumentList "-p", "443", "-R0:127.0.0.1:3000", "-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=30", "a.pinggy.io" `
    -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput $tunnelLog

# Poll for tunnel URL
$publicUrl = $null
$attempts = 0
while ($attempts -lt 30 -and -not $publicUrl) {
    Start-Sleep -Seconds 1
    $attempts++
    if (Test-Path $tunnelLog) {
        $matches = Select-String -Path $tunnelLog -Pattern "https://[a-zA-Z0-9\.\-]+pinggy\.net"
        if ($matches) {
            $publicUrl = $matches[0].Matches[0].Value.Trim()
        }
    }
}

if (-not $publicUrl) {
    Write-Error "Failed to retrieve public tunnel URL."
    exit 1
}

# Save Process IDs for stop-tunnel.ps1
$pids = @{
    Backend = $backendProc.Id
    Frontend = $frontendProc.Id
    Gateway = $gatewayProc.Id
    Tunnel = $tunnelProc.Id
}
$pids | ConvertTo-Json | Set-Content (Join-Path $logsDir "pids.json") -Force

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  TRUEVOICE IS PUBLICLY LIVE & TUNNELED!" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Public URL (Share with phone/testers): $publicUrl" -ForegroundColor Cyan
Write-Host "  Unified Local Gateway:                http://localhost:3000" -ForegroundColor Gray
Write-Host "  FastAPI Backend:                      http://localhost:8000" -ForegroundColor Gray
Write-Host "  Next.js Server:                       http://localhost:3001" -ForegroundColor Gray
Write-Host ""
Write-Host "  Note: HTTPS allows microphone and camera access on any device." -ForegroundColor Yellow
Write-Host "  To stop the deployment, run: .\stop-tunnel.ps1" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Green
