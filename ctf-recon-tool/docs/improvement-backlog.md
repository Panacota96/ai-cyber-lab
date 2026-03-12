---
title: Helm's Watch — Improvement Backlog
updated: 2026-03-11
source: automated codebase scan (claude-sonnet-4-6)
format: knowledge-sync compatible
---

# Improvement Backlog

> Full detail per item. Append new entries via `$knowledge-sync` at session close.
> Format: `[YYYY-MM-DD] [category/ID] description — source: <session>`

---

## Roadmap Wave Sync

### Next Wave Set — Waves 13-19 Planned
**Status:** Active (2026-03-11)

- **Wave 10.5 — Runtime Foundation:** Implemented with `EX.1`, `CTF.1`, `SEC.2`, `B.7`.
- **Wave 11 — Operator Intelligence Layer:** Implemented with `EX.2`, `EX.3`, `CTF.5`, `CTF.10`, `CTF.11`.
- **Wave 12 — Shell and Artifact Operations:** Implemented with `EX.12`, `CTF.14`.
- **Wave 12.5 — Credential Crack Prep:** Implemented with `CTF.2`.
- **Wave 13 — Stabilization and Decomposition:** Implemented with `G.7`, `G.2`, `UX.11`, `UX.3`.
- **Wave 14 — Multi-Target Recon Core:** Implemented with `CTF.8`, `GR.12`, `GR.18`.
- **Wave 15 — Assisted Operator Flow:** Implemented with `CTF.6`, `A.4`, `UX.5`, `GR.8`.
- **Wave 16 — Reporting Intelligence Core:** Planned with `R.2`, `R.8`, `R.9`, `R.11`, `R.4`.
- **Wave 17 — Executive and Comparative Reporting:** Implemented with `R.1`, `R.5`, `R.6`, `R.10`, `D.1`.
- **Wave 18 — Coach and Platform Expansion:** Implemented with `E.1`, `E.2`, `CTF.7`.
- **Wave 19 — Experimental AI Extensions:** Planned with `E.3`, `E.8`, `E.9`.
- Strategy rationale: the runtime, intelligence, shell/artifact, and hash-identification foundations now exist; the next sequence should reduce structural risk first, then expand target scope, then deepen operator/reporting workflows.

### Wave 12 — Shell and Artifact Operations
**Status:** Implemented (2026-03-11)

- `EX.12` Added a shell hub with reverse-shell listeners, webshell command execution, tabbed terminal UX, transcript persistence, and shell SSE fan-out.
- `CTF.14` Added session-scoped artifact storage for operator uploads and transcript-saved evidence, with preview/download APIs and report insertion hooks.
- Follow-on scope stays deferred for a later wave: Meterpreter transports and automated remote file-pull.

### Wave 12.5 — Credential Crack Prep
**Status:** Implemented (2026-03-11)

- `CTF.2` Added a credential hash-identification workflow that fingerprints common hashes, stores the best guess on credentials, and generates `john` / `hashcat` commands matched to available runtime tooling.

### Wave 13 — Stabilization and Decomposition
**Status:** Implemented (2026-03-11)

- `G.7`, `G.2` now cover extracted timeline filter/notification helpers and UI modules, plus the initial TypeScript project configuration and type packages needed for future gradual conversion.
- `UX.11`, `UX.3` now cover a compact timeline filter dropdown under `1400px` and toast feedback for command completion, discovery refreshes, credentials, shells, and artifacts.
- Startup stabilization also landed here: local production boot no longer probes disabled shell APIs eagerly, and a missing `CTF_WORDLIST_DIR` now renders as an empty browser state instead of a 404.
- Local verification now has supported commands: `npm run dev:webpack`, `npm run prepare:local-runtime`, and `npm run start:local-runtime`.
- Verification close-out is complete: Playwright smoke confirmed standalone page load plus compact filter and shell-view rendering, and Docker build/runtime checks confirmed `/api/health` plus bundled `john`, `hashcat`, and `searchsploit`.

### Wave 14 — Multi-Target Recon Core
**Status:** Implemented (2026-03-11)

- `CTF.8` introduces a proper multi-host session model spanning timeline, graph, credentials, shells, artifacts, and exports.
- `GR.12`, `GR.18` add the graph controls needed to keep multi-target sessions understandable at a glance.
- `session_targets` now backfills from legacy sessions, `targetId` is persisted across execution/credential/shell/artifact flows, and operators can manage active targets from the app header.
- The graph now hydrates target affinity from source timeline events, supports active-target scoping, offers a target-oriented layout mode, and highlights likely attack paths through the session graph.

### Wave 15 — Assisted Operator Flow
**Status:** Implemented (2026-03-11)

- `CTF.6` broadens advisory follow-up automation once the app can reason about more than one target in a session.
- `A.4`, `UX.5`, `GR.8` reduce execution friction with fuzzy suggestions, a command palette, and graph context actions.
- The command box now offers inline `Tab` autocomplete across advisory service suggestions, recent commands, and toolbox templates, with active-target-aware ranking.
- `Ctrl/Cmd+K` now opens a command palette that previews and inserts ranked operator commands without auto-executing them.
- Discovery graph nodes now expose context actions for timeline search and related follow-up commands, including service-derived actions and CVE exploit-research shortcuts.

### Wave 16 — Reporting Intelligence Core
**Status:** Implemented (2026-03-11)

- `R.2`, `R.8`, `R.9`, `R.11`, `R.4` make reports richer, more structured, and easier to filter or score consistently across formats.
- Reports and exports now share one findings-intelligence layer for ATT&CK tagging, CVSS/risk derivation, dedup/relationship tracking, and filter-aware output generation.
- The report modal now exposes filter controls and richer finding metadata editing so operators can shape the same reporting scope they export.

### Wave 17 — Executive and Comparative Reporting
**Status:** Implemented (2026-03-11)

