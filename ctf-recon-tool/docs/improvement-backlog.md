---
title: Helm's Paladin — Improvement Backlog
updated: 2026-03-08
source: automated codebase scan (claude-sonnet-4-6)
format: knowledge-sync compatible
---

# Improvement Backlog

> Full detail per item. Append new entries via `$knowledge-sync` at session close.
> Format: `[YYYY-MM-DD] [category/ID] description — source: <session>`

---

## A. Frontend / UI/UX

### A.1 — Mobile / Tablet Responsive Layout
**What:** Improve responsive design for tablets (768–1024px) and mobile.
**Why:** CTF practitioners work across devices; desktop-only limits utility.
**Files:** `app/page.js`, `app/globals.css`
**Difficulty:** Medium | **Impact:** High

### A.2 — Collapsible Timeline with Auto-Expand Recent
**What:** Toggle to collapse/expand all events; auto-expand newest N events.
**Why:** Long sessions become unwieldy.
**Files:** `app/page.js`
**Difficulty:** Easy | **Impact:** Medium

### A.3 — Dark Mode Toggle Persistence
**What:** Save dark/light preference in localStorage; apply via CSS variables.
**Files:** `app/page.js`, `app/globals.css`
**Difficulty:** Easy | **Impact:** Low

### A.4 — Real-time Fuzzy Command Suggestions
**What:** Fuzzy-match command history + cheatsheet; show inline preview on Tab.
**Files:** `app/page.js`
**Difficulty:** Medium | **Impact:** Medium

### A.5 — Inline Event Filtering by Status/Tag
**What:** Quick-filter buttons above timeline (all/success/failed/running).
**Files:** `app/page.js`
**Difficulty:** Easy | **Impact:** Medium
**Note:** Filter state persistence to localStorage is already implemented.

### A.6 — Drag-and-Drop Report Block Reordering
**What:** Manually reorder/delete report sections in the writeup editor.
**Files:** `app/page.js`
**Difficulty:** Medium | **Impact:** Low-Med

### A.7 — Copy-to-Clipboard Button Per Event
**What:** Per-event copy button on output; allow copying filtered output.
**Files:** `app/page.js`
**Difficulty:** Easy | **Impact:** Low
**Status:** Implemented (copy button on command output, 2026-03-08).

### A.8 — Screenshot Metadata Inline Edit (Popover)
**What:** Quick edit screenshot name/tag via popover instead of modal.
**Files:** `app/page.js`
**Difficulty:** Easy | **Impact:** Low

### A.9 — Customizable Sidebar Tool Categories
**What:** Allow users to hide/show/reorder SUGGESTIONS categories; persist to localStorage.
**Files:** `app/page.js`
**Difficulty:** Easy | **Impact:** Low-Med

### A.10 — Timeline Keyboard Shortcuts
**What:** Arrow keys to scroll, Ctrl+F to focus filter, J/K vim navigation.
**Files:** `app/page.js`
**Difficulty:** Medium | **Impact:** Low

---

## B. Operability / DevOps

### B.1 — Multi-Stage Docker Build (Slim Image)
**What:** Implement multi-stage build; use `node:20-slim` for runtime.
**Why:** Current image ~2GB; leaner image = faster startup.
**Files:** `Dockerfile`
**Difficulty:** Easy | **Impact:** Medium

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

### B.8 — Database Backup/Export API
**What:** `/api/admin/backup` to download SQLite DB as `.db` or `.sql`.
**Files:** `app/api/admin/backup/route.js`
**Difficulty:** Easy | **Impact:** Low-Med

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
**Files:** `app/page.js`, `app/api/execute/route.js`
**Difficulty:** Medium | **Impact:** High
**Note:** Elapsed timer display is implemented (2026-03-08); kill button still pending.

### C.2 — Command Templates / Macros
**What:** Save frequently-used patterns with placeholders (e.g., `nmap -A {target}`).
**Files:** `app/page.js`, `app/lib/cheatsheet.js`
**Difficulty:** Easy | **Impact:** Medium

### C.3 — Session Comparison Mode
**What:** Two sessions side-by-side; highlight diff in commands/findings.
**Files:** `app/page.js`
**Difficulty:** Hard | **Impact:** Low-Med

### C.4 — Session Tagging + Full-Text Search
**What:** User-defined tags, custom fields, cross-session full-text search.
**Files:** `app/lib/db.js`, `app/api/sessions/route.js`, `app/page.js`
**Difficulty:** Medium | **Impact:** Medium

### C.5 — Live Collaboration (WebSocket)
**What:** Multiple users in same session with live updates; basic conflict resolution.
**Files:** New WebSocket server, `app/page.js`
**Difficulty:** Hard | **Impact:** Medium

### C.6 — Command History Fuzzy Search
**What:** Regex/fuzzy search on command text and output in history sidebar.
**Files:** `app/page.js`
**Difficulty:** Easy | **Impact:** Low-Med

