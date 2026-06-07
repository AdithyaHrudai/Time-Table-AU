# =========================================================
#  TimetableGenius - Local Development Start Script
#  Run this from the app\ directory in PowerShell:
#    .\start-dev.ps1
# =========================================================

$APP_ROOT   = $PSScriptRoot
$BACKEND    = "$APP_ROOT\backend"
$FRONTEND   = "$APP_ROOT\frontend"
$PYTHON     = "C:/Users/hruda/AppData/Local/Programs/Python/Python310/python.exe"

Write-Host ""
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "  TimetableGenius - Starting Dev Stack" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""

# -- 1. MongoDB via Docker --------------------------------
Write-Host "[1/3] MongoDB..." -ForegroundColor Yellow
$running = docker ps --filter "name=mongodb-local" --filter "status=running" -q 2>$null
if ($running) {
    Write-Host "      MongoDB already running (container: mongodb-local)" -ForegroundColor Green
} else {
    $exists = docker ps -a --filter "name=mongodb-local" -q 2>$null
    if ($exists) {
        docker start mongodb-local | Out-Null
        Write-Host "      MongoDB container restarted" -ForegroundColor Green
    } else {
        Write-Host "      Pulling and starting fresh MongoDB container..." -ForegroundColor DarkGray
        docker run -d --name mongodb-local -p 27017:27017 mongo:7 | Out-Null
        Write-Host "      MongoDB container created and started" -ForegroundColor Green
    }
}

# -- 2. FastAPI Backend -----------------------------------
Write-Host "[2/3] Backend (FastAPI on :8000)..." -ForegroundColor Yellow
$backendJob = Start-Job -ScriptBlock {
    param($py, $dir)
    & $py -m uvicorn server:app --host 0.0.0.0 --port 8000 --reload --app-dir $dir
} -ArgumentList $PYTHON, $BACKEND
Write-Host "      Backend started (Job ID: $($backendJob.Id))" -ForegroundColor Green

Start-Sleep -Seconds 2

# -- 3. React Frontend ------------------------------------
Write-Host "[3/3] Frontend (React on :3000)..." -ForegroundColor Yellow
$frontendJob = Start-Job -ScriptBlock {
    param($dir)
    Set-Location $dir
    npm start
} -ArgumentList $FRONTEND
Write-Host "      Frontend started (Job ID: $($frontendJob.Id))" -ForegroundColor Green

Write-Host ""
Write-Host "---------------------------------------" -ForegroundColor DarkGray
Write-Host "  Frontend  -> http://localhost:3000"    -ForegroundColor White
Write-Host "  Backend   -> http://localhost:8000"    -ForegroundColor White
Write-Host "  API Docs  -> http://localhost:8000/docs" -ForegroundColor White
Write-Host "  MongoDB   -> localhost:27017"           -ForegroundColor White
Write-Host "---------------------------------------" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Press Ctrl+C to stop watching logs. Jobs keep running." -ForegroundColor DarkGray
Write-Host "To stop all:  Stop-Job $($backendJob.Id), $($frontendJob.Id)  then  docker stop mongodb-local" -ForegroundColor DarkGray
Write-Host ""

# Stream job output until user presses Ctrl+C
try {
    while ($true) {
        Receive-Job -Job $backendJob  -Keep 2>&1 | ForEach-Object { Write-Host "[backend] $_"  -ForegroundColor DarkCyan }
        Receive-Job -Job $frontendJob -Keep 2>&1 | ForEach-Object { Write-Host "[frontend] $_" -ForegroundColor DarkMagenta }
        Start-Sleep -Seconds 2
    }
} finally {
    Write-Host "`nDetached from log stream. Jobs still running in background." -ForegroundColor Yellow
}
