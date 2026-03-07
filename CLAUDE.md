# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Helm's Paladin** — a CTF (Capture The Flag) reconnaissance assistant. It is a Next.js web app that provides a terminal-style UI for running recon commands, capturing notes/screenshots, and generating session writeup reports. The app is intended to run inside Docker where the CTF tooling (nmap, gobuster, ffuf, sqlmap, etc.) is available.

## Commands

All commands run from `ctf-recon-tool/`:

```bash
npm run dev      # Start Next.js dev server (port 3000)
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
```

**Docker (recommended for full tool access):**

```bash
docker build -t helms-paladin .
docker run -p 3000:3000 helms-paladin
```

There is no test suite configured.

## Architecture

The app is a single-page Next.js 15 application using the App Router. All state is persisted in a SQLite database via `better-sqlite3`.

### Data flow

1. The single client page (`app/page.js`) polls `/api/timeline?sessionId=...` every 3 seconds and maintains a live feed of events.
2. Commands are submitted to `/api/execute`, which immediately returns a `running` event, then asynchronously shells out via `child_process.exec` and updates the record via `updateTimelineEvent`.
3. Notes and screenshots are submitted to `/api/timeline` and `/api/upload` respectively.
4. Reports are generated on-demand by `/api/report`, which pulls all session events and formats them as Markdown via `app/lib/report-gen.js`. Reports can then be saved as writeups via `/api/writeup`.

### Key files

| Path | Role |
|---|---|
| `app/page.js` | Entire frontend: session management, timeline feed, toolbox sidebar, input form |
| `app/lib/db.js` | SQLite init + all DB access functions (sessions, timeline events, writeups, logs) |
| `app/lib/report-gen.js` | Pure function that converts session + events array into a Markdown report |
| `app/lib/cheatsheet.js` | Static data: tool flags displayed in the sidebar FLAGS tab |
| `app/api/execute/route.js` | Async command execution via `child_process.exec`; fire-and-forget pattern |

### Database schema (SQLite at `data/ctf_assistant.db`)

- `sessions` — CTF challenge sessions (id, name)
- `timeline_events` — all events per session; `type` is `command | note | screenshot`
- `writeups` — saved markdown reports per session (upserted by session_id)
- `app_logs` — application-level logs written by `app/lib/logger.js`

Screenshots are stored on disk at `data/sessions/<sessionId>/screenshots/` and served via `/api/media/[sessionId]/[filename]`.

### Path alias

`@/` maps to `app/` (configured via Next.js default App Router conventions).

## Notes

- The `data/` directory (SQLite DB + screenshot files) is created at runtime and should not be committed.
- On Windows, `executeAndRecord` wraps commands in `powershell.exe -Command "..."`. Inside Docker (Linux), commands run directly in the shell — this is the intended production environment.
- `app/api/sessions/route.js` references `createSession` without importing it — this is a pre-existing bug.
