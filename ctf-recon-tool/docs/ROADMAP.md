---
title: Helm's Paladin — Project Improvement Roadmap
updated: 2026-03-10
source: automated multi-agent codebase scan (claude-sonnet-4-6)
---

# Helm's Paladin — Improvement Roadmap

## Architecture Assessment

Helm's Paladin is a production-grade Next.js 15 CTF reconnaissance assistant with:

- Clean separation of concerns (frontend, API routes, SQLite DB, security layer)
- Multi-provider AI coach (Claude, Gemini, OpenAI) with streaming, cost tracking, and feedback
- Rich CTF-specific features: session mgmt, timeline, discovery graph, PoC recorder, AI findings, reporting
- Robust security: path traversal protection, rate limiting, API token rotation, zod validation
- Multi-format export: PDF, DOCX, HTML, JSON, Markdown
- Vitest test suite (Phase 1 complete)

**Current gaps:** real-time output streaming, CTF platform integrations, graph enrichment, no concurrency control, missing session env vars, no CVSS calculator, no CVE/ExploitDB lookup, no Windows/AD cheatsheet.

**Product scope:** Helm's Paladin is desktop/laptop-first; tablet and mobile responsive work is intentionally out of scope.

> **Effort key:** S = Small (< 4h) · M = Medium (1–3 days) · H = Hard (1–2 weeks)

---

## Pending Improvements

### Recommended Execution Queue (Effort S)

> This queue covers all currently pending `Effort = S` items only. The category tables below remain unchanged as the canonical backlog inventory.

> Wave 1 completed on 2026-03-09: `SEC.4`, `SEC.5`, `SEC.6`, `SEC.1`, `SEC.3`, `EX.4`, `EX.10`, `GR.15`.
> Wave 2 completed on 2026-03-10: `GH.1`, `GH.2`, `GH.5`, `GH.10`, `GH.11`, `CQ.1`, `CQ.2`, `CQ.4`, `CD.1`, `CD.2`, `CD.3`.

1. **Wave 3 — Execution Workflow and Session Stability**  
   `UX.7`, `EX.7`, `EX.5`, `EX.9`, `EX.8`, `EX.11`, `UX.9`, `UX.10`, `R.14`
2. **Wave 4 — Reporting and Operator Value**  
   `R.3`, `R.12`, `R.7`, `CTF.13`, `CTF.12`, `CTF.4`, `CTF.3`, `CTF.9`
3. **Wave 5 — Discovery Graph Batch**  
   `GR.1`, `GR.2`, `GR.3`, `GR.10`, `GR.11`, `GR.16`, `GR.4`, `GR.6`, `GR.17`, `GR.5`, `GR.7`, `GR.13`, `GR.14`, `GR.9`
4. **Wave 6 — UX Polish**  
   `UX.8`, `UX.4`, `UX.1`, `UX.2`, `UX.6`, `UX.12`
5. **Wave 7 — Repository and Ops Hygiene**  
   `GH.4`, `GH.12`, `GH.6`, `GH.7`, `GH.8`, `OPS.1`, `OPS.2`
6. **Wave 8 — Deferred Small Item**  
   `R.13`  
   HTML export responsiveness remains useful for shared reports, but app mobile/tablet layout is out of scope and this item has lower urgency.

### UX

| ID | Item | Impact | Effort |
|----|------|--------|--------|
| A.4 | Real-time fuzzy command suggestions (autocomplete) | Med | M |
| UX.1 | Persist main panel view (TERMINAL/GRAPH) in localStorage | Low | S |
| UX.2 | Keyboard shortcut (`G`) to toggle GRAPH view | Low | S |
| UX.3 | Toast notification system (command complete, new discovery) | Med | M |
| UX.4 | Session target IP always visible in header breadcrumb | Low | S |
| UX.5 | Command palette (Ctrl+K) — quick-action search | Med | M |
| UX.6 | Better onboarding empty-state for new sessions | Low | S |
| UX.7 | Timeline auto-scroll lock: don't jump when user has scrolled up | High | S |
| UX.8 | Keyboard shortcut reference modal (`?` button in header) | Med | S |
| UX.9 | Auto-save report blocks to localStorage every 10s (prevent data loss) | Med | S |
| UX.10 | Screenshot bulk selection: persistent counter badge + highlight selected | Med | S |
| UX.11 | Filter toolbar: collapse into dropdown at < 1400px to prevent 4-row wrap | High | M |
| UX.12 | Timeline event expanded/collapsed visual indicator (colored left border) | Low | S |

### Discovery Graph

