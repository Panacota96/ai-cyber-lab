# Usage Playbook

This maps each code area to your intended outcomes: certification study, CTF execution, pentest documentation, and reusable knowledge.

For external free tools that complement this workflow, see [FREE_TOOLS_STACK.md](FREE_TOOLS_STACK.md).

## Component Map

| Path | Purpose | When You Use It |
|---|---|---|
| `apps/orchestrator/main.py` | FastAPI + CLI entrypoint (`/route`, `/health`, `/ready`, `/logs`, `/diagnostics`, session APIs) | Daily operations and automation integration |
| `apps/tool_exec/main.py` | Tool execution API (`/run`, `/capabilities`) with allowlist and runtime-target routing | Containerized command execution without host dependency |
| `apps/ui/main.py` | Web dashboard for route/session/log/report actions | Avoid raw API/curl workflows |
| `apps/orchestrator/graph.py` | Router logic (keyword or optional LLM) and agent dispatch | Route tuning and regression checks |
| `apps/orchestrator/deps.py` | Dependency probing for Qdrant/Ollama/Langfuse | Troubleshooting and readiness checks |
| `apps/agents/study_agent.py` | Study note generation and flashcard scaffolding | CCNA/HTB/PortSwigger study sessions |
| `apps/agents/pentest_agent.py` | Recon parsing, next-step heuristics, evidence pointers | During CTF/pentest enumeration |
| `apps/agents/report_agent.py` | Converts session logs to structured markdown writeup | End of each session/challenge |
| `apps/agents/knowledge_agent.py` | Store/index/retrieve memory over your notes | Reusing prior techniques across labs |
| `libs/tools/capture/command_logger.sh` | Bash logger for command/event capture | WSL shell during hands-on testing |
| `libs/tools/capture/command_logger.ps1` | PowerShell logger equivalent | Native Windows shell workflows |
| `libs/tools/capture/log_maintenance.py` | Compresses/prunes session logs by policy | Keep long-running log storage controlled |
| `scripts/collect_troubleshoot_bundle.sh` | Captures docker/API/app/system evidence into one archive | Incident triage and support handoff |
| `libs/sessions.py` | Session lifecycle persistence | Scoped evidence and report generation |
| `libs/logs.py` | Central JSON logging + enforced 1MB cap | Troubleshooting and observability |
| `libs/memory/qdrant_client.py`, `libs/memory/rag.py` | Vector memory and retrieval helpers | Building long-term knowledge base |
| `scripts/run_prompt_regression.py` | Route regression testing | Prevent router drift |
| `tests/` | Unit + API contracts + report parsing/generation tests | Pre-commit confidence gate |

## Workflow 1: Certification Study (CCNA/HTB Academy/PortSwigger)
1. Route a study request:

```bash
bash scripts/aicl.sh "Summarize OSPF areas and generate flashcards" --project cert-study
```

2. Store refined notes:

```bash
bash scripts/aicl.sh "store: OSPF LSA types are easiest to remember by flooding scope." --project cert-study
```

3. Retrieve related notes before next session:

```bash
bash scripts/aicl.sh "retrieve ospf lsa flooding scope" --project cert-study
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
bash scripts/aicl.sh "nmap recon on 10.10.10.10" --project htb-machine
```

4. End session and generate writeup:

```bash
aicl_session_end "Initial foothold not achieved"
bash scripts/aicl.sh "writeup project htb-machine" --project htb-machine
```

5. Run log maintenance (compression + retention):

```bash
make maintain-logs
```

## Workflow 3: Knowledge Base Growth
1. Index full project notes:

```bash
bash scripts/aicl.sh "index: project" --project htb-machine
```

2. Query similar historical patterns:

```bash
bash scripts/aicl.sh "retrieve smb anonymous + web upload chain" --project htb-machine
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

4. Capture full troubleshooting bundle when an issue appears:

```bash
make bundle-logs
```

## Workflow 5: Web UI (No Raw API)
1. Start UI and core stack:

```bash
make up
make up-ui
```

2. Open dashboard:

```bash
xdg-open http://127.0.0.1:8091
```

3. Use forms for route execution, session lifecycle, and diagnostics/log viewing.

## Operational Rules for Your Use Case
- Keep `AICL_ENABLE_ACTIVE_SCAN=false` unless you are explicitly in authorized active labs.
- Use one project slug per machine/challenge to keep evidence boundaries clean.
- Start and end sessions explicitly so report automation can scope evidence correctly.
- Run `make verify` before each commit to avoid drift.
