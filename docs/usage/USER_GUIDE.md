# User Guide

This guide describes how to effectively use Helm's Paladin for a CTF challenge or a security audit.

## Starting a Session
1.  Navigate to `http://localhost:3000`.
2.  Click **"New Session"** in the sidebar.
3.  Enter the target metadata (IP, OS, Difficulty).

## Executing Reconnaissance
- Use the **Toolbox** sidebar to find common commands.
- Type any command (e.g., `nmap -sV <target_ip>`) into the command input.
- Commands will appear in the **Timeline** as they run.

## Capturing Evidence
- **Notes**: Click "Add Note" to record findings or initial thoughts.
- **Screenshots**: Drag and drop or upload images directly to the timeline.
- **Tags**: Use the dropdown on each event to categorize it (e.g., "Exploitation").

## Generating the Report
1.  Click **"Generate Report"**.
2.  Select a report format (Lab Report, Executive Summary, etc.).
3.  Click **"Enhance with AI"** to let the assistant analyze your findings.
4.  Once satisfied, click **"Export PDF"** to save the final document.
