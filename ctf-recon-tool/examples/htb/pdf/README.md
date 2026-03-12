# HackTheBox Report Templates - Reference Library

This folder contains HackTheBox-oriented report references and scaffolds that can be used as structure and styling input for Helm's Watch `v0.4.0` exports.

## Available HTB report templates

| Certification | Template Source | Format | Notes |
| --- | --- | --- | --- |
| **CPTS** - Certified Penetration Testing Specialist | [SysReptor](https://docs.sysreptor.com/assets/reports/HTB-CPTS-Report.pdf) | PDF | Requires SysReptor account to unlock |
| **CJCA** - Certified Junior Cybersecurity Analyst | [HTB Direct](https://www.hackthebox.com/files/htb-cjca-report.pdf) | PDF | Saved locally: `htb-cjca-report.pdf` |
| **CDSA** - Certified Defensive Security Analyst | [SysReptor](https://docs.sysreptor.com/assets/reports/HTB-CDSA-Report.pdf) | PDF | Requires SysReptor account |
| **CAPE** - Certified Active Directory Pentesting Expert | [SysReptor](https://docs.sysreptor.com/assets/reports/HTB-CAPE-Report.pdf) | PDF | Requires SysReptor account |
| **CWEE** - Certified Web Exploitation Expert | [SysReptor](https://docs.sysreptor.com/assets/reports/HTB-CWEE-Report.pdf) | PDF | Markdown-only template |
| **CWPE** - Certified Web Penetration Testing Expert | [SysReptor](https://docs.sysreptor.com/assets/reports/HTB-CWPE-Report.pdf) | PDF | Requires SysReptor account |
| **CBBH** - Certified Bug Bounty Hunter | [SysReptor](https://docs.sysreptor.com/assets/reports/HTB-CBBH-Report.pdf) | PDF | Requires SysReptor account |
| **Sample Pentest Report** | [HTB Direct](https://www.hackthebox.com/storage/press/samplereport/sample-penetration-testing-report-template.pdf) | PDF | Public 37-page reference |

## Additional HTB resources

| Resource | Link | Purpose |
| --- | --- | --- |
| HTB Guides and Templates page | https://www.hackthebox.com/cybersecurity-resources/guides-and-templates | Index of templates |
| Real-World Incident Report Template | Google Docs (linked from above) | Incident response format |
| CISO Board Reporting Toolkit | Google Docs (linked from above) | Executive communication |
| 90-Day Incident Recovery Checklist | HTB Hub | Post-incident recovery |
| SOC Analyst Onboarding Program | HTB Hub | 30-60-90 day checklist |

## Folder structure

```text
examples/htb/pdf/
|- README.md
|- htb-cjca-report.pdf
|- structures/
|  |- sample-pentest-structure.md
|  |- cpts-structure.md
|  |- cjca-structure.md
|  |- cdsa-structure.md
|  |- cape-structure.md
|  |- cwee-structure.md
|  `- cwpe-structure.md
`- markdown-scaffolds/
   |- htb-pentest-report.md
   |- htb-cjca-scaffold.md
   `- htb-cpts-scaffold.md
```

## Note on password protection
Most SysReptor templates are distributed as password-protected files.
1. Create a free account at [sysreptor.com](https://www.sysreptor.com/)
2. Import the template through SysReptor
3. Export the unlocked PDF from the platform

The local `htb-cjca-report.pdf` is a reference copy only.

## Using these references with Helm's Watch
Treat this folder as a style and structure library, not as a second reporting system.

Recommended workflow:
1. Start from a Helm's Watch session and generate a `technical-walkthrough` or `pentest` report.
2. Use the structure files or markdown scaffolds here to compare section ordering, cover-page style, and appendix layout.
3. Refine the report in the app, then export it as Markdown, PDF, HTML, JSON, or DOCX.
4. For HTB-style PDF presentation, use the `htb-professional` or `professional` PDF theme.

Because current exports can include findings, PoC steps, screenshots, and code snippets, these examples are most useful as presentation references rather than one-to-one templates.

## Integration with `$report-coach`
The `$report-coach` workflow can use these scaffold paths as starting references when building synchronized report material.

```text
$report-coach
Source: examples/htb/pdf/markdown-scaffolds/htb-pentest-report.md
Goal: Pentest engagement report for HTB machine <name>
```
