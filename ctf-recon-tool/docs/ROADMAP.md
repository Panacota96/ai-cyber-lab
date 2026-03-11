---
title: Helm's Watch — Project Improvement Roadmap
updated: 2026-03-11
source: automated multi-agent codebase scan (claude-sonnet-4-6)
---

# Helm's Watch — Improvement Roadmap

## Architecture Assessment

Helm's Watch is a production-grade Next.js 16 CTF reconnaissance assistant with:

- Clean separation of concerns (frontend, API routes, SQLite DB, security layer)
- Multi-provider AI coach (Claude, Gemini, OpenAI) with streaming, cost tracking, and feedback
- Rich CTF-specific features: session mgmt, timeline, discovery graph, PoC recorder, AI findings, reporting, local flags, wordlist browsing, SearchSploit, and operator templates
- Robust security: path traversal protection, rate limiting, API token rotation, zod validation
- Multi-format export: PDF, DOCX, HTML, JSON, Markdown
- Vitest test suite (Phase 2 complete)

**Current gaps:** real-time output streaming, interactive shell/session bridging, CTF platform integrations, advanced graph path/layout features, no CVSS calculator, and no CVE/ExploitDB lookup.

**Product scope:** Helm's Paladin is desktop/laptop-first; tablet and mobile responsive work is intentionally out of scope.

> **Effort key:** S = Small (< 4h) · M = Medium (1–3 days) · H = Hard (1–2 weeks)

---

## Pending Improvements

### Recommended Execution Queue (Effort S)

> This queue covers all currently pending `Effort = S` items only. The category tables below remain unchanged as the canonical backlog inventory.

> Wave 1 completed on 2026-03-09: `SEC.4`, `SEC.5`, `SEC.6`, `SEC.1`, `SEC.3`, `EX.4`, `EX.10`, `GR.15`.
> Wave 2 completed on 2026-03-10: `GH.1`, `GH.2`, `GH.5`, `GH.10`, `GH.11`, `CQ.1`, `CQ.2`, `CQ.4`, `CD.1`, `CD.2`, `CD.3`.
> Wave 3 completed on 2026-03-10: `UX.7`, `EX.7`, `EX.5`, `EX.9`, `EX.8`, `EX.11`, `UX.9`, `UX.10`, `R.14`.
> Wave 4 completed on 2026-03-10: `R.3`, `R.12`, `R.7`, `CTF.13`, `CTF.12`, `CTF.4`, `CTF.3`, `CTF.9`.
> Wave 5 completed on 2026-03-10: `GR.19`, `GR.1`, `GR.2`, `GR.3`, `GR.10`, `GR.11`, `GR.16`, `GR.4`, `GR.6`, `GR.17`, `GR.5`, `GR.7`, `GR.13`, `GR.14`, `GR.9`.
> Wave 6 completed on 2026-03-10: `UX.8`, `UX.4`, `UX.1`, `UX.2`, `UX.6`, `UX.12`.
> Wave 7 completed on 2026-03-10: `GH.4`, `GH.12`, `GH.6`, `GH.7`, `GH.8`, `OPS.1`, `OPS.2`.
> Wave 8 completed on 2026-03-10: `R.13`.
> Wave 9 completed on 2026-03-11: `GH.3`, `GH.9`, `GH.13`, `B.1` (release workflows + docs pages + multi-stage Docker).
> Wave 10 completed on 2026-03-11: `EX.6`, `CQ.3`, `G.1 (Phase 2)` (command queue, API middleware factory rollout, expanded security/runtime tests).

All `Effort = S` roadmap items are now completed.

### Next Wave Set (Release-First Track)

> Selected strategy: **Release First**. Stabilize distribution and release operations first, then harden runtime consistency, then deliver higher-complexity operator intelligence and shell/artifact capabilities.

#### Wave 11 — Operator Intelligence Layer

**Scope:** `EX.2`, `EX.3`, `CTF.5`, `CTF.10`, `CTF.11`

