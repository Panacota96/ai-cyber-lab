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

### `GET /api/report`
Generates a report draft from timeline data.
- **Query Params**: `sessionId`, `format` (`lab-report` | `executive-summary` | `technical-walkthrough` | `ctf-solution`)

### `POST /api/writeup/enhance`
Enhances writeup content with AI.
- **Reporter Skills**: `enhance`, `writeup-refiner`, `report`
- **Legacy stream mode payload**:
  - `{ reportContent: string, provider: 'claude'|'gemini'|'openai', apiKey?: string, skill?: string }`
- **Section patch mode payload**:
  - `{ reportContent: string, reportBlocks: object[], selectedSectionIds?: string[], evidenceContext?: string, mode: 'section-patch', provider, apiKey, skill }`
- **Section patch response**:
  - `{ mode: 'section-patch', patches: [{ sectionId, title?, content?, caption?, alt?, evidenceRefs? }] }`

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

## Media Endpoints

### `POST /api/upload`
Handles screenshot file uploads.
- **Storage**: Files are saved to `data/sessions/<sessionId>/screenshots/`.

### `GET /api/media/:sessionId/:filename`
Serves screenshot files for timeline, writeup editor, and PDF export.