| ID | Item | Impact | Effort |
|----|------|--------|--------|
| GR.1 | Extract domain/hostname nodes (FQDN regex in `graph-derive.js`) | Med | S |
| GR.2 | Extract username nodes from output (e.g., `user: foo`, `as foo`) | Med | S |
| GR.3 | Extract hash values (MD5, NTLM, SHA patterns) as credential nodes | Med | S |
| GR.4 | Graph node search / highlight by keyword | Med | S |
| GR.5 | Direct PNG export button (independent of "Add to Report") | Low | S |
| GR.6 | Phase filter — show only nodes from a selected attack phase | Med | S |
| GR.7 | Graph reset button (clear auto-derived nodes, keep manual edits) | Low | S |
| GR.8 | Right-click context menu on nodes (edit label, delete, link to event) | Med | M |
| GR.9 | Animated / directed edge arrows for attack path visualization | Low | S |
| GR.10 | Add Windows UNC/path patterns (`\\server\share`, `C:\Users\...`) to regex extraction | Med | S |
| GR.11 | New node types: `subdomain`, `hash`, `username`, `database`, `directory`, `api-endpoint` | Med | S |
| GR.12 | Dagre layout alternative (hierarchical top-down attack path view) | Med | M |
| GR.13 | Graph stats panel (node count by type, edge count, density) | Low | S |
| GR.14 | Node size scaled by degree (more connections → larger node) | Low | S |
| GR.16 | Fix SVG→PNG export null-check on `toSVGElement()` to prevent silent failure | Med | S |
| GR.17 | Mermaid export: subgraph clustering by attack phase + classDef color coding | Med | S |
| GR.18 | Attack path highlighting — click node to highlight all connected paths | Med | M |

### GitHub / CI-CD (NEW)

| ID | Item | Impact | Effort |
|----|------|--------|--------|
| GH.3 | `.github/workflows/docker-publish.yml` — push image to GHCR on semver tag | High | M |
| GH.4 | `.github/dependabot.yml` — weekly npm + Docker base image bumps | Med | S |
| GH.6 | `.github/ISSUE_TEMPLATE/` + `.github/pull_request_template.md` | Low | S |
| GH.7 | `CODEOWNERS` file | Low | S |
| GH.8 | README badges (CI status, Docker image, license, test coverage) | Low | S |
| GH.9 | GitHub Releases automation — semver tag triggers changelog + release notes | Med | M |
| GH.12 | reviewdog ESLint annotations inline on PRs | Med | S |
| GH.13 | GitHub Pages docs site (MkDocs Material, auto-deploy from `docs/`) | Low | M |

### Reporting & Export

| ID | Item | Impact | Effort |
|----|------|--------|--------|
| D.1 | Custom report template builder UI | Med | H |
| R.1 | Executive summary auto-generation (AI-powered, from findings table) | High | M |
| R.2 | MITRE ATT&CK technique tagging on findings | Med | M |
| R.3 | Auto-generated severity summary table in every report | Med | S |
| R.4 | Risk scoring matrix (severity × likelihood 5×5 grid in PDF) | Med | M |
| R.5 | Read-only report share link (unique token URL, no auth required) | Med | M |
| R.6 | AI-powered remediation suggestion per finding | Med | M |
| R.7 | Report cover page with session metadata (target, date, analyst name) | Low | S |
| R.8 | CVSS v3.1 calculator / severity color-coding in PDF+HTML export (visual badges) | High | M |
| R.9 | Report filtering: generate subset by severity, date range, or tag | Med | M |
| R.10 | Before/after session comparison report (delta: new/remediated/changed findings) | Med | M |
| R.11 | Finding deduplication + relationship tracking (`relatedFindingIds`) | Med | M |
| R.12 | Finding auto-tagging endpoint (severity-based, component-based, compliance tags) | Med | S |
| R.13 | HTML export: responsive CSS media queries (mobile/tablet viewable) | Med | S |
| R.14 | Screenshot captions: add `caption` + `context` fields to timeline event schema | Med | S |

### Execution Engine (NEW)

| ID | Item | Impact | Effort |
|----|------|--------|--------|
| EX.1 | Real-time output streaming via SSE (Server-Sent Events) | High | H |
| EX.2 | Nmap XML auto-parser (`-oX` output → graph host/service nodes) | High | M |
| EX.3 | Structured output detection (auto-pretty-print JSON/XML in terminal) | Med | M |
| EX.5 | Output size pagination (gracefully truncate very large outputs in UI) | Med | S |
| EX.6 | Command concurrency control — job queue with configurable max parallel (`MAX_CONCURRENT_COMMANDS` env) | Med | M |
| EX.7 | Inject session env vars into child process (`$CTF_TARGET`, `$CTF_SESSION_ID`, `$CTF_WORDLIST_DIR`) | High | S |
| EX.8 | Parse stderr progress patterns (%, X/Y) → store `progress_pct` + show progress bar in UI | Med | S |
| EX.9 | Command retry endpoint (`/api/execute/retry/[eventId]`) — re-run same or modified command | Med | S |
| EX.11 | Command history deduplication (`command_hash` SHA256 column, dedup endpoint, success-rate display) | Low | S |

