---
report_type: pentest-full
template: htb-professional
certification: CPTS
version: "1.0"
classification: CONFIDENTIAL
---

# Penetration Test Report: {{engagement_name}}

---

| Field | Value |
|-------|-------|
| **Client** | {{client_name}} |
| **Tester** | {{tester_name}} |
| **Assessment Period** | {{start_date}} – {{end_date}} |
| **Report Date** | {{report_date}} |
| **Version** | {{report_version}} |
| **Classification** | CONFIDENTIAL |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Methodology](#2-methodology)
3. [Attack Chain Summary](#3-attack-chain-summary)
4. [Findings Summary](#4-findings-summary)
5. [Detailed Findings](#5-detailed-findings)
6. [Post-Exploitation Evidence](#6-post-exploitation-evidence)
7. [Appendix A — Scope](#appendix-a--scope)
8. [Appendix B — Tools Used](#appendix-b--tools-used)
9. [Appendix C — Credentials Discovered](#appendix-c--credentials-discovered)
10. [Appendix D — Remediation Roadmap](#appendix-d--remediation-roadmap)

---

## 1. Executive Summary

### 1.1 Assessment Overview

{{executive_overview}}

### 1.2 Scope

| Field | Value |
|-------|-------|
| **External IPs / Domains** | {{external_scope}} |
| **Internal Network** | {{internal_scope}} |
| **Active Directory Domain** | {{ad_domain}} |
| **Testing Type** | Gray-box / Black-box |
| **Engagement Period** | {{start_date}} – {{end_date}} |

### 1.3 Risk Summary

| Severity | Count |
|----------|-------|
| 🔴 Critical | {{count_critical}} |
| 🟠 High | {{count_high}} |
| 🟡 Medium | {{count_medium}} |
| 🔵 Low | {{count_low}} |
| ⚪ Informational | {{count_info}} |

### 1.4 Critical Path Narrative

{{critical_path_narrative}}

---

## 2. Methodology

### 2.1 Testing Phases

| Phase | Description | Duration |
|-------|-------------|----------|
| 1. External Reconnaissance | OSINT, DNS, web footprinting | {{phase_1_duration}} |
| 2. External Exploitation | Exploit external attack surface → initial foothold | {{phase_2_duration}} |
| 3. Internal Pivoting | Move from DMZ/external foothold to internal network | {{phase_3_duration}} |
| 4. Active Directory Attacks | Enumerate + attack AD for DA escalation | {{phase_4_duration}} |
| 5. Post-Exploitation | Data collection, persistence, flag capture | {{phase_5_duration}} |

### 2.2 Standards Referenced
- PTES (Penetration Testing Execution Standard)
- OWASP Testing Guide v4.2
- MITRE ATT&CK Framework

---

## 3. Attack Chain Summary

### 3.1 Attack Path Overview

```
[External Foothold]
    ↓ (via: {{initial_access_technique}})
[{{foothold_host}}] — {{foothold_user}}
    ↓ (via: {{lateral_technique_1}})
[{{pivot_host_1}}] — {{pivot_user_1}}
    ↓ (via: {{escalation_technique}})
[Domain Admin] — {{da_user}}@{{ad_domain}}
```

### 3.2 Key Milestones

| Milestone | Technique | Time to Achieve |
|-----------|-----------|----------------|
| External foothold | {{initial_technique}} | {{initial_time}} |
| Internal network access | {{pivot_technique}} | {{pivot_time}} |
| Local admin on DC | {{local_admin_technique}} | {{local_admin_time}} |
| Domain Admin | {{da_technique}} | {{da_time}} |

---

## 4. Findings Summary

| ID | Title | Severity | CVSS | Phase | Affected Host |
|----|-------|----------|------|-------|---------------|
| FIND-001 | {{f1_title}} | 🔴 Critical | {{f1_cvss}} | {{f1_phase}} | {{f1_host}} |
| FIND-002 | {{f2_title}} | 🟠 High | {{f2_cvss}} | {{f2_phase}} | {{f2_host}} |
| FIND-003 | {{f3_title}} | 🟠 High | {{f3_cvss}} | {{f3_phase}} | {{f3_host}} |
| FIND-004 | {{f4_title}} | 🟡 Medium | {{f4_cvss}} | {{f4_phase}} | {{f4_host}} |
| FIND-005 | {{f5_title}} | 🔵 Low | {{f5_cvss}} | {{f5_phase}} | {{f5_host}} |

---

## 5. Detailed Findings

---

### [FIND-001] {{f1_title}}

| Field | Value |
|-------|-------|
| **Severity** | 🔴 Critical |
| **CVSS Score** | {{f1_cvss}} |
| **CVSS Vector** | {{f1_cvss_vector}} |
| **Affected Host(s)** | {{f1_host}} |
| **Affected Service** | {{f1_service}} |
| **Phase** | {{f1_phase}} |
| **MITRE ATT&CK** | {{f1_mitre}} |
| **Status** | Confirmed |

**Description**: {{f1_description}}

**Impact**: {{f1_impact}}

**Steps to Reproduce**:
1. {{f1_step_1}}
2. {{f1_step_2}}
3. {{f1_step_3}}

**Evidence**:
```bash
{{f1_command}}
```
```
{{f1_output}}
```

![{{f1_screenshot_alt}}]({{f1_screenshot_path}})

**Remediation**: {{f1_remediation}}

**References**: {{f1_references}}

---

<!-- Repeat FIND-XXX block for each finding -->

---

## 6. Post-Exploitation Evidence

### 6.1 User Flag

```
{{user_flag_hostname}}
{{user_flag_whoami}}
{{user_flag_value}}
```

![User flag proof]({{user_flag_screenshot}})

### 6.2 Root / Administrator Flag

```
{{root_flag_hostname}}
{{root_flag_whoami}}
{{root_flag_value}}
```

![Root flag proof]({{root_flag_screenshot}})

### 6.3 Domain Admin Evidence (if applicable)

```
{{da_hostname}}
{{da_whoami_groups}}
```

![Domain admin proof]({{da_screenshot}})

---

## Appendix A — Scope

### External Scope

| Asset | Type | Notes |
|-------|------|-------|
| {{ext_asset_1}} | IP / Domain / CIDR | {{ext_notes_1}} |

### Internal Scope

| Asset | Type | Notes |
|-------|------|-------|
| {{int_asset_1}} | IP / CIDR | {{int_notes_1}} |

---

## Appendix B — Tools Used

| Tool | Version | Phase | Purpose |
|------|---------|-------|---------|
| Nmap | {{nmap_ver}} | Recon | Port scanning |
| Gobuster | {{gobuster_ver}} | Enum | Directory brute-force |
| Burp Suite | {{burp_ver}} | Web | Web testing |
| BloodHound | {{bh_ver}} | AD | Attack path analysis |
| Impacket | {{imp_ver}} | AD | Kerberos attacks, credential extraction |
| CrackMapExec | {{cme_ver}} | AD | SMB enumeration, PTH |
| Hashcat | {{hc_ver}} | Cracking | Password cracking |

---

## Appendix C — Credentials Discovered

> **CONFIDENTIAL — Authorized recipient eyes only**

| Service | Username | Credential / Hash | Source | Used For |
|---------|----------|-------------------|--------|---------|
| {{cred_service}} | {{cred_user}} | {{cred_value}} | {{cred_source}} | {{cred_use}} |

---

## Appendix D — Remediation Roadmap

### Priority 1 — Immediate (0–7 days)

| Finding | Action | Owner |
|---------|--------|-------|
| FIND-001 | {{f1_remediation_short}} | {{f1_owner}} |
| FIND-002 | {{f2_remediation_short}} | {{f2_owner}} |

### Priority 2 — Short-term (7–30 days)

| Finding | Action | Owner |
|---------|--------|-------|
| FIND-003 | {{f3_remediation_short}} | {{f3_owner}} |

### Priority 3 — Long-term (30–90 days)

| Finding | Action | Owner |
|---------|--------|-------|
| FIND-004 | {{f4_remediation_short}} | {{f4_owner}} |
| FIND-005 | {{f5_remediation_short}} | {{f5_owner}} |

---

*Report generated by Helm's Paladin CTF Assistant — {{report_date}}*