**Outcome:**
- Ingest Nmap XML into graph entities.
- Render structured command output (JSON/XML) cleanly in terminal/timeline.
- Suggest next steps from discovered services.
- Enrich CVE/ExploitDB context with CVSS and PoC metadata.
- Add credential verification and blast-radius workflows.

#### Wave 12 — Shell and Artifact Operations

**Scope:** `EX.12`, `CTF.14` (`CTF.1` and `CTF.2` as optional sub-wave if capacity allows)

**Outcome:**
- Multi-session shell hub (reverse shell, webshell, metasploit/meterpreter transport integration).
- Transcript persistence across live shell sessions.
- Artifact/loot manager linked to notes and report evidence.

#### Expected Public Interface Progression

- Wave 11: additive API/UI behavior for parsing, enrichment, and graph/event rendering.
- Wave 12: new shell/artifact API groups and additive session data models.

#### Success Criteria

- Wave 11: Nmap XML and CVE evidence automatically appear in graph and report context.
- Wave 12: concurrent shell sessions are usable with reliable transcripts and artifact linkage.

### UX

| ID | Item | Impact | Effort |
|----|------|--------|--------|
| A.4 | Real-time fuzzy command suggestions (autocomplete) | Med | M |
| UX.3 | Toast notification system (command complete, new discovery) | Med | M |
| UX.5 | Command palette (Ctrl+K) — quick-action search | Med | M |
| UX.11 | Filter toolbar: collapse into dropdown at < 1400px to prevent 4-row wrap | High | M |

### Discovery Graph

| ID | Item | Impact | Effort |
|----|------|--------|--------|
| GR.8 | Right-click context menu on nodes (edit label, delete, link to event) | Med | M |
| GR.12 | Dagre layout alternative (hierarchical top-down attack path view) | Med | M |
| GR.18 | Attack path highlighting — click node to highlight all connected paths | Med | M |

### GitHub / CI-CD (NEW)

All currently tracked GitHub / CI-CD items are completed through Wave 9.

### Reporting & Export

| ID | Item | Impact | Effort |
|----|------|--------|--------|
| D.1 | Custom report template builder UI | Med | H |
| R.1 | Executive summary auto-generation (AI-powered, from findings table) | High | M |
| R.2 | MITRE ATT&CK technique tagging on findings | Med | M |
| R.4 | Risk scoring matrix (severity × likelihood 5×5 grid in PDF) | Med | M |
| R.5 | Read-only report share link (unique token URL, no auth required) | Med | M |
| R.6 | AI-powered remediation suggestion per finding | Med | M |
| R.8 | CVSS v3.1 calculator / severity color-coding in PDF+HTML export (visual badges) | High | M |
| R.9 | Report filtering: generate subset by severity, date range, or tag | Med | M |
| R.10 | Before/after session comparison report (delta: new/remediated/changed findings) | Med | M |
| R.11 | Finding deduplication + relationship tracking (`relatedFindingIds`) | Med | M |

### Execution Engine (NEW)

| ID | Item | Impact | Effort |
|----|------|--------|--------|
| EX.1 | Real-time output streaming via SSE (Server-Sent Events) | High | H |
| EX.2 | Nmap XML auto-parser (`-oX` output → graph host/service nodes) | High | M |
| EX.3 | Structured output detection (auto-pretty-print JSON/XML in terminal) | Med | M |
| EX.12 | Interactive shell session hub — attach webshells, reverse shells, and Metasploit/Meterpreter transports with multiple live tabs and transcript persistence | High | H |

### CTF-Specific Features (NEW)