- `R.1` adds executive-summary generation with deterministic fallback plus optional provider-backed drafting from the current filtered findings/timeline scope.
- `R.6` adds remediation suggestion generation that can populate finding remediation text from the report workflow without mutating evidence or auto-publishing anything.
- `R.10` adds before/after comparison reports across sessions with classified new/remediated/changed/persisted finding deltas.
- `D.1` adds reusable report-template persistence with placeholder substitution so the Chronicle editor doubles as a template builder.
- `R.5` adds public read-only share links backed by stored report snapshots plus authenticated create/list/revoke controls from the report modal.

### Wave 18 — Coach and Platform Expansion
**Status:** Implemented (2026-03-12)

- `E.1`, `E.2`, `CTF.7` now ship coach difficulty controls, bounded context modes, in-memory response caching, and optional HTB / THM / CTFd platform linkage with metadata + flag workflows.
- This wave is also the roadmap anchor for a downstream SysReptor handoff path once coach/platform metadata is stable enough to map cleanly into an external reporting system.
- Reference links:
  - SysReptor docs: https://docs.sysreptor.com/
  - HTB reporting with SysReptor: https://docs.sysreptor.com/htb-reporting-with-sysreptor/

### Wave 19 — Experimental AI Extensions
**Status:** Planned

- `E.3`, `E.8`, `E.9` stay explicitly experimental so offline/auto-authoring/simulation ideas do not destabilize the primary operator workflow.

### Wave 10.5 — Runtime Foundation
**Status:** Implemented (2026-03-11)

- `EX.1` Added SSE execution streaming for stdout/stderr/progress/state/completion events with timeline polling fallback.
- `CTF.1` Added a first-class session credential store with CRUD APIs, sidebar management, and report/export integration.
- `SEC.2` Added CSRF bootstrap + validation for authenticated mutating routes.
- `B.7` Added structured JSON logging mode through `LOG_FORMAT=json`.

### Wave 10 — Runtime Quality and API Consistency
**Status:** Implemented (2026-03-11)

- `EX.6` Added bounded command concurrency queueing via `MAX_CONCURRENT_COMMANDS` with `queued -> running` lifecycle and queued-command cancellation support.
- `CQ.3` Added shared API route middleware helpers (`withAuth`, `withValidSessionId`, `withErrorHandler`) and rolled them out across core routes (`execute`, `timeline`, `findings`, `poc`, `flags`, `sessions`, `writeup`, `graph`, upload/auth flows).
- `G.1 (Phase 2)` Expanded Vitest coverage for security helpers, API middleware, execute queue behavior, and execute-route concurrency/auth regressions.

### Wave 9 — Release Delivery Backbone
**Status:** Implemented (2026-03-11)

- `GH.3` Added `.github/workflows/docker-publish.yml` for stable semver tag image publishing to `ghcr.io/<owner>/helms-watch`.
- `GH.9` Added `.github/workflows/release.yml` that enforces tag/changelog parity and creates GitHub Releases from changelog sections.
- `GH.13` Added MkDocs Material docs site config (`mkdocs.yml`) and `.github/workflows/docs-pages.yml` for GitHub Pages deploy from root `docs/`.
- `B.1` Refactored `ctf-recon-tool/Dockerfile` to a true multi-stage build with Next standalone output and slim runtime stage.
- `GH.8` Docker badge deferral is closed; README badges now include Docker publish workflow status.

### Wave 8 — Deferred Small Item
**Status:** Implemented (2026-03-10)

- `R.13` HTML export now applies responsive CSS media queries (`1024px`, `768px`, `520px`) for tablet/mobile readability, including safer wrapping for metadata chips, code blocks, images, and tables.

### Wave 7 — Repository and Ops Hygiene
**Status:** Implemented (2026-03-10)

- `GH.4` Added `.github/dependabot.yml` for weekly npm and Docker updates scoped to `/ctf-recon-tool`.
- `GH.12` Added `reviewdog-eslint.yml` so ESLint findings annotate PRs inline on `main`.
- `GH.6` Added issue templates plus a pull request template at the repo root.
- `GH.7` Added `CODEOWNERS` with `@Panacota96` as the default owner.
- `GH.8` Added real README badges for CI, tests, security, MIT license, and repo-hosted coverage; Docker publish badge is now active after `GH.3`.
- `OPS.1` Added an image-level `HEALTHCHECK` to the Dockerfile using `/api/health`.
- `OPS.2` Added default Docker Compose resource limits via `APP_MEM_LIMIT` and `APP_CPUS`, and documented them in the app README.

### Wave 6 — UX Polish
**Status:** Implemented (2026-03-10)

- `UX.1` Main panel view (`TERMINAL`/`GRAPH`) now persists via `ui.mainView`.
- `UX.2` Added `G` keyboard toggle for terminal/graph view with input/modal guards.
- `UX.8` Added keyboard shortcut reference modal (`?`) with close-on-escape/backdrop behavior.
- `UX.4` Header now always shows session breadcrumb metadata including explicit `Target: not set` when empty.
- `UX.6` Empty timeline state upgraded to a structured onboarding panel with quick-start actions.
- `UX.12` Timeline cards now render expanded/collapsed visual state using class-based left-border indicators.

### Wave 5 — Discovery Graph Continuation
**Status:** Implemented (2026-03-10)

- `GR.19` Successful commands now refresh persisted graph state on the backend, and the graph view refetches that state instead of re-deriving locally from timeline rows.
- `GR.1`, `GR.2`, `GR.3`, `GR.10`, `GR.11` expanded graph derivation with hostname/subdomain, username, hash, Windows path, database, directory, and API-endpoint node extraction from command evidence and findings.
- `GR.4`, `GR.6`, `GR.13`, `GR.14`, `GR.9` added graph search/highlight, phase filtering, stats, node-degree sizing, and directed/animated edges.
- `GR.5`, `GR.16`, `GR.17`, `GR.7` added direct PNG export, hardened SVG export checks, richer phase-clustered Mermaid export, and reset of auto-derived graph content without deleting manual nodes.

