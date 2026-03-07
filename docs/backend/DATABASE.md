# Database Schema and Persistence

Helm's Paladin uses SQLite for lightweight, file-based persistence, located at `data/ctf_assistant.db`.

## Tables

### `sessions`
Stores metadata about individual CTF challenges.
- `id` (UUID): Primary Key.
- `name`: Human-readable name.
- `target_ip`: IP address of the victim machine.
- `target_os`: Detected Operating System.
- `difficulty`: Easy, Medium, Hard, or Insane.
- `objective`: Primary goal (e.g., "Root access").

### `timeline_events`
The heart of the application, recording every action within a session.
- `id`: Primary Key.
- `sessionId`: Foreign Key to `sessions`.
- `type`: `command`, `note`, or `screenshot`.
- `content`: Text content or relative path to media.
- `status`: For commands (`running`, `success`, `failed`).
- `timestamp`: Automatically generated.

### `writeups`
Stores the latest generated or edited report for a session.
- `sessionId`: Primary Key.
- `content`: Markdown text.
- `updated_at`: Last save date.

## Maintenance
The application includes a maintenance mode that executes:
1. `DELETE FROM app_logs`: Clears internal audit logs.
2. `VACUUM`: Reclaims disk space and optimizes the database file.
