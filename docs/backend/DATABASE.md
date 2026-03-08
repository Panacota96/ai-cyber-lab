# Database Schema and Persistence

Helm's Paladin uses SQLite for file-based persistence at `data/ctf_assistant.db`.

## Tables

### `sessions`
Stores metadata about individual CTF challenges.
- `id`: Primary Key.
- `name`: Human-readable name.
- `target`: target IP/URL.
- `difficulty`: `easy`, `medium`, or `hard`.
- `objective`: Primary goal (e.g., "Root access").

### `timeline_events`
The heart of the application, recording every action within a session.
- `id`: Primary Key.
- `session_id`: Foreign Key to `sessions`.
- `type`: `command`, `note`, or `screenshot`.
- `command`, `content`, `output`: event payload.
- `filename`, `name`: screenshot metadata.
- `status`: event execution status.
- `tag`, `tags`: quick tag + JSON tag list.
- `timestamp`: Automatically generated.

### `writeups`
Stores the latest generated or edited report for a session.
- `session_id`: Unique key by session.
- `content`: Markdown text used for export.
- `content_json`: Structured block editor content (JSON string).
- `status`, `visibility`: publication state.
- `updated_at`: Last save date.

### `writeup_versions`
Immutable snapshots taken before each writeup update.
- `session_id`, `version_number`
- `content`, `content_json`
- `visibility`, `created_at`

## Maintenance
The application includes a maintenance mode that executes:
1. `DELETE FROM app_logs`: Clears internal audit logs.
2. `VACUUM`: Reclaims disk space and optimizes the database file.