### Wave 4 — Reporting and Operator Value
**Status:** Implemented (2026-03-10)

- `R.3` Every report and export now includes a severity summary table when persisted findings exist.
- `R.7` Report generation now emits a reusable cover/header metadata block across modal, Markdown, HTML, PDF, DOCX, and JSON exports.
- `R.12` Findings now store editable `tags`, and `POST /api/findings/auto-tag` applies deterministic rule-based tags.
- `CTF.13` Toolbox and cheatsheet now include SearchSploit, Exploit-DB, Metasploit templates, Windows privesc, AD, post-exploitation, and reverse-shell helpers.
- `CTF.12` Note mode now supports insertable OWASP Top 10, PTES, Linux privesc, and Windows privesc templates.
- `CTF.4` Added a read-only wordlist browser rooted at `CTF_WORDLIST_DIR`.
- `CTF.3` Added a per-session timer with pause/resume/reset and local persistence.
- `CTF.9` Added local flag tracking CRUD with captured/submitted/accepted/rejected statuses.
- Blocking regressions addressed: report modal opens directly without analyst-name gating, valid notes post cleanly, and SearchSploit is bundled into the Docker runtime.

### Wave 3 — Execution Workflow and Session Stability
**Status:** Implemented (2026-03-10)

- `UX.7` Timeline auto-follow now stays unlocked while the user is reading older history and only resumes near bottom or on explicit jump.
- `EX.7` Command execution now injects `CTF_TARGET`, `CTF_SESSION_ID`, and `CTF_WORDLIST_DIR`.
- `EX.5` Large command output now paginates client-side instead of rendering the entire body at once.
- `EX.9` Added `POST /api/execute/retry/[eventId]` and wired quick rerun from grouped history.
- `EX.8` Running command cards now persist and render `progress_pct`.
- `EX.11` Sidebar history now uses grouped `command_hash` stats with run count and success rate.
- `UX.9` Report blocks now autosave to local draft storage and restore the newest draft on reopen.
- `UX.10` Screenshot bulk selection now keeps a visible counter badge and persistent highlight state within the session.
- `R.14` Screenshot evidence now stores and exports `caption` and `context`.

---

## A. Frontend / UI/UX

### A.2 — Collapsible Timeline with Auto-Expand Recent
**What:** Toggle to collapse/expand all events; auto-expand newest N events.
**Why:** Long sessions become unwieldy.
**Files:** `app/HomeClient.js`
**Difficulty:** Easy | **Impact:** Medium
**Status:** Implemented (2026-03-09). Added `Collapse All` / `Expand All`, persisted `ui.timelineCollapsed`, per-event `Show/Hide`, and auto-expand of newest 5 events while collapsed.

### A.3 — Dark Mode Toggle Persistence
**What:** Save dark/light preference in localStorage; apply via CSS variables.
**Files:** `app/HomeClient.js`, `app/globals.css`
**Difficulty:** Easy | **Impact:** Low

### A.4 — Real-time Fuzzy Command Suggestions
**What:** Fuzzy-match command history + cheatsheet; show inline preview on Tab.
**Files:** `app/HomeClient.js`, new `app/hooks/` suggestions module
**Difficulty:** Medium | **Impact:** Medium

### A.5 — Inline Event Filtering by Status/Tag
**What:** Quick-filter buttons above timeline (all/success/failed/running).
**Files:** `app/HomeClient.js`
**Difficulty:** Easy | **Impact:** Medium
**Note:** Filter state persistence to localStorage is already implemented.

### A.6 — Drag-and-Drop Report Block Reordering
**What:** Manually reorder/delete report sections in the writeup editor.
**Files:** `app/HomeClient.js`, extracted reporting UI modules
**Difficulty:** Medium | **Impact:** Low-Med

### A.7 — Copy-to-Clipboard Button Per Event
**What:** Per-event copy button on output; allow copying filtered output.
**Files:** `app/HomeClient.js`
**Difficulty:** Easy | **Impact:** Low
**Status:** Implemented (copy button on command output, 2026-03-08).

### A.8 — Screenshot Metadata Inline Edit (Popover)
**What:** Quick edit screenshot name/tag via popover instead of modal.
**Files:** `app/HomeClient.js`, extracted sidebar/media modules
**Difficulty:** Easy | **Impact:** Low

### A.9 — Customizable Sidebar Tool Categories
**What:** Allow users to hide/show/reorder SUGGESTIONS categories; persist to localStorage.
**Files:** `app/HomeClient.js`, extracted sidebar modules
**Difficulty:** Easy | **Impact:** Low-Med

### A.10 — Timeline Keyboard Shortcuts
**What:** Arrow keys to scroll, Ctrl+F to focus filter, J/K vim navigation.
**Files:** `app/HomeClient.js`, focused timeline hook/module
**Difficulty:** Medium | **Impact:** Low

### A.11 — Project Version Tracking Footer
**What:** Show app version and git commit short SHA in a fixed bottom footer.
**Why:** Improves release traceability during rapid UI/feature iterations.
**Files:** `next.config.mjs`, `app/layout.js`, `app/globals.css`, `app/HomeClient.js`
**Difficulty:** Easy | **Impact:** Low
**Status:** Implemented (2026-03-09). Footer shows `Helm's Watch • vX.Y.Z (abcdef1)`.

---

## B. Operability / DevOps

### B.1 — Multi-Stage Docker Build (Slim Image)
**What:** Implement multi-stage build; use `node:20-slim` for runtime.
**Why:** Current image ~2GB; leaner image = faster startup.
**Files:** `Dockerfile`
**Difficulty:** Easy | **Impact:** Medium
**Status:** Implemented (2026-03-11). Docker now uses `deps` + `builder` + `runner` stages with Next standalone output and runtime tooling in a slim final image.

