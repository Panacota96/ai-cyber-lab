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

## Layered Testing Matrix

| Layer | Command | Purpose | Expected |
|---|---|---|---|
| Bootstrap | `bash scripts/bootstrap.sh` | Build local venv and install package | `.venv` exists and install ends without errors |
| Dependencies | `cd infra && docker compose up -d qdrant ollama` | Start memory and local model endpoints | Containers are running |
| API readiness | `curl -sS http://127.0.0.1:<PORT>/ready` | Check orchestrator dependency health | JSON with `status` and `dependencies` |
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

python -m apps.orchestrator.main "writeup project demo" --project demo
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

## Failure Debug Guide
- `curl` connection error: API is not running; start with `bash scripts/run_dev.sh` or `nohup` mode.
- `ready` degraded: one of `qdrant` or `ollama` is down; check `docker ps` and endpoint URLs in `.env`.
- Empty reports: ensure `command_logger.sh` or API session endpoints were used in the same project scope.
- Knowledge retrieval errors: verify Qdrant endpoint and run `index: project` via route endpoint.