### C.7 — Bulk Screenshot Operations
**What:** Select multiple screenshots; batch-tag, delete, or rename.
**Files:** `app/page.js`
**Difficulty:** Easy | **Impact:** Low

### C.8 — Output Diff View
**What:** Side-by-side diff when two similar commands produce different output.
**Files:** `app/page.js`
**Difficulty:** Medium | **Impact:** Low-Med

### C.9 — Global Search Across Sessions
**What:** Search commands, notes, flags across all sessions.
**Files:** `app/api/search/route.js`, `app/lib/db.js`, `app/page.js`
**Difficulty:** Medium | **Impact:** Medium

### C.10 — Scheduled Command Execution
**What:** Queue commands to run at specific times (e.g., overnight scans).
**Files:** New scheduler, `app/api/schedule/route.js`
**Difficulty:** Hard | **Impact:** Low-Med

---

## D. Reporting / Documentation Automation

### D.1 — Custom Report Template Builder
**What:** UI to create/edit markdown templates with sections and `{{placeholders}}`.
**Files:** `app/page.js`, `app/lib/report-formats.js`
**Difficulty:** Hard | **Impact:** Medium

### D.2 — AI Auto-Finding Extraction + Severity Tagging
**What:** AI-assisted detection of findings from output; tag Critical/High/Medium/Low.
**Files:** `app/api/coach/route.js`, `app/lib/report-gen.js`
**Difficulty:** Hard | **Impact:** High

### D.3 — Inline Images in Markdown/PDF
**What:** Auto-embed screenshot data URIs in exported reports.
**Files:** `app/lib/report-gen.js`, `app/api/export/pdf/route.js`
**Difficulty:** Easy | **Impact:** Medium
**Note:** PDF export already handles inline images via data URI; markdown export does not.

### D.4 — Proof-of-Concept Step Recorder
**What:** Guided UI to record finding proof (screenshot + command + output, structured).
**Files:** `app/page.js`, `app/lib/db.js`
**Difficulty:** Medium | **Impact:** Medium

### D.5 — Multi-Format Export (DOCX, HTML, JSON)
**What:** Export beyond PDF: Word doc, HTML, raw JSON.
**Files:** `app/api/export/`, `package.json`
**Difficulty:** Medium | **Impact:** Medium

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
**Files:** `app/page.js`, `app/lib/db.js`
**Difficulty:** Medium | **Impact:** Low-Med

### D.10 — Report Format Presets
**What:** Pre-built templates for Pentest, CTF, Bug Bounty engagement types.
**Files:** `app/lib/report-formats.js`
**Difficulty:** Easy | **Impact:** Medium

---

## E. AI / Coach Integration

### E.1 — Coach Skill Difficulty Levels
**What:** Beginner/intermediate/expert modes; adjust language and hint depth.
**Files:** `app/api/coach/route.js`, `app/page.js`
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
**Files:** `app/page.js`, `app/lib/db.js`
**Difficulty:** Medium | **Impact:** Low-Med

### E.5 — Coach Command Validation
**What:** Validate coach-suggested commands against allowlist before execution.
**Files:** `app/api/coach/route.js`, `app/lib/security.js`
**Difficulty:** Easy | **Impact:** Low

### E.6 — Multi-Model Coach Comparison
**What:** Run coach query on multiple providers in parallel; show side-by-side.
**Files:** `app/api/coach/route.js`, `app/page.js`
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
**Files:** `app/lib/db.js`, `app/api/coach/route.js`, `app/page.js`
**Difficulty:** Easy | **Impact:** Low

---

## F. Security & Reliability

### F.1 — Missing `createSession` Import (RESOLVED)
**What:** `app/api/sessions/route.js` — `createSession` was referenced without import.
**Status:** Fixed — import confirmed present (2026-03-08).

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
**Files:** `app/api/upload/route.js`
**Difficulty:** Easy | **Impact:** Medium

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
**Files:** `app/lib/report-gen.js`, `app/page.js`
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

### G.2 — TypeScript Gradual Conversion
**What:** `tsconfig.json`; convert `db.js`, `security.js`, API routes first.
**Difficulty:** Hard | **Impact:** Medium

### G.3 — Logger Standardization
**What:** Consistent log levels (debug/info/warn/error); structured output.
**Files:** `app/lib/logger.js`
**Difficulty:** Easy | **Impact:** Low-Med

### G.4 — Constants Consolidation
**What:** Move `SUGGESTIONS`, `DIFFICULTY_COLORS`, etc. to a config file.
**Files:** `app/lib/constants.js` (new), `app/page.js`
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
**Files:** `app/page.js`, new context files
**Difficulty:** Hard | **Impact:** Medium

### G.8 — CSS Module Organization
**What:** Break inline JS styles and `globals.css` into component-level CSS modules.
**Files:** `app/page.js`, `app/globals.css`
**Difficulty:** Easy | **Impact:** Low

### G.9 — Dependency Audit + Updates
**What:** `npm audit`; update to latest compatible versions.
**Files:** `package.json`, `package-lock.json`
**Difficulty:** Easy | **Impact:** Medium

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