### B.2 — Environment Configuration Documentation
**What:** Document all env vars; create `.env.example`.
**Why:** Missing vars lead to silent failures; setup is opaque.
**Files:** `.env.example`, `README.md`
**Difficulty:** Easy | **Impact:** High
**Key vars:** `APP_API_TOKEN`, `ENABLE_COMMAND_EXECUTION`, `ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY`, `OPENAI_API_KEY`, `NODE_ENV`

### B.3 — Health Check Endpoint
**What:** Add `/api/health` returning DB connectivity + AI provider status + disk space.
**Files:** `app/api/health/route.js`
**Difficulty:** Easy | **Impact:** Medium
**Status:** Implemented (2026-03-08). Green/yellow/red dot in header, 30s polling.

### B.4 — Graceful Shutdown Handler
**What:** SIGTERM handler to close SQLite connection cleanly.
**Files:** `app/lib/db.js`
**Difficulty:** Easy | **Impact:** Low-Med
**Status:** Implemented (2026-03-09). Added idempotent SQLite close helper with `SIGTERM` and `SIGINT` handlers guarded for dev hot-reload.

### B.5 — `.env` File Config with dotenv
**What:** Load config from `.env` via dotenv; validate required vars on startup.
**Files:** `package.json`, `next.config.mjs`, `app/lib/db.js`
**Difficulty:** Easy | **Impact:** Medium

### B.6 — Docker Compose for Full Stack
**What:** `docker-compose.yml` with db volume, AI key secrets, port mapping.
**Files:** `docker-compose.yml`
**Difficulty:** Easy | **Impact:** High

### B.7 — Structured JSON Logging
**What:** JSON logging mode (opt-in via env var) for log aggregation.
**Files:** `app/lib/logger.js`
**Difficulty:** Medium | **Impact:** Medium
**Status:** Implemented (2026-03-11). `LOG_FORMAT=json` now emits structured console/file logs while preserving local JSONL persistence in `data/app.log`.

### B.8 — Database Backup/Export API
**What:** `/api/admin/backup` to download SQLite DB as `.db` or `.sql`.
**Files:** `app/api/admin/backup/route.js`
**Difficulty:** Easy | **Impact:** Low-Med
**Status:** Implemented (2026-03-09). Added admin-guarded `GET /api/admin/backup?format=db|sql` with sqlite3 `.dump` fallback handling.

### B.9 — Resource Limits Documentation
**What:** Document recommended CPU/RAM/disk; tuning guidance for large sessions.
**Files:** `README.md`, `docs/`
**Difficulty:** Easy | **Impact:** Low

### B.10 — Startup Init Script
**What:** `scripts/init.sh` to initialize DB schema, create directories, validate setup.
**Files:** `scripts/init.sh`
**Difficulty:** Easy | **Impact:** Low-Med

---

## C. Functionality / Features

### C.1 — Command Timeout UI + Cancel Button
**What:** Display countdown timer during execution; allow user to cancel.
**Files:** `app/HomeClient.js`, `app/api/execute/route.js`, execution stream hooks
**Difficulty:** Medium | **Impact:** High
**Note:** Elapsed timer display is implemented (2026-03-08); kill button still pending.

### C.2 — Command Templates / Macros
**What:** Save frequently-used patterns with placeholders (e.g., `nmap -A {target}`).
**Files:** `app/HomeClient.js`, `app/lib/cheatsheet.js`
**Difficulty:** Easy | **Impact:** Medium

### C.3 — Session Comparison Mode
**What:** Two sessions side-by-side; highlight diff in commands/findings.
**Files:** `app/HomeClient.js`, extracted comparison view modules
**Difficulty:** Hard | **Impact:** Low-Med

### C.4 — Session Tagging + Full-Text Search
**What:** User-defined tags, custom fields, cross-session full-text search.
**Files:** `app/lib/db.js`, `app/api/sessions/route.js`, `app/HomeClient.js`
**Difficulty:** Medium | **Impact:** Medium

### C.5 — Live Collaboration (WebSocket)
**What:** Multiple users in same session with live updates; basic conflict resolution.
**Files:** New WebSocket server, `app/HomeClient.js`, extracted session state hooks
**Difficulty:** Hard | **Impact:** Medium

### C.6 — Command History Fuzzy Search
**What:** Regex/fuzzy search on command text and output in history sidebar.
**Files:** `app/HomeClient.js`, extracted sidebar/history modules
**Difficulty:** Easy | **Impact:** Low-Med

### C.7 — Bulk Screenshot Operations
**What:** Select multiple screenshots; batch-tag, delete, or rename.
**Files:** `app/HomeClient.js`, extracted sidebar/media modules
**Difficulty:** Easy | **Impact:** Low

### C.8 — Output Diff View
**What:** Side-by-side diff when two similar commands produce different output.
**Files:** `app/HomeClient.js`, extracted comparison/reporting modules
**Difficulty:** Medium | **Impact:** Low-Med

### C.9 — Global Search Across Sessions
**What:** Search commands, notes, flags across all sessions.
**Files:** `app/api/search/route.js`, `app/lib/db.js`, `app/HomeClient.js`
**Difficulty:** Medium | **Impact:** Medium

### C.10 — Scheduled Command Execution
**What:** Queue commands to run at specific times (e.g., overnight scans).
**Files:** New scheduler, `app/api/schedule/route.js`
**Difficulty:** Hard | **Impact:** Low-Med

### EX.1 — Real-Time Output Streaming via SSE
**What:** Replace active-command polling as the primary live-output transport with SSE events for stdout/stderr, progress, queue state, and completion while keeping polling fallback.
**Files:** `app/lib/execute-service.js`, `app/lib/execution-stream.js`, `app/api/execute/stream/route.js`, `app/hooks/useExecutionStream.js`, `app/lib/timeline-stream.js`, `app/HomeClient.js`
**Difficulty:** Hard | **Impact:** High
**Status:** Implemented (2026-03-11). Active command output now streams over SSE, timeline cards update live, and polling falls back when the stream disconnects.

