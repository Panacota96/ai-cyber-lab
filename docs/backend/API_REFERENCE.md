# API Reference

Helm's Watch backend is implemented with Next.js API routes.

## Core Endpoints

### `POST /api/execute`
Executes a system command and returns a timeline event immediately.
- **Payload**: `{ command: string, sessionId: string, tags?: string[], timeout?: number }`
- **Behavior**:
  - command status may be `running` or `queued` depending on current concurrency slots
  - queue concurrency is controlled by `MAX_CONCURRENT_COMMANDS` (`1..16`, default `2`)
  - command output is finalized later through timeline polling
  - command events now persist `command_hash` and optional `progress_pct`
  - spawned processes receive `CTF_TARGET`, `CTF_SESSION_ID`, and `CTF_WORDLIST_DIR`

### `GET /api/execute/history`
Returns grouped command history for a session.
- **Query Params**: `sessionId`, `limit?`
- **Response**: `[{ command, commandHash, runCount, successCount, failureCount, successRate, lastStatus, lastTimestamp, latestEventId }]`

### `POST /api/execute/retry/:eventId`
Retries a previous command event.
- **Path Params**: `eventId`
- **Payload**: `{ command?: string, timeout?: number }`
- **Behavior**:
  - reuses the original session
  - defaults to the original command unless overridden
  - returns the new command event (`running` or `queued`), same shape as `POST /api/execute`

### `GET /api/sessions`
Retrieves all active sessions or a specific session by ID.
- **Response**: Array of session objects (`id`, `name`, `target`, `difficulty`, `objective`).

### `POST /api/timeline`
Creates a new event in the session timeline.
- **Payload**: `{ sessionId: string, type: 'note' | 'command' | 'screenshot', content?: string, command?: string, tags?: string[] | string, name?: string, tag?: string, caption?: string, context?: string }`
- **Timeline fields**:
  - command events may include `command_hash`, `progress_pct`
  - screenshot events may include `caption`, `context`

### `GET /api/poc`
Lists ordered Proof-of-Concept steps for a session (with hydrated linked events).
- **Query Params**: `sessionId`
- **Response**: `[{ id, stepOrder, title, goal, executionEventId, noteEventId, screenshotEventId, observation, executionEvent, noteEvent, screenshotEvent, ... }]`

### `POST /api/poc`
Creates a PoC step manually or from a timeline event.
- **Payload (manual)**: `{ sessionId, title?, goal?, observation?, executionEventId?, noteEventId?, screenshotEventId? }`
- **Payload (from timeline)**: `{ sessionId, sourceEventId, sourceEventType: 'command'|'note'|'screenshot', allowDuplicate?: boolean }`
- **Response**: `{ step, created, duplicatePrevented }`

### `PATCH /api/poc`
Updates or reorders PoC steps.
- **Payload (field update)**: `{ sessionId, id, title?, goal?, observation?, executionEventId?, noteEventId?, screenshotEventId? }`
- **Payload (reorder)**: `{ sessionId, id, direction: 'up'|'down' }` or `{ sessionId, id, stepOrder: number }`

### `DELETE /api/poc`
Deletes one PoC step.
- **Query Params**: `sessionId`, `id`

### `GET /api/findings`
Lists persisted findings for a session.
- **Query Params**: `sessionId`
- **Response**: `[{ id, sessionId, title, severity, description, impact, remediation, source, tags, evidenceEventIds, evidenceEvents, ... }]`

### `POST /api/findings`
Creates a persisted finding.
- **Payload**: `{ sessionId, title, severity?: 'critical'|'high'|'medium'|'low', description?, impact?, remediation?, source?, tags?: string[], evidenceEventIds?: string[] }`

### `PATCH /api/findings`
Updates an existing finding.
- **Payload**: `{ sessionId, id, title?, severity?, description?, impact?, remediation?, source?, tags?, evidenceEventIds? }`

### `DELETE /api/findings`
Deletes one finding.
- **Query Params**: `sessionId`, `id`

### `POST /api/findings/auto-tag`
Applies deterministic rule-based tags to findings.
- **Payload**: `{ sessionId, findingId? }`
- **Behavior**:
  - token-protected
  - when `findingId` is omitted, tags all findings in the session
  - persists tags directly and returns updated findings
