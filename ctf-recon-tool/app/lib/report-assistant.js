import {
  cvssSeverityLabel,
  enrichFindings,
  filterFindings,
  normalizeReportFilters,
} from './finding-intelligence';

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

function findingMatches(text, patterns) {
  const haystack = String(text || '').toLowerCase();
  return patterns.some((pattern) => haystack.includes(pattern));
}

export function buildExecutiveSummaryFallback({
  session,
  timeline = [],
  findings = [],
  reportFilters = {},
} = {}) {
  const normalizedFilters = normalizeReportFilters(reportFilters);
  const enrichedFindings = enrichFindings(Array.isArray(findings) ? findings : []);
  const scopedFindings = filterFindings(enrichedFindings, normalizedFilters)
    .slice()
    .sort((left, right) => (
      (SEVERITY_ORDER[left.severity] ?? 99) - (SEVERITY_ORDER[right.severity] ?? 99)
      || Number(right.riskScore || 0) - Number(left.riskScore || 0)
    ));
  const commands = (Array.isArray(timeline) ? timeline : []).filter((event) => event?.type === 'command');
  const successfulCommands = commands.filter((event) => ['success', 'completed'].includes(String(event?.status || '').toLowerCase()));
  const totalTargets = Array.isArray(session?.targets) && session.targets.length > 0
    ? session.targets.length
    : (session?.target ? 1 : 0);
  const severityCounts = scopedFindings.reduce((acc, finding) => {
    const key = String(finding?.severity || 'medium').toLowerCase();
    if (!acc[key]) acc[key] = 0;
    acc[key] += 1;
    return acc;
  }, { critical: 0, high: 0, medium: 0, low: 0 });
  const topFindings = scopedFindings.slice(0, 3);

  let md = '## Executive Summary\n\n';
  if (scopedFindings.length === 0) {
    md += `The assessment of **${session?.name || 'this session'}** executed ${commands.length} command(s) across ${totalTargets || 0} target(s), but the current report scope does not include any persisted findings. The session still captured operator evidence and can be used to document testing coverage, identified attack surface, and recommended next steps.\n\n`;
    return md;
  }

  const highestSeverity = severityCounts.critical > 0
    ? 'critical'
    : severityCounts.high > 0
      ? 'high'
      : severityCounts.medium > 0
        ? 'medium'
        : 'low';

  md += `The assessment of **${session?.name || 'this session'}** identified **${scopedFindings.length} in-scope finding(s)** across ${totalTargets || 1} target(s), with overall exposure driven by **${highestSeverity.toUpperCase()}-severity** issues. Operators executed ${commands.length} command(s), ${successfulCommands.length} of which completed successfully, producing the evidence used to support the current report scope.\n\n`;

  if (severityCounts.critical > 0 || severityCounts.high > 0) {
    md += `The highest-priority items require prompt remediation because they provide direct paths to compromise, credential abuse, or materially expanded attacker reach. Specifically, the current scope contains ${severityCounts.critical} critical and ${severityCounts.high} high findings, which should drive patching, access-control hardening, and exposure reduction before lower-priority weaknesses are addressed.\n\n`;
  } else {
    md += 'No critical or high findings are currently in scope, but the identified weaknesses still increase attacker visibility, lower the cost of exploitation, or weaken the defensive posture enough to warrant remediation as part of the next hardening cycle.\n\n';
  }

  if (topFindings.length > 0) {
    md += '### Priority Themes\n\n';
    topFindings.forEach((finding) => {
      const cvss = finding.cvssScore === null || finding.cvssScore === undefined
        ? ''
        : ` · CVSS ${Number(finding.cvssScore).toFixed(1)} (${cvssSeverityLabel(finding.cvssScore)})`;
      md += `- **${finding.title}** · ${String(finding.severity || 'medium').toUpperCase()} severity · ${String(finding.riskLevel || 'medium').toUpperCase()} risk${cvss}\n`;
    });
    md += '\n';
  }

  return md;
}

