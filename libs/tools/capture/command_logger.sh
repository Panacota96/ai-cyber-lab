#!/usr/bin/env bash
# Source this script from your interactive shell:
#   source libs/tools/capture/command_logger.sh
#
# Optional helpers after sourcing:
#   aicl_session_start [project] [operator]
#   aicl_session_end [summary]
#   aicl_run <command ...>         # capture output digest + preview

if [[ -n "${AICL_LOGGER_ACTIVE:-}" ]]; then
  return 0
fi

export AICL_LOGGER_ACTIVE=1
export AICL_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
if [[ -n "${PYTHONPATH:-}" ]]; then
  export PYTHONPATH="${AICL_REPO_ROOT}:$PYTHONPATH"
else
  export PYTHONPATH="${AICL_REPO_ROOT}"
fi
export AICL_PROJECT="${AICL_PROJECT:-default}"
export AICL_LOG_DIR="${AICL_LOG_DIR:-$PWD/data/projects/_logs}"
mkdir -p "$AICL_LOG_DIR"
export AICL_LOG_FILE="${AICL_LOG_FILE:-$AICL_LOG_DIR/terminal_$(date +%F).log}"

aicl__last_cmd=""

_aicl_log_event() {
  local event="$1"
  shift
  local ts
  ts="$(date -Iseconds)"
  printf '[%s] event=%s session=%s project=%s %s\n' \
    "$ts" "$event" "${AICL_SESSION_ID:-none}" "${AICL_PROJECT:-default}" "$*" >> "$AICL_LOG_FILE"
}

aicl_session_start() {
  local project="${1:-${AICL_PROJECT:-default}}"
  local operator="${2:-${USER:-unknown}}"
  export AICL_PROJECT="$project"

  local out
  if out="$(python3 -m libs.tools.capture.sessionctl start --project "$project" --operator "$operator" 2>/dev/null)"; then
    export AICL_SESSION_ID="$(echo "$out" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("session_id",""))' 2>/dev/null)"
  fi

  if [[ -z "${AICL_SESSION_ID:-}" ]]; then
    export AICL_SESSION_ID="$(date +%Y%m%d-%H%M%S)-$RANDOM"
  fi

  _aicl_log_event "session_start" "operator=$(printf %q "$operator")"
  echo "AICL session started: project=$AICL_PROJECT session=$AICL_SESSION_ID"
}

aicl_session_end() {
  local summary="${1:-}"
  if [[ -n "${AICL_SESSION_ID:-}" ]]; then
    python3 -m libs.tools.capture.sessionctl end \
      --project "${AICL_PROJECT:-default}" \
      --session-id "$AICL_SESSION_ID" \
      --summary "$summary" >/dev/null 2>&1 || true
  fi
  _aicl_log_event "session_end" "summary=$(printf %q "$summary")"
  echo "AICL session ended: project=${AICL_PROJECT:-default} session=${AICL_SESSION_ID:-none}"
  unset AICL_SESSION_ID
}

aicl_run() {
  if [[ $# -eq 0 ]]; then
    echo "Usage: aicl_run <command ...>"
    return 2
  fi

  local tmp
  tmp="$(mktemp)"
  "$@" > >(tee "$tmp") 2> >(tee -a "$tmp" >&2)
  local rc=$?
  local digest preview
  digest="$(sha256sum "$tmp" | awk '{print $1}')"
  preview="$(tail -n 5 "$tmp" | tr '\n' ' ' | cut -c1-240)"
  _aicl_log_event "command_output" \
    "exit=$rc" \
    "digest=$digest" \
    "output_preview=$(printf %q "$preview")" \
    "cmd=$(printf %q "$*")"
  rm -f "$tmp"
  return $rc
}

trap 'aicl__last_cmd=$BASH_COMMAND' DEBUG

_aicl_precmd() {
  local exit_code=$?
  if [[ -n "$aicl__last_cmd" ]]; then
    _aicl_log_event "command" \
      "exit=$exit_code" \
      "cwd=$(printf %q "$PWD")" \
      "cmd=$(printf %q "$aicl__last_cmd")"
  fi
}

if [[ -n "${PROMPT_COMMAND:-}" ]]; then
  PROMPT_COMMAND="_aicl_precmd;${PROMPT_COMMAND}"
else
  PROMPT_COMMAND="_aicl_precmd"
fi

echo "AICL logger active -> $AICL_LOG_FILE"
echo "Use: aicl_session_start [project] [operator], aicl_session_end [summary], aicl_run <cmd>"