### GR.19 — Auto-Refresh Graph After Successful Commands
**What:** Re-run graph derivation/persistence automatically whenever a command finishes successfully so the GRAPH view stays current without manual refresh.
**Files:** `app/lib/graph-derive.js`, `app/api/execute/route.js` or `app/lib/execute-service.js`, `app/api/graph/route.js`, `app/HomeClient.js`
**Difficulty:** Medium | **Impact:** High
**Status:** Implemented (2026-03-10). Successful command finalization now persists graph deltas server-side, `graph_state` is the source of truth, and the graph UI refetches persisted state instead of deriving a second client-only graph.

### CTF.1 — Credential Manager
**What:** Store usernames, passwords, hashes, notes, and optional node links per session so credential verification, blast radius, reporting, and later shell work share one source of truth.
**Files:** `app/lib/db.js`, `app/api/credentials/route.js`, `app/components/sidebar/CredentialsPanel.js`, `app/HomeClient.js`, `app/lib/export-utils.js`, `app/lib/report-formats.js`
**Difficulty:** Medium | **Impact:** High
**Status:** Implemented (2026-03-11). Credentials now persist in SQLite, render in the sidebar, and flow through JSON export plus report generation.

### EX.12 — Interactive Shell Session Hub
**What:** Bridge live shells into Helm's Watch so operators can manage reverse shells and webshells from the workspace with multiple concurrent tabs, transcript logging, and SSE-backed session state.
**Files:** `app/lib/shell-repository.js`, `app/lib/shell-runtime.js`, `app/lib/shell-stream.js`, `app/api/shell/`, `app/components/shells/`, `app/hooks/useShellHub.js`, `app/HomeClient.js`
**Difficulty:** Hard | **Impact:** High
**Status:** Implemented (2026-03-11). Reverse-shell listeners, webshell command routing, transcript persistence, shell SSE, and the tabbed shell workspace are now live. Meterpreter remains deferred.

### CTF.14 — Session Artifact / Loot Manager
**What:** Save documents and files collected from shell sessions (config dumps, loot, proofs) as session-scoped artifacts that can be previewed, downloaded, linked to notes, and referenced in reports.
**Files:** `app/lib/artifact-repository.js`, `app/lib/artifact-utils.js`, new artifact routes under `app/api/`, `app/components/sidebar/ArtifactsPanel.js`, `app/hooks/useArtifacts.js`, `app/HomeClient.js`
**Difficulty:** Medium | **Impact:** High
**Status:** Implemented (2026-03-11). Uploaded files and transcript-saved evidence now persist per session with preview/download APIs and insert-only report linkage.

---

## D. Reporting / Documentation Automation

### D.1 — Custom Report Template Builder
**What:** UI to create/edit markdown templates with sections and `{{placeholders}}`.
**Files:** `app/HomeClient.js`, extracted reporting modules, `app/lib/report-formats.js`
**Difficulty:** Hard | **Impact:** Medium

### D.2 — AI Auto-Finding Extraction + Severity Tagging
**What:** AI-assisted detection of findings from output; tag Critical/High/Medium/Low.
**Files:** `app/api/findings/route.js`, `app/api/findings/extract/route.js`, `app/lib/db.js`, `app/HomeClient.js`, `app/lib/report-formats.js`
**Difficulty:** Hard | **Impact:** High
**Status:** Implemented (2026-03-09). Added dedicated `findings` table + `/api/findings` CRUD and manual `POST /api/findings/extract` proposal workflow with severity tagging and evidence links; integrated findings into report generation and export bundle JSON.

### D.3 — Inline Images in Markdown/PDF
**What:** Auto-embed screenshot data URIs in exported reports.
**Files:** `app/api/export/markdown/route.js`, `app/api/export/pdf/route.js`
**Difficulty:** Easy | **Impact:** Medium
**Status:** Implemented (2026-03-09). Added `POST /api/export/markdown` with `inlineImages=true` default for export-only inlining.

### D.4 — Proof-of-Concept Step Recorder
**What:** Guided UI to record finding proof (screenshot + command + output, structured).
**Files:** `app/HomeClient.js`, extracted reporting/sidebar modules, `app/lib/db.js`, `app/api/poc/route.js`, `app/lib/report-formats.js`, `app/api/report/route.js`, `app/api/export/markdown/route.js`
**Difficulty:** Medium | **Impact:** Medium
**Status:** Implemented (2026-03-09). Added dedicated `poc_steps` table + `/api/poc` CRUD/reorder API, timeline `Add to PoC`/`In PoC` UX, report modal PoC editor, and PoC section injection for `technical-walkthrough` and `pentest`.

### D.5 — Multi-Format Export (DOCX, HTML, JSON)
**What:** Export beyond PDF: Word doc, HTML, raw JSON.
**Files:** `app/api/export/`, `package.json`
**Difficulty:** Medium | **Impact:** Medium
**Status:** Implemented (2026-03-09). Phase 1 delivered `POST /api/export/html` + `POST /api/export/json`; phase 2 completed `POST /api/export/docx`, report modal DOCX download action, and full docs coverage.

### D.6 — Report Versioning + Diff
**What:** Changelog between writeup versions; side-by-side markdown diff.
**Files:** `app/lib/db.js`, `app/api/writeup/route.js`
**Difficulty:** Medium | **Impact:** Low-Med

### D.7 — Finding Cross-Reference Links
**What:** Auto-linkify findings across report sections.
**Files:** `app/lib/report-gen.js`
**Difficulty:** Medium | **Impact:** Low

### D.8 — Auto TOC Generation
**What:** Auto-insert TOC in markdown report based on heading hierarchy.
**Files:** `app/lib/report-gen.js`
**Difficulty:** Easy | **Impact:** Low
**Note:** PDF TOC via pdfmake `toc` element already implemented in htb-professional theme (2026-03-08).

### D.9 — CVSS Score Integration
**What:** Link to CVSS calculator; store severity ratings in findings.
**Files:** `app/HomeClient.js`, `app/lib/db.js`
**Difficulty:** Medium | **Impact:** Low-Med

