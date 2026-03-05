# Changelog

All notable changes to this project are documented in this file.

## [0.5.1] - 2026-03-06
### Added
- New strategic backlog and roadmap document: `docs/FUTURE_IMPROVEMENTS.md`.
  - Full-scan improvement inventory grouped by:
    - Functionality
    - Automation
    - Intelligence
    - UI/UX
    - Pentest Tools
    - Pentest Workflow
    - Documentation
  - Includes 30-60-90 roadmap phases, impact matrix, and KPI-oriented acceptance criteria.
  - Includes external inspiration references from free/self-hosted and standards-oriented sources.

### Changed
- Updated `README.md` Documentation Index to include `Future Improvements`.

## [0.5.0] - 2026-03-05
### Added
- Graph backend abstraction (`libs/graph_backend.py`) with optional Neo4j synchronization and SQLite fallback.
- New graph intelligence APIs:
  - `GET /graph/query`
  - `GET /graph/subgraph`
  - `GET /graph/timeline`
- New multi-LLM proposal engine (`libs/proposals.py`) with local CLI adapters for Codex/Claude/Gemini and ensemble ranking.
- New proposal API endpoint:
  - `POST /proposals/commands`
- New operations endpoints:
  - `GET /ops/health/deep`
  - `GET /ops/log-index`
- New UI page:
  - `/ui/proposals` for provider comparison and ensemble command approval workflow.

### Changed
- `/projects/{project}/graph` and `/sessions/{session_id}/graph` now route through backend abstraction and report selected backend.
- `add_facts()` now syncs normalized facts to graph backend when Neo4j is enabled.
- UI now defaults to readable cards/tables with explicit `Readable View` / `JSON View` toggles.
- Graph UI readability improvements:
  - default excludes pending facts
  - confidence threshold filtering
  - focus-by-entity-kind filtering
  - node/edge capping to reduce overload
- Compose stack now includes Neo4j service and orchestrator Neo4j env wiring.
- Updated docs (`README`, `docs/HOW_TO_USE.md`, `docs/USAGE_PLAYBOOK.md`, `docs/TESTING_ROADMAP.md`) for proposals, graph APIs, and deep ops checks.
- Extended smoke and contract tests for proposals and advanced graph endpoints.

## [0.4.3] - 2026-03-05
### Added
- New operator-focused usage runbook: `docs/HOW_TO_USE.md`.

### Changed
- Updated `README.md` documentation index to include the new how-to guide.
- Updated `docs/USAGE_PLAYBOOK.md` to point to the quick runbook for daily execution.

## [0.4.2] - 2026-03-05
### Fixed
- Corrected SQLite migration/index ordering in `libs/workbench_db.py` to prevent orchestrator startup failure on older `data/aicl_workbench.db` files (`sqlite3.OperationalError: no such column: status`).
- Verified compose runtime startup with remapped host Ollama port (`AICL_OLLAMA_HOST_PORT=11435`) and healthy API/UI endpoints.

## [0.4.1] - 2026-03-05
### Added
- Discoveries graph and review workflow support in UI:
  - `GET /ui/graph` page for relationship visualization and session filtering.
  - Inline fact approve/reject actions from graph review queue.
- Workbench API coverage for advanced contracts:
  - fact review lifecycle
  - graph endpoints
  - session/project export endpoints

### Changed
- Fixed UI graph renderer template escaping in embedded Cytoscape JavaScript.
- Fixed reports page fact status chip rendering.
- Updated API graph endpoint typing to preserve FastAPI schema generation compatibility.
- README/testing/usage docs now document graph, review, and export operations end-to-end.

## [0.4.0] - 2026-03-05
### Added
- Multi-page web workbench UI with dedicated pages for:
  - Recon
  - Cracking
  - Documentation (findings + evidence upload)
  - Sessions (lifecycle + timeline)
  - Reports
