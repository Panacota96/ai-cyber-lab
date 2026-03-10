# AI Cyber Lab

AI Cyber Lab is the repository that houses Helm's Watch, a desktop-first cyber lab workspace for CTF, lab, and pentest documentation.

Current application release: **v0.2.0**

## Start Here
- [Application README](./ctf-recon-tool/README.md)
- [Roadmap](./ctf-recon-tool/docs/ROADMAP.md)
- [Changelog](./ctf-recon-tool/CHANGELOG.md)
- [Laboratory Report](./laboratory_report.md)

## Repository Layout
- [`ctf-recon-tool/`](./ctf-recon-tool/) - Active Next.js application, Docker runtime, templates, examples, and release tracking.
- [`docs/`](./docs/) - Shared project documentation split by domain.
- [`laboratory_report.md`](./laboratory_report.md) - Academic writeup for the project.

## Documentation Map
- [AI docs](./docs/ai/)
- [Backend docs](./docs/backend/)
- [Frontend docs](./docs/frontend/)
- [Implementation docs](./docs/implementation/)
- [Testing docs](./docs/testing/)
- [Usage docs](./docs/usage/)

## Helm's Watch at a Glance
Helm's Watch is the current operator workspace in this repo. It combines:
- timeline-first session tracking for commands, notes, screenshots, findings, and PoC steps
- AI Coach and AI Reporter workflows
- report generation in six formats with Markdown, PDF, HTML, JSON, and DOCX exports
- SQLite-backed persistence and Docker-first operation

For implementation details, setup, and current feature coverage, use the [application README](./ctf-recon-tool/README.md).

## Quick Start
```bash
cd ctf-recon-tool
docker compose up -d --build
```

Then open `http://localhost:3000`.

## Notes
- The product is desktop/laptop-first. Mobile and tablet UI work is intentionally out of scope.
- Some runtime identifiers still use `helms-paladin` for Docker and compatibility, even though the current product name is Helm's Watch.
