#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INFRA_DIR="$ROOT_DIR/infra"
API_URL="${AICL_API_URL:-http://127.0.0.1:8080}"
TOOL_EXEC_URL="${AICL_TOOL_EXEC_URL:-http://127.0.0.1:8082}"
PROJECT="${AICL_SMOKE_PROJECT:-smoke-compose}"
WITH_UI=0
WITH_EXEGOL=0
KEEP_UP=0
SKIP_BUILD=0
FAILURES=0

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
      echo "Usage: bash scripts/smoke_compose.sh [--with-ui] [--with-exegol] [--keep-up] [--skip-build]"
      exit 2
      ;;
  esac
done

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
  SERVICES+=(exegol)
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
  run_step "ui health" curl -fsS http://127.0.0.1:8091/health
fi

if [[ "$WITH_EXEGOL" -eq 1 ]]; then
  run_step "exegol container running" bash -lc "docker ps --format '{{.Names}}' | grep -q '^aicl-exegol$'"
fi

if [[ "$FAILURES" -gt 0 ]]; then
  echo "Smoke test finished with $FAILURES failure(s)."
  exit 1
fi

echo "Smoke test finished successfully."
