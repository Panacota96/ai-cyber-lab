# Pilot Offer Playbook (Profitability First)

This playbook productizes AI Cyber Lab for a first paid pilot without API or external model costs.

## 1) Offer Definition
- Offer name: `Local Pentest Copilot Setup`
- Customer: solo pentesters
- Delivery model: self-hosted install + onboarding + support
- Scope:
  - Session lifecycle + bounded recon workflow
  - Proposal generation with deterministic quality scoring
  - Evidence linking and markdown/html/json report exports
- Non-scope (for pilot): advanced team RBAC, deep Kubernetes scale-out, broad UI redesign

## 2) Commercial Package
- One-time setup fee:
  - Local deployment and hardening
  - 2 custom playbooks
  - Report template tuning
- Monthly support:
  - Upgrades, troubleshooting, and workflow tuning
  - Prompt/policy tuning for safer command proposals

## 3) KPI Targets
- Revenue KPI: `1 paying pilot in 30 days`
- Product KPI: `>=40% report drafting time reduction`
- Safety KPI: `0 out-of-scope command executions`
- Adoption KPI: `>=80% final reports from in-platform workflows`

## 4) ROI Calculator
Use the built-in calculator to quantify value during sales calls:

```bash
.venv/bin/python scripts/pilot_roi.py \
  --engagements-per-week 3 \
  --hours-per-report-now 5 \
  --hours-per-report-with-aicl 2.5 \
  --hourly-rate-usd 60 \
  --setup-fee-usd 1200 \
  --monthly-support-usd 250
```

Or via Make:

```bash
make pilot-roi \
  ENGAGEMENTS_PER_WEEK=3 \
  HOURS_PER_REPORT_NOW=5 \
  HOURS_PER_REPORT_WITH_AICL=2.5 \
  HOURLY_RATE_USD=60 \
  SETUP_FEE_USD=1200 \
  MONTHLY_SUPPORT_USD=250
```

## 5) Local-Only Runtime Profile
Set these in `.env`:

```bash
AICL_LOCAL_ONLY_MODE=true
AICL_PROPOSAL_PROVIDERS=ollama
AICL_USE_LLM_ROUTER=true
AICL_API_KEY=change-me
AICL_ROUTE_RATE_LIMIT_PER_MIN=30
```

Notes:
- `AICL_LOCAL_ONLY_MODE=true` forces proposal generation through local Ollama provider.
- `AICL_API_KEY` secures mutating API operations.
- `AICL_ROUTE_RATE_LIMIT_PER_MIN` throttles `/route` bursts.

## 6) Pilot Demo Script
1. Start stack and confirm health.
2. Start session in `/ui/sessions`.
3. Generate recon plan in `/ui/recon` and queue a bounded command set.
4. Generate proposals in `/ui/proposals` and show quality score/rationale.
5. Upload/link evidence in `/ui/docs`.
6. Generate report in `/ui/reports`.
7. Export session bundle from `/ui/sessions`.
