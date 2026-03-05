# Changelog

All notable changes to this project are documented in this file.

## [0.3.2] - 2026-03-05
### Added
- Section-level JSON schemas for generated notes:
  - `automation/schemas/study_note.schema.json`
  - `automation/schemas/pentest_note.schema.json`
  - `automation/schemas/report_note.schema.json`
  - `automation/schemas/knowledge_note.schema.json`
  - `automation/schemas/research_note.schema.json`
- Central schema validation module (`libs/docs/schema_validator.py`) with fail-fast errors.
- Deterministic pentest fixture tests that validate recommendations, warnings, and evidence pointers without live tools (`tests/test_pentest_agent.py`).
- Schema validation tests for note writer contracts (`tests/test_note_schema_validation.py`).

### Changed
- `write_project_note` now enforces schema validation before writing JSON/Markdown.
- Report metadata payload now includes `timestamp_utc`.
- Pentest planning payload now always includes `tool_warnings` for schema consistency.
- Environment configuration now exposes `AICL_SCHEMA_ROOT` and `AICL_VALIDATE_NOTES`.
- README now documents note schema validation behavior and controls.

## [0.3.1] - 2026-03-05
### Added
- Full testing roadmap documentation with step-by-step commands, expected outputs, smoke tests, and failure debug guidance (`docs/TESTING_ROADMAP.md`).
- Component usage playbook mapping each code area to certification/CTF/report workflows (`docs/USAGE_PLAYBOOK.md`).
- Prioritized robustness backlog with implementation sequence and acceptance criteria (`docs/ROBUSTNESS_NEXT_STEPS.md`).
- Consolidated verification script (`scripts/verify_all.sh`) and Make target (`make verify`) for compile/tests/regression/changelog checks.

### Changed
- Root README now includes a documentation index, daemon API run pattern, configurable-port health/readiness examples, and explicit testing entrypoints.

## [0.3.0] - 2026-03-05
### Added
- Readiness and diagnostics endpoints (`/ready`, `/diagnostics`) with dependency probes and critical-log snapshots.
- Unified API error payload format with explicit `error_code`, `component`, and `operation`.
- Circuit breaker utilities for Langfuse tracing and knowledge backend retries.
- API contract integration tests (route/session/logs/ready/diagnostics).
- Report generation fixture test for session-scoped evidence mapping.
- CI workflow with compile checks, unit tests, prompt regression threshold gate, and changelog policy check.
- Changelog policy script (`scripts/check_changelog.py`) and Make target.

### Changed
- Logging payloads now include per-event `event_id` for easier event correlation.
- Prompt regression script now supports `--min-pass-rate` thresholds.
- Make targets extended with `test` and `check-changelog`.
- Logging default directory now points to `/mnt/c/Users/david/OneDrive - Pontificia Universidad Javeriana/Documents/GitHub/ai-cyber-lab/logs` for troubleshooting consistency in this environment.

## [0.2.0] - 2026-03-05
### Added
- Session lifecycle support with CLI/API controls (`start-session`, `end-session`, current session lookup).
- Session metadata storage under `data/projects/<project>/sessions`.
- Session-aware command logging helpers (`aicl_session_start`, `aicl_session_end`, `aicl_run`, PowerShell equivalents).
- New parsers for `ffuf` and `whatweb` outputs.
- Pentest enrichment with evidence pointers and related knowledge retrieval.
- Optional Langfuse tracing integration with `trace_id` correlation in route responses.
- Prompt regression suite and dataset (`scripts/run_prompt_regression.py`, `automation/evals/prompt_regression.json`).
- Unit tests for parser and report-session parsing logic.

### Changed
- Report agent now supports session-bounded report generation (`session:<id>`) and evidence map sections.
- Router defaults to deterministic keyword mode (`AICL_USE_LLM_ROUTER=false`) with optional LLM-based mode.
- Knowledge agent now includes retry/backoff and project-aware default indexing behavior.
- Metadata normalization for memory records (`source`, `project`, `tags`, `confidence`).
- Added new Make targets for session controls and regression eval.

## [0.1.0] - 2026-03-05
### Added
- Initial AI Cyber Lab scaffold with segmented agents (`study`, `pentest`, `report`, `knowledge`, `research`).
- Orchestrator routing layer with CLI and FastAPI entrypoints.
- Docker Compose stack for Ollama and Qdrant, plus optional Langfuse profile.
- Optional Kubernetes starter manifests for orchestrator, Qdrant, and Ollama.
- Command capture scripts for Bash and PowerShell.
- Markdown/JSON note generation utilities and report templates.
- Shared schemas for session notes, findings, and evidence records.

### Changed
- Added centralized `logs` section with global troubleshooting log at `logs/aicl.log`.
- Implemented structured JSON event logging across orchestrator, agents, tools, docs writer, and memory modules.
- Enforced hard log size cap at 1MB (`AICL_LOG_MAX_BYTES=1048576`) using in-process truncation to retain most recent events.
- Added `/logs` API endpoint and `make logs` helper to monitor recent events.
- Extended environment configuration with logging controls (`AICL_LOG_DIR`, `AICL_LOG_FILE`, `AICL_LOG_MAX_BYTES`, `AICL_LOG_LEVEL`).
- Updated README with usage instructions for the new logs section.

### Notes
- `LICENSE` content is unchanged; only line endings differ in the working tree.
