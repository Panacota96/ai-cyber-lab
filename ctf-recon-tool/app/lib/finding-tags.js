export const FINDING_TAG_VOCABULARY = [
  'web',
  'network',
  'auth',
  'injection',
  'xss',
  'sqli',
  'idor',
  'rce',
  'file-upload',
  'lfi-rfi',
  'ssrf',
  'csrf',
  'config',
  'crypto',
  'secrets',
  'windows',
  'linux',
  'active-directory',
  'privilege-escalation',
  'lateral-movement',
  'post-exploitation',
];

const RULES = [
  { tag: 'web', patterns: [/http/i, /web/i, /browser/i, /endpoint/i, /panel/i] },
  { tag: 'network', patterns: [/port/i, /service/i, /socket/i, /dns/i, /nmap/i, /smb/i, /ldap/i, /ssh/i] },
  { tag: 'auth', patterns: [/auth/i, /login/i, /credential/i, /password/i, /session/i, /token/i, /jwt/i] },
  { tag: 'injection', patterns: [/inject/i, /payload/i, /command injection/i, /sql injection/i] },
  { tag: 'xss', patterns: [/xss/i, /cross-site scripting/i] },
  { tag: 'sqli', patterns: [/sqli/i, /sql injection/i, /database error/i, /union select/i] },
  { tag: 'idor', patterns: [/idor/i, /insecure direct object/i, /object reference/i] },
  { tag: 'rce', patterns: [/rce/i, /remote code execution/i, /command execution/i, /shell/i] },
  { tag: 'file-upload', patterns: [/file upload/i, /upload/i, /multipart/i] },
  { tag: 'lfi-rfi', patterns: [/lfi/i, /rfi/i, /file inclusion/i, /path traversal/i] },
  { tag: 'ssrf', patterns: [/ssrf/i, /server-side request forgery/i] },
  { tag: 'csrf', patterns: [/csrf/i, /cross-site request forgery/i] },
  { tag: 'config', patterns: [/misconfig/i, /configuration/i, /default config/i, /exposed service/i, /directory listing/i] },
  { tag: 'crypto', patterns: [/crypto/i, /cipher/i, /tls/i, /ssl/i, /hash/i, /encryption/i] },
  { tag: 'secrets', patterns: [/secret/i, /apikey/i, /api key/i, /token/i, /credential/i, /password/i, /private key/i] },
  { tag: 'windows', patterns: [/windows/i, /powershell/i, /ntlm/i, /smb/i, /winrm/i] },
  { tag: 'linux', patterns: [/linux/i, /bash/i, /sudo/i, /cron/i, /shadow/i] },
  { tag: 'active-directory', patterns: [/active directory/i, /kerberos/i, /domain controller/i, /ldap/i, /bloodhound/i, /ad cs/i] },
  { tag: 'privilege-escalation', patterns: [/privilege escalation/i, /privesc/i, /sudo/i, /setuid/i, /administrator/i, /root/i] },
  { tag: 'lateral-movement', patterns: [/lateral movement/i, /pivot/i, /pass-the-hash/i, /wmiexec/i, /psexec/i] },
  { tag: 'post-exploitation', patterns: [/post-exploitation/i, /persistence/i, /loot/i, /exfil/i, /meterpreter/i] },
];

export function autoTagFinding(finding = {}) {
  const haystack = [
    finding.title,
    finding.description,
    finding.impact,
    finding.remediation,
    ...(Array.isArray(finding.evidenceEvents)
      ? finding.evidenceEvents.flatMap((event) => [event?.command, event?.content, event?.output, event?.name, event?.tag, event?.caption, event?.context])
      : []),
  ].filter(Boolean).join('\n');

  const tags = new Set(Array.isArray(finding.tags) ? finding.tags : []);
  for (const rule of RULES) {
    if (rule.patterns.some((pattern) => pattern.test(haystack))) {
      tags.add(rule.tag);
    }
  }

  if (tags.has('xss') || tags.has('sqli') || tags.has('idor') || tags.has('rce') || tags.has('file-upload') || tags.has('lfi-rfi') || tags.has('ssrf') || tags.has('csrf')) {
    tags.add('web');
  }
  if (tags.has('active-directory')) {
    tags.add('windows');
    tags.add('network');
  }
  if (tags.has('privilege-escalation') || tags.has('lateral-movement') || tags.has('post-exploitation')) {
    tags.add('network');
  }

  return FINDING_TAG_VOCABULARY.filter((tag) => tags.has(tag));
}
