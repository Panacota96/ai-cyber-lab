---
title: Helm's Paladin — Project Improvement Roadmap
updated: 2026-03-09
source: automated codebase scan (claude-sonnet-4-6)
---

# Helm's Paladin — Improvement Roadmap

## Architecture Assessment

Helm's Paladin is a well-structured Next.js 15 CTF reconnaissance assistant with:

- Clean separation of concerns (frontend, API, database, security)
- Multi-provider AI support (Claude, Gemini, OpenAI)
- Rich CTF-specific features (session mgmt, timeline, reporting, PDF export)
- Thoughtful security hardening (path traversal protection, session validation, API tokens)

Main gaps: UX polish, operational robustness, reporting depth, test coverage, and code quality.

---

## Quick-Win Immediate Actions

> ~16 hours total estimated effort

| # | Item | File(s) | Est. |
|---|------|---------|------|
| 1 | ~~Add `/api/health` liveness endpoint~~ ✓ DONE | `app/api/health/route.js` | — |
| 2 | ~~Create `.env.example` + README setup section~~ ✓ DONE | `.env.example`, `README.md` | — |
| 3 | ~~Integrate dotenv for config loading~~ ✓ DONE | `app/lib/config.js` | — |
| 4 | ~~Write `docker-compose.yml`~~ ✓ DONE | `docker-compose.yml` | — |
| 5 | ~~Create `scripts/init.sh` startup script~~ ✓ DONE | `scripts/init.sh` | — |
| 6 | ~~Command templates with `{target}` substitution~~ ✓ DONE | `app/page.js` | — |
| 7 | ~~Fuzzy search in history sidebar~~ ✓ DONE | `app/page.js` | — |
| 8 | ~~Session event filtering (all/success/failed/running)~~ ✓ DONE | `app/page.js` | — |
| 9 | ~~Command timeout UI + cancel button~~ ✓ DONE | `app/page.js`, `app/api/execute/route.js`, `app/api/execute/cancel/route.js` | — |
| 10 | ~~Report format presets (CTF, Bug Bounty, Pentest)~~ ✓ DONE | `app/lib/report-formats.js`, `app/api/report/route.js` | — |
| 11 | ~~Graceful shutdown handler (SIGTERM/SIGINT + SQLite close)~~ ✓ DONE | `app/lib/db.js` | — |
| 12 | ~~Fixed bottom project version bar (Semver + Git SHA)~~ ✓ DONE | `next.config.mjs`, `app/layout.js`, `app/globals.css`, `app/page.js` | — |

---

## Master Ranked List — Easiest to Hardest

### Easy (1–2 days each)

| ID | Item | Category | Impact |
|----|------|----------|--------|
| B.2 | ~~Env var documentation (`.env.example`)~~ ✓ DONE | Ops | High |
| B.3 | ~~`/api/health` liveness endpoint~~ ✓ DONE | Ops | Medium |
| B.4 | ~~Graceful shutdown handler (SIGTERM)~~ ✓ DONE | Ops | Low-Med |
| B.5 | ~~`.env` file config with dotenv~~ ✓ DONE | Ops | Medium |
| B.6 | ~~`docker-compose.yml` for full stack~~ ✓ DONE | Ops | High |
| B.8 | ~~Database backup/export API endpoint~~ ✓ DONE | Ops | Low-Med |
| B.10 | ~~`scripts/init.sh` startup script~~ ✓ DONE | Ops | Low-Med |
| A.2 | ~~Collapsible timeline + expand-all toggle~~ ✓ DONE | UX | Medium |
| A.3 | ~~Dark mode toggle + localStorage persistence~~ ✓ DONE | UX | Low |
| A.5 | ~~Inline event filtering by status/tag~~ ✓ DONE | UX | Medium |
| A.7 | ~~Copy-to-clipboard button per event~~ ✓ DONE | UX | Low |
| A.8 | ~~Screenshot metadata inline edit (popover)~~ ✓ DONE | UX | Low |
| A.9 | ~~Customizable sidebar tool categories~~ ✓ DONE | UX | Low-Med |
| C.2 | ~~Command templates/macros (`{target}`)~~ ✓ DONE | Features | Medium |
| C.6 | ~~Command history fuzzy search~~ ✓ DONE | Features | Low-Med |
| C.7 | ~~Bulk screenshot operations~~ ✓ DONE | Features | Low |
| D.3 | ~~Inline images in markdown/PDF export~~ ✓ DONE | Reporting | Medium |
| D.8 | ~~Auto TOC generation in reports~~ ✓ DONE | Reporting | Low |
| D.10 | ~~Report format presets (Pentest, CTF, Bug Bounty)~~ ✓ DONE | Reporting | Medium |
| E.5 | ~~Coach command validation before execution~~ ✓ DONE | AI | Low |
| E.10 | ~~API cost tracking per session~~ ✓ DONE | AI | Low |
| F.4 | ~~Screenshot magic-byte MIME validation~~ ✓ DONE | Security | Medium |
| F.6 | ~~Session ID randomization (UUID)~~ ✓ DONE | Security | Low-Med |
| F.8 | ~~Note HTML sanitization (XSS)~~ ✓ DONE (plain text) | Security | Low-Med |
| F.10 | ~~Audit log for sensitive actions~~ ✓ DONE | Security | Low-Med |
| G.4 | ~~Constants consolidation to config file~~ ✓ DONE | Code | Low |
| G.8 | ~~CSS module organization~~ ✓ DONE (already organized) | Code | Low |
| G.9 | ~~Dependency audit (`npm audit`)~~ ✓ DONE | Code | Medium |