- **Tag vocabulary**:
  - `web`, `network`, `auth`, `injection`, `xss`, `sqli`, `idor`, `rce`, `file-upload`, `lfi-rfi`, `ssrf`, `csrf`, `config`, `crypto`, `secrets`, `windows`, `linux`, `active-directory`, `privilege-escalation`, `lateral-movement`, `post-exploitation`

### `POST /api/findings/extract`
Runs AI-assisted finding extraction from recent timeline evidence (manual trigger, proposal-only).
- **Payload**: `{ sessionId, provider?: 'claude'|'gemini'|'openai', apiKey?: string, maxEvents?: number }`
- **Default**: `maxEvents = 80`
- **Response**:
  - `{ proposals: [{ title, severity, description, impact, remediation, evidenceEventIds }], meta: { provider, model, maxEvents, eventCount } }`
- **Note**: does not persist findings; proposals must be accepted through `POST /api/findings`.

### `GET /api/graph`
Loads persisted discovery graph state for the current workspace.
- **Query Params**:
  - `mermaid=1` to return Mermaid text instead of JSON
- **Behavior**:
  - persisted graph state is the source of truth
  - successful command finalization refreshes graph state automatically on the backend
  - findings are merged into the graph as derived evidence nodes on read
- **Graph payload**:
  - `{ nodes, edges }`
  - nodes may include `data.nodeType`, `data.phase`, `data.origin`, `data.sourceEventId`, `data.sourceFindingId`, `data.severity`
  - `data.origin` is `auto` for derived nodes and `manual` for user-added nodes
- **Mermaid mode**:
  - returns phase-clustered Mermaid with `subgraph` sections and color classes

### `POST /api/graph`
Persists discovery graph state.
- **Payload**: `{ nodes: [], edges: [] }`
- **Validation**:
  - node and edge shapes are schema-validated
  - graph state is normalized before save
  - manual nodes should preserve `data.origin = 'manual'`

### `GET /api/report`
Generates a report draft from timeline data.
- **Query Params**: `sessionId`, `format` (`lab-report` | `executive-summary` | `technical-walkthrough` | `ctf-solution` | `bug-bounty` | `pentest`)
- **Generated metadata**:
  - all formats now prepend a metadata cover/header block with session, analyst, target, objective, generated time, and format
  - all formats include a severity summary table when persisted findings exist
- **PoC + Findings Integration**: `technical-walkthrough` and `pentest` include generated `## Proof of Concept` and `## Findings` sections from `/api/poc` and `/api/findings`.

### `POST /api/writeup/enhance`
Enhances writeup content with AI.
- **Reporter Skills**: `enhance`, `writeup-refiner`, `report`
- **Legacy stream mode payload**:
  - `{ sessionId?: string, reportContent: string, provider: 'claude'|'gemini'|'openai', apiKey?: string, skill?: string }`
- **Section patch mode payload**:
  - `{ sessionId?: string, reportContent: string, reportBlocks: object[], selectedSectionIds?: string[], evidenceContext?: string, mode: 'section-patch', provider, apiKey, skill }`
- **Section patch response**:
  - `{ mode: 'section-patch', patches: [{ sectionId, title?, content?, caption?, alt?, evidenceRefs? }] }`

### `GET /api/ai/usage`
Returns AI token/cost usage summary for a session.
- **Query Params**: `sessionId`
- **Response**:
  - `{ sessionId, totals: { calls, promptTokens, completionTokens, totalTokens, estimatedCostUsd, lastCallAt }, byProvider: [], byModel: [] }`

### `POST /api/export/markdown`
Exports a markdown report as a downloadable `.md` file.
- **Payload**: `{ sessionId: string, format?: string, inlineImages?: boolean }`
- **Defaults**:
  - `format = 'technical-walkthrough'`
  - `inlineImages = true` (converts `/api/media/...` links to `data:image/...;base64,...` for export file only)

### `POST /api/export/html`
Exports a standalone HTML report as a downloadable `.html` file.
- **Payload**: `{ sessionId: string, format?: string, analystName?: string, inlineImages?: boolean }`
- **Defaults**:
  - `format = 'technical-walkthrough'`
  - `inlineImages = true` (self-contained HTML with data URI screenshots)
- **Response**:
  - `text/html` attachment with embedded styles and semantic sections (`h1-h3`, lists, code blocks, screenshots)

### `POST /api/export/json`
Exports a full session bundle as a downloadable `.json` file.
- **Payload**: `{ sessionId: string, format?: string, analystName?: string, inlineImages?: boolean }`
- **Defaults**:
  - `format = 'technical-walkthrough'`
  - `inlineImages = false`
