# Changelog

All notable changes to Helm's Watch are documented in this file.

## [0.2.0] - 2026-03-09

### Added
- PoC step recorder with dedicated `poc_steps` storage and `/api/poc` CRUD/reorder endpoints.
- Timeline-to-PoC workflow: `Add to PoC` action plus `In PoC` indicator on linked events.
- PoC editor section in the report modal for inline editing, reorder, and delete.
- PoC section injection in `technical-walkthrough` and `pentest` report outputs.
- D.5 phase 1 multi-format exports: new `POST /api/export/html` and `POST /api/export/json` endpoints.
- Report modal export actions for `[ Download HTML ]` and `[ Download JSON ]`.

### Changed
- Docker runtime switched to production mode (`next build` + `next start`) for stable health checks.
- Project version footer now resolves to `v0.2.0` via `NEXT_PUBLIC_APP_VERSION`.
- Export pipeline now uses a shared bundle builder to keep markdown/HTML/JSON output consistent with PoC-aware report generation.

### Fixed
- Resolved recurring Docker `500` issues caused by stale dev runtime image and runtime mode mismatch.

## [0.1.0] - 2026-03-08

### Added
- Initial public release of Helm's Watch core platform.