### Medium (3–7 days each)

| ID | Item | Category | Impact |
|----|------|----------|--------|
| B.1 | Multi-stage Docker build (slim image) | Ops | Medium |
| B.7 | Structured JSON logging mode | Ops | Medium |
| A.1 | Mobile / tablet responsive layout | UX | High |
| A.4 | Real-time fuzzy command suggestions | UX | Medium |
| A.6 | ~~Drag-and-drop report block reordering~~ ✓ DONE | UX | Low-Med |
| A.10 | ~~Timeline keyboard shortcuts (↑↓, Ctrl+F)~~ ✓ DONE | UX | Low |
| C.1 | ~~Command timeout UI + cancel button~~ ✓ DONE | Features | High |
| C.4 | Session tagging + full-text search | Features | Medium |
| C.8 | ~~Output diff view for related commands~~ ✓ DONE | Features | Low-Med |
| C.9 | Global search across all sessions | Features | Medium |
| D.4 | ~~PoC step recorder (screenshot + cmd + output)~~ ✓ DONE | Reporting | Medium |
| D.5 | Multi-format export (DOCX, HTML, JSON) ◐ PARTIAL (HTML + JSON done, DOCX pending) | Reporting | Medium |
| D.6 | ~~Report versioning + diff view~~ ✓ DONE | Reporting | Low-Med |
| D.9 | ~~CVSS score integration~~ ✓ DONE | Reporting | Low-Med |
| E.1 | Coach skill difficulty levels (beginner/expert) | AI | Medium |
| E.2 | Coach caching + context limit management | AI | Medium |
| E.4 | ~~Coach feedback loop (thumbs up/down)~~ ✓ DONE | AI | Low-Med |
| E.6 | ~~Multi-model coach comparison (parallel)~~ ✓ DONE | AI | Low-Med |
| E.7 | ~~Coach confidence scoring~~ ✓ DONE | AI | Low |
| F.2 | ~~Advanced command injection hardening~~ ✓ DONE | Security | High |
| F.3 | ~~Rate limiting on `/api/execute`, `/api/coach`~~ ✓ DONE | Security | Medium |
| F.5 | ~~Parameterized query audit in `updateTimelineEvent`~~ ✓ DONE | Security | High |
| F.7 | ~~API token rotation + expiration~~ ✓ DONE | Security | Medium |
| F.9 | ~~PDF export XSS protection audit~~ ✓ DONE | Security | Low |
| G.3 | ~~Logger module standardization~~ ✓ DONE | Code | Low-Med |
| G.5 | ~~Error handling consistency across endpoints~~ ✓ DONE | Code | Low-Med |
| G.6 | ~~API response schema validation (zod)~~ ✓ DONE | Code | Low-Med |
| G.10 | ~~OpenAPI/Swagger docs at `/api/docs`~~ ✓ DONE | Code | Low-Med |

### Hard (1–3+ weeks each)

| ID | Item | Category | Impact |
|----|------|----------|--------|
| C.3 | Session comparison mode (side-by-side) | Features | Low-Med |
| C.5 | Live collaboration (WebSocket/SSE) | Features | Medium |
| C.10 | Scheduled command execution | Features | Low-Med |
| D.1 | Custom report template builder UI | Reporting | Medium |
| D.2 | AI auto-finding extraction + severity tagging | Reporting | High |
| E.3 | Offline coach mode (llama.cpp/ollama) | AI | Low-Med |
| E.8 | Auto writeup enhancement on timeline update | AI | Low-Med |
| E.9 | Adversarial challenge mode (AI as target) | AI | Low |
| G.1 | Unit + integration test suite (Jest/Vitest) | Code | High |
| G.2 | TypeScript gradual conversion | Code | Medium |
| G.7 | Frontend state management refactor (30+ useState) | Code | Medium |

---

## Recommended 6-Month Timeline

| Month | Focus |
|-------|-------|
| 1 | Security fixes, env/Docker docs, quick-win UX |
| 2 | Command timeout, session tagging, report presets |
| 3 | AI auto-finding extraction, test suite foundation |
| 4–6 | TypeScript conversion, state refactor, advanced features |

---

## See Also

- [improvement-backlog.md](improvement-backlog.md) — full per-item detail with rationale, files affected, and fix notes
- [../examples/htb/pdf/README.md](../examples/htb/pdf/README.md) — HTB report template references
