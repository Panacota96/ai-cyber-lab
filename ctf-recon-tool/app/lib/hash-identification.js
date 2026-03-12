import fs from 'node:fs';
import { isToolAvailable } from '@/lib/tool-availability';

const DEFAULT_WORDLIST_PATH = '/usr/share/wordlists/rockyou.txt';
const WORDLIST_CANDIDATES = [
  DEFAULT_WORDLIST_PATH,
  '/usr/share/wordlists/dirb/common.txt',
];
const WINDOWS_SERVICE_RE = /\b(?:smb|ldap|winrm|rdp|active[- ]directory|kerberos|mssql)\b/i;
const WEB_SERVICE_RE = /\b(?:http|https|web|wordpress|php|drupal|joomla|apache|nginx)\b/i;

function normalizeHashInput(rawValue) {
  return String(rawValue ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, '')
    .trim();
}

function escapePosixSingleQuoted(value) {
  return String(value).replace(/'/g, `'\"'\"'`);
}

function escapePowerShellSingleQuoted(value) {
  return String(value).replace(/'/g, "''");
}

function resolveWordlistPath() {
  const envOverride = String(process.env.HELMS_HASH_WORDLIST || '').trim();
  if (envOverride) return envOverride;

  for (const candidate of WORDLIST_CANDIDATES) {
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // ignore missing fs access in constrained runtimes
    }
  }

  return DEFAULT_WORDLIST_PATH;
}

function buildInlineHashFileCommand(hash, filename = 'hashes.txt') {
  const safeFilename = String(filename || 'hashes.txt').replace(/[^a-zA-Z0-9._-]/g, '_') || 'hashes.txt';
  if (process.platform === 'win32') {
    return `$hash = '${escapePowerShellSingleQuoted(hash)}'; Set-Content -Path '${safeFilename}' -Value $hash`;
  }
  return `printf '%s\\n' '${escapePosixSingleQuoted(hash)}' > ${safeFilename}`;
}

function buildHashcatCommand(hash, mode, filename = 'hashes.txt') {
  if (!mode && mode !== 0) return null;
  const prefix = buildInlineHashFileCommand(hash, filename);
  const wordlistPath = resolveWordlistPath();
  if (process.platform === 'win32') {
    return `${prefix}; hashcat -m ${mode} ${filename} ${wordlistPath}`;
  }
  return `${prefix} && hashcat -m ${mode} ${filename} ${wordlistPath}`;
}

function buildJohnCommand(hash, format, filename = 'hashes.txt') {
  if (!format) return null;
  const prefix = buildInlineHashFileCommand(hash, filename);
  const wordlistPath = resolveWordlistPath();
  if (process.platform === 'win32') {
    return `${prefix}; john --format=${format} --wordlist=${wordlistPath} ${filename}`;
  }
  return `${prefix} && john --format=${format} --wordlist=${wordlistPath} ${filename}`;
}

function enrichCandidate(base, normalizedHash, tools) {
  return {
    ...base,
    confidence: Number(Number(base.confidence || 0).toFixed(2)),
    hashcatCommand: tools.hashcat ? buildHashcatCommand(normalizedHash, base.hashcatMode) : null,
    johnCommand: tools.john ? buildJohnCommand(normalizedHash, base.johnFormat) : null,
  };
}

function pushCandidate(candidateMap, candidate) {
  if (!candidate?.id) return;
  const existing = candidateMap.get(candidate.id);
  if (!existing || Number(candidate.confidence || 0) > Number(existing.confidence || 0)) {
    candidateMap.set(candidate.id, candidate);
  }
}

function applyContextBias(candidate, context = {}) {
  const haystack = [
    context.service,
    context.label,
    context.notes,
  ].filter(Boolean).join(' ');

  let confidence = Number(candidate.confidence || 0);
  if (candidate.id === 'ntlm' || candidate.id === 'lm') {
    if (WINDOWS_SERVICE_RE.test(haystack)) confidence += 0.12;
  }
  if (candidate.id === 'bcrypt' || candidate.id === 'phpass') {
    if (WEB_SERVICE_RE.test(haystack)) confidence += 0.08;
  }
  return {
    ...candidate,
    confidence: Math.min(0.99, confidence),
  };
}

function detectStructuredHashCandidates(value, context = {}) {
  const candidateMap = new Map();

  if (!value) {
    return [];
  }

  if (/^\$2[abyx]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value)) {
    pushCandidate(candidateMap, {
      id: 'bcrypt',
      label: 'bcrypt',
      family: 'password hash',
      confidence: 0.99,
      description: 'Blowfish-based bcrypt hash with embedded cost and salt.',
      hashcatMode: 3200,
      johnFormat: 'bcrypt',
    });
  }

  if (/^\$argon2(?:id|i|d)\$/.test(value)) {
    pushCandidate(candidateMap, {
      id: 'argon2',
      label: 'Argon2',
      family: 'password hash',
      confidence: 0.99,
      description: 'Argon2 password hash with embedded parameters.',
      hashcatMode: null,
      johnFormat: 'argon2',
    });
  }

  if (/^\$[PH]\$[./A-Za-z0-9]{31}$/.test(value)) {
    pushCandidate(candidateMap, {
      id: 'phpass',
      label: 'phpass',
      family: 'password hash',
      confidence: 0.98,
      description: 'Portable PHP password hash often seen in WordPress and phpBB.',
      hashcatMode: 400,
      johnFormat: 'phpass',
    });
  }

  if (/^\$1\$[./A-Za-z0-9]{1,16}\$[./A-Za-z0-9]{22}$/.test(value)) {
    pushCandidate(candidateMap, {
      id: 'md5crypt',
      label: 'md5crypt',
      family: 'password hash',
      confidence: 0.98,
      description: 'Unix MD5-crypt password hash.',
      hashcatMode: 500,
      johnFormat: 'md5crypt',
    });
  }

  if (/^\$5\$/.test(value)) {
    pushCandidate(candidateMap, {
      id: 'sha256crypt',
      label: 'sha256crypt',
      family: 'password hash',
      confidence: 0.98,
      description: 'Unix SHA-256 crypt password hash.',
      hashcatMode: 7400,
      johnFormat: 'sha256crypt',
    });
  }

  if (/^\$6\$/.test(value)) {
    pushCandidate(candidateMap, {
      id: 'sha512crypt',
      label: 'sha512crypt',
      family: 'password hash',
      confidence: 0.98,
      description: 'Unix SHA-512 crypt password hash.',
      hashcatMode: 1800,
      johnFormat: 'sha512crypt',
    });
  }

  if (/^\$DCC2\$/i.test(value)) {
    pushCandidate(candidateMap, {
      id: 'mscash2',
      label: 'Domain Cached Credentials 2',
      family: 'windows hash',
      confidence: 0.99,
      description: 'DCC2 / MSCash2 domain cached credential hash.',
      hashcatMode: 2100,
      johnFormat: 'mscash2',
    });
  }

  if (/^\$krb5tgs\$/i.test(value)) {
    const etypeMatch = value.match(/^\$krb5tgs\$(\d+)\$/i);
    const etype = Number(etypeMatch?.[1] || 0);
    const modeByEtype = { 23: 13100, 17: 19600, 18: 19700 };
    pushCandidate(candidateMap, {
      id: 'krb5tgs',
      label: 'Kerberos 5 TGS-REP',
      family: 'kerberos ticket',
      confidence: 0.99,
      description: 'Kerberos TGS service ticket hash for offline cracking.',
      hashcatMode: modeByEtype[etype] ?? null,
      johnFormat: 'krb5tgs',
    });
  }

  if (/^\$krb5asrep\$/i.test(value)) {
    const etypeMatch = value.match(/^\$krb5asrep\$(\d+)\$/i);
    const etype = Number(etypeMatch?.[1] || 0);
    const modeByEtype = { 23: 18200, 17: 19800, 18: 19900 };
    pushCandidate(candidateMap, {
      id: 'krb5asrep',
      label: 'Kerberos 5 AS-REP',
      family: 'kerberos ticket',
      confidence: 0.99,
      description: 'AS-REP roastable Kerberos response hash.',
      hashcatMode: modeByEtype[etype] ?? null,
      johnFormat: 'krb5asrep',
    });
  }

  if (/^[^:\s]+::[^:\s]+:[A-Fa-f0-9]{16}:[A-Fa-f0-9]{32,}:[A-Fa-f0-9]{2,}$/i.test(value)) {
    pushCandidate(candidateMap, {
      id: 'netntlmv2',
      label: 'NetNTLMv2',
      family: 'windows network auth',
      confidence: 0.99,
      description: 'NetNTLMv2 challenge-response capture.',
      hashcatMode: 5600,
      johnFormat: 'netntlmv2',
    });
  } else if (/^[^:\s]+::[^:\s]+:[A-Fa-f0-9]{32}:[A-Fa-f0-9]{32}:[A-Fa-f0-9]{16}$/i.test(value)) {
    pushCandidate(candidateMap, {
      id: 'netntlmv1',
      label: 'NetNTLMv1',
      family: 'windows network auth',
      confidence: 0.97,
      description: 'NetNTLMv1 challenge-response capture.',
      hashcatMode: 5500,
      johnFormat: 'netntlm',
    });
  }

  if (/^[A-Fa-f0-9]{32}$/.test(value)) {
    pushCandidate(candidateMap, {
      id: 'md5',
      label: 'MD5',
      family: 'raw digest',
      confidence: 0.62,
      description: '32-hex raw digest consistent with MD5.',
      hashcatMode: 0,
      johnFormat: 'raw-md5',
    });
    pushCandidate(candidateMap, {
      id: 'ntlm',
      label: 'NTLM',
      family: 'windows hash',
      confidence: /^[A-F0-9]{32}$/.test(value) ? 0.64 : 0.58,
      description: '32-hex Windows NTLM hash.',
      hashcatMode: 1000,
      johnFormat: 'NT',
    });
    pushCandidate(candidateMap, {
      id: 'lm',
      label: 'LM',
      family: 'windows hash',
      confidence: /^[A-F0-9]{32}$/.test(value) ? 0.42 : 0.22,
      description: 'Legacy 32-hex LAN Manager hash.',
      hashcatMode: 3000,
      johnFormat: 'LM',
    });
  }

  if (/^[A-Fa-f0-9]{40}$/.test(value)) {
    pushCandidate(candidateMap, {
      id: 'sha1',
      label: 'SHA-1',
      family: 'raw digest',
      confidence: 0.91,
      description: '40-hex raw digest consistent with SHA-1.',
      hashcatMode: 100,
      johnFormat: 'raw-sha1',
    });
  }

  if (/^[A-Fa-f0-9]{56}$/.test(value)) {
    pushCandidate(candidateMap, {
      id: 'sha224',
      label: 'SHA-224',
      family: 'raw digest',
      confidence: 0.9,
      description: '56-hex raw digest consistent with SHA-224.',
      hashcatMode: 1300,
      johnFormat: 'raw-sha224',
    });
  }

  if (/^[A-Fa-f0-9]{64}$/.test(value)) {
    pushCandidate(candidateMap, {
      id: 'sha256',
      label: 'SHA-256',
      family: 'raw digest',
      confidence: 0.92,
      description: '64-hex raw digest consistent with SHA-256.',
      hashcatMode: 1400,
      johnFormat: 'raw-sha256',
    });
  }

  if (/^[A-Fa-f0-9]{96}$/.test(value)) {
    pushCandidate(candidateMap, {
      id: 'sha384',
      label: 'SHA-384',
      family: 'raw digest',
      confidence: 0.9,
      description: '96-hex raw digest consistent with SHA-384.',
      hashcatMode: 10800,
      johnFormat: 'raw-sha384',
    });
  }

  if (/^[A-Fa-f0-9]{128}$/.test(value)) {
    pushCandidate(candidateMap, {
      id: 'sha512',
      label: 'SHA-512',
      family: 'raw digest',
      confidence: 0.92,
      description: '128-hex raw digest consistent with SHA-512.',
      hashcatMode: 1700,
      johnFormat: 'raw-sha512',
    });
  }

  return [...candidateMap.values()]
    .map((candidate) => applyContextBias(candidate, context))
    .sort((left, right) => Number(right.confidence || 0) - Number(left.confidence || 0));
}

