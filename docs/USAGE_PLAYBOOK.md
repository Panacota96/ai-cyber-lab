# Usage Playbook

This maps each code area to your intended outcomes: certification study, CTF execution, pentest documentation, and reusable knowledge.

For external free tools that complement this workflow, see [FREE_TOOLS_STACK.md](FREE_TOOLS_STACK.md).

## Component Map

| Path | Purpose | When You Use It |
|---|---|---|
| `apps/orchestrator/main.py` | FastAPI + CLI entrypoint (`/route`, `/health`, `/ready`, `/logs`, `/diagnostics`, session APIs) | Daily operations and automation integration |
| `apps/tool_exec/main.py` | Tool execution API (`/run`, `/capabilities`) with allowlist and runtime-target routing | Containerized command execution without host dependency |
| `apps/ui/main.py` | Web dashboard for route/session/log/report actions | Avoid raw API/curl workflows |
| `libs/command_planner.py` | Profile-based command plan generator (`stealth/balanced/aggressive`) | Recon/cracking command suggestion by target |
| `libs/workbench_db.py` | SQLite index for sessions/jobs/findings/evidence/facts | Timeline, traceability, and cross-session querying |
| `libs/job_worker.py` | Queue worker that executes confirmed jobs via tool-exec | Queue+confirm command execution model |
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
| `scripts/start_pentest_target.sh` | End-to-end target kickoff automation (session + recon + route + report) | Fast CTF machine start with consistent artifacts |
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

## Workflow 2B: One-Command Target Kickoff
Use this when you want a machine-ready starting point quickly.

```bash
bash scripts/start_pentest_target.sh 154.57.164.76 32105 ctf-154-57-164-76-32105
```

What it does:
- Starts a session in orchestrator.
- Runs bounded recon (`nmap`, reason checks, HTTP probes, optional dir fuzzing).
- Stores artifacts under `data/projects/<project>/artifacts`.
- Calls pentest route and report route.
- Ends session with summary.
- Uses bounded defaults for safety/time (`AICL_MAX_REASON_PORTS=10`, `AICL_MAX_WEB_PORTS=3`).

If no port is known yet:

```bash
bash scripts/start_pentest_target.sh 10.10.10.10
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

Suggested UI flow for a machine:
1. Start session for project slug (example `ctf-154-57-164-76-32105`).
2. Route request: `ctf recon target 154.57.164.76:32105`.
3. Route request: `generate markdown report and writeup from project notes`.
4. End session.
5. Open `/logs` and `/diagnostics?project=<slug>` for traceable troubleshooting.

## Workflow 6: Multi-Page Workbench (Recommended Daily Flow)
1. `Recon` page:
   - Generate command plan from target + profile.
   - Queue + confirm selected commands.
   - Observe job states and extracted facts.
2. `Cracking` page:
   - Generate cracking plan for authorized lab data only.
   - Queue + confirm cracking jobs with explicit operator intent.
3. `Docs` page:
   - Create findings.
   - Upload screenshots and tag/link to finding/report sections.
4. `Graph` page:
   - Visualize discovery relations (host/port/service/version/domain/user/password/hash).
   - Filter by session to isolate a single engagement.
   - Approve/reject pending facts before report generation.
5. `Sessions` page:
   - Start/end sessions.
   - Load session timeline with jobs, findings, and evidence.
6. `Reports` page:
   - Trigger markdown report generation and review context snapshots.
   - Use session/project exports to generate markdown/html/json bundles.

## Operational Rules for Your Use Case
- Keep `AICL_ENABLE_ACTIVE_SCAN=false` unless you are explicitly in authorized active labs.
- Use one project slug per machine/challenge to keep evidence boundaries clean.
- Start and end sessions explicitly so report automation can scope evidence correctly.
- Keep `AICL_JOB_WORKER_ENABLED=true` during normal use; disable only for deterministic API tests.
- Run `make verify` before each commit to avoid drift.
