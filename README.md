# AI Cyber Lab

Local multi-agent cyber lab for authorized labs/CTFs and certification study.

This repository provides a segmented architecture with specialized agents:
- `study`: certification notes, flashcards, and weak-topic tracking.
- `pentest`: recon parsing, next-step suggestions, and structured note capture.
- `report`: log-to-writeup automation.
- `knowledge`: RAG-style storage/retrieval over your own notes.
- `research`: scoped technical research prompts/checklists.

The default orchestrator path uses deterministic keyword routing. Enable model-based router only if desired (`AICL_USE_LLM_ROUTER=true`). Set `AICL_USE_LANGGRAPH=true` only when your local LangGraph install is stable.

Graph backend modes:
- `sqlite` fallback (always available)
- `neo4j` primary graph store for relationship-heavy investigations

## Documentation Index
- [How To Use](docs/HOW_TO_USE.md)
- [Testing Roadmap](docs/TESTING_ROADMAP.md)
- [Usage Playbook](docs/USAGE_PLAYBOOK.md)
- [Free Tools Stack](docs/FREE_TOOLS_STACK.md)
- [Robustness Next Steps](docs/ROBUSTNESS_NEXT_STEPS.md)
- [Future Improvements](docs/FUTURE_IMPROVEMENTS.md)
- [Pilot Offer Playbook](docs/PILOT_OFFER.md)

## Safety
Use only on systems and labs you are explicitly authorized to test (HTB/THM/PortSwigger labs, internal approved environments, CTF targets).

## Project Layout
```text
apps/
  orchestrator/         # LangGraph router + FastAPI/CLI entrypoints
  agents/               # Specialized agent handlers
  tool_exec/            # Tool execution microservice
  ui/                   # Local web dashboard
libs/
  tools/                # Command wrappers/parsers/capture scripts
  memory/               # Qdrant + RAG helpers
  docs/                 # Markdown writer + report templates
automation/
  schemas/              # JSON schemas used to validate generated note payloads
data/
  knowledge/            # Knowledge documents for indexing
  projects/             # Generated project outputs
  artifacts/            # Raw artifacts/logs/screenshots
logs/
  aicl.log              # Global troubleshooting log (hard-capped to 1MB)
infra/
  docker-compose.yml    # Full local stack (orchestrator, tool-exec, runtimes, UI profile)
  images/               # Dockerfiles for orchestrator/tool-exec/ui/runtimes
  kubernetes/           # Optional scale-out manifests
scripts/
  bootstrap.sh          # Local environment setup
  run_dev.sh            # Run API locally
```

## Quick Start (WSL)
Use `bash scripts/aicl.sh ...` or `.venv/bin/python ...` for CLI commands.  
Do not use bare `python` if your system default is Python 2.7.

1. Copy env file:
```bash
cp .env.example .env
```

Recommended for zero external AI cost:
```bash
export AICL_LOCAL_ONLY_MODE=true
export AICL_PROPOSAL_PROVIDERS=ollama
export AICL_USE_LLM_ROUTER=true
export AICL_TOOL_PROFILE=web
```

Optional API hardening:
```bash
export AICL_API_KEY=change-me
export AICL_ROUTE_RATE_LIMIT_PER_MIN=30
```

2. Start core container stack:
```bash
make up
```

Optional profiles:
```bash
make up-ui        # web dashboard on :8091
make up-exegol    # exegol runtime container
```

3. Bootstrap Python environment:
```bash
bash scripts/bootstrap.sh
```

4. Test CLI router:
```bash
bash scripts/aicl.sh "Summarize OSPF and generate flashcards"
bash scripts/aicl.sh "nmap recon on 10.10.10.10"
```

5. Run API:
```bash
bash scripts/run_dev.sh
```

If port `8080` is occupied:
```bash
AICL_API_PORT=8090 bash scripts/run_dev.sh
```

Run in background (daemon style):
```bash
AICL_API_PORT=8090 nohup bash scripts/run_dev.sh > logs/dev-server.log 2>&1 &
echo $! > /tmp/aicl_api.pid
```

