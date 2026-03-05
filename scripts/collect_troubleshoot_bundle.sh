#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${AICL_COMPOSE_FILE:-$ROOT_DIR/infra/docker-compose.yml}"
API_PORT="${AICL_API_PORT:-8080}"
API_URL="${AICL_API_URL:-http://127.0.0.1:${API_PORT}}"
TOOL_EXEC_URL="${AICL_TOOL_EXEC_URL:-http://127.0.0.1:8082}"
BUNDLE_ROOT="${AICL_BUNDLE_LOG_DIR:-$ROOT_DIR/logs/troubleshoot}"
DOCKER_SINCE="${AICL_DOCKER_LOG_SINCE:-2h}"
DOCKER_TAIL_LINES="${AICL_DOCKER_LOG_TAIL_LINES:-1200}"
APP_TAIL_LINES="${AICL_APP_LOG_TAIL_LINES:-1500}"
CMD_TIMEOUT="${AICL_BUNDLE_CMD_TIMEOUT:-25}"
COMPOSE_LOG_TIMEOUT="${AICL_BUNDLE_COMPOSE_LOG_TIMEOUT:-60}"
DOCKER_EVENTS_TIMEOUT="${AICL_BUNDLE_DOCKER_EVENTS_TIMEOUT:-35}"
CURL_MAX_TIME="${AICL_BUNDLE_CURL_MAX_TIME:-8}"

usage() {
  cat <<'EOF'
Usage: bash scripts/collect_troubleshoot_bundle.sh [options]

Options:
  --since <duration>        Docker events/logs lookback window (default: 2h)
  --docker-tail <lines>     Per-container docker log tail lines (default: 1200)
  --app-tail <lines>        App log tail lines for logs/aicl.log (default: 1500)
  --out-dir <path>          Bundle root directory (default: logs/troubleshoot)
  --api-url <url>           Orchestrator URL (default: http://127.0.0.1:${AICL_API_PORT:-8080})
  --tool-exec-url <url>     Tool-exec URL (default: http://127.0.0.1:8082)
  --compose-file <path>     Compose file path (default: infra/docker-compose.yml)
  --timeout <seconds>       Default command timeout (default: 25)
  -h, --help                Show this help

Environment:
  AICL_DOCKER_LOG_SINCE, AICL_DOCKER_LOG_TAIL_LINES, AICL_APP_LOG_TAIL_LINES,
  AICL_BUNDLE_LOG_DIR, AICL_API_URL, AICL_TOOL_EXEC_URL, AICL_COMPOSE_FILE,
  AICL_BUNDLE_CMD_TIMEOUT, AICL_BUNDLE_COMPOSE_LOG_TIMEOUT,
  AICL_BUNDLE_DOCKER_EVENTS_TIMEOUT, AICL_BUNDLE_CURL_MAX_TIME
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --since)
      DOCKER_SINCE="${2:?missing value for --since}"
      shift 2
      ;;
    --docker-tail)
      DOCKER_TAIL_LINES="${2:?missing value for --docker-tail}"
      shift 2
      ;;
    --app-tail)
      APP_TAIL_LINES="${2:?missing value for --app-tail}"
      shift 2
      ;;
    --out-dir)
      BUNDLE_ROOT="${2:?missing value for --out-dir}"
      shift 2
      ;;
    --api-url)
      API_URL="${2:?missing value for --api-url}"
      shift 2
      ;;
    --tool-exec-url)
      TOOL_EXEC_URL="${2:?missing value for --tool-exec-url}"
      shift 2
      ;;
    --compose-file)
      COMPOSE_FILE="${2:?missing value for --compose-file}"
      shift 2
      ;;
    --timeout)
      CMD_TIMEOUT="${2:?missing value for --timeout}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      usage
      exit 2
      ;;
  esac
done

ts="$(date -u +%Y%m%d-%H%M%S)"
bundle_dir="${BUNDLE_ROOT}/bundle_${ts}"
mkdir -p "$bundle_dir/docker/inspect" "$bundle_dir/api" "$bundle_dir/app" "$bundle_dir/system"

run_capture() {
  local outfile="$1"
  shift
  local timeout_secs="$CMD_TIMEOUT"
  if [[ "${1:-}" == "--timeout" ]]; then
    timeout_secs="${2:?missing timeout value}"
    shift 2
  fi
  local rc=0
  {
    echo "# command: $*"
    echo "# timestamp_utc: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo
    set +e
    if command -v timeout >/dev/null 2>&1; then
      timeout "${timeout_secs}s" "$@"
      rc=$?
    else
      "$@"
      rc=$?
    fi
    set -e
    echo
    echo "# exit_code: $rc"
    if [[ "$rc" -eq 124 ]]; then
      echo "# timed_out: true (${timeout_secs}s)"
    fi
  } >"$outfile" 2>&1
}

