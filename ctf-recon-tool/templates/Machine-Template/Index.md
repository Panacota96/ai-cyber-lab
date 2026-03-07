---
title: "<Machine Name>"
platform: "<htb|thm|root-me|other>"
difficulty: "<Easy|Medium|Hard|Insane|Unknown>"
os: "<linux|windows|hybrid>"
status: "in_progress"
date_started: "<YYYY-MM-DD>"
date_completed: "<YYYY-MM-DD|N/A>"
tags:
  - machine
  - <platform>
  - <os>
flags:
  user: false
  root: false
---

> [!abstract] Navigation
> **Index** | [[Enumeration]] | [[Exploitation]] | [[Notes]] | [[Writeup]] | [[Writeup-public]]

# <Machine Name>

> [!summary]
> One-line synopsis of the attack chain.

## Platform Answer Confirmation (If Applicable)
- Platform answer tracking enabled: `<yes|no>`
- Confirmed on host/IP: `<target ip>`
- Validation date: `<YYYY-MM-DD>`
- Note: Use this section for THM sequential questions and for HTB machine answer tracking (for example `user` and `root` flags) when the user wants explicit submission-value documentation.
- Single-flag target note (optional): remove `Q2+` entries and mark non-applicable stats/flags as `N/A`.

### Q1. <platform question or canonical label>
Answer: `<answer>`

### Q2. <platform question or canonical label>
Answer: `<answer>`

## Files
| Document | Purpose |
|---|---|
| [[Enumeration]] | Recon and service mapping |
| [[Exploitation]] | Attack chain execution |
| [[Notes]] | Raw operator log |
| [[Writeup]] | Full internal writeup |
| [[Writeup-public]] | Reproducible public writeup |

## Quick Stats
- Time to user:
- Time to root: `<N/A for single-flag targets>`
- Key CVE:
- Kill chain:

## Next Skill
- If this is a fresh target: run `$new-machine` then `$ctf-coach`.
- For recon planning: run `$enum-target`.
- For report generation: run `$report-coach` after findings exist.

## Tags
`#machine` `#linux` `#web` `#privesc`

## Dataview
```dataview
TABLE platform, difficulty, status, date_completed
FROM #machine
SORT date_completed DESC
```
