# How To Use AI Cyber Lab

Practical runbook for daily usage in authorized labs/CTFs.

## 1) Start The Stack
From repo root:

```bash
cp .env.example .env
bash scripts/bootstrap.sh
```

Local-only AI mode (no paid providers):

```bash
export AICL_LOCAL_ONLY_MODE=true
export AICL_PROPOSAL_PROVIDERS=ollama
export AICL_USE_LLM_ROUTER=true
```

Optional API guardrails:

```bash
export AICL_API_KEY=change-me
export AICL_ROUTE_RATE_LIMIT_PER_MIN=30
```

Optional tool profiles (inspired by larger pentest tool stacks):

```bash
export AICL_TOOL_PROFILE=web      # web-focused workflow
# export AICL_TOOL_PROFILE=ad      # AD/internal workflow
# export AICL_TOOL_PROFILE=expanded
```

Start services with UI:

```bash
make up-ui
```

If port `11434` is already in use on host:

```bash
AICL_OLLAMA_HOST_PORT=11435 make up-ui
```

Validate:

```bash
curl -sS http://127.0.0.1:8080/health
curl -sS http://127.0.0.1:8080/ready
curl -sS http://127.0.0.1:8082/health
curl -sS http://127.0.0.1:8091/health
```

## 2) Open The UI

```bash
xdg-open http://127.0.0.1:8091
```

Main pages:
- `/ui/recon`: adaptive target planning + selectable recon options + queue/confirm
- `/ui/proposals`: Codex/Claude/Gemini proposals + ensemble review
- `/ui/playbooks`: staged web playbooks + stage approval + profitability metrics
- `/ui/cracking`: cracking plans (authorized labs only)
- `/ui/docs`: findings + evidence upload
- `/ui/graph`: discoveries graph + fact review
- `/ui/sessions`: start/end sessions + timeline + export
- `/ui/reports`: report generation context

UI readability:
- Default mode is `Readable View` (cards/tables).
- Switch to `JSON View` from the top toggle when raw payload inspection is needed.

## 3) Typical Pentest Workflow (UI)
1. Go to `/ui/sessions` and start a session with:
   - `project`: machine slug (example `ctf-154-57-164-76-32105`)
   - `operator`: your handle
2. Go to `/ui/recon`:
   - set target IP/FQDN and profile (`stealth`, `balanced`, `aggressive`)
   - generate plan
   - queue + confirm selected commands
3. Go to `/ui/docs`:
   - create findings
   - upload screenshots/evidence and link to finding/report section
4. Go to `/ui/graph`:
   - inspect discovered entities/relations
   - approve/reject pending facts
   - use `Focus Kind` + `Min Confidence` to reduce graph overload
5. Go to `/ui/proposals`:
   - generate provider proposals
   - compare Codex/Claude/Gemini side-by-side
   - execute only reviewed ensemble commands
6. Go to `/ui/playbooks`:
   - generate a staged web playbook (`discover -> fingerprint -> content-enum -> vuln-validate -> report-draft`)
   - approve/reject stages with human oversight
   - record engagement metrics (`revenue_usd`, `cost_usd`, `hours_saved`) to track ROI
7. Go to `/ui/reports` and `/ui/sessions`:
   - generate report
   - export session/project bundles (JSON + MD + HTML)
8. End session in `/ui/sessions`.

## 4) Typical Pentest Workflow (CLI)
One-command kickoff:

```bash
bash scripts/start_pentest_target.sh 154.57.164.76 32105 ctf-154-57-164-76-32105
```

Manual route examples:

```bash
bash scripts/aicl.sh "ctf recon target 154.57.164.76:32105" --project ctf-154-57-164-76-32105
bash scripts/aicl.sh "generate markdown report and writeup from project notes" --project ctf-154-57-164-76-32105
```

## 5) Study Workflow

```bash
bash scripts/aicl.sh "Summarize OSPF and generate flashcards" --project cert-study
bash scripts/aicl.sh "store: OSPF LSA type 1 is intra-area" --project cert-study
bash scripts/aicl.sh "retrieve ospf lsa type 1 notes" --project cert-study
```

## 6) Where Results Are Stored
- `data/projects/<project>/study/`
- `data/projects/<project>/pentest/`
- `data/projects/<project>/report/`
- `data/projects/<project>/artifacts/`
- `data/projects/<project>/jobs/`
- `data/projects/<project>/exports/`
- `data/projects/<project>/sessions/`
- `data/aicl_workbench.db` (sessions/jobs/findings/evidence/facts index)

## 7) Logging And Troubleshooting
- Central app log (capped to 1MB):
  - `/mnt/c/Users/david/OneDrive - Pontificia Universidad Javeriana/Documents/GitHub/ai-cyber-lab/logs/aicl.log`
- API logs endpoint:

```bash
curl -sS "http://127.0.0.1:8080/logs?lines=200"
curl -sS "http://127.0.0.1:8080/diagnostics?project=demo"
curl -sS "http://127.0.0.1:8080/ops/health/deep?project=demo"
curl -sS "http://127.0.0.1:8080/ops/log-index?limit=100"
```

Collect troubleshooting bundle:

```bash
make bundle-logs
```

## 8) Stop Services

```bash
make down
```

If you started with custom port env vars, reuse the same vars on stop:

```bash
AICL_OLLAMA_HOST_PORT=11435 make down
```