run_capture "${bundle_dir}/system/env.txt" env
run_capture "${bundle_dir}/system/uname.txt" uname -a
run_capture "${bundle_dir}/system/date_utc.txt" date -u
run_capture "${bundle_dir}/system/df_h.txt" df -h
run_capture "${bundle_dir}/system/free_h.txt" free -h
run_capture "${bundle_dir}/system/ports_ss.txt" ss -ltnp
run_capture "${bundle_dir}/system/git_status.txt" git -C "$ROOT_DIR" status --short --branch
run_capture "${bundle_dir}/system/git_head.txt" git -C "$ROOT_DIR" log -1 --decorate --oneline

run_capture "${bundle_dir}/docker/docker_version.txt" docker version
run_capture "${bundle_dir}/docker/docker_info.txt" docker info
run_capture "${bundle_dir}/docker/compose_services.txt" docker compose -f "$COMPOSE_FILE" config --services
run_capture "${bundle_dir}/docker/compose_ps.txt" docker compose -f "$COMPOSE_FILE" ps
run_capture "${bundle_dir}/docker/compose_logs.txt" --timeout "$COMPOSE_LOG_TIMEOUT" docker compose -f "$COMPOSE_FILE" logs --timestamps --no-color --tail "$DOCKER_TAIL_LINES"
run_capture "${bundle_dir}/docker/docker_events.txt" --timeout "$DOCKER_EVENTS_TIMEOUT" docker events --since "$DOCKER_SINCE" --until "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

mapfile -t compose_containers < <(docker compose -f "$COMPOSE_FILE" ps --format '{{.Name}}' 2>/dev/null || true)
for c in "${compose_containers[@]}"; do
  [[ -z "$c" ]] && continue
  run_capture "${bundle_dir}/docker/${c}.log" docker logs --timestamps --tail "$DOCKER_TAIL_LINES" "$c"
  run_capture "${bundle_dir}/docker/inspect/${c}.json" docker inspect "$c"
done

run_capture "${bundle_dir}/api/health.json" curl -fsS --max-time "$CURL_MAX_TIME" "${API_URL}/health"
run_capture "${bundle_dir}/api/ready.json" curl -fsS --max-time "$CURL_MAX_TIME" "${API_URL}/ready"
run_capture "${bundle_dir}/api/diagnostics.json" curl -fsS --max-time "$CURL_MAX_TIME" "${API_URL}/diagnostics?project=default"
run_capture "${bundle_dir}/api/logs.json" curl -fsS --max-time "$CURL_MAX_TIME" "${API_URL}/logs?lines=400"
run_capture "${bundle_dir}/api/tool_exec_health.json" curl -fsS --max-time "$CURL_MAX_TIME" "${TOOL_EXEC_URL}/health"
run_capture "${bundle_dir}/api/tool_exec_capabilities.json" curl -fsS --max-time "$CURL_MAX_TIME" "${TOOL_EXEC_URL}/capabilities"

if [[ -f "$ROOT_DIR/logs/aicl.log" ]]; then
  tail -n "$APP_TAIL_LINES" "$ROOT_DIR/logs/aicl.log" > "${bundle_dir}/app/aicl.tail.log" 2>&1 || true
fi
if [[ -f "$ROOT_DIR/logs/dev-server.log" ]]; then
  tail -n "$APP_TAIL_LINES" "$ROOT_DIR/logs/dev-server.log" > "${bundle_dir}/app/dev-server.tail.log" 2>&1 || true
fi
if [[ -d "$ROOT_DIR/data/projects/_logs" ]]; then
  run_capture "${bundle_dir}/app/session_logs_listing.txt" ls -lah "$ROOT_DIR/data/projects/_logs"
  latest_session_log="$(ls -1t "$ROOT_DIR"/data/projects/_logs/terminal_*.log "$ROOT_DIR"/data/projects/_logs/terminal_*.log.gz 2>/dev/null | head -n 1 || true)"
  if [[ -n "${latest_session_log}" ]]; then
    if [[ "$latest_session_log" == *.gz ]]; then
      run_capture "${bundle_dir}/app/latest_session_log_tail.txt" bash -lc "zcat \"$latest_session_log\" | tail -n ${APP_TAIL_LINES}"
    else
      tail -n "$APP_TAIL_LINES" "$latest_session_log" > "${bundle_dir}/app/latest_session_log_tail.txt" 2>&1 || true
    fi
  fi
fi

tarball="${bundle_dir}.tar.gz"
tar -C "$BUNDLE_ROOT" -czf "$tarball" "$(basename "$bundle_dir")"

echo "Bundle directory: $bundle_dir"
echo "Bundle archive:   $tarball"
echo "Tip: share only with trusted reviewers; bundle may contain sensitive data."
