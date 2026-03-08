# HTB CJCA Report Template — Structure Reference

**Certification**: Certified Junior Cybersecurity Analyst (CJCA)
**Source**: https://www.hackthebox.com/files/htb-cjca-report.pdf
**Local copy**: `../htb-cjca-report.pdf` (password-protected)
**Scope**: Incident response and security analysis (SOC/Blue Team focus)

---

## Document Overview

The CJCA report documents a cybersecurity incident analysis engagement. Unlike CPTS (offensive/red team), CJCA focuses on:
- Log analysis and threat hunting
- IOC (Indicator of Compromise) identification
- Timeline reconstruction
- Containment and remediation recommendations

---

## Section Structure

### Cover Page
- "Cybersecurity Analysis Report" / "Incident Response Report"
- Client: [Organization Name]
- Analyst: [Analyst Name]
- Incident Date Range: [Start] – [End]
- Report Date: [Date]
- Version: [Version]
- Classification: CONFIDENTIAL / RESTRICTED
- HTB Academy / CJCA branding

### Executive Summary
- Incident Overview (what happened in 2–3 sentences)
- Scope (affected systems, time range)
- Severity assessment
- Key findings summary
- Immediate actions recommended

### Incident Timeline

| Date/Time | Event | Source | Analyst Note |
|-----------|-------|--------|-------------|
| 2025-01-15 08:32 | Initial access via phishing | Email logs | IOC-001 |
| ... | ... | ... | ... |

### Technical Analysis

#### Initial Access
- Attack vector identification
- Evidence from logs/network captures
- IOC extraction

#### Lateral Movement
- Credential compromise evidence
- Pivoting activity in logs
- Host-to-host connections

#### Persistence Mechanisms
- Registry keys, scheduled tasks, services
- Evidence from forensic artifacts

#### Data Exfiltration (if applicable)
- Volume and type of data accessed
- Destination IPs/domains

### IOC Summary Table

| IOC ID | Type | Value | Confidence | First Seen |
|--------|------|-------|-----------|------------|
| IOC-001 | IP | 192.168.1.100 | High | 2025-01-15 |
| IOC-002 | Domain | malicious.example.com | High | 2025-01-15 |
| IOC-003 | File Hash (SHA256) | a1b2c3d4... | High | 2025-01-15 |
| IOC-004 | Registry Key | HKLM\...\Run | Medium | 2025-01-15 |

### Affected Systems Summary

| Host | IP | OS | User Accounts | Compromise Level |
|------|----|----|---------------|-----------------|
| WS01 | 10.1.1.10 | Windows 10 | jsmith, SYSTEM | Full |

### Findings and Recommendations

One subsection per finding:

#### [FIND-001] Finding Title

| Field | Value |
|-------|-------|
| **Severity** | Critical / High / Medium / Low |
| **CVSS Score** | (if applicable) |
| **Affected System(s)** | ... |
| **Evidence** | Log line / screenshot |

**Description**: ...
**Impact**: ...
**Recommendation**: ...

### Containment and Remediation Roadmap

Priority-ordered list of remediation actions:
1. **Immediate** (0–24h): Password reset, isolate host, block IOCs
2. **Short-term** (1–7 days): Patch vulnerabilities, review configs
3. **Long-term** (1–30 days): Process improvements, security awareness

### Appendix A — Evidence Artifacts
### Appendix B — Full IOC List
### Appendix C — Log Excerpts
### Appendix D — Timeline Detail

---

## Key Differences from Pentest Reports

| Aspect | CJCA (Defensive) | CPTS (Offensive) |
|--------|-----------------|-----------------|
| Primary focus | What happened? | What can be exploited? |
| Evidence type | Logs, memory dumps, network captures | Terminal output, screenshots |
| Timeline | Chronological incident reconstruction | Attack chain narrative |
| Audience | SOC management, CISO | IT/Security team, CTO |
| Remediation | Containment + recovery | Patch + hardening |
| IOC section | ✓ Required | ✗ Not typically present |