- Command planner (`POST /planner/commands`) with profile presets (`stealth`, `balanced`, `aggressive`).
- Queue+confirm job execution model:
  - `POST /jobs`
  - `POST /jobs/{job_id}/confirm`
  - `POST /jobs/{job_id}/cancel`
  - `GET /jobs`
  - `GET /jobs/{job_id}`
- SQLite workbench index (`data/aicl_workbench.db`) for sessions/jobs/findings/evidence/facts.
- Evidence and findings APIs:
  - `POST /findings`, `GET /findings`, `PATCH /findings/{finding_id}`
  - `POST /evidence/upload`, `GET /evidence`, `POST /evidence/{evidence_id}/link`
- Session intelligence APIs:
  - `GET /projects/{project}/sessions`
  - `GET /sessions/{session_id}/timeline`
  - `GET /projects/{project}/facts`
- Background job worker (`AICL_JOB_WORKER_ENABLED=true|false`) executing confirmed jobs via tool-exec.
- New test coverage: `tests/test_workbench_api.py`.

### Changed
- Session lifecycle now mirrors to the SQLite workbench index for timeline/history queries.
- Tool-exec default allowlist now includes cracking tooling entries (`john`, `hashcat`, `hydra`).
- README, usage playbook, and testing roadmap updated for multi-page workbench workflows and APIs.

## [0.3.10] - 2026-03-05
### Added
- New target kickoff automation script: `scripts/start_pentest_target.sh`.
  - Starts/ends orchestrator sessions.
  - Runs bounded recon commands with artifact capture.
  - Triggers pentest and report routes automatically.
  - Stores run summary and route responses for troubleshooting.
- New make target `make pentest-start TARGET=<ip> PORTS=<ports> PROJECT=<slug>`.

### Changed
- README now includes one-command pentest startup and a UI-first machine workflow.
- Usage playbook now maps the kickoff script to machine onboarding.
- Testing roadmap now includes a dedicated validation flow for the kickoff script.
- Kickoff script now enforces bounded probe loops to avoid long runs on hosts with many open ports.
- `.env.example` now includes kickoff-script timeout and port-cap controls.

## [0.3.9] - 2026-03-05
### Changed
- Synced generated `data/projects/demo` and `data/projects/smoke-compose` artifacts from latest session and smoke executions.

## [0.3.8] - 2026-03-05
### Added
- Troubleshooting bundle collector (`scripts/collect_troubleshoot_bundle.sh`) to capture docker/API/app/system evidence into a timestamped folder and `.tar.gz` archive.
- New `make bundle-logs` target to run bundle capture in one command.
- Bundle tuning environment variables in `.env.example` for lookback windows, tail sizes, and timeout controls.

### Changed
- README now documents bundle capture usage and exact artifacts produced.
- Testing roadmap now includes troubleshooting-bundle validation and tuning overrides.
- Usage playbook now maps bundle collection into the operational workflow.
- Bundle capture now uses bounded command and curl timeouts to avoid hanging during incident collection.
- Docker compose host port bindings are now configurable via env (`AICL_API_HOST_PORT`, `AICL_TOOL_EXEC_HOST_PORT`, `AICL_UI_HOST_PORT`, `AICL_OLLAMA_HOST_PORT`, `AICL_QDRANT_HOST_PORT`, `AICL_QDRANT_GRPC_HOST_PORT`, `AICL_LANGFUSE_HOST_PORT`).
- Smoke script now honors host-port env overrides for API/tool-exec/UI checks.
- Tool execution now falls back to Docker SDK when Docker CLI binary is missing in the tool-exec container, preserving `python2/python3` routed execution.

## [0.3.7] - 2026-03-05
### Changed
- `scripts/smoke_compose.sh` now supports `--strict-exegol` and treats `--with-exegol` as a bounded check by default (avoids forced first-run multi-GB pulls).
- Smoke script now validates that the Exegol service is declared in compose and only starts Exegol automatically when strict mode is enabled or image is already cached.
- Fixed Exegol compose image tag to `nwodtuhs/exegol:free`.
- Removed unavailable `nikto` package from Debian image build/install lists and command allowlist defaults.
- Updated README and testing roadmap with explicit Exegol smoke variants and expected behavior.