### D.10 — Report Format Presets
**What:** Pre-built templates for Pentest, CTF, Bug Bounty engagement types.
**Files:** `app/lib/report-formats.js`
**Difficulty:** Easy | **Impact:** Medium

### R.15 — SysReptor Bridge
**What:** Export or hand off Chronicle/report output into SysReptor so operators can continue inside a dedicated reporting platform after evidence collection and first-pass writeup work in Helm's Watch.
**Why:** SysReptor is a strong downstream fit for certification- and client-facing reporting, especially for HTB-style workflows and structured report designs.
**References:** https://docs.sysreptor.com/ · https://docs.sysreptor.com/htb-reporting-with-sysreptor/
**Files:** `app/lib/export-utils.js`, `app/api/export/*`, future `app/api/report/sysreptor/*`
**Difficulty:** Hard | **Impact:** Medium

---

## E. AI / Coach Integration

### E.1 — Coach Skill Difficulty Levels
**What:** Beginner/intermediate/expert modes; adjust language and hint depth.
**Files:** `app/api/coach/route.js`, `app/HomeClient.js`, extracted coach modules
**Difficulty:** Medium | **Impact:** Medium

### E.2 — Coach Caching + Context Limit Management
**What:** Prompt caching for repeated calls; truncate old timeline events to stay within token limits.
**Files:** `app/api/coach/route.js`
**Difficulty:** Medium | **Impact:** Medium

### E.3 — Offline Coach Mode (llama.cpp / ollama)
**What:** Support local LLM when no API key available.
**Files:** `app/api/coach/route.js`, `app/lib/ai-providers.js`
**Difficulty:** Hard | **Impact:** Low-Med

### E.4 — Coach Feedback Loop
**What:** Thumbs up/down on suggestions; persist to improve skill prompts.
**Files:** `app/HomeClient.js`, extracted coach modules, `app/lib/db.js`
**Difficulty:** Medium | **Impact:** Low-Med

### E.5 — Coach Command Validation
**What:** Validate coach-suggested commands against allowlist before execution.
**Files:** `app/api/coach/route.js`, `app/lib/security.js`
**Difficulty:** Easy | **Impact:** Low

### E.6 — Multi-Model Coach Comparison
**What:** Run coach query on multiple providers in parallel; show side-by-side.
**Files:** `app/api/coach/route.js`, `app/HomeClient.js`, extracted coach modules
**Difficulty:** Medium | **Impact:** Low-Med

### E.7 — Coach Confidence Scoring
**What:** Include confidence level (low/medium/high) with each suggestion.
**Files:** `app/api/coach/route.js`
**Difficulty:** Medium | **Impact:** Low

### E.8 — Auto Writeup Enhancement on Timeline Update
**What:** Trigger writeup enhancement when major findings added to timeline.
**Files:** `app/api/timeline/route.js`, `app/api/writeup/enhance/route.js`
**Difficulty:** Hard | **Impact:** Low-Med

### E.9 — Adversarial Challenge Mode
**What:** Coach proposes defensive questions and edge cases to test.
**Files:** `app/api/coach/route.js`
**Difficulty:** Hard | **Impact:** Low

### E.10 — API Cost Tracking
**What:** Log and display estimated cost of AI API calls per session.
**Files:** `app/lib/db.js`, `app/lib/ai-cost.js`, `app/api/coach/route.js`, `app/api/writeup/enhance/route.js`, `app/api/ai/usage/route.js`, `app/HomeClient.js`
**Difficulty:** Easy | **Impact:** Low
**Status:** Implemented (2026-03-09). Added `ai_usage` table + summary endpoint and UI session usage badge.

---

## F. Security & Reliability

### F.1 — Missing `createSession` Import (RESOLVED)
**What:** `app/api/sessions/route.js` — `createSession` was referenced without import.
**Status:** Fixed — import confirmed present (2026-03-08).

### SEC.2 — CSRF Protection for Mutating Routes
**What:** Require a CSRF token for authenticated state-mutating routes so browser-originated writes cannot rely on API token leakage alone.
**Files:** `app/lib/csrf.js`, `app/api/auth/csrf/route.js`, `app/lib/api-route.js`, authenticated `app/api/**/route.js`
**Difficulty:** Medium | **Impact:** Medium
**Status:** Implemented (2026-03-11). Mutating authenticated routes now require both the API token and a CSRF token/cookie pair.

### F.2 — Command Injection Hardening
**What:** Further harden shell command escaping; validate structure before execution.
**Files:** `app/api/execute/route.js`, `app/lib/security.js`
**Difficulty:** Medium | **Impact:** High

### F.3 — Rate Limiting on API Endpoints
**What:** 10 reqs/min per IP on `/api/execute`, `/api/coach`, `/api/upload`.
**Files:** `middleware.js` or per-route
**Difficulty:** Medium | **Impact:** Medium

### F.4 — Screenshot Magic-Byte MIME Validation
**What:** Verify file magic bytes, not just Content-Type header.
**Files:** `app/lib/image-sniff.js`, `app/api/upload/route.js`, `app/api/media/[sessionId]/[filename]/route.js`
**Difficulty:** Easy | **Impact:** Medium
**Status:** Implemented (2026-03-09). Upload now validates PNG/JPEG/GIF/WEBP signatures and normalizes saved extension; media route serves MIME from bytes first.

### F.5 — Parameterized Query Audit
**What:** Audit `updateTimelineEvent` dynamic SQL; ensure all user inputs are parameterized.
**Files:** `app/lib/db.js`
**Difficulty:** Medium | **Impact:** High

### F.6 — Session ID Randomization (UUID)
**What:** Option to use UUID instead of alphanumeric session IDs to prevent guessing.
**Files:** `app/lib/db.js`, `app/api/sessions/route.js`
**Difficulty:** Easy | **Impact:** Low-Med

### F.7 — API Token Rotation + Expiration
**What:** Time-limited API tokens; auto-rotate on startup.
**Files:** `app/lib/security.js`, `middleware.js`
**Difficulty:** Medium | **Impact:** Medium

