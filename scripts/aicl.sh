#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="$ROOT_DIR/.venv/bin/python"

if [[ ! -x "$PYTHON_BIN" ]]; then
  echo "Missing virtualenv python at $PYTHON_BIN"
  echo "Run: bash scripts/bootstrap.sh"
  exit 1
fi

exec "$PYTHON_BIN" -m apps.orchestrator.main "$@"
