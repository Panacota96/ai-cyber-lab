# Changelog

All notable changes to Helm's Watch are documented in this file.

## [Unreleased]

### Added
- Wave 10 `EX.6`: bounded command queueing with `MAX_CONCURRENT_COMMANDS` (`1..16`, default `2`) and `queued -> running` lifecycle handling.
- Queued-command cancellation support in `/api/execute/cancel` for events that have not started.
- Shared API middleware helpers in `app/lib/api-route.js`: `withAuth`, `withValidSessionId`, `withErrorHandler`, `readJsonBody`, and route meta helpers.
- G.1 Phase 2 tests: `security.test.js`, `api-route.test.js`, `execute-queue.test.js`, plus execute-route integration coverage for queue/auth/session middleware behavior.

### Changed
- Core routes now use shared middleware patterns for consistent auth/session/error handling (`execute`, `timeline`, `findings`, `graph`, `poc`, `flags`, `sessions`, `writeup`, `upload`, `ai/usage`, `coach/feedback`).
- `POST /api/execute` and `POST /api/execute/retry/:eventId` may now return `queued` events when concurrency slots are saturated.
- API docs and README env docs now describe queue semantics and `MAX_CONCURRENT_COMMANDS`.

## [0.3.0] - 2026-03-10

### Added
- Stable semver Docker publishing workflow (`.github/workflows/docker-publish.yml`) for GHCR images (`ghcr.io/<owner>/helms-watch`).
- GitHub release automation workflow (`.github/workflows/release.yml`) with tag/changelog parity enforcement.
- GitHub Pages docs deployment workflow (`.github/workflows/docs-pages.yml`) with MkDocs Material site config (`mkdocs.yml` + `docs/index.md`).
- Request-scoped nonce-based CSP for production app pages via `proxy.js`, with dedicated validation coverage.
- Grouped command history endpoint `GET /api/execute/history` with per-command run counts and success-rate summaries.
- Command retry endpoint `POST /api/execute/retry/[eventId]`.
- Server-driven discovery graph refresh after successful commands, keeping persisted `graph_state` current without client-side re-derivation.
- Local report autosave and draft restore flow keyed by session and report format.
- Deterministic findings auto-tagging endpoint `POST /api/findings/auto-tag` with editable finding tags.
- Read-only wordlist browser rooted at `CTF_WORDLIST_DIR`.
- Local flag tracking API and sidebar workflow.
- Session timer persisted per session.
- Note templates for OWASP Top 10, PTES, Linux privesc, and Windows privesc.
- SearchSploit runtime support in Docker via a vendored Exploit-DB mirror.
- MIT license for the repository.
- Dependabot configuration for weekly npm and Docker update PRs.
- reviewdog ESLint workflow for inline PR annotations.
- Issue templates, pull request template, and `CODEOWNERS`.
- Repo-hosted coverage badge generation workflow backed by Vitest coverage output.

### Changed
- Wave 9 release backbone (`GH.3`, `GH.9`, `GH.13`, `B.1`) is now implemented in-repo.
- Project metadata, READMEs, and API docs now align on release `v0.3.0`.
- Roadmap planning now defines a Release-First next-wave sequence: Wave 9 (release backbone), Wave 10 (runtime/API consistency), Wave 11 (operator intelligence), and Wave 12 (shell/artifact operations).
- Project version footer now resolves to `v0.3.0` via `NEXT_PUBLIC_APP_VERSION`.
- OpenAPI metadata now uses the package version instead of a stale hardcoded API version.
- Companion template and HTB example READMEs now explicitly track the current Helm's Watch release line.
- Main panel view (`TERMINAL`/`GRAPH`) now persists with `ui.mainView`, including keyboard toggle support via `G`.
- Header session metadata now always renders target visibility with explicit fallback (`Target: not set`) and a dedicated breadcrumb strip.
- Timeline history sidebar now uses grouped `command_hash` statistics instead of raw duplicated command rows.
- Large command output now paginates in the UI when expanded, preserving full-copy behavior without rendering every line at once.
- Running command execution now injects `CTF_TARGET`, `CTF_SESSION_ID`, and `CTF_WORDLIST_DIR`.
- Screenshot evidence metadata now supports `caption` and `context` across timeline editing, report generation, and exports.
- Report generation now prepends reusable cover metadata and severity summaries across modal, Markdown, HTML, PDF, DOCX, and JSON exports.
- Toolbox and cheatsheet coverage now include SearchSploit, Exploit-DB, Metasploit templates, Windows privesc, Active Directory, post-exploitation, and reverse-shell references.
- Discovery graph now derives richer node types from command evidence and findings: hostnames/subdomains, usernames, hashes, databases, directories, and API endpoints.
- Discovery graph UX now includes search/highlight, phase filtering, stats, degree-based node sizing, directed/animated edges, direct PNG export, auto-only reset, and richer Mermaid phase clustering.
- Root and app READMEs now expose CI, test, security, Docker publish, MIT, and coverage badges.
- Dockerfile now uses a multi-stage (`deps`/`builder`/`runner`) standalone Next.js build with a slim runtime stage.
- Dockerfile now includes an image-level `/api/health` `HEALTHCHECK`.
- Docker Compose now applies default `APP_MEM_LIMIT` and `APP_CPUS` resource limits for the app service.
- Standalone HTML export now includes responsive media-query CSS for tablet/mobile readability (`1024px`, `768px`, `520px` breakpoints).