6. Check health/readiness:
```bash
curl -sS http://127.0.0.1:${AICL_API_PORT:-8080}/health
curl -sS http://127.0.0.1:${AICL_API_PORT:-8080}/ready
curl -sS "http://127.0.0.1:${AICL_API_PORT:-8080}/diagnostics?project=demo"
curl -sS "http://127.0.0.1:${AICL_API_PORT:-8080}/ops/health/deep?project=demo"
curl -sS http://127.0.0.1:8082/health
curl -sS http://127.0.0.1:8082/capabilities
```

If UI profile is enabled:
```bash
xdg-open http://127.0.0.1:8091
```

## Command Logger (delegated note-taking)
- Bash/WSL:
```bash
source libs/tools/capture/command_logger.sh
```
- PowerShell (Windows):
```powershell
. .\libs\tools\capture\command_logger.ps1
```

Commands are appended to `data/projects/_logs/terminal_<date>.log`.
Older logs can be auto-compressed to `terminal_<date>.log.gz` and pruned by retention policy.

Manual maintenance:
```bash
make maintain-logs
```

Retention controls:
- `AICL_SESSION_LOG_COMPRESS_AFTER_DAYS` (default `1`)
- `AICL_SESSION_LOG_RETENTION_DAYS` (default `30`)

Session helpers after sourcing:
```bash
aicl_session_start my-project david
aicl_run nmap -sV -Pn 10.10.10.10
aicl_session_end "Completed recon"
```

API session controls:
```bash
curl -sS -X POST http://127.0.0.1:8080/sessions/start -H 'content-type: application/json' -d '{"project":"demo","operator":"david"}'
curl -sS "http://127.0.0.1:8080/sessions/current?project=demo"
curl -sS -X POST http://127.0.0.1:8080/sessions/end -H 'content-type: application/json' -d '{"project":"demo","summary":"done"}'
```

To force report generation for a specific session:
```bash
bash scripts/aicl.sh "writeup session:20260305-120001-abc123" --project demo
```

## Start A Pentest Target (One Command)
Authorized labs/CTFs only.

CLI automation (session start -> recon -> pentest route -> report route -> session end):
```bash
bash scripts/start_pentest_target.sh 154.57.164.76 32105 ctf-154-57-164-76-32105
```

Runtime bounds (recommended defaults):
- `AICL_MAX_REASON_PORTS=10` (max ports for reason + HTTP probe loop)
- `AICL_MAX_WEB_PORTS=3` (max ports for gobuster/ffuf loop)
- `AICL_NMAP_TOP_TIMEOUT=180`, `AICL_NMAP_ALL_TIMEOUT=240`, `AICL_WEB_SCAN_TIMEOUT=120`

Equivalent Make target:
```bash
make pentest-start TARGET=154.57.164.76 PORTS=32105 PROJECT=ctf-154-57-164-76-32105
```

Artifacts are written to:
- `data/projects/<project>/artifacts/`
- `data/projects/<project>/pentest/`
- `data/projects/<project>/report/`

If no port is provided, the script performs discovery first:
```bash
bash scripts/start_pentest_target.sh 10.10.10.10
```

## UI Pentest Flow (Human-Friendly)
1. Open `http://127.0.0.1:8091`.
2. In `Session Start`, set `project` (example: `ctf-154-57-164-76-32105`) and `operator`, submit.
3. In `Route Request`, run:
   - `user_input`: `ctf recon target 154.57.164.76:32105`
4. Review generated note under `data/projects/<project>/pentest/`.
5. Run second route request:
   - `user_input`: `generate markdown report and writeup from project notes`
6. End session from `Session End` form.
7. Check logs/troubleshooting:
   - `http://127.0.0.1:8080/logs?lines=200`
   - `http://127.0.0.1:8080/diagnostics?project=<project>`

