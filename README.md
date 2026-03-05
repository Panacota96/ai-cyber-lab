# AI Cyber Lab

Local multi-agent cyber lab for authorized labs/CTFs and certification study.

This repository provides a segmented architecture with specialized agents:
- `study`: certification notes, flashcards, and weak-topic tracking.
- `pentest`: recon parsing, next-step suggestions, and structured note capture.
- `report`: log-to-writeup automation.
- `knowledge`: RAG-style storage/retrieval over your own notes.
- `research`: scoped technical research prompts/checklists.

The default orchestrator path uses direct routing with identical agent boundaries. Set `AICL_USE_LANGGRAPH=true` only when your local LangGraph install is stable.

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

## Logs
- Central log file: `logs/aicl.log`
- Max size is always capped to **1MB** (`AICL_LOG_MAX_BYTES=1048576`).
- File contains router events, agent lifecycle events, tool execution metadata, memory operations, and API events.
- Read recent entries via API:
```bash
curl -sS "http://127.0.0.1:8080/logs?lines=200"
```
- Or from shell:
```bash
tail -n 200 logs/aicl.log
```

## Make Targets
```bash
make up
make dev
make route INPUT="writeup project demo"
make logs
```

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
