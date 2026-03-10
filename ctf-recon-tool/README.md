# Helm's Watch

> Desktop-first cyber lab workspace for commands, evidence, AI-assisted analysis, and export-ready writeups.
>
> **Current Version:** `v0.2.0`  
> [Changelog](./CHANGELOG.md) | [Roadmap](./docs/ROADMAP.md) | [Improvement Backlog](./docs/improvement-backlog.md)

## Overview
Helm's Watch is a self-hosted Next.js application for CTF operators, lab workflows, and pentest documentation. The UI is built around a persistent session timeline so you can execute commands, capture screenshots, keep operator notes, curate findings, and assemble proof-of-concept steps without leaving the browser.

The current product name is **Helm's Watch**. Some runtime identifiers still use `helms-paladin` for Docker image, container, and volume compatibility.

## Core Workflow
1. Create or switch a session.
2. Execute commands, add notes, and upload screenshots into the timeline.
3. Organize evidence with tags, findings, PoC steps, and graph nodes.
4. Use AI Coach for pentest-next-step guidance and AI Reporter for report-only enhancement.
5. Export the session as Markdown, PDF, HTML, JSON, or DOCX.

## Feature Set
### Timeline-first workspace
- Session-scoped timeline for commands, notes, screenshots, and evidence metadata.
- Filters, collapse controls, history-focus mode, and stable scroll behavior.
- Screenshot uploads with metadata normalization and inline evidence rendering.
- Discovery graph view backed by persisted graph state.

### Reporting and evidence
- Six report formats:

| Format | Primary use |
| --- | --- |
| `lab-report` | General technical reporting |
| `executive-summary` | Business-facing summary |
| `technical-walkthrough` | Reproducible step-by-step writeup |
| `ctf-solution` | Challenge-style solution format |
| `bug-bounty` | Vulnerability disclosure workflow |
| `pentest` | Formal pentest report structure |

- Writeup version history with rollback support.
- Structured findings storage with severity, remediation, and linked evidence.
- PoC step recorder with ordering and export integration.
- Export targets: Markdown, PDF, HTML, JSON, and DOCX.
- PDF themes: `terminal-dark`, `professional`, `minimal`, and `htb-professional`.

### AI workflows
- **AI Coach**: pentest-oriented guidance from the current session state.
- **AI Reporter**: report enhancement with report-only skill selection.
- Findings extraction proposals with manual review-before-save.
- AI usage tracking per session, including token and estimated cost summaries.
- Provider support for Anthropic, OpenAI, and Google Gemini.

### Operations and platform controls
- SQLite persistence for sessions, writeups, findings, PoC steps, graph state, and AI usage.
- Docker-first runtime with health checks and graceful shutdown support.
- Security controls for command execution, admin APIs, API token enforcement, and CSP headers.
- Repo-level GitHub Actions for CI, tests, security scanning, CodeQL, and changelog enforcement.

## Stack
| Layer | Technology |
| --- | --- |
| Framework | Next.js `16.1.6` |
| UI | React `19.2.4` |
| Database | SQLite via `better-sqlite3` |
| Validation | `zod` |
| Graph UI | `@xyflow/react` |
| PDF export | `pdfmake` |
| DOCX export | `docx` |
| AI providers | Anthropic, OpenAI, Google Gemini |
| Test runner | Vitest |
| Runtime baseline | Node `20` |

## Quick Start
### Docker
```bash
cd ctf-recon-tool
docker compose up -d --build
```

Open `http://localhost:3000`.

Notes:
- `docker-compose.yml` runs the app in production mode.
- Persistent data is stored in the `helms-paladin-data` volume.
- The service image/container names still use `helms-paladin` for compatibility.

### Local development
```bash
cd ctf-recon-tool
npm install
npm run dev
```

Useful commands:
```bash
npm run build
npm run start
npm run lint
npm run test
npm run test:watch
npm run test:coverage
```

## Environment and security controls
Copy `.env.example` to `.env` when you want explicit local configuration.

| Variable | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | unset | Claude provider |
| `OPENAI_API_KEY` | unset | OpenAI provider |
| `GOOGLE_AI_API_KEY` | unset | Gemini provider |
| `APP_API_TOKEN` | unset | Requires `x-api-token` on mutating routes when set |
| `ENABLE_COMMAND_EXECUTION` | `true` in dev, `false` in prod | Enables browser-triggered shell execution |
| `ENABLE_ADMIN_API` | `true` in dev, `false` in prod | Enables admin routes |
| `NODE_ENV` | `development` | Production hardens defaults |

## API and documentation entrypoints
- Backend reference: [../docs/backend/API_REFERENCE.md](../docs/backend/API_REFERENCE.md)
- OpenAPI JSON: `/api/docs`
- Swagger UI: `/api/docs?ui=1`
- Product roadmap: [./docs/ROADMAP.md](./docs/ROADMAP.md)
- Improvement backlog: [./docs/improvement-backlog.md](./docs/improvement-backlog.md)

## Persistence model
The application stores runtime state in `./data/`.

Key tables currently tracked in SQLite:
- `sessions`
- `timeline_events`
- `writeups`
- `writeup_versions`
- `ai_usage`
- `poc_steps`
- `findings`
- `graph_state`
- `app_logs`

Uploaded screenshots are stored under `data/sessions/<sessionId>/screenshots/`.

## Project layout
Use the codebase by subsystem rather than the older single-file MVP model:
- `app/page.js` - primary desktop UI shell
- `app/api/` - session, timeline, execute, report, export, findings, PoC, coach, media, admin, and docs routes
- `app/lib/` - DB access, report formats, export builders, runtime helpers, validation, graph schemas, and security utilities
- `docs/` - roadmap and improvement backlog for the app
- `templates/` - operator templates and scaffolds
- `examples/` - reference report material

## Current export and report behavior
- `technical-walkthrough` and `pentest` can include findings and PoC sections.
- JSON exports include session metadata, generated report markdown, timeline, findings, PoC steps, and writeup content.
- HTML and DOCX exports use the shared report-generation bundle so they stay aligned with Markdown and PDF output.

## Testing and delivery guardrails
- Vitest is configured for isolated local test execution with a temporary data directory.
- `npm run test`, `npm run lint`, and `npm run build` are the local quality gates.
- GitHub Actions at the repository root enforce build, test, security, CodeQL, and changelog checks against `main`.

## Companion resources
- [Machine Template](./templates/Machine-Template/README.md)
- [HTB PDF references](./examples/htb/pdf/README.md)
- [Root repository README](../README.md)

## Scope note
Helm's Watch is intentionally desktop/laptop-first. Tablet and mobile responsive work is not part of the current product scope.
