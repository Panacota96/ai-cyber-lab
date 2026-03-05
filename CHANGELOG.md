# Changelog

All notable changes to this project are documented in this file.

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
