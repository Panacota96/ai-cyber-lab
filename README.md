# AI Cyber Lab

Local multi-agent cyber lab for authorized labs/CTFs and certification study.

This repository provides a segmented architecture with specialized agents:
- `study`: certification notes, flashcards, and weak-topic tracking.
- `pentest`: recon parsing, next-step suggestions, and structured note capture.
- `report`: log-to-writeup automation.
- `knowledge`: RAG-style storage/retrieval over your own notes.
- `research`: scoped technical research prompts/checklists.

The default orchestrator path uses deterministic keyword routing. Enable model-based router only if desired (`AICL_USE_LLM_ROUTER=true`). Set `AICL_USE_LANGGRAPH=true` only when your local LangGraph install is stable.

## Documentation Index
- [Testing Roadmap](docs/TESTING_ROADMAP.md)
- [Usage Playbook](docs/USAGE_PLAYBOOK.md)
- [Robustness Next Steps](docs/ROBUSTNESS_NEXT_STEPS.md)

## Safety
Use only on systems and labs you are explicitly authorized to test (HTB/THM/PortSwigger labs, internal approved environments, CTF targets).

## Project Layout
```text
apps/
  orchestrator/         # LangGraph router + FastAPI/CLI entrypoints
  agents/               # Specialized agent handlers
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
  docker-compose.yml    # Ollama + Qdrant (+ optional observability profile)
  kubernetes/           # Optional scale-out manifests
scripts/
  bootstrap.sh          # Local environment setup
  run_dev.sh            # Run API locally
```

## Quick Start (WSL)
1. Copy env file:
```bash
cp .env.example .env
```

2. Start dependencies:
```bash
cd infra
docker compose up -d qdrant ollama
cd ..
```

3. Bootstrap Python environment:
```bash
bash scripts/bootstrap.sh
```

4. Test CLI router:
```bash
source .venv/bin/activate
python -m apps.orchestrator.main "Summarize OSPF and generate flashcards"
python -m apps.orchestrator.main "nmap recon on 10.10.10.10"
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
python -m apps.orchestrator.main "writeup session:20260305-120001-abc123" --project demo
```

## Logs
- Central troubleshooting directory: `/mnt/c/Users/david/OneDrive - Pontificia Universidad Javeriana/Documents/GitHub/ai-cyber-lab/logs`
- Central log file: `/mnt/c/Users/david/OneDrive - Pontificia Universidad Javeriana/Documents/GitHub/ai-cyber-lab/logs/aicl.log`
- Max size is always capped to **1MB** (`AICL_LOG_MAX_BYTES=1048576`).
- File contains router events, agent lifecycle events, tool execution metadata, memory operations, and API events.
- Each route response includes a `trace_id` for log correlation.
- Optional Langfuse tracing can be enabled with `AICL_ENABLE_LANGFUSE=true`.
- Read recent entries via API:
```bash
curl -sS "http://127.0.0.1:${AICL_API_PORT:-8080}/logs?lines=200"
```
- Or from shell:
```bash
tail -n 200 logs/aicl.log
```

## Testing
Run full verification:
```bash
make verify
```

This executes compile checks, `pytest`, prompt regression, and changelog policy checks.  
Detailed testing procedure is in [docs/TESTING_ROADMAP.md](docs/TESTING_ROADMAP.md).

## Note Schema Validation
- Generated note payloads are validated before being written to disk.
- Section schemas live in `automation/schemas/` (`study`, `pentest`, `report`, `knowledge`, `research`).
- Toggle validation with `AICL_VALIDATE_NOTES=true|false` (default: `true`).

## Make Targets
```bash
make up
make dev
make route INPUT="writeup project demo"
make start-session PROJECT=demo OPERATOR=david
make end-session PROJECT=demo SUMMARY="done"
make logs
make maintain-logs
make eval
make test
make verify
make check-changelog
```

## Prompt Regression
Regression dataset lives in `automation/evals/prompt_regression.json`.
Run:
```bash
python scripts/run_prompt_regression.py --min-pass-rate 90
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