| ID | Item | Impact | Effort |
|----|------|--------|--------|
| CTF.1 | Credential manager (store username/password/hash per session, link to nodes) | High | M |
| CTF.2 | Hash identification workflow (hashid → john/hashcat command generator) | High | M |
| CTF.5 | Service enumeration checklists (HTTP found → auto-suggest gobuster, nikto…) | High | M |
| CTF.6 | Automated follow-up pipeline (IP discovered → auto-suggest next commands) | High | H |
| CTF.7 | Platform integrations: HTB / THM / CTFd API (flag submit, machine info) | Med | H |
| CTF.8 | Multi-target support (track multiple hosts/IPs in one session) | Med | H |
| CTF.10 | CVE/ExploitDB lookup integration — auto-fetch CVSS + PoC count when CVE node created | High | M |
| CTF.11 | Credential verification + blast radius — test found creds against all discovered services | Med | M |
| CTF.14 | Session artifact manager — save documents/files pulled from shells or webshells as session-scoped loot linked to notes and reports | High | M |

### Code Quality & Tests

| ID | Item | Impact | Effort |
|----|------|--------|--------|
| G.2 | TypeScript gradual conversion (start with `lib/` modules) | Med | H |
| G.7 | Frontend state refactor: 30+ `useState` → `useReducer` in `page.js` | Med | H |

### Security

| ID | Item | Impact | Effort |
|----|------|--------|--------|
| SEC.2 | CSRF token for state-mutating POST endpoints | Med | M |

### Ops / Infrastructure

| ID | Item | Impact | Effort |
|----|------|--------|--------|
| B.7 | Structured JSON logging mode (`LOG_FORMAT=json` env var) | Med | M |

### AI Coach

| ID | Item | Impact | Effort |
|----|------|--------|--------|
| E.1 | Coach persona difficulty levels (beginner / intermediate / expert) | Med | M |
| E.2 | Coach caching + context limit management (avoid token overflow on long sessions) | Med | M |
| E.3 | Offline coach mode (ollama / llama.cpp provider) | Low | H |
| E.8 | Auto writeup enhancement when timeline is updated | Low | H |
| E.9 | Adversarial challenge mode (AI simulates the target system) | Low | H |

---

## Completed ✓

> All items below are fully implemented and merged.

### Quick Wins (12/12 Done)

1. `/api/health` liveness endpoint
2. `.env.example` + README setup section
3. dotenv config loading (`app/lib/config.js`)
4. `docker-compose.yml`
5. `scripts/init.sh` startup script
6. Command templates with `{target}` substitution
7. Fuzzy search in command history sidebar
8. Session event filtering (all / success / failed / running)
9. Command timeout UI + cancel button
10. Report format presets (CTF, Bug Bounty, Pentest)
11. Graceful shutdown handler (SIGTERM / SIGINT + SQLite close)
12. Fixed bottom version bar (Semver + Git SHA)

### Easy Items (Implemented)