## [0.3.6] - 2026-03-05
### Added
- Full Docker smoke harness (`scripts/smoke_compose.sh`) for build/start/health/route/runtime/report checks.
- New `make smoke-compose` command for one-step container smoke validation.
- Free tools catalog for documentation, note-taking, and certification learning (`docs/FREE_TOOLS_STACK.md`), including:
  - SysReptor
  - Pentest-Notes
  - BookStack
  - HedgeDoc
  - Logseq
  - TriliumNext
  - Anki + FSRS
  - Moodle
  - Exegol

### Changed
- README/testing docs now include container smoke workflow and smoke flags (`--with-ui`, `--with-exegol`).
- Usage playbook now links to the free-tools stack guide.

## [0.3.5] - 2026-03-05
### Added
- New tool execution microservice (`apps/tool_exec/main.py`) with:
  - `POST /run` for allowlisted command execution.
  - `GET /capabilities` for mode/tool/container visibility.
- New local web dashboard (`apps/ui/main.py`) to run routes/sessions and inspect logs/diagnostics without raw API calls.
- Docker microservice images:
  - `infra/images/orchestrator.Dockerfile`
  - `infra/images/tool-exec.Dockerfile`
  - `infra/images/ui.Dockerfile`
  - `infra/images/tools-core.Dockerfile`
  - `infra/images/py2-runner.Dockerfile`
  - `infra/images/py3-runner.Dockerfile`
- Expanded Docker Compose stack with core services plus optional `ui` and `exegol` profiles.
- Kubernetes manifests for new services:
  - tool-exec
  - ui
  - tools-core
  - py2-runner
  - py3-runner
- New tests:
  - `tests/test_tool_exec_api.py`
  - `tests/test_cli_exec_backends.py`

### Changed
- CLI execution layer now supports `AICL_EXEC_BACKEND=service` and calls tool-exec over HTTP.
- Readiness probes include tool-exec dependency when service backend is enabled.
- `Makefile` now includes `up-ui`, `up-exegol`, `ui`, and `tool-exec` targets.
- Environment configuration now includes execution backend/UI/runtime container settings.
- README/testing/usage docs updated for microservice stack, UI usage, and Exegol option.

## [0.3.4] - 2026-03-05
### Added
- Python-version-safe CLI wrapper: `scripts/aicl.sh` (always runs `.venv/bin/python -m apps.orchestrator.main`).

### Changed
- `scripts/run_dev.sh`, `scripts/verify_all.sh`, and `Makefile` now use `.venv/bin/python` directly to avoid system `python` ambiguity.
- README/testing/usage docs now use `bash scripts/aicl.sh ...` for orchestrator CLI examples.
- Added explicit Quick Start note warning against bare `python` when default interpreter is Python 2.7.

## [0.3.3] - 2026-03-05
### Added
- Command log maintenance utility with per-day compression and retention pruning (`libs/tools/capture/log_maintenance.py`).
- Session control CLI maintenance action (`python -m libs.tools.capture.sessionctl maintain ...`).
- New `make maintain-logs` target for one-command log maintenance.
- Tests for maintenance behavior and gzipped report log ingestion:
  - `tests/test_log_maintenance.py`
  - `tests/test_report_parsing.py::test_read_project_logs_supports_gzip`

### Changed
- Report agent now ingests both `terminal_*.log` and `terminal_*.log.gz`.
- Bash and PowerShell command logger helpers now trigger maintenance automatically and expose explicit maintenance helpers.
- Added maintenance env configuration:
  - `AICL_SESSION_LOG_DIR`
  - `AICL_SESSION_LOG_COMPRESS_AFTER_DAYS`
  - `AICL_SESSION_LOG_RETENTION_DAYS`
- Updated README/testing/usage docs to include compression-retention workflow.

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