## Workbench UI (Multi-Page)
The UI now provides purpose-specific pages:
- `http://127.0.0.1:8091/ui/recon` (adaptive command planning with option checklist, memory dedupe, queue controls)
- `http://127.0.0.1:8091/ui/proposals` (Codex/Claude/Gemini proposals + ensemble review)
- `http://127.0.0.1:8091/ui/playbooks` (staged web playbooks + stage approvals + profitability KPIs)
- `http://127.0.0.1:8091/ui/cracking` (authorized lab cracking command planning + queue)
- `http://127.0.0.1:8091/ui/docs` (finding creation + screenshot upload/tag/link)
- `http://127.0.0.1:8091/ui/sessions` (session lifecycle + timeline)
- `http://127.0.0.1:8091/ui/reports` (markdown report generation + context snapshot)
- `http://127.0.0.1:8091/ui/graph` (discoveries graph, fact review queue, relation inspector)

Each page supports `Readable View` (default) and `JSON View` toggles for operator-friendly or raw payload inspection.

### New API Endpoints
- Planner:
  - `POST /planner/commands`
  - `POST /proposals/commands`
- Playbooks:
  - `POST /playbooks/web`
  - `GET /playbooks`
  - `GET /playbooks/{playbook_id}`
  - `POST /playbooks/{playbook_id}/stages/{stage_id}/approve`
  - `POST /playbooks/{playbook_id}/stages/{stage_id}/reject`
- Profitability metrics:
  - `POST /metrics/engagement`
  - `GET /metrics/engagement`
  - `GET /metrics/profitability`
- Jobs:
  - `POST /jobs`
  - `POST /jobs/{job_id}/confirm`
  - `POST /jobs/{job_id}/cancel`
  - `GET /jobs`
  - `GET /jobs/{job_id}`
- Findings:
  - `POST /findings`
  - `GET /findings`
  - `PATCH /findings/{finding_id}`
- Evidence:
  - `POST /evidence/upload`
  - `GET /evidence`
  - `POST /evidence/{evidence_id}/link`
- Session intelligence:
  - `GET /projects/{project}/sessions`
  - `GET /sessions/{session_id}/timeline`
  - `GET /projects/{project}/facts`
- Graph intelligence:
  - `GET /projects/{project}/graph`
  - `GET /sessions/{session_id}/graph`
  - `GET /graph/query`
  - `GET /graph/subgraph`
  - `GET /graph/timeline`
- Fact review workflow:
  - `GET /facts/review`
  - `POST /facts/review/{fact_id}/approve`
  - `POST /facts/review/{fact_id}/reject`
  - `PATCH /facts/review/{fact_id}`
- Export workflow:
  - `POST /exports/session`
  - `POST /exports/project`
- Operations:
  - `GET /ops/health/deep`
  - `GET /ops/log-index`

### Queue + Confirm Execution Model
- Commands are created as `pending` jobs.
- UI confirms jobs (`/jobs/{id}/confirm`) to move them to `queued`.
- Background worker executes queued jobs through tool-exec service.
- Worker extracts candidate entity/relation facts into review queue (`pending` by default).
- Outputs are stored under:
  - `data/projects/<project>/jobs/<job_id>.stdout.log`
  - `data/projects/<project>/jobs/<job_id>.stderr.log`

### Discoveries Graph + Review
- Open `/ui/graph?project=<slug>` to visualize host/port/service/domain/user/hash relationships.
- Use `Session Filter` to focus one campaign and reduce noise.
- Use `Focus Kind` and `Min Confidence` controls to reduce visual overload.
- Review queue allows approve/reject from the same page.
- Reports page consumes approved facts for cleaner outputs.

### New Runtime Toggle
- `AICL_JOB_WORKER_ENABLED=true|false`
  - Default: `true`
  - Set to `false` for deterministic API tests without background execution.

## Logs
- Central troubleshooting directory: `/mnt/c/Users/david/OneDrive - Pontificia Universidad Javeriana/Documents/GitHub/ai-cyber-lab/logs`
- Central log file: `/mnt/c/Users/david/OneDrive - Pontificia Universidad Javeriana/Documents/GitHub/ai-cyber-lab/logs/aicl.log`
- Max size is always capped to **1MB** (`AICL_LOG_MAX_BYTES=1048576`).
- File contains router events, agent lifecycle events, tool execution metadata, memory operations, and API events.
- Each route response includes a `trace_id` for log correlation.
- Optional Langfuse tracing can be enabled with `AICL_ENABLE_LANGFUSE=true`.
- One-command troubleshooting bundle (docker + api + system + app logs):
```bash
make bundle-logs
```
- Bundle output:
  - `logs/troubleshoot/bundle_<timestamp>/`
  - `logs/troubleshoot/bundle_<timestamp>.tar.gz`
