# Testing Roadmap

This guide defines how to validate the full project locally in WSL.

## Goal
Verify that routing, agents, sessions, reports, knowledge memory, and troubleshooting logs behave correctly before pushing changes.

## Prerequisites
- WSL terminal at repo root.
- Python 3.11+ and Docker available.
- `.env` created from `.env.example`.
- If `8080` is occupied, set `AICL_API_PORT=8090` (or another free port).

## Quality Gate (One Command)
Run:

```bash
make verify
```

What it does:
1. Compiles Python modules (`apps`, `libs`, `scripts`, `tests`).
2. Runs tests in `tests/`.
3. Runs prompt routing regression from `automation/evals/prompt_regression.json`.
4. Runs changelog policy check script.

Expected outcome:
- Process exits with code `0`.
- Console prints `Verification completed successfully.`

## Full Container Smoke Campaign
Run:

```bash
make smoke-compose
```

Variants:

```bash
bash scripts/smoke_compose.sh --with-ui
bash scripts/smoke_compose.sh --with-ui --with-exegol
bash scripts/smoke_compose.sh --with-ui --strict-exegol
```

Notes:
- `--with-exegol` validates Exegol wiring and starts the Exegol container only if the image is already cached locally.
- `--strict-exegol` forces full Exegol pull/start validation (first run can take significant time and bandwidth).

Expected outcome:
- Core services build and start.
- Orchestrator and tool-exec health endpoints return `200`.
- Route, runtime, and report smoke checks pass.
- Script exits `0` with `Smoke test finished successfully.`

## Layered Testing Matrix

| Layer | Command | Purpose | Expected |
|---|---|---|---|
| Bootstrap | `bash scripts/bootstrap.sh` | Build local venv and install package | `.venv` exists and install ends without errors |
| Dependencies | `cd infra && docker compose up -d qdrant ollama` | Start memory and local model endpoints | Containers are running |
| Full container smoke | `make smoke-compose` | Validate compose build + core health + route/report/runtime checks | Script exits `0` |
| API readiness | `curl -sS http://127.0.0.1:<PORT>/ready` | Check orchestrator dependency health | JSON with `status` and `dependencies` |
| Tool-exec readiness | `curl -sS http://127.0.0.1:8082/health` | Check execution microservice is up | `{"status":"ok"}` |
| Tool capabilities | `curl -sS http://127.0.0.1:8082/capabilities` | Verify runtime/container mapping and allowed tools | JSON includes `mode`, `allowed_tools`, `container_status` |
| Unit + contracts | `make test` | Validate parser behavior and API/session contracts | `N passed` |
| Prompt routing | `make eval` | Guard routing behavior from regression | Pass rate >= configured threshold |
| Troubleshooting log | `curl -sS "http://127.0.0.1:<PORT>/logs?lines=200"` | Confirm structured events are available | JSON with `stats` and `lines` |
| Diagnostics | `curl -sS "http://127.0.0.1:<PORT>/diagnostics?project=demo"` | Inspect readiness + trace + critical events | JSON includes readiness/trace/knowledge/log stats |

## End-to-End Smoke Test (Session + Report)
1. Start API in background:

```bash
AICL_API_PORT=8090 nohup bash scripts/run_dev.sh > logs/dev-server.log 2>&1 &
echo $! > /tmp/aicl_api.pid
```

2. Check health:

```bash
curl -sS http://127.0.0.1:8090/health
```

Expected: `{"status":"ok"}`.

3. Start session:

```bash
curl -sS -X POST http://127.0.0.1:8090/sessions/start \
  -H 'content-type: application/json' \
  -d '{"project":"demo","operator":"david"}'
```

4. Route one study request and one pentest request:

```bash
curl -sS -X POST http://127.0.0.1:8090/route \
  -H 'content-type: application/json' \
  -d '{"project":"demo","user_input":"Summarize CCNA OSPF and create flashcards"}'

curl -sS -X POST http://127.0.0.1:8090/route \
  -H 'content-type: application/json' \
  -d '{"project":"demo","user_input":"nmap recon on 10.10.10.10"}'
```

Expected:
- Both responses include `project`, `route`, `result`, `trace_id`.
- Notes are written under `data/projects/demo/`.

5. End session and build report:

```bash
curl -sS -X POST http://127.0.0.1:8090/sessions/end \
  -H 'content-type: application/json' \
  -d '{"project":"demo","summary":"smoke test complete"}'

bash scripts/aicl.sh "writeup project demo" --project demo
```

Expected:
- `data/projects/demo/report/auto_report.md` exists.
- Report includes `## Evidence Map`.

6. Stop API:

```bash
kill "$(cat /tmp/aicl_api.pid)"
rm -f /tmp/aicl_api.pid
```

## Log Cap Validation (1MB)
Central log file:
- `/mnt/c/Users/david/OneDrive - Pontificia Universidad Javeriana/Documents/GitHub/ai-cyber-lab/logs/aicl.log`

Check cap:

```bash
wc -c "/mnt/c/Users/david/OneDrive - Pontificia Universidad Javeriana/Documents/GitHub/ai-cyber-lab/logs/aicl.log"
```

Expected:
- Size is always `<= 1048576` bytes.

## Command Log Maintenance Validation
Run:

```bash
make maintain-logs
```

Expected:
- Command returns JSON summary with `compressed` and `deleted` counters.
- Older files may become `terminal_YYYY-MM-DD.log.gz`.
- Report generation still works against both `.log` and `.log.gz` sources.

## Troubleshooting Bundle (Docker + API + System)
Run:

```bash
make bundle-logs
```

Expected:
- Creates `logs/troubleshoot/bundle_<timestamp>/` and `.tar.gz` archive.
- Captures:
  - compose logs + docker events + per-container logs + `docker inspect`
  - orchestrator/tool-exec health-readiness-diagnostics snapshots
  - app log tails (`logs/aicl.log`, `logs/dev-server.log`)
  - latest session command log tail and system context (`ss`, `df`, `free`, git/docker info)

Useful overrides:

```bash
AICL_DOCKER_LOG_SINCE=6h AICL_DOCKER_LOG_TAIL_LINES=3000 make bundle-logs
```

## Failure Debug Guide
- `curl` connection error: API is not running; start with `bash scripts/run_dev.sh` or `nohup` mode.
- tool-exec `503` or timeout: ensure service is up and `AICL_TOOL_EXEC_URL` is reachable.
- command blocked errors: check `AICL_ALLOWED_TOOLS` and tool/container mapping.
- `ready` degraded: one of `qdrant` or `ollama` is down; check `docker ps` and endpoint URLs in `.env`.
- Empty reports: ensure `command_logger.sh` or API session endpoints were used in the same project scope.
- Knowledge retrieval errors: verify Qdrant endpoint and run `index: project` via route endpoint.
