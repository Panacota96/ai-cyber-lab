#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INFRA_DIR="$ROOT_DIR/infra"
API_HOST_PORT="${AICL_API_HOST_PORT:-8080}"
TOOL_EXEC_HOST_PORT="${AICL_TOOL_EXEC_HOST_PORT:-8082}"
UI_HOST_PORT="${AICL_UI_HOST_PORT:-8091}"
API_URL="${AICL_API_URL:-http://127.0.0.1:${API_HOST_PORT}}"
TOOL_EXEC_URL="${AICL_TOOL_EXEC_URL:-http://127.0.0.1:${TOOL_EXEC_HOST_PORT}}"
PROJECT="${AICL_SMOKE_PROJECT:-smoke-compose}"
WITH_UI=0
WITH_EXEGOL=0
EXEGOL_STRICT=0
KEEP_UP=0
SKIP_BUILD=0
FAILURES=0
EXEGOL_IMAGE="${AICL_EXEGOL_IMAGE:-nwodtuhs/exegol:free}"
EXEGOL_IMAGE_PRESENT=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-ui)
      WITH_UI=1
      shift
      ;;
    --with-exegol)
      WITH_EXEGOL=1
      shift
      ;;
    --strict-exegol)
      WITH_EXEGOL=1
      EXEGOL_STRICT=1
      shift
      ;;
    --keep-up)
      KEEP_UP=1
      shift
      ;;
    --skip-build)
      SKIP_BUILD=1
      shift
      ;;
    *)
      echo "Unknown argument: $1"
      echo "Usage: bash scripts/smoke_compose.sh [--with-ui] [--with-exegol] [--strict-exegol] [--keep-up] [--skip-build]"
      exit 2
      ;;
  esac
done

if docker image inspect "$EXEGOL_IMAGE" >/dev/null 2>&1; then
  EXEGOL_IMAGE_PRESENT=1
fi

COMPOSE_ARGS=()
if [[ "$WITH_UI" -eq 1 ]]; then
  COMPOSE_ARGS+=(--profile ui)
fi
if [[ "$WITH_EXEGOL" -eq 1 ]]; then
  COMPOSE_ARGS+=(--profile exegol)
fi

SERVICES=(qdrant ollama tools-core py2-runner py3-runner tool-exec orchestrator)
if [[ "$WITH_UI" -eq 1 ]]; then
  SERVICES+=(ui-web)
fi
if [[ "$WITH_EXEGOL" -eq 1 ]]; then
  # Default mode avoids pulling the full Exegol image on first run.
  if [[ "$EXEGOL_STRICT" -eq 1 || "$EXEGOL_IMAGE_PRESENT" -eq 1 ]]; then
    SERVICES+=(exegol)
  fi
fi

run_step() {
  local label="$1"
  shift
  echo "==> $label"
  if "$@"; then
    echo "PASS: $label"
  else
    echo "FAIL: $label"
    FAILURES=$((FAILURES + 1))
  fi
}

cleanup() {
  if [[ "$KEEP_UP" -eq 1 ]]; then
    echo "Keeping containers up (--keep-up set)."
    return
  fi
  echo "Bringing compose stack down..."
  compose_cmd down || true
}
trap cleanup EXIT

compose_cmd() {
  (
    cd "$INFRA_DIR"
    docker compose "${COMPOSE_ARGS[@]}" "$@"
  )
}

if [[ "$SKIP_BUILD" -eq 0 ]]; then
  run_step "docker compose build" compose_cmd build "${SERVICES[@]}"
fi

run_step "docker compose up" compose_cmd up -d "${SERVICES[@]}"
sleep 5

run_step "orchestrator health" curl -fsS "$API_URL/health"
run_step "orchestrator ready" curl -fsS "$API_URL/ready"
run_step "tool-exec health" curl -fsS "$TOOL_EXEC_URL/health"
run_step "tool-exec capabilities" curl -fsS "$TOOL_EXEC_URL/capabilities"

run_step "route study request" curl -fsS -X POST "$API_URL/route" \
  -H "content-type: application/json" \
  -d "{\"project\":\"$PROJECT\",\"user_input\":\"Summarize CCNA OSPF and create flashcards\"}"

run_step "route pentest request" curl -fsS -X POST "$API_URL/route" \
  -H "content-type: application/json" \
  -d "{\"project\":\"$PROJECT\",\"user_input\":\"nmap recon on 10.10.10.10\"}"

run_step "python3 runtime check via tool-exec" curl -fsS -X POST "$TOOL_EXEC_URL/run" \
  -H "content-type: application/json" \
  -d '{"cmd":["python3","--version"],"timeout":15}'

run_step "python2 runtime check via tool-exec" curl -fsS -X POST "$TOOL_EXEC_URL/run" \
  -H "content-type: application/json" \
  -d '{"cmd":["python2","--version"],"timeout":15}'

run_step "generate report" bash -lc "cd '$ROOT_DIR' && bash scripts/aicl.sh \"writeup project $PROJECT\" --project \"$PROJECT\""

if [[ "$WITH_UI" -eq 1 ]]; then
  run_step "ui health" curl -fsS "http://127.0.0.1:${UI_HOST_PORT}/health"
fi

if [[ "$WITH_EXEGOL" -eq 1 ]]; then
  run_step "exegol service declared" bash -lc "cd '$INFRA_DIR' && docker compose config --services | grep -q '^exegol$'"
  if [[ "$EXEGOL_STRICT" -eq 1 ]]; then
    run_step "exegol compose up (strict)" compose_cmd up -d exegol
    run_step "exegol container running" bash -lc "docker ps --format '{{.Names}}' | grep -q '^aicl-exegol$'"
  elif [[ "$EXEGOL_IMAGE_PRESENT" -eq 1 ]]; then
    run_step "exegol compose up (cached image)" compose_cmd up -d exegol
    run_step "exegol container running" bash -lc "docker ps --format '{{.Names}}' | grep -q '^aicl-exegol$'"
  else
    echo "SKIP: exegol runtime start (image $EXEGOL_IMAGE not present)."
    echo "      Run with --strict-exegol to pull/start Exegol in this smoke test."
  fi
fi

if [[ "$FAILURES" -gt 0 ]]; then
  echo "Smoke test finished with $FAILURES failure(s)."
  exit 1
fi

echo "Smoke test finished successfully."
