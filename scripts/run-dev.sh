#!/usr/bin/env bash
# Linux/macOS equivalent of run-dev.ps1 (handy for WSL or non-Windows machines).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

[ -f "$ROOT/.env" ] || { echo "No .env — copying .env.example. Fill in your keys!"; cp "$ROOT/.env.example" "$ROOT/.env"; }

docker compose -f "$ROOT/docker-compose.yml" up -d

if [ ! -d "$ROOT/backend/.venv" ]; then
  python3 -m venv "$ROOT/backend/.venv"
  "$ROOT/backend/.venv/bin/pip" install -r "$ROOT/backend/requirements.txt"
fi
[ -d "$ROOT/frontend/node_modules" ] || (cd "$ROOT/frontend" && npm install)

trap 'kill 0' EXIT
(cd "$ROOT/backend" && "$ROOT/backend/.venv/bin/python" -m uvicorn main:app --reload --host 0.0.0.0 --port 8000) &
(cd "$ROOT/frontend" && npm run dev) &
echo "HUD: http://localhost:5173 · API: http://localhost:8000/health"
wait
