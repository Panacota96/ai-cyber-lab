# Usage Playbook

This maps each code area to your intended outcomes: certification study, CTF execution, pentest documentation, and reusable knowledge.

## Component Map

| Path | Purpose | When You Use It |
|---|---|---|
| `apps/orchestrator/main.py` | FastAPI + CLI entrypoint (`/route`, `/health`, `/ready`, `/logs`, `/diagnostics`, session APIs) | Daily operations and automation integration |
| `apps/orchestrator/graph.py` | Router logic (keyword or optional LLM) and agent dispatch | Route tuning and regression checks |
| `apps/orchestrator/deps.py` | Dependency probing for Qdrant/Ollama/Langfuse | Troubleshooting and readiness checks |
| `apps/agents/study_agent.py` | Study note generation and flashcard scaffolding | CCNA/HTB/PortSwigger study sessions |
| `apps/agents/pentest_agent.py` | Recon parsing, next-step heuristics, evidence pointers | During CTF/pentest enumeration |
| `apps/agents/report_agent.py` | Converts session logs to structured markdown writeup | End of each session/challenge |
| `apps/agents/knowledge_agent.py` | Store/index/retrieve memory over your notes | Reusing prior techniques across labs |
| `libs/tools/capture/command_logger.sh` | Bash logger for command/event capture | WSL shell during hands-on testing |
| `libs/tools/capture/command_logger.ps1` | PowerShell logger equivalent | Native Windows shell workflows |
| `libs/tools/capture/log_maintenance.py` | Compresses/prunes session logs by policy | Keep long-running log storage controlled |
| `libs/sessions.py` | Session lifecycle persistence | Scoped evidence and report generation |
| `libs/logs.py` | Central JSON logging + enforced 1MB cap | Troubleshooting and observability |
| `libs/memory/qdrant_client.py`, `libs/memory/rag.py` | Vector memory and retrieval helpers | Building long-term knowledge base |
| `scripts/run_prompt_regression.py` | Route regression testing | Prevent router drift |
| `tests/` | Unit + API contracts + report parsing/generation tests | Pre-commit confidence gate |

## Workflow 1: Certification Study (CCNA/HTB Academy/PortSwigger)
1. Route a study request:

```bash
python -m apps.orchestrator.main "Summarize OSPF areas and generate flashcards" --project cert-study
```

2. Store refined notes:

```bash
python -m apps.orchestrator.main "store: OSPF LSA types are easiest to remember by flooding scope." --project cert-study
```

3. Retrieve related notes before next session:

```bash
python -m apps.orchestrator.main "retrieve ospf lsa flooding scope" --project cert-study
```

## Workflow 2: CTF / Pentest Session
1. Activate logger:

```bash
source libs/tools/capture/command_logger.sh
aicl_session_start htb-machine david
```

2. Capture commands with output digests:

```bash
aicl_run nmap -sV -Pn 10.10.10.10
```

3. Ask pentest agent for parser-based next steps:

```bash
python -m apps.orchestrator.main "nmap recon on 10.10.10.10" --project htb-machine
```

4. End session and generate writeup:

```bash
aicl_session_end "Initial foothold not achieved"
python -m apps.orchestrator.main "writeup project htb-machine" --project htb-machine
```

5. Run log maintenance (compression + retention):

```bash
make maintain-logs
```

## Workflow 3: Knowledge Base Growth
1. Index full project notes:

```bash
python -m apps.orchestrator.main "index: project" --project htb-machine
```

2. Query similar historical patterns:

```bash
python -m apps.orchestrator.main "retrieve smb anonymous + web upload chain" --project htb-machine
```

3. Reuse retrieval output in next pentest route prompts to accelerate enumeration decisions.

## Workflow 4: API Integration with Claude Code or Other Clients
1. Start service:

```bash
AICL_API_PORT=8090 nohup bash scripts/run_dev.sh > logs/dev-server.log 2>&1 &
```

2. Route from client:

```bash
curl -sS -X POST http://127.0.0.1:8090/route \
  -H 'content-type: application/json' \
  -d '{"project":"client-demo","user_input":"writeup session:s-123"}'
```

3. Monitor logs:

```bash
tail -n 200 "/mnt/c/Users/david/OneDrive - Pontificia Universidad Javeriana/Documents/GitHub/ai-cyber-lab/logs/aicl.log"
```

## Operational Rules for Your Use Case
- Keep `AICL_ENABLE_ACTIVE_SCAN=false` unless you are explicitly in authorized active labs.
- Use one project slug per machine/challenge to keep evidence boundaries clean.
- Start and end sessions explicitly so report automation can scope evidence correctly.
- Run `make verify` before each commit to avoid drift.
