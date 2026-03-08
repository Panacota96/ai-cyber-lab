# HTB CAPE Report Template — Structure Reference

**Certification**: Certified Active Directory Pentesting Expert (CAPE)
**Source**: https://docs.sysreptor.com/assets/reports/HTB-CAPE-Report.pdf
**Access**: Requires SysReptor account (password-protected PDF)
**Scope**: Active Directory penetration testing — Kerberos attacks, LDAP exploitation, domain compromise

---

## Document Overview

The CAPE report documents a focused Active Directory (AD) penetration test. It emphasizes:
- AD enumeration (BloodHound, LDAP queries)
- Kerberos attack chains (ASREPRoasting, Kerberoasting, Golden/Silver Ticket, Pass-the-Hash)
- Domain privilege escalation paths
- Lateral movement across the domain

---

## Section Structure

### Cover Page
- "Active Directory Penetration Test Report"
- Domain: [domain.local]
- Tester / Team
- Engagement dates
- Classification
- CAPE / HTB Academy branding

### Executive Summary
- Domain compromise summary
- Scope (domain name, DC IPs, number of hosts)
- Attack chain summary (2–3 sentences: "Starting from an unprivileged domain account, the tester escalated to Domain Admin within X hours by exploiting Y and Z.")
- Risk Summary table

### AD Environment Overview

| Component | Value |
|-----------|-------|
| Domain Name | corp.local |
| Domain Controller(s) | DC01 (10.1.1.1), DC02 (10.1.1.2) |
| Forest / Tree | corp.local |
| Functional Level | Windows Server 2019 |
| Total Users | ~500 |
| Total Computers | ~200 |
| Privileged Groups | Domain Admins (5), Enterprise Admins (2) |

### Attack Chain

Narrative + diagram showing the path from initial access to Domain Admin:

```
Initial Access (low-priv user jsmith)
  → ASREPRoast svcBackup account
  → Crack hash → password reuse → WinRM as svcBackup
  → BloodHound: svcBackup member of Backup Operators
  → DCSync via ntdsutil / impacket-secretsdump
  → DA hash → Pass-the-Hash → Domain Admin
```

### Findings Summary Table

| ID | Finding | Severity | CVSS | Technique |
|----|---------|----------|------|-----------|
| AD-001 | ASREPRoastable Account | High | 7.5 | T1558.004 |
| AD-002 | Kerberoastable Service Account | High | 7.5 | T1558.003 |
| AD-003 | Weak Domain Password Policy | Medium | 5.3 | T1110 |
| AD-004 | DCSync Rights — Non-Admin User | Critical | 9.1 | T1003.006 |

### Detailed Findings

Standard per-finding block (same as CPTS), plus:
- **AD Specific**: BloodHound screenshot showing the privilege path
- **MITRE ATT&CK mapping** for each finding
- **BloodHound query** used to discover the vector

### Post-Exploitation Evidence

- Domain Admin proof (hostname + whoami /groups + DA flag)
- NTDS.dit extraction evidence
- krbtgt hash (for Golden Ticket PoC, if in scope)
- All domain user hashes summary (count only, not full dump in public report)

### Remediation Roadmap

Priority-ordered AD hardening recommendations:
1. Enforce Pre-Authentication on all accounts (fix ASREPRoast)
2. Enforce strong passwords on service accounts (fix Kerberoast)
3. Audit DCSync rights (remove from non-DC computers/non-admin accounts)
4. Enable Protected Users security group for privileged accounts
5. Implement LAPS for local admin passwords
6. Enable Credential Guard
7. Audit BloodHound attack paths quarterly

### Appendix A — BloodHound Export (JSON)
### Appendix B — Tools Used
### Appendix C — AD User/Group Inventory (sensitive — client only)
### Appendix D — MITRE ATT&CK Matrix Coverage

---

## Common AD Findings and Severity

| Finding | Severity | MITRE Technique |
|---------|----------|----------------|
| ASREPRoasting | High | T1558.004 |
| Kerberoasting | High | T1558.003 |
| Pass-the-Hash | High | T1550.002 |
| DCSync | Critical | T1003.006 |
| Golden Ticket | Critical | T1558.001 |
| Silver Ticket | High | T1558.002 |
| PrintNightmare | Critical | CVE-2021-1675 |
| ZeroLogon | Critical | CVE-2020-1472 |
| Unconstrained Delegation | Critical | T1558 |
| Constrained Delegation Abuse | High | T1558 |
| RBCD Attack | High | T1558 |
| LAPS Not Deployed | Medium | T1552.001 |
| Weak Password Policy | Medium | T1110 |
| AdminSDHolder Misconfiguration | High | T1098 |
