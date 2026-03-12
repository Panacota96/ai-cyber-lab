---
title: Helm's Watch — Project Improvement Roadmap
updated: 2026-03-12
source: automated multi-agent codebase scan (claude-sonnet-4-6)
---

# Helm's Watch — Improvement Roadmap

## Architecture Assessment

Helm's Watch is a production-grade Next.js 16 CTF reconnaissance assistant with:

- Clean separation of concerns (frontend, API routes, SQLite DB, security layer)
- Multi-provider AI coach (Claude, Gemini, OpenAI, plus an experimental offline provider) with streaming, cost tracking, and feedback
- Rich CTF-specific features: session mgmt, timeline, discovery graph, credential manager, PoC recorder, AI findings, reporting, local flags, wordlist browsing, SearchSploit, and operator templates
- Robust security: path traversal protection, rate limiting, API token rotation, CSRF enforcement, and zod validation
- Multi-format export: PDF, DOCX, HTML, JSON, Markdown
- Vitest test suite (Phase 2 complete)

**Current gaps:** deeper `HomeClient` / persistence decomposition, executive/report audience automation beyond the current Chronicle workflow, external reporting handoff paths such as SysReptor, and deeper shell transports beyond reverse/webshell v1.

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

Foundation wave completed on 2026-03-11: `EX.1`, `CTF.1`, `SEC.2`, `B.7` (SSE execution transport, session credential manager, CSRF middleware, structured JSON logging).

### Next Wave Set (Post-Wave-12.5 Track)

> Selected strategy: **Stabilize first, then expand the target model, then accelerate operator/reporting workflows**. The runtime, intelligence, shell/artifact, and hash-identification foundations are in place; the next sequence should reduce structural risk before broadening session scope and report surfaces.

#### Wave 10.5 — Runtime Foundation

**Status:** Implemented (2026-03-11)

**Scope:** `EX.1`, `CTF.1`, `SEC.2`, `B.7`

**Outcome:**
- Replaced active-command polling as the primary live-output path with SSE, while keeping polling as a fallback.
- Added a first-class session credential model for storage, update, export, and reporting flows.
- Enforced CSRF checks on state-mutating authenticated routes.
- Added opt-in structured JSON logging for local file logs and console aggregation.

#### Wave 11 — Operator Intelligence Layer

**Status:** Implemented (2026-03-11)

**Scope:** `EX.2`, `EX.3`, `CTF.5`, `CTF.10`, `CTF.11`

**Outcome:**
- Build on top of live execution streams and stored credentials rather than timeline-only polling state.
- Ingest Nmap XML into graph entities.
- Render structured command output (JSON/XML) cleanly in terminal/timeline.
- Suggest next steps from discovered services.
- Enrich CVE/ExploitDB context with CVSS and PoC metadata.
- Add credential verification and blast-radius workflows.

#### Wave 12 — Shell and Artifact Operations

**Status:** Implemented (2026-03-11)

**Scope:** `EX.12`, `CTF.14`

**Outcome:**
- Multi-session shell hub for reverse shells and webshells with live SSE updates, transcript persistence, and tabbed in-browser terminals.
- Session artifact manager for operator uploads and transcript-saved evidence with inline preview and report insertion hooks.
- Shell/artifact persistence now lives in dedicated repositories/services instead of extending the legacy monolith further.

#### Wave 12.5 — Credential Crack Prep

**Status:** Implemented (2026-03-11)

**Scope:** `CTF.2`

**Outcome:**
- Credential manager can fingerprint common hash formats and persist the best guess when a credential has no `hashType`.
- Operators can insert generated `john` and `hashcat` commands directly into the command box from the credential sidebar.
- Docker runtime now includes `john` and `hashcat`, with wordlist-path fallback support for generated commands.

#### Wave 13 — Stabilization and Decomposition

**Status:** Implemented (2026-03-11)

**Scope:** `G.7`, `G.2`, `UX.11`, `UX.3`

