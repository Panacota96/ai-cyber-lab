---
title: "AG-Writeup-Template"
type: "template"
agent: "Antigravity"
created: "2026-03-06"
tags:
  - template
  - writeup
  - ag_agent
  - reproducible
---

<!--
USAGE
─────
This template is generated automatically by scripts/ag_agent/writeup_generator.py
and also serves as a standalone human-editable template.

RULES (Granular Guided Standard — enforced by AGENTS.md §3):
1. Every step MUST have all five sub-sections: Goal / Reasoning / Execution / Observation / Decision.
2. Execution MUST declare: sandbox used, exact command (copy-pasteable), payload name + relative path, code relative path.
3. No pseudocode — every command must run exactly as written.
4. All paths to files (payloads, scripts, output) are RELATIVE to this workspace root (e.g. assets/exploit.py).
5. Writeup-public.md is auto-generated from this file — NEVER edit it manually.
-->

> [!abstract] Navigation
> [[Index]] | [[Enumeration]] | [[Exploitation]] | [[Notes]] | **Writeup** | [[Writeup-public]]

# `<Challenge Name>`

## TL;DR
- **Platform**: `<HackTheBox | Root-me | TryHackMe | PicoCTF>`
- **Category**: `<web | pwn | crypto | forensics | reversing | stego | misc | machine>`
- **Target**: `<IP or URL>`
- **Sandbox**: Exegol (`ghcr.io/exegol/exegol:nightly`) — network mode: `host`
- **Timeline**: [`assets/timeline.json`](assets/timeline.json)
- **Flag found**: `<yes | no>`

---

## Skills Loaded
- `<skill-name>` — loaded from `docs/assets/skill-index.json`

---

## Reproducible Walkthrough (Step by Step)

<!--
STEP TEMPLATE — Copy this block for each step.
Delete sections that don't apply, but Goal/Reasoning/Execution/Observation/Decision are MANDATORY.
-->

### Step 1 — Reconnaissance

**Goal**: `<What are we trying to achieve in this step?>`

**Reasoning**: `<Why this specific tool / approach? Reference AGENTS.md quickcheck if applicable.>`

**Execution**:
  - Sandbox: Exegol (`ghcr.io/exegol/exegol:nightly`)
  - Tool: `<tool_name>`
  - Purpose: `<one-line purpose>`
  - Code used: `<Yes — [assets/solver.py](assets/solver.py)>` or `No`
  - Payload: `<payload_name>` stored at [`assets/payload.ext`](assets/payload.ext) | `None`
    - Why this payload: `<derivation reason>`

  ```bash
  # Exact command — must be copy-pasteable with no modifications
  nmap -sV -sC -Pn --open -T4 \
    -oN /workspace/assets/nmap_initial.txt \
    -oX /workspace/assets/nmap_initial.xml \
    <TARGET_IP>
  ```

**Observation**:
  ```
  # Paste actual stdout / stderr here — not summarized, not paraphrased
  80/tcp   open  http    Apache httpd 2.4.41
  443/tcp  open  https   nginx 1.18.0
  22/tcp   open  ssh     OpenSSH 8.2p1
  ```

  Output artefacts (relative paths):
  - [`assets/nmap_initial.txt`](assets/nmap_initial.txt)
  - [`assets/nmap_initial.xml`](assets/nmap_initial.xml)

**Decision**: `<What do we do next based on this output? Update hypothesis if applicable.>`

---

### Step 2 — Enumeration

**Goal**: `<Deeper service-specific probe based on Step 1 findings>`

**Reasoning**: `<Why this tool for this service?>`

**Execution**:
  - Sandbox: Exegol (`ghcr.io/exegol/exegol:nightly`)
  - Tool: `<gobuster | ffuf | enum4linux | nikto | ...>`
  - Purpose: `<one-line purpose>`
  - Code used: `No`
  - Payload: `None`

  ```bash
  gobuster dir \
    -u http://<TARGET_IP>/ \
    -w /usr/share/wordlists/dirb/common.txt \
    -o /workspace/assets/gobuster_dirs.txt \
    -t 40 --no-error
  ```

**Observation**:
  ```
  /admin   (Status: 302)
  /login   (Status: 200)
  /api     (Status: 200)
  ```

  Output artefacts: [`assets/gobuster_dirs.txt`](assets/gobuster_dirs.txt)

**Decision**: `<Target /admin and /api for further probing>`

---

### Step 3 — Vulnerability Assessment

**Goal**: `<Identify exploitable vulnerability in discovered surface>`

**Reasoning**: `<Correlation of findings with loaded skill quickchecks>`

