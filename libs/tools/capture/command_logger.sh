#!/usr/bin/env bash
# Source this script from your interactive shell:
#   source libs/tools/capture/command_logger.sh

if [[ -n "${AICL_LOGGER_ACTIVE:-}" ]]; then
  return 0
fi

export AICL_LOGGER_ACTIVE=1
export AICL_LOG_DIR="${AICL_LOG_DIR:-$PWD/data/projects/_logs}"
mkdir -p "$AICL_LOG_DIR"
export AICL_LOG_FILE="${AICL_LOG_FILE:-$AICL_LOG_DIR/terminal_$(date +%F).log}"

aicl__last_cmd=""

trap 'aicl__last_cmd=$BASH_COMMAND' DEBUG

_aicl_precmd() {
  local exit_code=$?
  if [[ -n "$aicl__last_cmd" ]]; then
    printf '[%s] exit=%s cwd=%s cmd=%q\n' "$(date -Iseconds)" "$exit_code" "$PWD" "$aicl__last_cmd" >> "$AICL_LOG_FILE"
  fi
}

if [[ -n "${PROMPT_COMMAND:-}" ]]; then
  PROMPT_COMMAND="_aicl_precmd;${PROMPT_COMMAND}"
else
  PROMPT_COMMAND="_aicl_precmd"
fi

echo "AICL logger active -> $AICL_LOG_FILE"
