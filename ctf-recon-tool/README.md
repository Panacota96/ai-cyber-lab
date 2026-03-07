# Helm's Paladin

> A terminal-style CTF reconnaissance assistant — run recon commands, capture evidence, and generate AI-enhanced writeup reports, all from one browser tab.

---

## Overview

Helm's Paladin is a self-hosted web app built for CTF competitors and pentesters. It gives you a persistent session workspace where you can execute reconnaissance commands, record notes, capture screenshots, and build a live timeline of your findings. When you're ready to write up, it generates structured Markdown reports and exports them as styled PDFs — with optional AI enhancement powered by Claude, Gemini, or OpenAI.

The app is designed to run inside Docker where the full CTF toolchain (nmap, gobuster, ffuf, sqlmap, hydra, etc.) is available. It can also run locally for report writing and session management without tool execution.

---

## Features

### Session Management
- Create, switch, rename, and delete sessions
- Tag each session with target IP, OS, difficulty, and objective
- Per-session timeline persisted in SQLite

### Command Execution
- Run any shell command directly from the browser
- Live output captured and stored with status (running / success / failed)
- Configurable timeout (1 – 30 min)
- Tag commands by pentest phase (Information Gathering, Exploitation, Post-Exploitation, etc.)

### Evidence Capture
- Add notes with tags for instant context
- Upload and annotate screenshots — served inline in the timeline
- Filter timeline by event type and tag

### Report Generation
Four report formats:

| Format | Use case |
|---|---|
| Lab Report | General-purpose technical report |
| Executive Summary | Business-facing, non-technical audience |
| Technical Walkthrough | Step-by-step guide |
| CTF Solution | Competition-style writeup |

### AI Enhancement — 11 Skill Modes
Enhance any report draft with an AI model of your choice:

| Group | Skills |
|---|---|
| General | Quick Enhance, Writeup Refiner (Granular Guided Standard), Pentest Report |
| Challenge Skills | Web Solve, Priv Esc, Crypto Solve, Pwn Solve, Reversing Solve, Stego, Analyze File, Enum Target |

Supports **Claude** (Anthropic), **Gemini** (Google), and **OpenAI**. API keys are entered directly in the UI — no server-side configuration required.

### AI Coach
One-click coaching panel that analyzes your session timeline and suggests the single best next action: current phase, situation summary, exact command, and expected signal.

### PDF Export
Download your writeup as a PDF in three themes:

| Theme | Style |
|---|---|
| Terminal Dark | Dark background, green/blue syntax colors |
| Professional | Clean navy and white corporate style |
| Minimal | Light grey, GitHub-flavored |

The PDF renders from the current writeup text — including any AI-enhanced edits.

### Writeup Versioning
Every save creates a version snapshot. Restore any previous version from the Version History modal.

### DB Maintenance
Built-in maintenance modal to clear accumulated logs and run SQLite VACUUM to reclaim disk space.

---

## Quick Start — Docker (recommended)

Docker provides the full Linux toolchain (nmap, gobuster, ffuf, sqlmap, etc.) needed for live command execution.

```bash
# From the ctf-recon-tool/ directory
docker build -t helms-paladin .
docker run -p 3000:3000 helms-paladin
```

Open [http://localhost:3000](http://localhost:3000).

To persist sessions and screenshots between container restarts, mount the data directory:

```bash
docker run -p 3000:3000 -v $(pwd)/data:/app/data helms-paladin
```

---

## Local Development

Requires Node.js 18+.

```bash
cd ctf-recon-tool
npm install
npm run dev        # http://localhost:3000
```

Other commands:

```bash
npm run build      # production build
npm run start      # start production server
npm run lint       # run ESLint
```

> Note: On Windows, commands are wrapped in `powershell.exe`. Inside Docker (Linux) they run in the shell directly — this is the intended environment for tool execution.

---

## AI Setup

API keys are entered in the report modal UI and saved to browser `localStorage`. No `.env` file is required.

Optionally set environment variables to pre-populate keys server-side:

```bash
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AIza...
OPENAI_API_KEY=sk-...
```

With Docker:

```bash
docker run -p 3000:3000 \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -e GEMINI_API_KEY=AIza... \
  helms-paladin
```

---

## Security Controls

To reduce risk when exposing the app outside localhost:

- `ENABLE_COMMAND_EXECUTION=true|false`  
  Defaults to enabled in development, disabled in production.
- `ENABLE_ADMIN_API=true|false`  
  Defaults to enabled in development, disabled in production.
- `APP_API_TOKEN=<secret>`  
  When set, mutating API routes require header `x-api-token: <secret>`.

Example:

```bash
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -e ENABLE_COMMAND_EXECUTION=false \
  -e ENABLE_ADMIN_API=false \
  -e APP_API_TOKEN=change-me \
  helms-paladin
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React 19, single-page (`app/page.js`) |
| Database | SQLite via `better-sqlite3` |
| PDF generation | pdfmake 0.3 |
| AI providers | `@anthropic-ai/sdk`, `@google/genai`, `openai` |
| Containerization | Docker |

---

## Project Structure

```
ctf-recon-tool/
├── app/
│   ├── page.js                    # Entire frontend (session UI, timeline, modals)
│   ├── lib/
│   │   ├── db.js                  # SQLite init + all DB access functions
│   │   ├── report-gen.js          # Markdown report generator
│   │   ├── report-formats.js      # 4 report format definitions
│   │   └── cheatsheet.js          # Toolbox sidebar data
│   └── api/
│       ├── execute/route.js       # Async command execution
│       ├── sessions/route.js      # Session CRUD
│       ├── timeline/route.js      # Timeline events
│       ├── report/route.js        # Report generation
│       ├── writeup/
│       │   ├── route.js           # Save/load writeups
│       │   ├── enhance/route.js   # AI enhancement (11 skill modes)
│       │   └── versions/route.js  # Version history
│       ├── export/pdf/route.js    # PDF export (markdown → pdfmake)
│       ├── coach/route.js         # AI Coach (timeline → next-step suggestion)
│       ├── upload/route.js        # Screenshot upload
│       ├── media/route.js         # Screenshot serving
│       └── admin/cleanup/route.js # DB maintenance
├── data/                          # Runtime data (gitignored)
│   ├── ctf_assistant.db           # SQLite database
│   └── sessions/<id>/screenshots/
├── Dockerfile
└── docker-compose.yml
```

---

## Data Persistence

All session data is stored in `data/` at the project root:

- `data/ctf_assistant.db` — SQLite database (sessions, timeline events, writeups, version history, logs)
- `data/sessions/<sessionId>/screenshots/` — uploaded screenshot files

The `data/` directory is gitignored and created automatically on first run. Back it up to preserve your work between rebuilds.

---

## Database Schema

| Table | Description |
|---|---|
| `sessions` | CTF challenge sessions (id, name, target, difficulty, objective) |
| `timeline_events` | All events per session — commands, notes, screenshots |
| `writeups` | Saved Markdown reports per session (upserted) |
| `writeup_versions` | Version history snapshots |
| `app_logs` | Application-level logs |
