# Starts Postgres (docker), the FastAPI backend, and the Vite frontend together.
# Run from the repo root:  ./scripts/run-dev.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

if (-not (Test-Path "$root\.env")) {
    Write-Host "No .env found — copying .env.example. Fill in your keys!" -ForegroundColor Yellow
    Copy-Item "$root\.env.example" "$root\.env"
}

Write-Host "Starting Postgres (docker compose)..." -ForegroundColor Cyan
docker compose -f "$root\docker-compose.yml" up -d

# Backend venv
if (-not (Test-Path "$root\backend\.venv")) {
    Write-Host "Creating Python venv + installing backend deps (first run)..." -ForegroundColor Cyan
    python -m venv "$root\backend\.venv"
    & "$root\backend\.venv\Scripts\pip.exe" install -r "$root\backend\requirements.txt"
}

# Frontend deps
if (-not (Test-Path "$root\frontend\node_modules")) {
    Write-Host "Installing frontend deps (first run)..." -ForegroundColor Cyan
    Push-Location "$root\frontend"; npm install; Pop-Location
}

Write-Host "Launching backend (http://localhost:8000) and frontend (http://localhost:5173)..." -ForegroundColor Cyan
$backend = Start-Process -PassThru -WorkingDirectory "$root\backend" `
    -FilePath "$root\backend\.venv\Scripts\python.exe" `
    -ArgumentList "-m", "uvicorn", "main:app", "--reload", "--host", "0.0.0.0", "--port", "8000"
$frontend = Start-Process -PassThru -WorkingDirectory "$root\frontend" `
    -FilePath "npm" -ArgumentList "run", "dev"

Write-Host ""
Write-Host "Jarvis is starting:" -ForegroundColor Green
Write-Host "  HUD:     http://localhost:5173"
Write-Host "  API:     http://localhost:8000/health"
Write-Host "  iPhone:  http://<your-tailscale-hostname>:5173 (Tailscale on both devices)"
Write-Host "Press Ctrl+C in this window, then close the spawned windows to stop."

Wait-Process -Id $backend.Id, $frontend.Id