### Fixed
- Restored frontend hydration by moving app-page CSP handling to a request-scoped nonce flow instead of a broken global inline-script block.
- Health-driven UI capability status and command-execution behavior now stay aligned in Docker/runtime checks.
- Timeline auto-follow now stays stable when the user scrolls up, only resuming near the bottom or on explicit jump.
- Timeline UX now includes explicit expanded/collapsed visual state indicators and a richer empty-session onboarding panel with quick actions.
- Running commands now persist parsed progress markers to `progress_pct` and render progress bars in the timeline.
- Screenshot bulk selection now keeps a persistent selection badge and highlight state across filter changes within the current session.

## [0.2.0] - 2026-03-09

### Added
- PoC step recorder with dedicated `poc_steps` storage and `/api/poc` CRUD/reorder endpoints.
- Timeline-to-PoC workflow: `Add to PoC` action plus `In PoC` indicator on linked events.
- PoC editor section in the report modal for inline editing, reorder, and delete.
- PoC section injection in `technical-walkthrough` and `pentest` report outputs.
- D.2 findings system: dedicated `findings` storage, `/api/findings` CRUD API, and manual `POST /api/findings/extract` AI proposal endpoint with severity tagging and evidence links.
- Report modal findings review workflow with proposal accept/reject and inline persisted finding edits.
- D.5 phase 1 multi-format exports: new `POST /api/export/html` and `POST /api/export/json` endpoints.
- D.5 phase 2 DOCX export: new `POST /api/export/docx` endpoint with embedded screenshots and evidence appendix support.
- Report modal export actions for `[ Download HTML ]` and `[ Download JSON ]`.
- Report modal export action for `[ Download DOCX ]`.
- G.1 phase 1 test foundation: Vitest setup, Node test config, and isolated temporary SQLite test data runtime.
- Critical-path test suites for findings DB helpers, findings extraction/CRUD APIs, and report/export findings integration.
- Wave 1 hardening utilities: shared text sanitization helpers, structured command runtime registry, and strict graph payload schemas.
- Repo-root GitHub Actions workflows for CI, tests, security scanning, CodeQL, and changelog enforcement.
- Wave 2 Vitest coverage for rate limiter behavior, DB safety/indexing, execute finalization failure handling, and timeline timestamp parsing helpers.

### Changed
- Docker runtime switched to production mode (`next build` + `next start`) for stable health checks.
- Project version footer now resolves to `v0.2.0` via `NEXT_PUBLIC_APP_VERSION`.
- Export pipeline now uses a shared bundle builder to keep markdown/HTML/JSON output consistent with PoC/findings-aware report generation.
- Added npm test scripts: `test`, `test:watch`, `test:coverage`; coverage output is ignored by ESLint.
- Planning docs now treat tablet/mobile responsiveness as out of scope and removed backlog item `A.1` to keep tracking aligned with the desktop-only product direction.
- Report and export entry points now normalize analyst names as plain text, and screenshot metadata is normalized before storage/rendering.
- App responses now emit CSP and browser security headers, with a route-specific relaxed policy for `/api/docs`.
- Rate limiting now prunes every 30 seconds, stays bounded with a 10k-window ceiling, and logs when forced eviction happens.
- SQLite bootstrap now creates additional timeline/writeup indexes, and the repo’s PR process recognizes `skip-changelog` as the explicit bypass label for changelog enforcement.

### Fixed
- Resolved recurring Docker `500` issues caused by stale dev runtime image and runtime mode mismatch.
- Replaced the Windows command launch path with structured `spawn()` execution and unified process tracking across execute, cancel, timeout, and shutdown.
- Prevented tracked child-process leaks by pruning runtime registry entries exactly once on completion, cancellation, timeout, or shutdown.
- Stripped ANSI/VT escape sequences and other control characters from persisted command output.
- Rejected malformed graph payloads instead of accepting arbitrary node/edge arrays.
- Failed command, note, and screenshot submissions no longer append fake timeline events that render as `Invalid Date` / `EVENT`.
- Timeline and version-history timestamps now safely parse SQLite-style values and fall back to neutral labels when a date is malformed.
- Command finalization now logs timeline persistence failures without leaking tracked processes or surfacing unhandled callback errors.
- Malformed `evidence_event_ids` JSON is now logged before falling back to an empty evidence list.
- Report modal now opens directly without analyst-name gating, and blank analyst names safely normalize to `Unknown`.
- Note submission now uses a stable `POST /api/timeline` contract, preserves drafts on failure, and surfaces auth/config errors cleanly.

## [0.1.0] - 2026-03-08

### Added
- Initial public release of Helm's Watch core platform.
