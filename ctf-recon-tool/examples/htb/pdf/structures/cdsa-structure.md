# HTB CDSA Report Template — Structure Reference

**Certification**: Certified Defensive Security Analyst (CDSA)
**Source**: https://docs.sysreptor.com/assets/reports/HTB-CDSA-Report.pdf
**Access**: Requires SysReptor account (password-protected PDF)
**Scope**: Security operations, SIEM analysis, threat hunting, and detection engineering

---

## Document Overview

The CDSA report documents a defensive security analysis engagement. It covers SOC analyst work including alert triage, SIEM query writing, detection rule creation, and threat hunting activities.

---

## Section Structure

### Cover Page
- "Security Analysis Report"
- Analyst / Team name
- Period of analysis
- Classification
- CDSA / HTB Academy branding

### Executive Summary
- Analysis scope and period
- Number of alerts triaged
- True positives vs. false positives
- Critical threats identified
- Recommendations summary

### Environment Overview
- SIEM platform (Splunk / ELK / Microsoft Sentinel)
- Log sources ingested
- Coverage gaps identified

### Alert Analysis

#### Alert Triage Summary Table

| Alert ID | Rule Name | Severity | Status | Analyst Notes |
|----------|-----------|----------|--------|---------------|
| ALT-001 | Suspicious Powershell | High | True Positive | ... |
| ALT-002 | Mass Auth Failure | Medium | False Positive | ... |

#### True Positive Analysis
For each confirmed threat — one subsection:

##### [ALT-XXX] Alert Title

- **Rule/Detection**: Rule name or SIEM query
- **Evidence**: Raw log lines, screenshots
- **MITRE ATT&CK Mapping**:
  - Tactic: [e.g., TA0001 Initial Access]
  - Technique: [e.g., T1566.001 Phishing: Spearphishing Attachment]
- **Impact Assessment**
- **Remediation Action Taken**

### Threat Hunting Report

#### Hypothesis
"We believe adversary X may have used technique Y based on Z."

#### Hunt Methodology
- Data sources queried
- SIEM queries used (SPL/KQL/EQL)

#### Findings
- Evidence discovered or absence of evidence
- Conclusion

### Detection Engineering

New or improved detection rules created during the engagement:

```
Rule Name: Suspicious Encoded PowerShell
Platform: Splunk
SPL: index=windows EventCode=4688 CommandLine="*-EncodedCommand*" | ...
MITRE: T1059.001
Severity: High
FP Rate: Low
```

### Remediation Roadmap

| Priority | Finding | Action | Owner | Target Date |
|----------|---------|--------|-------|-------------|
| 1 | ... | ... | SOC Team | ... |

### Appendix A — SIEM Queries
### Appendix B — MITRE ATT&CK Navigator Export
### Appendix C — False Positive Tuning Recommendations
### Appendix D — Detection Rule Backlog

---

## MITRE ATT&CK Integration

CDSA reports frequently reference the MITRE ATT&CK framework. Key fields:

| Field | Example |
|-------|---------|
| Tactic | TA0001 — Initial Access |
| Technique | T1566.001 — Phishing: Spearphishing Attachment |
| Sub-technique | T1059.001 — Command and Scripting Interpreter: PowerShell |
| Mitigation | M1049 — Antivirus/Antimalware |
| Detection | DS0015 — Application Log |
