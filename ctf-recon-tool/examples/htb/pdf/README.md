# HackTheBox Report Templates — Reference Library

This folder contains reference PDFs and structure documentation for HackTheBox (HTB) certification report templates, suitable for use as inspiration for Helm's Paladin report generation.

---

## Available HTB Report Templates

| Certification | Template Source | Format | Notes |
|---|---|---|---|
| **CPTS** — Certified Penetration Testing Specialist | [SysReptor](https://docs.sysreptor.com/assets/reports/HTB-CPTS-Report.pdf) | PDF | Requires SysReptor account to unlock |
| **CJCA** — Certified Junior Cybersecurity Analyst | [HTB Direct](https://www.hackthebox.com/files/htb-cjca-report.pdf) | PDF | Saved locally: `htb-cjca-report.pdf` |
| **CDSA** — Certified Defensive Security Analyst | [SysReptor](https://docs.sysreptor.com/assets/reports/HTB-CDSA-Report.pdf) | PDF | Requires SysReptor account |
| **CAPE** — Certified Active Directory Pentesting Expert | [SysReptor](https://docs.sysreptor.com/assets/reports/HTB-CAPE-Report.pdf) | PDF | Requires SysReptor account |
| **CWEE** — Certified Web Exploitation Expert | [SysReptor](https://docs.sysreptor.com/assets/reports/HTB-CWEE-Report.pdf) | PDF | Markdown-only template |
| **CWPE** — Certified Web Penetration Testing Expert | [SysReptor](https://docs.sysreptor.com/assets/reports/HTB-CWPE-Report.pdf) | PDF | Requires SysReptor account |
| **CBBH** — Certified Bug Bounty Hunter | [SysReptor](https://docs.sysreptor.com/assets/reports/HTB-CBBH-Report.pdf) | PDF | Requires SysReptor account |
| **Sample Pentest Report** | [HTB Direct](https://www.hackthebox.com/storage/press/samplereport/sample-penetration-testing-report-template.pdf) | PDF (37pp) | Public reference template |

### Additional HTB Resources

| Resource | Link | Purpose |
|---|---|---|
| HTB Guides & Templates page | https://www.hackthebox.com/cybersecurity-resources/guides-and-templates | Index of all templates |
| Real-World Incident Report Template | Google Docs (linked from above) | Incident response format |
| CISO Board Reporting Toolkit | Google Docs (linked from above) | Executive communication |
| 90-Day Incident Recovery Checklist | HTB Hub | Post-incident recovery |
| SOC Analyst Onboarding Program | HTB Hub | 30-60-90 day checklist |

---

## Folder Structure

```
examples/htb/pdf/
├── README.md                        ← This file
├── htb-cjca-report.pdf              ← CJCA reference PDF (password-protected)
├── structures/
│   ├── sample-pentest-structure.md  ← HTB 37-page sample pentest report structure
│   ├── cpts-structure.md            ← CPTS certification report structure
│   ├── cjca-structure.md            ← CJCA certification report structure
│   ├── cdsa-structure.md            ← CDSA certification report structure
│   ├── cape-structure.md            ← CAPE certification report structure
│   ├── cwee-structure.md            ← CWEE certification report structure
│   └── cwpe-structure.md            ← CWPE certification report structure
└── markdown-scaffolds/
    ├── htb-pentest-report.md        ← Full HTB-style pentest report scaffold
    ├── htb-cjca-scaffold.md         ← CJCA-style report scaffold
    └── htb-cpts-scaffold.md         ← CPTS-style report scaffold
```

---

## Note on Password Protection

Most SysReptor templates are password-protected as distributed. To access them:
1. Create a free account at [sysreptor.com](https://www.sysreptor.com/)
2. Import the template via the SysReptor platform
3. Export the unlocked PDF from within SysReptor

The `htb-cjca-report.pdf` in this folder is the password-protected reference copy — use it as a visual reference via SysReptor or HTB Academy.

---

## Using These Templates with Helm's Paladin

The Markdown scaffolds in `markdown-scaffolds/` are designed to be used with Helm's Paladin's PDF export:

1. Copy the desired scaffold (e.g., `htb-pentest-report.md`)
2. Fill in your findings from your session timeline
3. Use the report editor in Helm's Paladin to refine
4. Export as PDF using the `htb-professional` or `professional` PDF theme

**Recommended PDF theme**: `htb-professional` (navy/red HTB color scheme) or `professional` (clean formal layout).

---

## Integration with `$report-coach`

The `$report-coach` skill in Helm's Paladin can use these scaffolds as base templates. Reference the scaffold path when invoking report-coach:

```
$report-coach
Source: examples/htb/pdf/markdown-scaffolds/htb-pentest-report.md
Goal: Pentest engagement report for HTB machine <name>
```