- **Response shape**:
  - `meta`: `{ exportedAt, appVersion, format, analystName, sessionName, target, difficulty, objective, generatedAt, formatLabel }`
  - `session`: session metadata
  - `report`: `{ markdown }` generated by the selected report format
  - `timeline`: ordered timeline events
  - `pocSteps`: ordered PoC steps (hydrated linked events)
  - `findings`: persisted findings (hydrated linked evidence events)
  - `writeup`: saved writeup snapshot (`content`, `contentJson`, `status`, `visibility`, `updatedAt`)

### `POST /api/export/docx`
Exports a DOCX report as a downloadable `.docx` file.
- **Payload**: `{ sessionId: string, format?: string, analystName?: string, inlineImages?: boolean, includeAppendix?: boolean }`
- **Defaults**:
  - `format = 'technical-walkthrough'`
  - `inlineImages = true`
  - `includeAppendix = true`
- **Behavior**:
  - Uses the same shared report bundle as markdown/html/json exports
  - Embeds screenshot evidence when inline images are enabled
  - Appends an evidence appendix (timeline summary + PoC evidence) when enabled
- **Response**:
  - `application/vnd.openxmlformats-officedocument.wordprocessingml.document` attachment

### `GET /api/writeup`
Loads the current writeup for a session.
- **Query Params**: `sessionId`
- **Response**: `{ content, contentJson, status, visibility, ... }`

### `POST /api/writeup`
Saves the current writeup for a session.
- **Payload**: `{ sessionId, content, contentJson?, status?, visibility? }`

### `GET /api/writeup/history`
Lists historical versions or loads a specific version.
- **Query Params**: `sessionId`, `versionId?`

## Admin Endpoints

### `GET /api/admin/backup`
Downloads a SQLite backup export (admin-protected).
- **Guards**: requires valid `x-api-token` when `APP_API_TOKEN` is configured; requires `ENABLE_ADMIN_API=true` (or non-production default).
- **Query Params**:
  - `format=db|sql` (default: `db`)
- **Responses**:
  - `format=db`: binary SQLite file download (`.db`)
  - `format=sql`: SQL dump download (`.sql`) generated via `sqlite3 .dump`
  - `400`: invalid format
  - `401`: unauthorized
  - `403`: admin API disabled
  - `404`: database file missing
  - `501`: `sqlite3` CLI unavailable for SQL export

## Media Endpoints

### `POST /api/upload`
Handles screenshot file uploads.
- **Storage**: Files are saved to `data/sessions/<sessionId>/screenshots/`.
- **Validation**: Enforces PNG/JPEG/GIF/WEBP magic-byte signature checks (not header-only MIME checks).
- **Optional metadata**: `name`, `tag`, `caption`, `context`

### `PATCH /api/timeline`
Updates timeline event metadata.
- **Payload**: `{ sessionId, id, name?, tag?, caption?, context? }`
- **Current usage**: screenshot rename/tagging plus caption/context evidence notes

### `GET /api/wordlists`
Lists directories and files rooted at `CTF_WORDLIST_DIR`.
- **Query Params**: `path?`
- **Behavior**:
  - read-only
  - rejects path traversal
  - returns `root`, `currentPath`, `parentPath`, and sorted directory/file entries

### `GET /api/flags`
Lists local flag tracking records for a session.
- **Query Params**: `sessionId`

### `POST /api/flags`
Creates a local flag tracking record.
- **Payload**: `{ sessionId, value, status?: 'captured'|'submitted'|'accepted'|'rejected', notes? }`

### `PATCH /api/flags`
Updates a local flag tracking record.
- **Payload**: `{ sessionId, id, value?, status?, notes?, submittedAt? }`

### `DELETE /api/flags`
Deletes one local flag tracking record.
- **Query Params**: `sessionId`, `id`

## Runtime Notes

- Browser `Report` flow no longer blocks on analyst name. Blank analyst names are normalized to `Unknown` during generation and export.
- Note creation is standardized on `POST /api/timeline` with `tags` preferred as `string[]` and legacy string compatibility retained server-side.
- Docker runtime now includes `searchsploit` via a vendored Exploit-DB mirror. Metasploit is documented in the toolbox as templates and external links only.

### `GET /api/media/:sessionId/:filename`
Serves screenshot files for timeline, writeup editor, and PDF export.
- **Content-Type**: Inferred from file bytes first, with extension fallback.