**Outcome:**
- Extracted timeline filter and notification logic out of the main client shell, with new helper modules and components instead of another inline toolbar/feedback block.
- Introduced TypeScript for new helper modules and project config without forcing a repo-wide conversion.
- Added responsive filter-toolbar collapse behavior below `1400px` and toast notifications for command completion, discovery refreshes, credentials, shells, and artifacts.
- Stabilized local startup behavior by avoiding eager shell-hub probes before health flags load and by returning an empty wordlist browser state when the configured root does not exist.
- Added supported local verification paths with `npm run dev:webpack`, `npm run prepare:local-runtime`, and `npm run start:local-runtime`, plus generated-output ignores for ESLint/Docker/git hygiene.
- Verified the staged standalone runtime with Playwright smoke coverage for page load, compact timeline filters, and shell-view rendering, and verified Docker build/runtime health with bundled `john`, `hashcat`, and `searchsploit` availability.

#### Wave 14 — Multi-Target Recon Core

**Status:** Implemented (2026-03-11)

**Scope:** `CTF.8`, `GR.12`, `GR.18`

**Outcome:**
- Let a single session track multiple hosts cleanly across timeline, graph, credentials, shells, artifacts, and reports.
- Add hierarchical graph layout and attack-path highlighting so multi-host sessions stay intelligible.
- Make multi-target state the base layer for later orchestration and platform integrations.

**Implemented:**
- Added a normalized `session_targets` registry with primary-target backfill from legacy `sessions.target`.
- Threaded `targetId` through command execution, timeline events, credentials, shell sessions, artifacts, and JSON exports.
- Added `/api/sessions/targets` plus header/session-modal target controls so operators can add, select, promote, and delete targets without leaving the app.
- Hydrated graph nodes and edges with target affinity derived from their source timeline events so older sessions can participate in target-aware views without manual repair.
- Added target-scoped graph filtering, target-oriented layout mode, and attack-path highlighting so operators can isolate one host or follow likely exploitation paths through a larger session graph.

#### Wave 15 — Assisted Operator Flow

**Status:** Implemented (2026-03-11)

**Scope:** `CTF.6`, `A.4`, `UX.5`, `GR.8`

**Outcome:**
- Add fuzzy command suggestions and a command palette so operators can act on discovered context faster.
- Expand the service-suggestion model into a broader follow-up pipeline that stays advisory by default.
- Add graph context actions to tighten graph-to-command and graph-to-timeline workflows.

**Implemented:**
- Added target-aware ranking across advisory service suggestions, recent command history, and toolbox templates so the command box can surface inline `Tab` completions instead of requiring sidebar browsing.
- Added a `Ctrl/Cmd+K` command palette with ranked command previews across service suggestions, recent commands, and static toolbox templates.
- Added graph node context actions that let operators search the timeline from a node or insert related follow-up commands directly from selected hosts, services, and CVE nodes.
- Kept the full operator flow advisory-only: suggestions insert commands into the input box, but nothing auto-executes.

#### Wave 16 — Reporting Intelligence Core

**Status:** Implemented (2026-03-11)

**Scope:** `R.2`, `R.8`, `R.9`, `R.11`, `R.4`

**Outcome:**
- Add MITRE ATT&CK tagging, CVSS calculator/badges, report filtering, finding dedup/relationships, and risk-matrix output.
- Use the structured evidence introduced in Waves 11-15 to make reports more defensible and easier to slice by audience.

**Implemented:**
- Added a shared `finding-intelligence` layer that derives ATT&CK techniques, CVSS severity, likelihood-driven risk scoring, duplicate relationships, and related-finding links from persisted findings and evidence.
- Extended findings storage and APIs with manual `likelihood`, `cvssScore`, and `cvssVector` fields while keeping ATT&CK, deduplication, and relationship tracking derived from one normalized pipeline.
- Updated report generation and all export paths to honor report filters (`minimumSeverity`, `tag`, `techniqueId`, `includeDuplicates`) and to emit scope summaries, risk matrices, ATT&CK coverage, and richer finding detail blocks consistently across Markdown, HTML, DOCX, PDF, and JSON.
- Expanded the in-app report modal and findings editor with report-filter controls plus CVSS/likelihood/risk/ATT&CK metadata so operators can drive the same reporting model without leaving the app.

#### Wave 17 — Executive and Comparative Reporting

**Status:** Implemented (2026-03-11)

**Scope:** `R.1`, `R.5`, `R.6`, `R.10`, `D.1`

**Outcome:**
- Add executive-summary generation, remediation suggestions, before/after comparison reports, read-only share links, and a custom report template builder.
- Move reporting from operator-only export generation to a more distributable output model.

