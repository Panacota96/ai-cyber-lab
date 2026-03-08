# HTB CWEE Report Template — Structure Reference

**Certification**: Certified Web Exploitation Expert (CWEE)
**Source**: https://docs.sysreptor.com/assets/reports/HTB-CWEE-Report.pdf
**Access**: Requires SysReptor account (password-protected PDF)
**Scope**: Advanced web application penetration testing — server-side vulnerabilities, chained exploits, complex injection attacks

---

## Document Overview

The CWEE report covers a comprehensive web application penetration test with a focus on advanced server-side exploitation. This is a Markdown-only template (no LaTeX) per HTB documentation.

---

## Section Structure

### Cover Page
- "Web Application Penetration Test Report"
- Target application / URL
- Tester / Team
- Engagement dates
- Classification
- CWEE / HTB Academy branding

### Executive Summary
- Application scope and testing approach
- Total findings by severity
- Critical findings highlights (1 sentence per critical)
- Business risk summary

### Application Overview

| Field | Value |
|-------|-------|
| Application Name | ... |
| URL(s) | https://target.example.com |
| Technology Stack | PHP 8.1 / MySQL 8.0 / Apache 2.4 |
| Authentication | Session cookies / JWT / OAuth |
| Testing Approach | Black-box / Authenticated |
| Test Accounts | test@example.com, admin@example.com |

### Findings Summary Table

| ID | Title | Severity | CVSS | CWE | OWASP |
|----|-------|----------|------|-----|-------|
| WEB-001 | SQL Injection in Login Form | Critical | 9.8 | CWE-89 | A03:2021 |
| WEB-002 | Stored XSS in Comments | High | 8.0 | CWE-79 | A03:2021 |
| WEB-003 | IDOR in Profile API | High | 7.5 | CWE-639 | A01:2021 |
| WEB-004 | Missing CSRF Protection | Medium | 6.5 | CWE-352 | A01:2021 |

### Detailed Findings

Standard per-finding block plus web-specific fields:

#### [WEB-XXX] Finding Title

| Field | Value |
|-------|-------|
| **Severity** | Critical / High / Medium / Low / Informational |
| **CVSS Score** | 9.8 |
| **CVSS Vector** | CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H |
| **CWE** | CWE-89: SQL Injection |
| **OWASP Category** | A03:2021 – Injection |
| **URL** | https://target.example.com/login.php |
| **Parameter** | `username` POST parameter |
| **Authentication Required** | No |

**Description**: ...

**Proof of Concept**:
```http
POST /login.php HTTP/1.1
Host: target.example.com

username=admin' OR '1'='1'--&password=anything
```

**Impact**: ...

**Evidence**:
```
[SQL error / data dump output]
```

**Remediation**: Use parameterized queries / prepared statements.

**References**:
- https://owasp.org/www-community/attacks/SQL_Injection
- CWE-89

### Attack Chains (if applicable)

For multi-step exploit chains, document the full kill chain:

```
Step 1: SQL injection in /login → dump credentials
Step 2: Crack admin hash → gain admin session
Step 3: Admin panel file upload → PHP webshell
Step 4: Webshell RCE → system shell
```

### Appendix A — Full Request/Response Logs
### Appendix B — Burp Suite Scan Export
### Appendix C — Tools Used
### Appendix D — Remediation Priority Matrix

---

## Common Web Findings and OWASP Mapping

| Finding | OWASP (2021) | CWE | Severity |
|---------|-------------|-----|----------|
| SQL Injection | A03 Injection | CWE-89 | Critical |
| Stored XSS | A03 Injection | CWE-79 | High |
| IDOR | A01 Broken Access Control | CWE-639 | High |
| Path Traversal / LFI | A01 Broken Access Control | CWE-22 | High |
| SSRF | A10 SSRF | CWE-918 | High |
| XXE | A05 Security Misconfiguration | CWE-611 | High |
| CSRF | A01 Broken Access Control | CWE-352 | Medium |
| Open Redirect | A01 Broken Access Control | CWE-601 | Medium |
| JWT None Algorithm | A02 Crypto Failures | CWE-347 | High |
| Insecure Direct Object Reference | A01 Broken Access Control | CWE-639 | High |
| RCE via Deserialization | A08 Software/Data Integrity | CWE-502 | Critical |
| PHP File Inclusion (RFI/LFI) | A03 Injection | CWE-73 | High |
| Template Injection (SSTI) | A03 Injection | CWE-94 | Critical |
| Command Injection | A03 Injection | CWE-78 | Critical |