- B.2 Env var documentation (`.env.example`)
- B.3 `/api/health` liveness endpoint
- B.4 Graceful shutdown handler (SIGTERM)
- B.5 `.env` file config with dotenv
- B.6 `docker-compose.yml` for full stack
- B.8 Database backup/export API endpoint
- B.10 `scripts/init.sh` startup script
- B.1 Multi-stage Docker build (builder + slim runtime image)
- A.2 Collapsible timeline + expand-all toggle
- A.3 Dark mode toggle + localStorage persistence
- A.5 Inline event filtering by status/tag
- A.7 Copy-to-clipboard button per event
- A.8 Screenshot metadata inline edit (popover)
- A.9 Customizable sidebar tool categories
- C.2 Command templates/macros (`{target}`)
- C.6 Command history fuzzy search
- C.7 Bulk screenshot operations
- D.3 Inline images in Markdown/PDF export
- D.8 Auto TOC generation in reports
- D.10 Report format presets (Pentest, CTF, Bug Bounty)
- E.5 Coach command validation before execution
- E.10 API cost tracking per session
- F.4 Screenshot magic-byte MIME validation
- F.6 Session ID randomization (UUID)
- F.8 Note HTML sanitization (XSS — stored as plain text)
- F.10 Audit log for sensitive actions
- G.4 Constants consolidation to config file
- G.8 CSS module organization
- G.9 Dependency audit (`npm audit`)
- EX.4 Running process registry pruning on completion/cancel/timeout
- EX.10 Graceful child-process shutdown before SQLite close
- GR.1 Domain, hostname, and subdomain extraction from command evidence
- GR.2 Username extraction from output and findings evidence
- GR.3 Hash extraction (MD5, SHA1, SHA256, SHA512, NTLM-like patterns)
- GR.4 Graph node search and highlight controls
- GR.5 Direct PNG export button for discovery graph
- GR.6 Phase filter for graph nodes and edges
- GR.7 Reset auto-derived graph content while preserving manual nodes
- GR.9 Directed and animated graph edges for attack-path visualization
- GR.10 Windows UNC/path extraction for graph evidence
- GR.11 Expanded node types: `subdomain`, `hash`, `username`, `database`, `directory`, `api-endpoint`
- GR.13 Graph stats panel (node counts, edges, density)
- GR.14 Node sizing scaled by graph degree
- GR.15 Strict graph node/edge Zod validation in `graph/route.js`
- GR.16 Hardened SVG-to-PNG export checks and visible failure handling
- GR.17 Mermaid phase clustering with `subgraph` blocks and `classDef` color styling
- GR.19 Server-driven graph refresh after successful command completion
- SEC.1 Content Security Policy and browser security headers
- SEC.3 ANSI/VT escape stripping before command output persistence
- SEC.4 Structured `spawn()`-based command execution on Windows/POSIX
- SEC.5 Analyst name sanitization across report and export routes
- SEC.6 Screenshot name/tag sanitization in upload and timeline edit flows
- GH.1 GitHub CI workflow for lint and production build
- GH.2 GitHub test workflow for Vitest
- GH.4 `.github/dependabot.yml` for weekly npm and Docker dependency updates
- GH.5 GitHub security workflow for `npm audit` and Trivy image scan
- GH.6 Issue templates and pull request template at the repo root
- GH.7 `CODEOWNERS` file
- GH.8 Accurate README badges for CI, tests, security, license, coverage, and Docker publish status
- GH.3 `.github/workflows/docker-publish.yml` — publish `ghcr.io/<owner>/helms-watch` on stable semver tags
- GH.9 GitHub Releases automation from semver tag + changelog parity
- GH.13 GitHub Pages docs site deployment from root `docs/` with MkDocs Material
- GH.10 CodeQL SAST workflow for JavaScript
- GH.11 Changelog enforcement workflow with `skip-changelog` label bypass
- GH.12 reviewdog ESLint annotations inline on pull requests
- CD.1 DB index on `timeline_events(session_id, timestamp)`
- CD.2 DB index on `timeline_events(session_id, type)`
- CD.3 DB index on `writeup_versions(session_id, version_number DESC)`
- CQ.1 Rate limiter prune interval, ceiling enforcement, and warning logging
- CQ.2 Safe command finalization when timeline persistence fails
- CQ.3 Shared API middleware factory (`withAuth`, `withValidSessionId`, `withErrorHandler`) rolled out across core routes
- CQ.4 Evidence JSON parse failure logging in `normalizeEvidenceEventIds`
- G.1 Vitest Phase 2 coverage for security helpers, execute queue/middleware, and execute-route concurrency regressions
- UX.7 Timeline auto-follow lock when user scrolls away from bottom
- UX.8 Keyboard shortcut reference modal (`?`) in header
- UX.4 Always-visible session breadcrumb with explicit target placeholder
- UX.1 Persisted main panel view (`TERMINAL`/`GRAPH`) in localStorage
- UX.2 Keyboard shortcut (`G`) to toggle main panel view
- UX.6 Structured onboarding empty-state with quick-start actions
- UX.12 Expanded/collapsed timeline visual state indicators with left-border accents
- UX.9 Local report block autosave every 10 seconds with newer-draft restore
- UX.10 Screenshot bulk selection badge + persistent highlight state
- R.14 Screenshot `caption` and `context` metadata stored end-to-end
- R.3 Auto-generated severity summary table in every report and export
- R.7 Reusable report cover/header metadata block across modal and all export formats
- R.12 Deterministic findings auto-tagging endpoint and editable finding tags
- R.13 Responsive HTML export CSS media queries for mobile/tablet readability
- EX.5 Output pagination for large command results in the timeline UI
- EX.7 Session env vars injected into child processes (`CTF_TARGET`, `CTF_SESSION_ID`, `CTF_WORDLIST_DIR`)
- EX.8 Stderr progress parsing to `progress_pct` with running command progress bars
- EX.9 Command retry endpoint (`/api/execute/retry/[eventId]`) with editable rerun flow
- EX.6 Command concurrency queue with configurable `MAX_CONCURRENT_COMMANDS` cap and queued cancellation handling
- EX.11 Grouped command history using `command_hash` with run counts and success-rate display
- CTF.3 Session timer with start, pause, resume, and reset persisted per session
- CTF.4 Read-only wordlist browser rooted at `CTF_WORDLIST_DIR`
- CTF.9 Local flag submission tracking with per-session CRUD
- CTF.12 Note templates for OWASP Top 10, PTES, and Linux/Windows privesc workflows
- CTF.13 Cheatsheet expansion with SearchSploit, Exploit-DB, Metasploit templates, Windows privesc, AD, post-exploitation, and reverse shells
- OPS.1 `HEALTHCHECK` instruction in `Dockerfile`
- OPS.2 Resource limits in `docker-compose.yml` (`mem_limit`, `cpus`)

