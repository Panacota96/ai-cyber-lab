# Robustness Next Steps

This backlog is prioritized for your operational goals: dependable study automation, safe CTF assistance, and high-quality report output.

## Current State (Baseline)
- Segmented agents are implemented and routable through CLI/API.
- Session lifecycle exists and is persisted per project.
- Central JSON troubleshooting log exists with 1MB hard cap.
- Tests cover parser behavior, API contracts, and report generation.
- Prompt regression suite exists for routing stability.
- Note payloads are schema-validated before write.
- Pentest behavior has deterministic fixture tests independent of live tools.
- Command logs support maintenance (compression + retention) and reports read `.log` + `.log.gz`.

## Priority 0 (Immediate)

### 1) Add deterministic fixtures for pentest agent (Completed 2026-03-05)
Why:
- Current pentest logic depends on installed tools and optional active scan mode.

Actions:
- Add fixture-based tests for pentest recommendations without requiring live nmap/ffuf/whatweb binaries.
- Assert `next_steps`, `tool_warnings`, and `evidence_pointers` shape.

Success criteria:
- CI passes on machines without recon binaries installed.
- Recommendation text remains stable across refactors.

### 2) Add strict schema validation for generated notes (Completed 2026-03-05)
Why:
- Notes are produced automatically and should remain machine-consumable.

Actions:
- Validate generated JSON notes against `automation/schemas/*.schema.json`.
- Add tests that fail on schema drift.

Success criteria:
- Any output contract break blocks CI.

### 3) Add backup/rotation policy for command logs (Completed 2026-03-05)
Why:
- `data/projects/_logs` can grow quickly in long sessions.

Actions:
- Add optional per-day compression (`terminal_YYYY-MM-DD.log.gz`) or retention policy env vars.
- Keep report agent compatible with both `.log` and `.log.gz`.

Success criteria:
- Long-running sessions do not degrade disk usage.
- Report generation still works on rotated logs.

## Priority 1 (Near-Term)

### 4) Add auth/rate controls for local API (Completed 2026-03-06)
Why:
- Even local APIs can be accidentally exposed from WSL host networking.

Actions:
- Add optional API key header check (`AICL_API_KEY`) for mutating endpoints (`/route`, session start/end).
- Add simple in-memory rate limiter for `/route`.

Success criteria:
- Unauthorized requests are rejected.
- Burst traffic cannot starve the service.

### 5) Expand observability metadata
Why:
- Troubleshooting is faster when every event has stable component/operation tags.

Actions:
- Standardize `component` and `operation` fields across all logs.
- Add command duration fields to capture slow tools and bottlenecks.

Success criteria:
- You can filter logs by component and operation without free-text search.

### 6) Add failure-injection tests
Why:
- Recovery behavior for dependency outages should be predictable.

Actions:
- Add tests for qdrant down, ollama down, and circuit breaker open states.
- Assert `/ready` and `/diagnostics` reflect degraded mode clearly.

Success criteria:
- Degraded behavior is reproducible and validated in CI.

## Priority 2 (Scale-Out)

### 7) Job queue for heavy tasks
Why:
- Indexing and report generation can block request latency.

Actions:
- Introduce worker queue (RQ/Celery or simple background tasks) for indexing and large report builds.
- Keep `/route` responsive with async job IDs.

Success criteria:
- API responsiveness remains stable under long tasks.

### 8) Kubernetes hardening profile
Why:
- K8s is useful only when you want continuous jobs and shared services at scale.

Actions:
- Add namespace, resource limits, probes, and persistent volume policies.
- Add a kustomize overlay for dev vs. production-like lab cluster.

Success criteria:
- One-command deploy with predictable resource behavior.

## Recommended Execution Sequence
1. Implement Priority 0 items first.
2. Re-run `make verify` and add new tests to CI.
3. Implement Priority 1 security and observability controls.
4. Move to Priority 2 only when local single-node flow is consistently stable.