export function buildRemediationSuggestionFallback(finding = {}) {
  const title = String(finding?.title || '').trim();
  const severity = String(finding?.severity || 'medium').toLowerCase();
  const tags = Array.isArray(finding?.tags) ? finding.tags.map((tag) => String(tag || '').toLowerCase()) : [];
  const attackTechniques = Array.isArray(finding?.attackTechniqueIds)
    ? finding.attackTechniqueIds.map((id) => String(id || '').toLowerCase())
    : [];
  const text = [title, finding?.description, finding?.impact, tags.join(' '), attackTechniques.join(' ')].join(' ').toLowerCase();
  const priority = severity === 'critical' ? 'immediate'
    : severity === 'high' ? 'high'
      : severity === 'medium' ? 'medium'
        : 'low';

  let remediation = 'Patch or reconfigure the affected service, limit unnecessary exposure, validate access controls on the server side, and add monitoring to detect recurrence.';
  let rationale = 'The finding indicates a weakness that should be addressed by reducing exposure, correcting the vulnerable behavior, and improving detection coverage.';

  if (findingMatches(text, ['xss', 'cross-site scripting'])) {
    remediation = 'Apply contextual output encoding, server-side input validation, and a restrictive Content Security Policy. Remove unsafe HTML sinks or template rendering paths that allow attacker-controlled script execution.';
    rationale = 'XSS findings are best mitigated by eliminating the browser execution path for untrusted input rather than relying on filters alone.';
  } else if (findingMatches(text, ['sqli', 'sql injection', 'database injection', 't1190'])) {
    remediation = 'Replace dynamic query construction with parameterized statements, restrict database privileges to the minimum required, and add query-level validation around attacker-controlled inputs.';
    rationale = 'Injection weaknesses persist until the application stops concatenating untrusted data into interpreter or database contexts.';
  } else if (findingMatches(text, ['idor', 'access control', 'authorization', 't1078'])) {
    remediation = 'Enforce object-level authorization checks on the server for every sensitive action, remove trust in client-supplied identifiers, and add access-control regression tests for direct object references.';
    rationale = 'Authorization defects are fixed by centralizing and enforcing access decisions server-side for each resource request.';
  } else if (findingMatches(text, ['credential', 'password', 'hash', 'secret', 'token'])) {
    remediation = 'Rotate exposed credentials or secrets, remove embedded copies from code and configuration, enforce stronger authentication controls, and monitor for reuse across related services.';
    rationale = 'Credential and secret exposure creates ongoing compromise risk until the material is rotated and its storage or reuse pattern is corrected.';
  } else if (findingMatches(text, ['smb', 'share', 'ldap', 'active-directory', 'windows'])) {
    remediation = 'Restrict exposed administrative services, disable anonymous or weak access paths, rotate impacted accounts, and enforce least privilege plus network segmentation for Windows-facing services.';
    rationale = 'Network-service findings on Windows infrastructure typically expand attacker reach and should be contained by reducing exposure and credential privilege.';
  } else if (findingMatches(text, ['rce', 'command injection', 'code execution', 'ssti'])) {
    remediation = 'Remove attacker control over command or template execution paths, replace shell invocation with safe library calls, enforce allowlists on user-controlled parameters, and isolate the service with least privilege.';
    rationale = 'Code-execution weaknesses must be removed at the execution boundary; filtering alone is not reliable.';
  } else if (findingMatches(text, ['ssrf', 'lfi', 'rfi', 'file upload', 'path traversal'])) {
    remediation = 'Constrain filesystem and network access to approved paths or destinations, validate uploaded content by type and storage location, and block user control over internal resource requests.';
    rationale = 'File and request-routing flaws are mitigated by strict allowlists and isolation of the underlying resource access path.';
  } else if (findingMatches(text, ['http', 'web', 'admin panel', 'exposed service'])) {
    remediation = 'Reduce internet exposure for the affected web surface, require strong authentication, patch the underlying framework or plugin stack, and monitor the endpoint for abnormal access patterns.';
    rationale = 'Public-facing application weaknesses are most effectively reduced by limiting exposure and hardening authentication and patch posture.';
  }

  return {
    findingId: finding?.id ?? null,
    title,
    remediation,
    rationale,
    priority,
    source: 'fallback',
  };
}

export function buildRemediationSuggestionsFallback(findings = []) {
  return (Array.isArray(findings) ? findings : [])
    .filter((finding) => finding?.title)
    .map((finding) => buildRemediationSuggestionFallback(finding));
}
