# Starts Postgres and prepares the database. Tables are created automatically
# on first backend startup; this script also stamps Alembic for future
# migrations. Run from the repo root:  ./scripts/setup-db.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

docker compose -f "$root\docker-compose.yml" up -d postgres
Write-Host "Waiting for Postgres to be healthy..." -ForegroundColor Cyan
Start-Sleep -Seconds 5

Push-Location "$root\backend"
& ".venv\Scripts\python.exe" -c "from db.models import Base; from db.session import engine; Base.metadata.create_all(engine); print('Tables created.')"
& ".venv\Scripts\alembic.exe" stamp head
Pop-Location
Write-Host "Database ready." -ForegroundColor Green