function buildSummary(bestCandidate, candidateCount, tools) {
  if (!bestCandidate) {
    return tools.hashcat || tools.john
      ? 'No confident hash fingerprint detected. You can still set the type manually and generate cracking commands later.'
      : 'No confident hash fingerprint detected, and cracking tools are not available in this runtime.';
  }

  const availableTools = [
    tools.hashcat ? 'hashcat' : null,
    tools.john ? 'john' : null,
  ].filter(Boolean);
  const suffix = availableTools.length > 0
    ? `Commands are ready for ${availableTools.join(' and ')}.`
    : 'No cracking tools are available in this runtime yet.';
  const ambiguity = candidateCount > 1 ? ` Top ${candidateCount} candidates are shown.` : '';
  return `Best match: ${bestCandidate.label} (${Math.round(Number(bestCandidate.confidence || 0) * 100)}% confidence).${ambiguity} ${suffix}`.trim();
}

export function identifyHashValue(rawHash, context = {}) {
  const normalizedHash = normalizeHashInput(rawHash);
  const tools = {
    hashcat: isToolAvailable('hashcat'),
    john: isToolAvailable('john'),
  };

  if (!normalizedHash) {
    return {
      normalizedHash: '',
      bestCandidate: null,
      candidates: [],
      tools,
      summary: 'No hash provided.',
    };
  }

  const candidates = detectStructuredHashCandidates(normalizedHash, context)
    .slice(0, 6)
    .map((candidate) => enrichCandidate(candidate, normalizedHash, tools));
  const bestCandidate = candidates[0] || null;

  return {
    normalizedHash,
    bestCandidate,
    candidates,
    tools,
    summary: buildSummary(bestCandidate, candidates.length, tools),
    fingerprint: {
      length: normalizedHash.length,
      hasDollarPrefix: normalizedHash.startsWith('$'),
      hasColonSections: normalizedHash.includes(':'),
    },
  };
}
