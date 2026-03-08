# AI Cyber Lab: Helm's Paladin Reconstruction Project

## Overview
This repository contains the **AI Cyber Lab** project, centered around the development and deployment of **Helm's Paladin**—a specialized reconnaissance assistant designed for Capture The Flag (CTF) competitions and penetration testing engagements. 

The project integrates a professional Next.js-based web interface with a robust Linux security toolchain, persistent SQLite storage, and a multi-provider AI enhancement system.

---

## Repository Structure

### 1. [Application: ctf-recon-tool/](file:///c:/Users/david/OneDrive%20-%20Pontificia%20Universidad%20Javeriana/Documents/GitHub/ai-cyber-lab/ctf-recon-tool/)
The core software application. It includes:
*   **Next.js 16 Web Interface**: Real-time terminal-style dashboard.
*   **Docker Configuration**: Pre-configured environment for security tool execution.
*   **[Templates/](file:///c:/Users/david/OneDrive%20-%20Pontificia%20Universidad%20Javeriana/Documents/GitHub/ai-cyber-lab/ctf-recon-tool/templates/)**: Professional CTF writeup templates integrated from the `ctf-writeups` collection.

### 2. [Technical Documentation: docs/](file:///c:/Users/david/OneDrive%20-%20Pontificia%20Universidad%20Javeriana/Documents/GitHub/ai-cyber-lab/docs/)
A comprehensive technical suite covering all aspects of the implementation:
*   **[AI Reference](file:///c:/Users/david/OneDrive%20-%20Pontificia%20Universidad%20Javeriana/Documents/GitHub/ai-cyber-lab/docs/ai/SKILLS.md)**: Skill routing, models, and prompting strategies.
*   **[Backend Architecture](file:///c:/Users/david/OneDrive%20-%20Pontificia%20Universidad%20Javeriana/Documents/GitHub/ai-cyber-lab/docs/backend/API_REFERENCE.md)**: RESTful API definitions and SQLite database schema.
*   **[Frontend Design](file:///c:/Users/david/OneDrive%20-%20Pontificia%20Universidad%20Javeriana/Documents/GitHub/ai-cyber-lab/docs/frontend/ARCHITECTURE.md)**: React 19 component structure and theme system.
*   **[Deployment Guide](file:///c:/Users/david/OneDrive%20-%20Pontificia%20Universidad%20Javeriana/Documents/GitHub/ai-cyber-lab/docs/implementation/DOCKER_BUILD.md)**: Docker orchestration and environment setup.
*   **[User Guide & Verification](file:///c:/Users/david/OneDrive%20-%20Pontificia%20Universidad%20Javeriana/Documents/GitHub/ai-cyber-lab/docs/usage/USER_GUIDE.md)**: Operational instructions and quality assurance procedures.

### 3. [Laboratory Report: laboratory_report.md](file:///c:/Users/david/OneDrive%20-%20Pontificia%20Universidad%20Javeriana/Documents/GitHub/ai-cyber-lab/laboratory_report.md)
The formal academic writeup of the project, following the ESME/Javeriana structural conventions (Overview, Task Sets, Conclusion).

---

## Getting Started

### Prerequisites
*   Docker and Docker Compose
*   (Optional) Node.js 20+ for local development

### Deployment
To initialize the environment and start the assistant:
```bash
cd ctf-recon-tool
docker compose up -d --build
```
The application will be accessible at [http://localhost:3000](http://localhost:3000).

---
*Note: This project is maintained for CTF reconnaissance and security research purposes.*
