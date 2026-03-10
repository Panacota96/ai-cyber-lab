# API Reference

Helm's Paladin backend is implemented with Next.js API routes.

## Core Endpoints

### `POST /api/execute`
Executes a system command and returns the live output stream.
- **Payload**: `{ command: string, sessionId: string, tags: string[], timeout: number }`

### `GET /api/sessions`
Retrieves all active sessions or a specific session by ID.
- **Response**: Array of session objects (`id`, `name`, `target`, `difficulty`, `objective`).

### `POST /api/timeline`
Creates a new event in the session timeline.
- **Payload**: `{ sessionId: string, type: 'note' | 'command' | 'screenshot', content?: string, command?: string, tags?: string[] }`

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
- **Response**: `[{ id, sessionId, title, severity, description, impact, remediation, source, evidenceEventIds, evidenceEvents, ... }]`

### `POST /api/findings`
Creates a persisted finding.
- **Payload**: `{ sessionId, title, severity?: 'critical'|'high'|'medium'|'low', description?, impact?, remediation?, source?, evidenceEventIds?: string[] }`

### `PATCH /api/findings`
Updates an existing finding.
- **Payload**: `{ sessionId, id, title?, severity?, description?, impact?, remediation?, source?, evidenceEventIds? }`

### `DELETE /api/findings`
Deletes one finding.
- **Query Params**: `sessionId`, `id`

### `POST /api/findings/extract`
Runs AI-assisted finding extraction from recent timeline evidence (manual trigger, proposal-only).
- **Payload**: `{ sessionId, provider?: 'claude'|'gemini'|'openai', apiKey?: string, maxEvents?: number }`
- **Default**: `maxEvents = 80`
- **Response**:
  - `{ proposals: [{ title, severity, description, impact, remediation, evidenceEventIds }], meta: { provider, model, maxEvents, eventCount } }`
- **Note**: does not persist findings; proposals must be accepted through `POST /api/findings`.

### `GET /api/report`
Generates a report draft from timeline data.
- **Query Params**: `sessionId`, `format` (`lab-report` | `executive-summary` | `technical-walkthrough` | `ctf-solution` | `bug-bounty` | `pentest`)
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
  - `meta`: `{ exportedAt, appVersion, format, analystName }`
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

### `GET /api/media/:sessionId/:filename`
Serves screenshot files for timeline, writeup editor, and PDF export.
- **Content-Type**: Inferred from file bytes first, with extension fallback.