**Implemented:**
- Added executive-summary generation with deterministic fallback plus optional Anthropic/OpenAI/Gemini assistance on top of the existing reporting filters and findings-intelligence pipeline.
- Added per-finding remediation suggestion generation with safe fallback guidance so remediation text can be filled from the report workflow without leaving the findings editor.
- Added before/after session comparison reporting that classifies findings as new, remediated, changed, or persisted and renders a reusable delta report.
- Added reusable report-template persistence with placeholder substitution so operators can save the current Chronicle layout and reapply it to later sessions.
- Added read-only share snapshots for generated reports via unique public `/share/[token]` URLs plus authenticated share management and revocation from the report modal.

#### Wave 18 — Coach and Platform Expansion

**Status:** Implemented (2026-03-12)

**Scope:** `E.1`, `E.2`, `CTF.7`

**Outcome:**
- Added coach difficulty levels, context modes, bounded prompt assembly, and in-memory cache headers for long-running sessions.
- Added optional HTB / THM / CTFd platform linkage via session metadata, plus remote metadata sync and linked flag submit/validation flows where supported.

**Ecosystem linkage:**
- Track a downstream reporting bridge to [SysReptor](https://docs.sysreptor.com/) after Wave 18 stabilization so Helm's Watch can hand off structured Chronicle/report output into a dedicated reporting platform when operators need full report-lifecycle workflows.
- Primary reference targets:
  - [SysReptor documentation](https://docs.sysreptor.com/)
  - [Hack The Box Reporting with SysReptor](https://docs.sysreptor.com/htb-reporting-with-sysreptor/)

#### Wave 19A — Experimental Offline Coach and Auto-Writeup

**Status:** Implemented (2026-03-12)

**Scope:** `E.3`, `E.8`

**Outcome:**
- Added a shared AI provider runtime so AI Coach and writeup enhancement can use the same online/offline provider contract.
- Added an experimental `offline` provider backed by either Ollama or a local OpenAI-compatible endpoint, with explicit runtime flags and zero-cost local usage tracking.
- Added a review-first auto-writeup suggestion queue that turns major evidence updates into persisted section-patch suggestions instead of rewriting drafts automatically.
- Kept all offline and auto-writeup behavior behind explicit experimental feature flags so the core operator workflow remains stable by default.

#### Wave 19B — Adversarial Challenge Mode

**Status:** Implemented (2026-03-12)

**Scope:** `E.9`

**Outcome:**
- Added an experimental adversarial coach skill that pressure-tests the operator's current path from the target or challenge-author perspective.
- Kept it isolated inside the existing coach workflow behind an explicit feature flag rather than broadening it into a larger simulation subsystem.
- Disabled compare mode for adversarial runs so the experimental behavior stays single-provider and easier to reason about.

#### Structural Refactor Track

**Scope:** split `app/HomeClient.js` by domain and decompose `app/lib/db.js` into narrower repositories/services before Wave 12 shell/artifact work.

**Outcome:**
- Frontend work targets extracted execution/timeline, reporting/findings, graph, coach, and sidebar modules instead of growing the wrapper page.
- Persistence work targets session/timeline, findings/reporting, graph, flags, AI usage, credentials, and future shell/artifact access layers.

#### Expected Public Interface Progression

- Wave 10.5: additive SSE transport, credential CRUD/export/reporting data, CSRF bootstrap/validation, and structured logging mode.
- Wave 11: additive API/UI behavior for parsing, enrichment, and graph/event rendering on top of the streaming/credential foundation.
- Wave 12: new shell/artifact API groups and additive session data models after module boundaries are stabilized.
- Wave 12.5: additive credential hash-identification API/UI behavior on top of the credential manager and shell/artifact runtime.
- Wave 13: primarily internal decomposition plus additive UX affordances that improve testability and operator feedback.
- Wave 14: additive target-registry and multi-host relationships across existing session models and graph views, including scoped graph filtering and attack-path emphasis.
- Wave 15: additive operator suggestion surfaces and graph actions that remain advisory by default.
- Wave 16: additive report metadata, filtering, scoring, and deduplication on top of the current export formats.
- Wave 17: additive sharing, comparison, and reusable template/report-generation surfaces.
- Wave 18: additive coach behavior, optional CTF platform/session integration paths, and the planning anchor for downstream report-platform linkage such as SysReptor.
- Wave 19A: additive experimental offline-provider support plus review-first writeup suggestion APIs behind explicit runtime flags.
- Wave 19B: additive adversarial challenge coaching behind explicit runtime flags and constrained to the existing coach workflow.

#### Success Criteria

- Wave 10.5: live command output appears without primary polling lag, credentials persist/export cleanly, mutating routes reject missing CSRF tokens, and logs can emit JSON.
- Wave 11: Nmap XML and CVE evidence automatically appear in graph and report context.
- Wave 12: concurrent shell sessions are usable with reliable transcripts, artifact linkage, and report insertions.
- Wave 12.5: stored hashes can be fingerprinted quickly, and generated cracking commands match the tools available in the runtime image.
- Wave 13: extracted UI/persistence modules reduce change risk, and the operator gets responsive filters plus clear transient feedback for long-running actions.
- Wave 14: one session can represent multiple related targets without cross-target confusion in graph, credentials, shells, or exports, and the graph can pivot cleanly between all-target and focused-target views.
- Wave 15: next-step guidance is faster to reach, target-aware, and still operator-controlled rather than auto-executing.
- Wave 16: reports carry ATT&CK/CVSS/dedup/filter semantics consistently across Markdown, PDF, HTML, JSON, and DOCX.
- Wave 17: reports can be compared, shared read-only, and generated from reusable templates.
- Wave 18: implemented coach difficulty/context scaling plus optional HTB / THM / CTFd linkage, while preserving the roadmap linkage toward SysReptor-based downstream reporting workflows.
- Wave 19A: offline AI and auto-writeup stay opt-in, bounded, and review-first so they do not silently mutate core evidence or reporting state.
- Wave 19B: adversarial challenge guidance remains isolated from the core execution, evidence, and reporting paths.

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
| R.15 | SysReptor bridge — hand off Chronicle/report output into SysReptor workflows using its reporting platform and certification-oriented templates | Med | H |

### Execution Engine (NEW)

| ID | Item | Impact | Effort |
|----|------|--------|--------|
| EX.2 | Nmap XML auto-parser (`-oX` output → graph host/service nodes) | High | M |
| EX.3 | Structured output detection (auto-pretty-print JSON/XML in terminal) | Med | M |
| EX.12 | Interactive shell session hub — v1 ships reverse shells and webshells with multiple live tabs and transcript persistence; deeper transports stay deferred | High | H |

### CTF-Specific Features (NEW)

| ID | Item | Impact | Effort |
|----|------|--------|--------|
| CTF.2 | Hash identification workflow (hashid → john/hashcat command generator) | Implemented | M |
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
| G.2 | TypeScript gradual conversion for new or extracted modules first (streaming, credentials, shell transport) | Med | H |
| G.7 | Frontend state refactor: split `app/HomeClient.js` into domain modules/reducers/hooks | Med | H |

### Security

All currently tracked security items are completed through Wave 10.5.

### Ops / Infrastructure

All currently tracked ops/infrastructure items are completed through Wave 10.5.

### AI Coach

| ID | Item | Impact | Effort |
|----|------|--------|--------|
| E.1 | Coach persona difficulty levels (beginner / intermediate / expert) | Med | M |
| E.2 | Coach caching + context limit management (avoid token overflow on long sessions) | Med | M |
| E.3 | Offline coach mode (ollama / local OpenAI-compatible provider) | Implemented | H |
| E.8 | Auto writeup enhancement when timeline is updated | Implemented | H |
| E.9 | Adversarial challenge mode (AI simulates the target system) | Implemented | H |

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

### Medium Items (23/23 Done)

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
- B.7 Structured JSON logging mode (`LOG_FORMAT=json`)
- CTF.1 Credential manager (store username/password/hash per session, link to nodes)
- SEC.2 CSRF token for state-mutating POST/PATCH/DELETE endpoints

### Hard Items (2/2 Done)

- D.2 AI auto-finding extraction + severity tagging (findings table + `/api/findings`)
- EX.1 Real-time output streaming via SSE (Server-Sent Events)

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
- SSE execution stream transport with live timeline updates and polling fallback
- Session credential manager with export/report integration
- CSRF bootstrap and validation flow for mutating authenticated routes
- Report block drag-and-drop reordering (HTML5 native DnD)
- Output diff view (LCS-based unified diff modal)
- Multi-model AI coach comparison (parallel `Promise.allSettled`)

---

## See Also

- [improvement-backlog.md](improvement-backlog.md) — per-item rationale, files affected, and implementation notes
- [../examples/htb/pdf/README.md](../examples/htb/pdf/README.md) — HTB report template references
