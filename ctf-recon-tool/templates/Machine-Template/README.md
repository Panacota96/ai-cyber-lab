# Machine Template (Obsidian)

Use this folder as the operator-side companion structure for a Helm's Watch session, especially when you want a file-based notebook next to the in-app timeline, findings, and exports.

## Files
- `Index.md`
- `Enumeration.md`
- `Exploitation.md`
- `Notes.md`
- `Writeup.md`
- `Writeup-public.md`
- `screenshots/` - evidence captures referenced by the writeup
- `artifacts/` - downloaded or generated target artifacts
- `solution/` - helper scripts and automation
- `scans/` - raw tool outputs and parsed findings

> [!info] Command Prompt Convention
> - `┌──(kali㉿kali)-[~]` = attacker box
> - `victim$` = low-privilege shell on target
> - `victim#` = root shell on target
> - `msf>` = Metasploit console

## Recommended usage
1. Copy this folder for the target you are working on.
2. Replace placeholders like `<Machine Name>`, `<IP>`, and `<YYYY-MM-DD>`.
3. Keep the phase alignment consistent with the Helm's Watch timeline:
   - Pre-Engagement
   - Information Gathering
   - Vulnerability Assessment
   - Exploitation
   - Post-Exploitation
   - Lateral Movement
   - Proof-of-Concept
   - Post-Engagement
4. Keep `Notes.md` as the chronological operator log and mirror key pivots from the application timeline.
5. Use `screenshots/` for evidence that should also appear in walkthrough or pentest exports.
6. Track structured findings and PoC steps in your notes so they can map cleanly into the app's report flows.
7. Create `Writeup.md` first with full technical detail, then derive `Writeup-public.md` by redacting secrets.
8. Keep Mermaid labels simple and parser-safe when maintaining attack-surface diagrams.
9. Run writeup linting before closure:
   - `python3 scripts/lint_writeups.py --path <machine_dir>`

## How this fits the current app
- `Writeup.md` maps well to `technical-walkthrough` and `pentest` report outputs.
- `Writeup-public.md` is the redacted handoff version.
- `Notes.md`, `screenshots/`, and `scans/` mirror the evidence Helm's Watch stores in the session timeline.
- Findings, PoC steps, and screenshots should remain reproducible from command history, not just prose.
