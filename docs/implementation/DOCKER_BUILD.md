# Docker Build and Orchestration

Helm's Watch runs in a Linux container that bundles runtime recon tooling and the production Next.js app server.

## Multi-stage Dockerfile (`B.1`)

The app image now uses a three-stage build:

1. **`deps` stage (`node:20-bookworm`)**
   - Installs Node dependencies with `npm ci`.
2. **`builder` stage (`node:20-bookworm`)**
   - Builds Next.js with standalone output (`next.config.mjs -> output: 'standalone'`).
3. **`runner` stage (`node:20-bookworm-slim`)**
   - Installs runtime operator tools only (nmap, ffuf, dirb, sqlite3, etc.).
   - Vendors SearchSploit from the official Exploit-DB mirror.
   - Copies `.next/standalone`, `.next/static`, and `public/` from the builder.

This keeps runtime behavior unchanged while reducing final image size and build attack surface versus single-stage builds.

## Runtime behavior

- Exposes port `3000`.
- Uses `NODE_ENV=production`.
- Starts with `node server.js` from standalone output.
- Includes image-level healthcheck:

```bash
wget -qO- http://localhost:3000/api/health
```

## Docker Compose

`ctf-recon-tool/docker-compose.yml` provides:

- Persistent volume `helms-paladin-data` mounted at `/app/data`.
- Port mapping `${PORT:-3000}:3000`.
- Optional resource limits:
  - `APP_MEM_LIMIT` (default `2g`)
  - `APP_CPUS` (default `2.0`)

## Usage

```bash
cd ctf-recon-tool
docker compose up -d --build
```
