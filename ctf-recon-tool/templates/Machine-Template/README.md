# Machine Template (Obsidian)

Use this folder as the starting structure for any machine engagement.

## Files
- `Index.md`
- `Enumeration.md`
- `Exploitation.md`
- `Notes.md`
- `Writeup.md`
- `Writeup-public.md`
- `screenshots/` (evidence captures)
- `artifacts/` (downloaded/generated target artifacts)
- `solution/` (automation scripts and helper code)
- `scans/` (tool outputs and parsed findings)

> [!info] Command Prompt Convention
> - `┌──(kali㉿kali)-[~]` = attacker box
> - `victim$` = low-privilege shell on target
> - `victim#` = root shell on target
> - `msf>` = Metasploit console

## Usage
1. Copy this folder to your machine path.
2. Replace placeholders like `<Machine Name>`, `<IP>`, `<YYYY-MM-DD>`.
3. Keep phase alignment for machines:
   - Pre-Engagement
   - Information Gathering
   - Vulnerability Assessment
   - Exploitation
   - Post-Exploitation
   - Lateral Movement
   - Proof-of-Concept
   - Post-Engagement
4. Keep `Notes.md` as a strict chronological operator log of all meaningful actions.
5. In `Notes.md`, create and maintain a `## Attack Surface Diagram` (Mermaid) and update it on every major pivot.
6. Apply phase colors directly on attack-surface nodes/edges:
   - Reconnaissance: green
   - Enumeration: light blue
   - Vulnerability Assessment: yellow/amber
   - Exploitation: red
   - Post-Exploitation: orange
   - Lateral Movement: purple
   - Proof-of-Concept: brown
   - Post-Engagement: slate/gray-blue
7. **Writeup Creation Workflow (CRITICAL)**:
   - Create `Writeup.md` FIRST with ALL actual values (passwords, flags, keys, hashes, tokens in cleartext)
   - Create `Writeup-public.md` SECOND by copying `Writeup.md` and redacting secrets with placeholders
   - Both files must be step-by-step reproducible with exact commands and expected/observed signals
8. Keep Mermaid labels simple and parser-safe.
9. Run quality lint before closure:
   - `python3 scripts/lint_writeups.py --path <machine_dir>`
