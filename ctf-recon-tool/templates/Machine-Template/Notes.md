---
title: "<Machine Name> - Notes"
parent: "[[Index]]"
platform: "<HTB|THM|RootMe|Other>"
category: "<Web|Linux|Windows|Hybrid>"
difficulty: "<Easy|Medium|Hard|Insane|Unknown>"
date: "<YYYY-MM-DD>"
tags:
  - ctf
  - <platform>
  - machine
  - notes
status: "in_progress"
---

> [!abstract] Navigation
> [[Index]] | [[Enumeration]] | [[Exploitation]] | **Notes** | [[Writeup]] | [[Writeup-public]]

## Session Context
- Victim IP:
- Attacker IP:
- Mode:

## Next Skill
- `$ctf-coach` for guided phase flow.
- `$knowledge-sync` after confirmed completion.

## Attack Surface Diagram
> [!note]
> Update this diagram after each major pivot. Keep only evidence-backed nodes.
> Apply phase colors directly on attack-surface nodes/edges.

```mermaid
flowchart TD
  tgt["Target <IP>"]:::recon
  ssh["22/tcp SSH"]:::recon
  web["80/tcp HTTP"]:::recon
  vhost1["main vhost"]:::enumeration
  vhost2["hidden/admin vhost"]:::enumeration
  vuln["validated vulnerability"]:::assessment
  foothold["initial foothold"]:::exploitation
  data["credential/data access"]:::postex
  pivot["lateral pivot"]:::lateral
  proof["flag/proof path"]:::poc
  close["documentation closure"]:::posteng

  tgt --> ssh
  tgt --> web
  web --> vhost1
  web --> vhost2
  vhost2 --> vuln
  vuln --> foothold
  foothold --> data
  data --> pivot
  pivot --> proof
  proof --> close

  classDef recon fill:#2e7d32,color:#ffffff,stroke:#1b5e20,stroke-width:2px;
  classDef enumeration fill:#81d4fa,color:#0d1b2a,stroke:#29b6f6,stroke-width:2px;
  classDef assessment fill:#fbc02d,color:#1f1f1f,stroke:#f9a825,stroke-width:2px;
  classDef exploitation fill:#ef5350,color:#ffffff,stroke:#c62828,stroke-width:2px;
  classDef postex fill:#fb8c00,color:#ffffff,stroke:#ef6c00,stroke-width:2px;
  classDef lateral fill:#8e24aa,color:#ffffff,stroke:#6a1b9a,stroke-width:2px;
  classDef poc fill:#6d4c41,color:#ffffff,stroke:#4e342e,stroke-width:2px;
  classDef posteng fill:#546e7a,color:#ffffff,stroke:#37474f,stroke-width:2px;
```

> [!warning]
> `Notes.md` is a strict operator log. Record every meaningful step in chronological order, including failed attempts and pivots.

## Timeline (Chronological Log)
- `<YYYY-MM-DD HH:MM>` Phase: `<Pre-Engagement|Information Gathering|Vulnerability Assessment|Exploitation|Post-Exploitation|Lateral Movement|Proof-of-Concept|Post-Engagement>`
  - Action:
  - Command:
    ```bash
    # exact command
    ```
  - Expected:
  - Observed:
  - Screenshot: `screenshots/<YYYYMMDD-HHMM>-<slug>.png`
  - Screenshot evidence note:
  - Decision / Pivot:
  - Improvement Candidate (if any):
  - Impacted Skill/Script:
  - Apply at Close: `<yes|no>`

## Step Log (Do Not Skip Steps)
### Step 1 - Information Gathering ^step-1
| Field | Value |
|---|---|
| Time | `<YYYY-MM-DD HH:MM>` |
| Phase | Information Gathering |
| Action |  |
| Command | `<exact command>` |
| Expected |  |
| Observed |  |
| Screenshot | `screenshots/<YYYYMMDD-HHMM>-<slug>.png` |
| Screenshot Evidence |  |
| Decision |  |
| Improvement Candidate |  |
| Impacted Skill/Script |  |
| Apply at Close | `<yes|no>` |

### Step 2 - Vulnerability Assessment ^step-2
| Field | Value |
|---|---|
| Time | `<YYYY-MM-DD HH:MM>` |
| Phase | Vulnerability Assessment |
| Action |  |
| Command | `<exact command>` |
| Expected |  |
| Observed |  |
| Screenshot | `screenshots/<YYYYMMDD-HHMM>-<slug>.png` |
| Screenshot Evidence |  |
| Decision |  |
| Improvement Candidate |  |
| Impacted Skill/Script |  |
| Apply at Close | `<yes|no>` |

### Step 3 - Exploitation ^step-3
| Field | Value |
|---|---|
| Time | `<YYYY-MM-DD HH:MM>` |
| Phase | Exploitation |
| Action |  |
| Command | `<exact command>` |
| Expected |  |
| Observed |  |
| Screenshot | `screenshots/<YYYYMMDD-HHMM>-<slug>.png` |
| Screenshot Evidence |  |
| Decision |  |
| Improvement Candidate |  |
| Impacted Skill/Script |  |
| Apply at Close | `<yes|no>` |

### Step 4 - Post-Exploitation ^step-4
| Field | Value |
|---|---|
| Time | `<YYYY-MM-DD HH:MM>` |
| Phase | Post-Exploitation |
| Action |  |
| Command | `<exact command>` |
| Expected |  |
| Observed |  |
| Screenshot | `screenshots/<YYYYMMDD-HHMM>-<slug>.png` |
| Screenshot Evidence |  |
| Decision |  |
| Improvement Candidate |  |
| Impacted Skill/Script |  |
| Apply at Close | `<yes|no>` |

### Step 5 - Lateral Movement ^step-5
| Field | Value |
|---|---|
| Time | `<YYYY-MM-DD HH:MM>` |
| Phase | Lateral Movement |
| Action |  |
| Command | `<exact command>` |
| Expected |  |
| Observed |  |
| Screenshot | `screenshots/<YYYYMMDD-HHMM>-<slug>.png` |
| Screenshot Evidence |  |
| Decision |  |
| Improvement Candidate |  |
| Impacted Skill/Script |  |
| Apply at Close | `<yes|no>` |

### Step 6 - Proof-of-Concept ^step-6
| Field | Value |
|---|---|
| Time | `<YYYY-MM-DD HH:MM>` |
| Phase | Proof-of-Concept |
| Action |  |
| Command | `<exact command>` |
| Expected |  |
| Observed |  |
| Screenshot | `screenshots/<YYYYMMDD-HHMM>-<slug>.png` |
| Screenshot Evidence |  |
| Decision |  |
| Improvement Candidate |  |
| Impacted Skill/Script |  |
| Apply at Close | `<yes|no>` |

## Decision Quality Log (Hypotheses & Signals)
| Hypothesis | Evidence/Source | Expected Signal | Result | Pivot? |
|---|---|---|---|---|
| | | | | |

## Dead Ends / Rabbit Holes
- 

## Evidence Captured
- 

## Local Artifacts Created (Manifest)
| Artifact | Source/Transformation | Purpose | SHA256 (first 12) |
|---|---|---|---|
| `artifacts/` | | | |

> Generate with: `sha256sum <file> | cut -c1-12`

## Tools Used
- [[Tools/Recon/Nmap|Nmap]]
- [[Tools/General-Utilities/Curl|cURL]]
