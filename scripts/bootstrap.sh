#!/usr/bin/env bash
set -euo pipefail

if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi

# shellcheck disable=SC1091
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e .

echo "Bootstrap complete. Activate with: source .venv/bin/activate"
