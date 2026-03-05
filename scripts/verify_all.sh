#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -d .venv ]]; then
  echo "Missing .venv. Run: bash scripts/bootstrap.sh"
  exit 1
fi

PYTHON_BIN=".venv/bin/python"

echo "[1/4] Compile checks"
"$PYTHON_BIN" -m compileall apps libs scripts tests

echo "[2/4] Unit and contract tests"
"$PYTHON_BIN" -m pytest -q tests

echo "[3/4] Prompt regression gate"
"$PYTHON_BIN" scripts/run_prompt_regression.py --min-pass-rate "${AICL_MIN_PASS_RATE:-90}"

echo "[4/4] Changelog policy check (HEAD)"
"$PYTHON_BIN" scripts/check_changelog.py

echo "Verification completed successfully."
