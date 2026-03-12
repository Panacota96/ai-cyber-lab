# Helm's Watch

[![CI](https://github.com/Panacota96/ai-cyber-lab/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Panacota96/ai-cyber-lab/actions/workflows/ci.yml)
[![Tests](https://github.com/Panacota96/ai-cyber-lab/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/Panacota96/ai-cyber-lab/actions/workflows/test.yml)
[![Security](https://github.com/Panacota96/ai-cyber-lab/actions/workflows/security.yml/badge.svg?branch=main)](https://github.com/Panacota96/ai-cyber-lab/actions/workflows/security.yml)
[![Docker Publish](https://github.com/Panacota96/ai-cyber-lab/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/Panacota96/ai-cyber-lab/actions/workflows/docker-publish.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](../LICENSE)
[![Coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/Panacota96/ai-cyber-lab/main/ctf-recon-tool/docs/badges/coverage.json)](https://github.com/Panacota96/ai-cyber-lab/actions/workflows/coverage.yml)

> Desktop-first cyber lab workspace for commands, evidence, AI-assisted analysis, and export-ready writeups.
>
> **Current Version:** `v0.3.0`  
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
- Live command output streaming via SSE with timeline polling fallback when the stream is unavailable.
- Filters, collapse controls, and stable scroll behavior.
- Screenshot uploads with metadata normalization and inline evidence rendering.
- Discovery graph view backed by persisted graph state.
- Tabbed shell hub for reverse shells and webshells with transcript persistence and SSE updates.
- Local flag tracking, read-only wordlist browsing, session credential management with hash identification and John/Hashcat command insertion, and per-session timer controls in the workspace sidebar/header.

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
- Reusable report templates with placeholder substitution for session metadata and finding counts.
- Structured findings storage with severity, remediation, and linked evidence.
- Deterministic finding auto-tagging plus editable finding tags.
- Executive-summary drafting, remediation suggestion helpers, and before/after session comparison reports in the Chronicle workflow.
- PoC step recorder with ordering and export integration.
- Session artifact manager for operator uploads and saved transcript output, with preview/download routes and report insertion hooks.
- Read-only share-link snapshots for reports via unique `/share/[token]` URLs with operator-side revoke controls.
- Export targets: Markdown, PDF, HTML, JSON, and DOCX.
- PDF themes: `terminal-dark`, `professional`, `minimal`, and `htb-professional`.
- Report outputs now include reusable session cover metadata and severity summary tables.

### AI workflows
- **AI Coach**: pentest-oriented guidance from the current session state.
- Coach difficulty controls (`beginner`, `intermediate`, `expert`) plus bounded context modes (`compact`, `balanced`, `full`) with in-memory cache headers for long sessions.
- **AI Reporter**: report enhancement with report-only skill selection.
- Findings extraction proposals with manual review-before-save.
- AI usage tracking per session, including token and estimated cost summaries.
- Provider support for Anthropic, OpenAI, and Google Gemini.

### Operations and platform controls
- SQLite persistence for sessions, writeups, findings, PoC steps, graph state, credentials, and AI usage.
- Optional server-side platform linkage for Hack The Box, TryHackMe, and CTFd session metadata plus linked flag submission/validation flows.
- Docker-first runtime with health checks and graceful shutdown support.
- Security controls for command execution, admin APIs, API token enforcement, CSRF enforcement, and CSP headers.
- Structured JSON logging is available via `LOG_FORMAT=json`.
- Repo-level GitHub Actions for CI, tests, security scanning, CodeQL, and changelog enforcement.
- Bundled operator tooling includes SearchSploit in Docker, with Exploit-DB and Metasploit references exposed in the toolbox/cheatsheet.
- Docker runtime also bundles `john` and `hashcat` for the credential hash-identification workflow.

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
- Docker now vendors the Exploit-DB mirror so `searchsploit` is available inside the app container.
- Stable semver tags publish multi-arch GHCR images at `ghcr.io/<owner>/helms-watch`.

Docker runtime tuning:

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_MEM_LIMIT` | `2g` | Compose memory cap for the app container |
| `APP_CPUS` | `2.0` | Compose CPU limit for the app container |

### Local development
```bash
cd ctf-recon-tool
npm install
npm run dev
```

Windows/browser verification fallback:
```bash
npm run dev:webpack
```

Production-like local verification:
```bash
npm run build
npm run start:local-runtime
```

Useful commands:
```bash
npm run build
npm run start
npm run start:local-runtime
npm run dev:webpack
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
| `COACH_CACHE_TTL_MS` | `300000` | In-memory TTL for cached AI Coach responses |
| `APP_API_TOKEN` | unset | Requires `x-api-token` on mutating routes when set |
| `ENABLE_COMMAND_EXECUTION` | `true` in dev, `false` in prod | Enables browser-triggered shell execution |
| `ENABLE_SHELL_HUB` | `true` in dev, `false` in prod | Enables reverse-shell/webshell session APIs and UI |
| `MAX_CONCURRENT_COMMANDS` | `2` | Max concurrent command processes (`1..16`); extra commands stay queued |
| `ENABLE_ADMIN_API` | `true` in dev, `false` in prod | Enables admin routes |
| `CTF_WORDLIST_DIR` | `/usr/share/wordlists` | Root directory for the read-only wordlist browser and execution env injection |
| `HELMS_HASH_WORDLIST` | auto-detect | Preferred wordlist path for generated `john` / `hashcat` commands |
| `HTB_API_TOKEN` | unset | Hack The Box MCP bearer token for platform metadata/flag workflows |
| `HTB_MCP_URL` | `https://mcp.hackthebox.ai/v1/ctf/mcp/` | Hack The Box MCP endpoint override |
| `THM_API_TOKEN` | unset | TryHackMe enterprise API token |
| `THM_API_BASE_URL` | `https://tryhackme.com` | TryHackMe API base URL override |
| `CTFD_BASE_URL` | unset | CTFd base URL (required with `CTFD_API_TOKEN`) |
| `CTFD_API_TOKEN` | unset | CTFd API token used for metadata sync and flag submission |
| `LOG_FORMAT` | `pretty` | `json` enables structured console/file logging |
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
- `session_credentials`
- `credential_verifications`
- `poc_steps`
- `findings`
- `flag_submissions`
- `graph_state`
- `shell_sessions`
- `shell_transcript_chunks`
- `session_artifacts`
- `app_logs`

Uploaded screenshots are stored under `data/sessions/<sessionId>/screenshots/`.
Uploaded/session artifacts are stored under `data/sessions/<sessionId>/artifacts/`.

## Project layout
Use the codebase by subsystem rather than the older single-file MVP model:
- `app/page.js` - thin Next.js page wrapper
- `app/HomeClient.js` - primary desktop UI shell and composition root
- `app/components/` - extracted UI modules such as sidebar panels
- `app/hooks/` - client hooks for API access, execution streaming, shell state, artifacts, and focused state
- `app/api/` - session, timeline, execute, shell, artifact, report, export, findings, PoC, coach, media, admin, and docs routes
- `app/lib/` - DB access, repository/services for shells and artifacts, report formats, export builders, runtime helpers, validation, graph schemas, and security utilities
- `docs/` - roadmap and improvement backlog for the app
- `templates/` - operator templates and scaffolds
- `examples/` - reference report material

## Current export and report behavior
- `technical-walkthrough` and `pentest` can include findings and PoC sections.
- All report formats include cover/header metadata, and findings-backed severity summaries render when findings exist.
- JSON exports include session metadata, generated report markdown, timeline, findings, PoC steps, credentials, shell sessions/transcripts, artifacts, and writeup content.
- HTML and DOCX exports use the shared report-generation bundle so they stay aligned with Markdown and PDF output.

## Testing and delivery guardrails
- Vitest is configured for isolated local test execution with a temporary data directory.
- `npm run test`, `npm run lint`, and `npm run build` are the local quality gates.
- GitHub Actions at the repository root enforce build, test, security, CodeQL, and changelog checks against `main`.

## Release automation (Wave 9)
- Docker publish workflow: `.github/workflows/docker-publish.yml`.
- Release workflow: `.github/workflows/release.yml`.
- Docs Pages workflow: `.github/workflows/docs-pages.yml`.

Create a stable release:

```bash
git tag v0.4.0
git push origin v0.4.0
```

Expected artifacts:
- GHCR image tags: `v0.4.0`, `0.4.0`, and `latest`.
- GitHub Release generated from the matching changelog section (`[0.4.0]`).
- GitHub Pages docs deployment from root `docs/`.

## Companion resources
- [Machine Template](./templates/Machine-Template/README.md)
- [HTB PDF references](./examples/htb/pdf/README.md)
- [Root repository README](../README.md)

## Scope note
Helm's Watch is intentionally desktop/laptop-first. Tablet and mobile responsive work is not part of the current product scope.
