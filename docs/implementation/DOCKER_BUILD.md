# Docker Build and Orchestration

Helm's Paladin is designed to run in a containerized Linux environment, ensuring that all necessary reconnaissance tools are available without manual installation on the host machine.

## Dockerfile Breakdown
The `Dockerfile` uses a multi-stage approach for optimization:

1.  **Base Image**: `node:20-bookworm`. This provides the latest Node.js runtime on a modern Debian base.
2.  **Tool Installation**: 
    -   `apt-get update` installs essential Linux utilities (`nmap`, `gobuster`, `ffuf`, `sqlite3`, etc.).
3.  **Dependency Management**: 
    -   `npm install` handles project-specific dependencies (Next.js, PDF library, AI SDKs).
4.  **Application Build**: 
    -   Copies the source code and prepares the Next.js runtime.

## Docker Compose
The `docker-compose.yml` file simplifies deployment:

- **Volume Mounting**: Mounts `./data` to `/app/data` to ensure persistence across container restarts.
- **Port Mapping**: Exposes internal port `3000` to the host machine.
- **Environment**: Sets `NODE_ENV` to `development` by default for live-reloading.

## Usage
```bash
docker compose up -d --build
```
This command builds the image and starts the service in detached mode.
