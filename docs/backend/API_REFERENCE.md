# API Reference

The Helm's Paladin backend is implemented as a set of Next.js API routes, providing a stateless interface to the underlying SQLite database and system shell.

## Core Endpoints

### `POST /api/execute`
Executes a system command and returns the live output stream.
- **Payload**: `{ command: string, sessionId: string, tag: string }`
- **Logic**: Uses `child_process.spawn` to run the command and pipes output to the database.

### `GET /api/sessions`
Retrieves all active sessions or a specific session by ID.
- **Query Params**: `id` (optional)
- **Response**: Array of session objects.

### `POST /api/timeline`
Creates a new event in the session timeline.
- **Payload**: `{ sessionId: string, type: 'note' | 'command' | 'screenshot', content: string }`

### `POST /api/writeup/enhance`
Sends timeline data to the selected AI provider for report generation.
- **Payload**: `{ sessionId: string, skill: string, provider: string, apiKey: string }`

## Media Endpoints

### `POST /api/upload`
Handles screenshot file uploads using `formidable`.
- **Storage**: Files are saved to `data/sessions/<sessionId>/screenshots/`.

### `GET /api/media`
Serves images stored on the filesystem for inline rendering in the frontend.
