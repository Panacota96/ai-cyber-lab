#!/usr/bin/env bash
set -euo pipefail

if [[ ! -d .venv ]]; then
  echo "Missing .venv. Run: bash scripts/bootstrap.sh"
  exit 1
fi

exec .venv/bin/python -m apps.orchestrator.main --serve