### Medium Items (20/20 Done)

- A.6 Drag-and-drop report block reordering
- A.10 Timeline keyboard shortcuts (↑↓ history, Ctrl+F search)
- C.1 Command timeout UI + cancel button
- C.8 Output diff view for related commands (LCS algorithm)
- D.4 PoC step recorder (screenshot + command + output + observation)
- D.5 Multi-format export (DOCX, HTML, JSON, Markdown)
- D.6 Report versioning + diff view
- D.9 CVSS score integration on findings
- E.4 Coach feedback loop (thumbs up/down per response)
- E.6 Multi-model coach comparison (parallel providers)
- E.7 Coach confidence scoring
- F.2 Advanced command injection hardening (host-protection blocklist)
- F.3 Rate limiting on `/api/execute` and `/api/coach`
- F.5 Parameterized query audit in `updateTimelineEvent`
- F.7 API token rotation + expiration
- F.9 PDF export XSS protection audit
- G.3 Logger module standardization (`app/lib/logger.js`)
- G.5 Error handling consistency across all endpoints
- G.6 API response schema validation with zod
- G.10 OpenAPI/Swagger docs at `/api/docs`

### Hard Items (1/1 Done)

- D.2 AI auto-finding extraction + severity tagging (findings table + `/api/findings`)

### New Features Added This Sprint

- Discovery Graph (React Flow v12) — auto-derive host/service/vuln/flag/credential nodes
- Graph in main panel with TERMINAL/GRAPH tab switcher
- Graph state persisted in SQLite `graph_state` table
- Mermaid diagram export (`GET /api/graph?mermaid=1`)
- `app/lib/graph-derive.js` — pure regex extraction from timeline events
- Vitest test infrastructure (Phase 1): unit tests for `findings`, `report-formats`, integration tests for findings routes
- Multi-format export: DOCX (`docx` library), HTML (semantic template), JSON (structured)
- Findings tag editing and deterministic auto-tagging endpoint
- SearchSploit runtime support in Docker with toolbox/cheatsheet integration
- Wordlist browser and local flag tracking workflows in the sidebar
- Report block drag-and-drop reordering (HTML5 native DnD)
- Output diff view (LCS-based unified diff modal)
- Multi-model AI coach comparison (parallel `Promise.allSettled`)

---

## See Also

- [improvement-backlog.md](improvement-backlog.md) — per-item rationale, files affected, and implementation notes
- [../examples/htb/pdf/README.md](../examples/htb/pdf/README.md) — HTB report template references