- Bundle includes:
  - Docker: compose logs, docker events, per-container logs, `docker inspect`
  - API: `/health`, `/ready`, `/diagnostics`, `/logs`, tool-exec health/capabilities
  - App: `aicl.log` tail, `dev-server.log` tail, latest session command log tail
  - System: ports, memory/disk, git state, docker version/info
- Bundle tuning examples:
```bash
AICL_DOCKER_LOG_SINCE=6h AICL_DOCKER_LOG_TAIL_LINES=3000 make bundle-logs
AICL_BUNDLE_CURL_MAX_TIME=12 AICL_BUNDLE_CMD_TIMEOUT=40 make bundle-logs
```
- Read recent entries via API:
```bash
curl -sS "http://127.0.0.1:${AICL_API_PORT:-8080}/logs?lines=200"
```
- Or from shell:
```bash
tail -n 200 logs/aicl.log
```

## Exegol
- Exegol is a Docker-based offensive security workspace with prebuilt tooling and repeatable environments.
- This project supports optional Exegol runtime container via compose profile:
```bash
make up-exegol
```
- To route default tool execution to Exegol in the tool-exec service:
```bash
export AICL_TOOL_EXEC_MODE=exegol
```

## Testing
Run full verification:
```bash
make verify
```

This executes compile checks, `pytest`, prompt regression, and changelog policy checks.  
Detailed testing procedure is in [docs/TESTING_ROADMAP.md](docs/TESTING_ROADMAP.md).

Run full container smoke campaign:
```bash
make smoke-compose
```

Optional smoke flags:
```bash
bash scripts/smoke_compose.sh --with-ui --skip-build
bash scripts/smoke_compose.sh --with-ui --with-exegol
bash scripts/smoke_compose.sh --with-ui --strict-exegol
```

`--with-exegol` now performs a bounded Exegol check by default (no forced first-time multi-GB pull).
Use `--strict-exegol` when you want full Exegol image pull/start validation.
Use `--skip-build` for fast reruns when Dockerfiles have not changed.

If a host port is already occupied (example: Ollama on `11434`), remap only for this run:
```bash
AICL_OLLAMA_HOST_PORT=11435 bash scripts/smoke_compose.sh --with-ui --skip-build
```

## Note Schema Validation
- Generated note payloads are validated before being written to disk.
- Section schemas live in `automation/schemas/` (`study`, `pentest`, `report`, `knowledge`, `research`).
- Toggle validation with `AICL_VALIDATE_NOTES=true|false` (default: `true`).

## Make Targets
```bash
make up
make up-ui
make up-exegol
make dev
make ui
make tool-exec
make route INPUT="writeup project demo"
make pentest-start TARGET=10.10.10.10 PORTS=80,443 PROJECT=demo
make start-session PROJECT=demo OPERATOR=david
make end-session PROJECT=demo SUMMARY="done"
make logs
make maintain-logs
make bundle-logs
make smoke-compose
make eval
make test
make verify
make check-changelog
```

## Prompt Regression
Regression dataset lives in `automation/evals/prompt_regression.json`.
Run:
```bash
.venv/bin/python scripts/run_prompt_regression.py --min-pass-rate 90
```
Outputs are written to `data/projects/_evals/`.

## Kubernetes (optional)
Starter manifests are in `infra/kubernetes/`.
Apply with:
```bash
kubectl apply -k infra/kubernetes
```

## Starter Roadmap
1. Foundation: router + docker services + file schema conventions.
2. Note Delegation: command logging and report generation from logs.
3. Pentest Agent v1: parser-driven recommendations + evidence links.
4. Knowledge Agent v1: index and retrieve historical notes.
5. Observability: add Langfuse (optional) and prompt refinements.