**Execution**:
  - Sandbox: Exegol (`ghcr.io/exegol/exegol:nightly`)
  - Tool: `<tool>`
  - Purpose: `<purpose>`
  - Code used: `<Yes or No>`
  - Payload: `<name>` stored at [`assets/<file>`](assets/<file>) | `None`

  ```bash
  # Exact command
  ```

**Observation**:
  ```
  # Exact output
  ```

**Decision**: `<Next action>`

---

### Step 4 — Exploitation

**Goal**: `<Exploit the confirmed vulnerability to gain access / retrieve flag>`

**Reasoning**: `<Why this exploit? What quickcheck or skill guided the choice?>`

**Execution**:
  - Sandbox: Exegol (`ghcr.io/exegol/exegol:nightly`)
  - Tool: `<sqlmap | pwntools | python3 | metasploit | ...>`
  - Purpose: `<exploit purpose>`
  - Code used: `Yes — [`assets/exploit.py`](assets/exploit.py)` ← **required if code is used**
  - Payload: `<payload_name>` stored at [`assets/payload.ext`](assets/payload.ext)
    - Why this payload: `<exact reason based on vuln analysis>`

  ```bash
  python3 /workspace/assets/exploit.py 2>&1 | tee /workspace/assets/exploit_output.txt
  ```

**Observation**:
  ```
  [*] Connecting to target...
  [+] Shell obtained
  id: uid=0(root) gid=0(root)
  ```

  Output artefacts: [`assets/exploit_output.txt`](assets/exploit_output.txt)

**Decision**: `<Capture flag / pivot to post-exploitation>`

---

### Step 5 — Post-Exploitation / Proof

**Goal**: `<Retrieve flag and establish proof of access>`

**Reasoning**: `<Flag capture is the terminal proof-of-concept>`

**Execution**:
  - Sandbox: Exegol (`ghcr.io/exegol/exegol:nightly`)
  - Tool: `cat`
  - Purpose: Read flag file
  - Code used: No
  - Payload: None

  ```bash
  cat /root/root.txt
  cat /home/*/user.txt
  ```

**Observation**:
  ```
  HTB{<x_flag_value>}
  ```

**Decision**: Record flag. Finalize writeup. Run `close_case.py`.

---

## Hypothesis Log

| # | Statement | Status | Pivot Reason |
|---|-----------|--------|--------------|
| 1 | `<hypothesis>` | ✅ Confirmed / ❌ Rejected / 🔄 Open | `<pivot reason if rejected>` |

---

## Flags
- **Flag / Root flag**: `<value>` ← replaced with `<x_flag_value>` in public writeup

## Recovered Credentials (Non-Flag)
- `<username>` : `<secret>` (source: `<brute-force | found in config | ...>`)

---

## Artifacts Manifest

All tool outputs are stored under `assets/` using relative paths.

| File | Purpose |
|------|---------|
| [`assets/timeline.json`](assets/timeline.json) | Agent execution timeline — full command history with stdout/stderr |
| [`assets/nmap_initial.txt`](assets/nmap_initial.txt) | Initial nmap scan |
| [`assets/exploit.py`](assets/exploit.py) | Exploit script |
| `...` | `...` |

---

## Timeline

Machine-readable log at [`assets/timeline.json`](assets/timeline.json).

Contains for every executed command:
- Exact command string
- Tool, phase, purpose
- Payload name and relative path
- Code used (boolean + relative path)
- stdout / stderr (capped at 8 KB)
- Exit code, duration, success flag
- Agent reasoning and hypothesis link

The timeline is consumed by the next `ag_agent` run to prefer proven paths and skip known dead-ends.

---

## Session Feedback Summary
- Successful paths: `<N>`
- Failed paths: `<N>`
- Pivot count: `<N>`

---

## Reusable Improvements
- `[coach_logic]` `<new quickcheck to add>`
- `[automation]` `<new scripts/ctf/lib/ helper>`
- `[documentation]` `<new Tools/ or Concepts/ page>`

---

## Validation Checklist
- [ ] Every command is copy-pasteable as-is (no pseudocode)
- [ ] All file references use **relative** paths (not `/home/user/...`)
- [ ] Every step has Goal, Reasoning, Execution, Observation, Decision
- [ ] Payload names and paths are explicitly stated
- [ ] Code-used is explicitly stated with relative path
- [ ] `assets/timeline.json` exists and is valid JSON
- [ ] `Writeup-public.md` has no real flags, passwords, or hashes
- [ ] Ran: `python3 scripts/audit_git_privacy.py`
- [ ] Ran: `python3 scripts/lint_writeups.py --profile strict --allow-compact`