### F.8 — Note HTML Sanitization (XSS)
**What:** Escape HTML in note content before rendering in reports.
**Files:** `app/lib/report-gen.js`, `app/HomeClient.js`
**Difficulty:** Easy | **Impact:** Low-Med

### F.9 — PDF Export XSS Protection
**What:** Ensure markdown-to-PDF conversion can't execute injected scripts.
**Files:** `app/api/export/pdf/route.js`
**Difficulty:** Medium | **Impact:** Low

### F.10 — Audit Log for Sensitive Actions
**What:** Log session deletes, writeup publishes, API token uses to `app_logs`.
**Files:** `app/lib/logger.js`, `app/lib/db.js`
**Difficulty:** Easy | **Impact:** Low-Med

---

## G. Code Quality / Architecture

### G.1 — Unit + Integration Test Suite
**What:** Jest/Vitest covering DB layer, API endpoints, report generation.
**Files:** `tests/`, `package.json`
**Difficulty:** Hard | **Impact:** High
**Status:** Implemented (2026-03-11). Phase 1 foundation is complete and Phase 2 added coverage for `security.js`, `graph-derive.js`, execute route concurrency/auth paths, and new queue/middleware helpers.

### G.2 — TypeScript Gradual Conversion
**What:** `tsconfig.json`; convert `db.js`, `security.js`, API routes first.
**Difficulty:** Hard | **Impact:** Medium

### G.3 — Logger Standardization
**What:** Consistent log levels (debug/info/warn/error); structured output.
**Files:** `app/lib/logger.js`
**Difficulty:** Easy | **Impact:** Low-Med

### G.4 — Constants Consolidation
**What:** Move `SUGGESTIONS`, `DIFFICULTY_COLORS`, etc. to a config file.
**Files:** `app/lib/constants.js` (new), `app/HomeClient.js`
**Difficulty:** Easy | **Impact:** Low

### G.5 — Error Handling Consistency
**What:** Global error boundary; standardized error response format across all endpoints.
**Files:** All `app/api/**/route.js`
**Difficulty:** Medium | **Impact:** Low-Med

### G.6 — API Response Schema Validation (zod)
**What:** Runtime validation of API request/response bodies.
**Files:** All `app/api/**/route.js`, `package.json`
**Difficulty:** Medium | **Impact:** Low-Med

### G.7 — Frontend State Management Refactor
**What:** Move 30+ `useState` calls to Context API or Zustand.
**Files:** `app/HomeClient.js`, new `app/components/` and `app/hooks/` modules, local reducer/context files
**Difficulty:** Hard | **Impact:** Medium

### G.8 — CSS Module Organization
**What:** Break inline JS styles and `globals.css` into component-level CSS modules.
**Files:** `app/HomeClient.js`, extracted component modules, `app/globals.css`
**Difficulty:** Easy | **Impact:** Low

### G.9 — Dependency Audit + Updates
**What:** `npm audit`; update to latest compatible versions.
**Files:** `package.json`, `package-lock.json`
**Difficulty:** Easy | **Impact:** Medium
**Status:** Implemented (2026-03-09). `npm audit` = 0 vulnerabilities; safe patch updates applied: `react 19.2.4`, `react-dom 19.2.4`.

### G.10 — OpenAPI / Swagger Docs
**What:** Generate OpenAPI spec; publish interactive docs at `/api/docs`.
**Files:** `app/api/docs/route.js`, `package.json`
**Difficulty:** Medium | **Impact:** Low-Med

---

## Changelog

