# Laboratory Report: Helm's Paladin Reconstruction Assistant

## Table of Contents
1. [Overview](#1-overview)
2. [Task Set 1: Session and Target Management](#2-task-set-1-session-and-target-management)
3. [Task Set 2: Command Execution and Toolchain](#3-task-set-2-command-execution-and-toolchain)
4. [Task Set 3: Evidence Capture and Timeline](#4-task-set-3-evidence-capture-and-timeline)
5. [Task Set 4: AI-Enhanced Reporting and Coaching](#5-task-set-4-ai-enhanced-reporting-and-coaching)
6. [Task Set 5: Export and Deployment](#6-task-set-5-export-and-deployment)
7. [Conclusion](#7-conclusion)

---

## 1. Overview
Helm's Paladin is an integrated web-based reconnaissance assistant specifically designed for Capture The Flag (CTF) competitions and penetration testing engagements. The application provides a centralized platform for executing security tools, managing session data, and generating technical documentation. 

The architecture is built on the Next.js 16 framework using the App Router, with a persistent SQLite backend for session state and event logging. By containerizing the environment with Docker, the system ensures a consistent and pre-configured toolset is available regardless of the host operating system.

---

## 2. Task Set 1: Session and Target Management
The core of the application revolves around persistent session management. Each security engagement is treated as a unique session, allowing for isolation of data and findings.

*   **Metadata Tracking**: Sessions are enriched with target-specific information, including IP addresses, target Operating Systems, difficulty levels, and primary objectives.
*   **Persistence Layer**: All session metadata and configuration are stored in the `sessions` table of the SQLite database (`data/ctf_assistant.db`).
*   **CRUD Operations**: The system provides a RESTful API (`/api/sessions`) for creating, retrieving, updating, and deleting sessions, ensuring high data availability and management flexibility.

---

## 3. Task Set 2: Command Execution and Toolchain
Helm's Paladin integrates a non-blocking command execution engine that bridges the browser-based interface with the underlying Linux shell.

*   **Execution Engine**: The `/api/execute` endpoint utilizes Node.js child processes to run system commands. On Windows environments, commands are wrapped in PowerShell, while Docker environments execute them directly in a Linux shell.
*   **Integrated Toolchain**: The Docker environment comes pre-installed with essential security tools including `nmap`, `gobuster`, `ffuf`, `sqlmap`, `dnsutils`, and more, as defined in the `Dockerfile`.
*   **Asynchronous Feedback**: Command output is captured in real-time and stored in the database, allowing users to navigate the application while long-running processes complete.

---

## 4. Task Set 3: Evidence Capture and Timeline
Maintaining a rigorous chronological record is essential for effective security reporting. The application implements an automated timeline system.

*   **Timeline Events**: Every action—command execution, manual note-taking, or screenshot upload—is recorded as a discrete event in the `timeline_events` table.
*   **Evidence Management**: The system supports direct file uploads for screenshots, which are stored in session-specific directories (`data/sessions/<id>/screenshots/`) and served via a dedicated media API.
*   **Indexing and Search**: Events are tagged by pentest phases (e.g., Information Gathering, Exploitation), enabling efficient filtering and review of captured evidence.

---

## 5. Task Set 4: AI-Enhanced Reporting and Coaching
The application leverages Large Language Models (LLMs) to transform raw technical data into structured narratives.

*   **Multi-Provider Integration**: Support is provided for Anthropic (Claude), Google (Gemini), and OpenAI models via their respective SDKs.
*   **Specialized Skill Modes**: Eleven distinct AI "skills" are implemented (e.g., Web Solve, Priv Esc, Technical Walkthrough), each using customized prompt engineering to analyze the timeline and generate specific report sections.
*   **AI Coach**: A dedicated coaching module analyzes the current session state and suggests the most effective next logical step in the penetration testing methodology.

---

## 6. Task Set 5: Export and Deployment
Final outcomes are delivered through high-fidelity document generation and a streamlined deployment process.

*   **PDF Generation**: Technically detailed reports are rendered into PDFs using the `pdfmake` library. The system supports multiple professional themes, including "Terminal Dark" and "Professional" styles.
*   **Containerization**: The entire application and its dependencies are defined in a `Dockerfile` and orchestrated via `docker-compose.yml`, ensuring a "one-command" deployment strategy.
*   **Maintenance Utilities**: Built-in functions allow for database optimization (SQLite VACUUM) and log rotation to manage long-term storage requirements.

---

## 7. Conclusion
Helm's Paladin successfully bridges the gap between active reconnaissance and technical documentation. By centralizing the pentest lifecycle within a single, AI-aware platform, it significantly reduces the administrative overhead of report generation while maintaining a high standard of technical accuracy. Future developments may include real-time collaboration features and deeper integration with cloud-based security toolchains.
