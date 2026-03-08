# HTB CPTS Report Template — Structure Reference

**Certification**: Certified Penetration Testing Specialist (CPTS)
**Source**: https://docs.sysreptor.com/assets/reports/HTB-CPTS-Report.pdf
**Access**: Requires SysReptor account (password-protected PDF)
**Scope**: Full penetration test of an enterprise environment (external + internal)

---

## Document Overview

The CPTS report is the most comprehensive HTB certification report. It covers a full network penetration test from external perimeter to domain admin, requiring detailed evidence for each phase.

---

## Section Structure

### Cover Page
- "Penetration Test Report"
- Client: [Client Name]
- Prepared by: [Tester Name]
- Date: [Date]
- Version: [Version]
- Classification: CONFIDENTIAL
- HTB Academy / CPTS branding

### Executive Summary
- Assessment Overview (1 paragraph)
- Scope (IP ranges, domains)
- Assessment Timeline
- Risk Summary table (Critical/High/Medium/Low/Info counts)
- Top 3 Critical Findings narrative

### Methodology
- Testing Phases:
  1. External Reconnaissance
  2. External Exploitation
  3. Internal Pivoting
  4. Active Directory Attacks
  5. Post-Exploitation
  6. Reporting
- PTES (Penetration Testing Execution Standard) reference
- Tools and techniques overview

### Attack Chain Summary
- High-level attack path narrative (External foothold → Internal network → Domain Admin)
- Mermaid-style attack path diagram or sequential list

### Findings Summary Table

| ID | Finding Title | Severity | CVSS | Affected Host | Status |
|----|--------------|----------|------|---------------|--------|
| FIND-001 | ... | Critical | 9.8 | ... | Confirmed |

### Detailed Findings

One section per finding with the standard per-finding block:
- Severity badge
- CVSS 3.1 score + vector
- Affected host(s) and service
- Description
- Impact
- Steps to Reproduce (numbered)
- Evidence (command output + screenshots)
- Remediation
- References

### Post-Exploitation Evidence
- User flag + root/Administrator flag captures
- Screenshot of flag reads
- Proof screenshots (hostname + whoami + flag)

### Appendix A — Scope
### Appendix B — Tools Used
### Appendix C — Credentials Discovered
### Appendix D — Remediation Roadmap (prioritized by severity)

---

## Finding Severity Definitions

| Severity | CVSS Range | Description |
|----------|-----------|-------------|
| Critical | 9.0–10.0 | Direct path to full system compromise |
| High | 7.0–8.9 | Significant impact on confidentiality/integrity/availability |
| Medium | 4.0–6.9 | Limited impact or requires user interaction |
| Low | 0.1–3.9 | Minor issue with minimal exploitability |
| Informational | N/A | Configuration observation, no direct security impact |

---

## Key Sections vs Other HTB Reports

| Feature | CPTS | CJCA | CAPE | CDSA |
|---------|------|------|------|------|
| Attack chain diagram | ✓ | ✗ | ✓ | ✗ |
| AD-specific findings | ✓ | ✗ | ✓ | ✗ |
| CVSS scoring | ✓ | ✓ | ✓ | ✓ |
| Remediation roadmap | ✓ | ✗ | ✓ | ✓ |
| SOC/detection focus | ✗ | ✓ | ✗ | ✓ |
| Network pivoting evidence | ✓ | ✗ | ✓ | ✗ |