| Date | Entry |
|------|-------|
| 2026-03-08 | Initial backlog created from automated codebase scan |
| 2026-03-08 | A.7 (copy button), A.5 status dots implemented |
| 2026-03-08 | F.1 (createSession import) confirmed resolved |
| 2026-03-08 | D.8 PDF TOC implemented in htb-professional theme |
| 2026-03-08 | C.1 elapsed timer display implemented (kill button pending) |
| 2026-03-08 | B.3 health endpoint + header status dot implemented |
| 2026-03-08 | Header compressed: two-row → single compact row with abbreviated buttons (HW brand, inline difficulty/target, btn-compact class) |
| 2026-03-08 | Stage tag chip row replaced with grouped `<select>` dropdown (Pentest Phases / CTF Categories optgroups) |
| 2026-03-08 | Filter toolbar merged from 2 rows → 1 row; type labels shortened (CMD/SS/NOTE); icon-only export/db/focus buttons |
| 2026-03-08 | Collapsible input area added (▲/▼ toggle, hides form when not needed) |
| 2026-03-08 | Output preview truncated to 4 lines by default (was 10); "Show more" expands inline |
| 2026-03-09 | Sidebar `«`/`»` collapse implemented — sidebar becomes fixed overlay when collapsed, `»` re-expand button appears in filter toolbar, central panel expands to full width |
| 2026-03-09 | CSS grid layout hardened — `minmax(400px, 1fr)` min-width for central panel; `.layout.layout-collapsed` single-column override prevents black-screen when sidebar is out of grid flow |
| 2026-03-09 | Input area collapse button (`▼`) removed — form is now always visible to guarantee usability |
| 2026-03-09 | History focus mode (`⊞`/`⊡` button) removed — caused unrecoverable full-collapse layout on re-load |
| 2026-03-09 | FLAGS tab: Expand All / Collapse All buttons added; all flag sections default to collapsed |
| 2026-03-09 | B.4 implemented — graceful DB shutdown added in `app/lib/db.js` with idempotent close and `SIGTERM`/`SIGINT` handlers |
| 2026-03-09 | A.11 implemented — fixed bottom version footer added with Semver + Git SHA (`Helm's Watch • vX.Y.Z (abcdef1)`) |
| 2026-03-09 | B.8 implemented — new `/api/admin/backup` endpoint exports SQLite backups as `.db` or `.sql` with admin/token guards |
| 2026-03-09 | G.4 — Constants (`SUGGESTIONS`, `DIFFICULTY_COLORS`, sidebar widths, `SUGGESTED_TAGS`) extracted to `app/lib/constants.js` |
| 2026-03-09 | A.3 — Dark/light theme toggle added to header; `.theme-light` CSS class applied to `<main>`; preference persisted in `localStorage('ui.theme')` |
| 2026-03-09 | A.9 — Sidebar category hide/show: ⚙ button opens inline checklist; `hiddenCats` state persisted to `localStorage('ui.hiddenCats')`; hidden categories skipped in render |
| 2026-03-09 | C.7 — Bulk screenshot delete: per-screenshot checkbox; "🗑 N" button in filter toolbar when selection active; loops existing single-delete API |
| 2026-03-09 | D.8 — Auto TOC generator (`buildToc()`) added to `report-formats.js`; replaces hardcoded TOC in `labReport()`; also injected into `pentestReport()` |
| 2026-03-09 | F.6 — UUID session IDs: `crypto.randomUUID()` auto-generates ID server-side when none provided in POST body |
| 2026-03-09 | F.10 — Audit log added to sessions route (AUDIT:SESSION_CREATED, AUDIT:SESSION_DELETED) and writeup route (AUDIT:WRITEUP_SAVED) using existing `logger` |
| 2026-03-09 | E.5 — Coach dangerous command warning: scans coach response code blocks for destructive patterns (`rm -rf`, `dd if=`, etc.); shows yellow badge if found |
| 2026-03-09 | A.8 — Confirmed already implemented (editingScreenshot inline form); F.8 — already safe (React plain text); G.8 — already organized |
| 2026-03-09 | A.2 — Timeline collapse mode implemented with `Collapse All`/`Expand All`, `ui.timelineCollapsed`, per-event `Show/Hide`, and newest-5 auto-expand behavior |
| 2026-03-09 | D.3 — Added `POST /api/export/markdown` with optional inline screenshot data URIs (`inlineImages=true` default) plus report modal download action |
| 2026-03-09 | E.10 — AI usage/cost tracking added (`ai_usage` table, `/api/ai/usage`, coach + writeup enhance instrumentation, UI summary badge) |
| 2026-03-09 | F.4 — Magic-byte image validation added for uploads with extension normalization; media serving now infers MIME from bytes first |
| 2026-03-09 | G.9 — Dependency audit completed: `npm audit` reports 0 vulnerabilities; safe updates applied (`react/react-dom` to 19.2.4), major-risk packages deferred |
| 2026-03-09 | D.4 — PoC recorder implemented with `poc_steps` storage, `/api/poc` CRUD/reorder API, timeline add/indicator UX, report modal PoC editor, and PoC injection into technical/pentest report generation |
| 2026-03-09 | D.5 phase 1 — Multi-format export added (`/api/export/html`, `/api/export/json`) with standalone styled HTML, full JSON bundle output, and report modal download buttons |
| 2026-03-09 | D.5 phase 2 — DOCX export completed (`/api/export/docx`) with clean professional layout, embedded screenshots, and default evidence appendix |
| 2026-03-09 | Wave 1 hardening completed — `SEC.1`, `SEC.3`, `SEC.4`, `SEC.5`, `SEC.6`, `EX.4`, `EX.10`, and `GR.15` implemented with structured process runtime, tracked child-process shutdown, CSP/security headers, strict graph validation, ANSI stripping, and plain-text sanitization for analyst/screenshot fields |
| 2026-03-10 | Wave 2 delivery/data-safety completed — `GH.1`, `GH.2`, `GH.5`, `GH.10`, `GH.11`, `CQ.1`, `CQ.2`, `CQ.4`, `CD.1`, `CD.2`, `CD.3` implemented with repo-root GitHub workflows, `skip-changelog` PR bypass label, bounded rate limiting, additive DB indexes, execute finalization hardening, and evidence JSON parse warnings |
| 2026-03-10 | Timeline invalid-date regression fixed — failed execute/note/upload responses no longer append fake events; client now safely parses SQLite timestamps and falls back to neutral time labels |
| 2026-03-10 | Wave 3 execution workflow completed — `UX.7`, `EX.7`, `EX.5`, `EX.9`, `EX.8`, `EX.11`, `UX.9`, `UX.10`, `R.14` delivered with grouped command history, retry API, progress bars, output pagination, report autosave, screenshot bulk selection polish, and screenshot caption/context metadata |
| 2026-03-10 | Wave 6 UX polish completed — `UX.8`, `UX.4`, `UX.1`, `UX.2`, `UX.6`, `UX.12` delivered with persisted terminal/graph view, `G` + `?` shortcuts, shortcut reference modal, always-visible session breadcrumb target, richer empty-session onboarding, and class-based expanded/collapsed timeline visual indicators |
| 2026-03-10 | Wave 7 repository and ops hygiene completed — Dependabot, reviewdog ESLint PR annotations, issue/PR templates, CODEOWNERS, MIT license, README badges, coverage badge workflow, Docker HEALTHCHECK, and Compose resource limits |
| 2026-03-10 | Wave 8 deferred Small item completed — `R.13` responsive HTML export CSS media-query support for smaller screens |
| 2026-03-11 | Wave 9 release delivery backbone completed — `GH.3`, `GH.9`, `GH.13`, `B.1` implemented with stable semver GHCR publishing, changelog-enforced GitHub releases, MkDocs Pages deployment, and multi-stage standalone Docker runtime |
| 2026-03-11 | Wave 10 runtime/API consistency completed — `EX.6`, `CQ.3`, `G.1 (Phase 2)` delivered with bounded command queueing (`MAX_CONCURRENT_COMMANDS`), shared API middleware rollout, and expanded execute/security test coverage |
| 2026-03-11 | Wave 10.5 runtime foundation completed — `EX.1`, `CTF.1`, `SEC.2`, `B.7` delivered with SSE execution streaming, session credential management, CSRF enforcement, and structured JSON logging |