### CTF-Specific Features (NEW)

| ID | Item | Impact | Effort |
|----|------|--------|--------|
| CTF.1 | Credential manager (store username/password/hash per session, link to nodes) | High | M |
| CTF.2 | Hash identification workflow (hashid → john/hashcat command generator) | High | M |
| CTF.3 | Session timer (CTF countdown clock with start/stop/reset) | Med | S |
| CTF.4 | Wordlist browser (enumerate `/usr/share/wordlists` on host) | Med | S |
| CTF.5 | Service enumeration checklists (HTTP found → auto-suggest gobuster, nikto…) | High | M |
| CTF.6 | Automated follow-up pipeline (IP discovered → auto-suggest next commands) | High | H |
| CTF.7 | Platform integrations: HTB / THM / CTFd API (flag submit, machine info) | Med | H |
| CTF.8 | Multi-target support (track multiple hosts/IPs in one session) | Med | H |
| CTF.9 | Flag submission tracking (mark flags submitted/pending per session) | Low | S |
| CTF.10 | CVE/ExploitDB lookup integration — auto-fetch CVSS + PoC count when CVE node created | High | M |
| CTF.11 | Credential verification + blast radius — test found creds against all discovered services | Med | M |
| CTF.12 | Note templates: OWASP Top 10, PTES, Linux/Windows privesc checklists (markdown with checkboxes) | Med | S |
| CTF.13 | Cheatsheet expansion: Windows privesc, Active Directory, post-exploitation, reverse shells, Metasploit | High | S |

### Code Quality & Tests

| ID | Item | Impact | Effort |
|----|------|--------|--------|
| G.1 | Vitest Phase 2: add tests for `security.js`, `graph-derive.js`, execute route | High | M |
| G.2 | TypeScript gradual conversion (start with `lib/` modules) | Med | H |
| G.7 | Frontend state refactor: 30+ `useState` → `useReducer` in `page.js` | Med | H |
| CQ.3 | API middleware factory (`withAuth`, `withValidSessionId`, `withErrorHandler`) to replace repeated auth boilerplate across 26 routes | Low | M |

### Security

| ID | Item | Impact | Effort |
|----|------|--------|--------|
| SEC.2 | CSRF token for state-mutating POST endpoints | Med | M |

### Ops / Infrastructure

| ID | Item | Impact | Effort |
|----|------|--------|--------|
| B.1 | Multi-stage Docker build (builder + slim runtime image) | Med | M |
| B.7 | Structured JSON logging mode (`LOG_FORMAT=json` env var) | Med | M |
| OPS.1 | `HEALTHCHECK` instruction in `Dockerfile` | Low | S |
| OPS.2 | Resource limits in `docker-compose.yml` (`mem_limit`, `cpus`) | Low | S |

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

### Easy Items (47/47 Done)

- B.2 Env var documentation (`.env.example`)
- B.3 `/api/health` liveness endpoint
- B.4 Graceful shutdown handler (SIGTERM)
- B.5 `.env` file config with dotenv
- B.6 `docker-compose.yml` for full stack
- B.8 Database backup/export API endpoint
- B.10 `scripts/init.sh` startup script
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
- GR.15 Strict graph node/edge Zod validation in `graph/route.js`
- SEC.1 Content Security Policy and browser security headers
- SEC.3 ANSI/VT escape stripping before command output persistence
- SEC.4 Structured `spawn()`-based command execution on Windows/POSIX
- SEC.5 Analyst name sanitization across report and export routes
- SEC.6 Screenshot name/tag sanitization in upload and timeline edit flows
- GH.1 GitHub CI workflow for lint and production build
- GH.2 GitHub test workflow for Vitest
- GH.5 GitHub security workflow for `npm audit` and Trivy image scan
- GH.10 CodeQL SAST workflow for JavaScript
- GH.11 Changelog enforcement workflow with `skip-changelog` label bypass
- CD.1 DB index on `timeline_events(session_id, timestamp)`
- CD.2 DB index on `timeline_events(session_id, type)`
- CD.3 DB index on `writeup_versions(session_id, version_number DESC)`
- CQ.1 Rate limiter prune interval, ceiling enforcement, and warning logging
- CQ.2 Safe command finalization when timeline persistence fails
- CQ.4 Evidence JSON parse failure logging in `normalizeEvidenceEventIds`

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
- Report block drag-and-drop reordering (HTML5 native DnD)
- Output diff view (LCS-based unified diff modal)
- Multi-model AI coach comparison (parallel `Promise.allSettled`)

---

## See Also

- [improvement-backlog.md](improvement-backlog.md) — per-item rationale, files affected, and implementation notes
- [../examples/htb/pdf/README.md](../examples/htb/pdf/README.md) — HTB report template references
