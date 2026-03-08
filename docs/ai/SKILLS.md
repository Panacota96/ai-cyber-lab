# AI Skill Modes Reference

Helm's Paladin provides 11 distinct AI "skills" designed to assist in various phases of a penetration test or CTF challenge.

## Skill Routing
- **AI Reporter (`/api/writeup/enhance`)**: only report-focused skills are exposed:
  - Quick Enhance
  - Writeup Refiner
  - Pentest Report
- **AI Coach (`/api/coach`)**: pentest/challenge skills remain available for next-step guidance.

## General Skills

### 1. Quick Enhance
Optimizes the current writeup for clarity and professional tone without changing the core technical content. Use this for final polish.

### 2. Writeup Refiner (Granular Guided Standard)
A multi-step refining process that guides the AI to expand on specific sections of the report based on standard pentesting documentation requirements.

### 3. Pentest Report
Formats the entire session timeline into a formal penetration testing report structure, including executive summaries and technical findings.

## Challenge Skills

### 4. Web Solve
Analyzes web-related events (HTTP requests, `dirb` scans, `gobuster` output) to identify common web vulnerabilities like SQLi, XSS, or broken access control.

### 5. Priv Esc
Focuses on post-exploitation data (system logs, `sudo -l` output) to suggest potential privilege escalation vectors on the target system.

### 6. Crypto Solve
Identifies and provides analysis for cryptographic challenges, including cipher identification and potential decryption strategies.

### 7. Pwn Solve
Assists with binary exploitation challenges, analyzing memory corruption issues and suggesting payload construction.

### 8. Reversing Solve
Aids in reverse engineering tasks by interpreting disassembly or decompiled code snippets from the timeline.

### 9. Stego
Analyzes file metadata and patterns to identify potential steganographic content in challenge files.

### 10. Analyze File
Provides a deep dive into specific files uploaded or interactively analyzed during the session.

### 11. Enum Target
Suggests the most effective enumeration strategies based on the current target's OS and open ports.
