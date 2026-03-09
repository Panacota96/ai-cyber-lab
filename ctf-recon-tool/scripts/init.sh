#!/usr/bin/env bash
# Helm's Paladin — initialisation + startup helper
# Usage: ./scripts/init.sh [dev|start|build]
#        chmod +x scripts/init.sh   (first-time setup)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# 1. Bootstrap .env from example if missing
if [ ! -f .env ] && [ -f .env.example ]; then
  cp .env.example .env
  echo "[init] Created .env from .env.example — edit it to add your API keys."
fi

# 2. Ensure runtime data directories exist
mkdir -p data/sessions
echo "[init] data/ directories ready."

# 3. Install dependencies if node_modules is absent
if [ ! -d node_modules ]; then
  echo "[init] node_modules not found — running npm install..."
  npm install
fi

# 4. Start the server (default: dev)
MODE="${1:-dev}"
echo "[init] Starting Helm's Paladin in '${MODE}' mode..."
exec npm run "$MODE"
