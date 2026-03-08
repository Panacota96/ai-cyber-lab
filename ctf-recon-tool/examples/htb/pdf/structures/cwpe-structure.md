# HTB CWPE Report Template — Structure Reference

**Certification**: Certified Web Penetration Testing Expert (CWPE)
**Source**: https://docs.sysreptor.com/assets/reports/HTB-CWPE-Report.pdf
**Access**: Requires SysReptor account (password-protected PDF)
**Scope**: Web penetration testing focusing on both client-side and server-side vulnerabilities, business logic, and authentication flaws

---

## Document Overview

The CWPE report is similar to CWEE but covers a broader web application testing scope. It includes both client-side (XSS, CSRF, clickjacking) and server-side vulnerabilities, authentication bypass, and business logic flaws.

---

## Section Structure

### Cover Page
- "Web Penetration Test Report"
- Application name + URL
- Tester / Team
- Engagement dates
- Classification
- CWPE / HTB Academy branding

### Executive Summary
- Application scope (number of endpoints tested, authentication tiers)
- Total findings by severity
- Most critical attack paths
- Business impact summary

### Application Architecture Overview

| Component | Technology |
|-----------|-----------|
| Frontend | React / Angular / Vue / Plain HTML |
| Backend | Node.js / PHP / Python / Java |
| Database | MySQL / PostgreSQL / MongoDB |
| Authentication | Session-based / JWT / OAuth2 / SAML |
| Hosting | On-prem / AWS / Azure / GCP |
| WAF | Cloudflare / ModSecurity / None |

### Attack Surface Map

List all tested endpoints / functions:
- Public pages
- Authenticated endpoints
- Admin interfaces
- API endpoints
- File upload handlers
- Authentication flows (login, registration, password reset, 2FA)

### Findings Summary Table

| ID | Title | Severity | CVSS | CWE | OWASP | Endpoint |
|----|-------|----------|------|-----|-------|---------|
| WEB-001 | Auth Bypass via JWT None | Critical | 9.8 | CWE-287 | A07 | /api/auth |
| WEB-002 | Business Logic — Price Manipulation | High | 7.5 | CWE-840 | A04 | /checkout |
| WEB-003 | Reflected XSS in Search | Medium | 6.1 | CWE-79 | A03 | /search |

### Detailed Findings

Same structure as CWEE, plus:
- **Business Logic Flaws**: special sub-section for logic-based vulnerabilities
- **Authentication Flow Testing**: document each auth endpoint tested
- **Race Condition PoCs**: for timing-based issues

### Business Logic Findings Section

For logic-based vulnerabilities that don't map cleanly to standard CVEs:

#### [BIZ-XXX] Business Logic Vulnerability Title

**Scenario**: [Brief description of the legitimate business flow]
**Vulnerability**: [What can be abused and how]
**Impact**: [Financial/data/operational impact]
**Steps to Reproduce**: [Exact steps]
**Evidence**: [Screenshots/requests]
**Remediation**: [Server-side validation recommendations]

### Authentication and Session Management

Document findings specific to auth flows:
- Password policy weaknesses
- Account enumeration (timing / error messages)
- Password reset flaws (token reuse, predictable tokens)
- 2FA bypass vectors
- Session fixation / hijacking
- JWT implementation flaws

### Appendix A — Full Burp Suite Requests
### Appendix B — JS/Client-Side Code Review Notes
### Appendix C — Tools Used
### Appendix D — OWASP Top 10 Coverage Matrix

---

## OWASP Top 10 Coverage Matrix

| OWASP Category | Tested | Findings |
|---------------|--------|---------|
| A01 Broken Access Control | ✓ | WEB-003, WEB-004 |
| A02 Cryptographic Failures | ✓ | WEB-001 |
| A03 Injection | ✓ | WEB-002 |
| A04 Insecure Design | ✓ | BIZ-001 |
| A05 Security Misconfiguration | ✓ | — |
| A06 Vulnerable Components | ✓ | — |
| A07 Auth Failures | ✓ | WEB-001 |
| A08 Software/Data Integrity | ✓ | — |
| A09 Security Logging Failures | ✓ | — |
| A10 SSRF | ✓ | — |
