# Changelog

All notable changes to Helm's Watch are documented in this file.

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

## [0.1.0] - 2026-03-08

### Added
- Initial public release of Helm's Watch core platform.
