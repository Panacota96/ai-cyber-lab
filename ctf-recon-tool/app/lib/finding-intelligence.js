export const FINDING_LIKELIHOODS = ['low', 'medium', 'high'];
export const FINDING_SEVERITIES = ['critical', 'high', 'medium', 'low'];
export const DEFAULT_REPORT_FILTERS = {
  minimumSeverity: 'all',
  tag: '',
  techniqueId: '',
  includeDuplicates: false,
};

const SEVERITY_RANK = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const LIKELIHOOD_RANK = {
  high: 3,
  medium: 2,
  low: 1,
};

const ATTACK_TECHNIQUE_CATALOG = [
  {
    id: 'T1046',
    name: 'Network Service Discovery',
    tactic: 'Discovery',
    tags: ['network'],
    patterns: [/nmap/i, /port/i, /service/i, /enumerat/i, /banner/i, /ldap/i, /smb/i, /ssh/i],
  },
  {
    id: 'T1190',
    name: 'Exploit Public-Facing Application',
    tactic: 'Initial Access',
    tags: ['web', 'injection', 'xss', 'sqli', 'idor', 'rce', 'file-upload', 'lfi-rfi', 'ssrf', 'csrf'],
    patterns: [/public-facing/i, /http/i, /web/i, /endpoint/i, /sql injection/i, /xss/i, /upload/i, /rce/i, /remote code execution/i],
  },
  {
    id: 'T1078',
    name: 'Valid Accounts',
    tactic: 'Defense Evasion / Persistence / Privilege Escalation',
    tags: ['auth', 'secrets'],
    patterns: [/credential/i, /password/i, /login/i, /valid account/i, /authenticated/i, /session token/i],
  },
  {
    id: 'T1552',
    name: 'Unsecured Credentials',
    tactic: 'Credential Access',
    tags: ['secrets', 'crypto'],
    patterns: [/secret/i, /api key/i, /private key/i, /token/i, /hash/i, /credential dump/i],
  },
  {
    id: 'T1068',
    name: 'Exploitation for Privilege Escalation',
    tactic: 'Privilege Escalation',
    tags: ['privilege-escalation', 'windows', 'linux'],
    patterns: [/privilege escalation/i, /privesc/i, /sudo/i, /administrator/i, /root/i, /setuid/i],
  },
  {
    id: 'T1021',
    name: 'Remote Services',
    tactic: 'Lateral Movement',
    tags: ['lateral-movement', 'active-directory', 'windows'],
    patterns: [/psexec/i, /wmiexec/i, /winrm/i, /remote service/i, /pivot/i, /lateral movement/i],
  },
];

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeTokens(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function intersectionCount(left = [], right = []) {
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item)).length;
}

function titleSimilarity(left = '', right = '') {
  const leftTokens = unique(normalizeTokens(left));
  const rightTokens = unique(normalizeTokens(right));
  if (leftTokens.length === 0 || rightTokens.length === 0) return 0;
  const overlap = intersectionCount(leftTokens, rightTokens);
  const base = new Set([...leftTokens, ...rightTokens]).size;
  return base > 0 ? overlap / base : 0;
}

function normalizeTechniqueId(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return /^T\d{4}(?:\.\d{3})?$/.test(normalized) ? normalized : '';
}

export function getAttackTechniqueCatalog() {
  return ATTACK_TECHNIQUE_CATALOG.map((item) => ({ ...item }));
}

export function getAttackTechniqueById(id) {
  const normalized = normalizeTechniqueId(id);
  return ATTACK_TECHNIQUE_CATALOG.find((item) => item.id === normalized) || null;
}

export function normalizeFindingLikelihood(value, fallback = 'medium') {
  const normalized = String(value || '').trim().toLowerCase();
  return FINDING_LIKELIHOODS.includes(normalized) ? normalized : fallback;
}

export function normalizeFindingCvssScore(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0 || parsed > 10) return null;
  return Math.round(parsed * 10) / 10;
}

export function cvssSeverityLabel(score) {
  const normalized = normalizeFindingCvssScore(score);
  if (normalized === null) return '';
  if (normalized >= 9) return 'Critical';
  if (normalized >= 7) return 'High';
  if (normalized >= 4) return 'Medium';
  if (normalized > 0) return 'Low';
  return 'None';
}

export function normalizeReportFilters(filters = {}) {
  const minimumSeverity = String(filters?.minimumSeverity || 'all').trim().toLowerCase();
  return {
    minimumSeverity: minimumSeverity === 'all' || FINDING_SEVERITIES.includes(minimumSeverity)
      ? minimumSeverity
      : DEFAULT_REPORT_FILTERS.minimumSeverity,
    tag: String(filters?.tag || '').trim().toLowerCase(),
    techniqueId: normalizeTechniqueId(filters?.techniqueId),
    includeDuplicates: Boolean(filters?.includeDuplicates),
  };
}

export function deriveAttackTechniqueIds(finding = {}) {
  const haystack = [
    finding.title,
    finding.description,
    finding.impact,
    finding.remediation,
    ...(Array.isArray(finding.tags) ? finding.tags : []),
    ...(Array.isArray(finding.evidenceEvents)
      ? finding.evidenceEvents.flatMap((event) => [event?.command, event?.content, event?.output, event?.name, event?.caption, event?.context])
      : []),
  ].filter(Boolean).join('\n');

  const tagSet = new Set((Array.isArray(finding.tags) ? finding.tags : []).map((tag) => String(tag || '').trim().toLowerCase()));
  const existing = asArray(finding.attackTechniqueIds || finding.attack_technique_ids)
    .map((item) => normalizeTechniqueId(item))
    .filter(Boolean);

  const derived = ATTACK_TECHNIQUE_CATALOG
    .filter((entry) => (
      entry.tags.some((tag) => tagSet.has(tag))
      || entry.patterns.some((pattern) => pattern.test(haystack))
    ))
    .map((entry) => entry.id);

  return unique([...existing, ...derived]).sort();
}

export function expandAttackTechniqueIds(ids = []) {
  return unique(asArray(ids).map((item) => normalizeTechniqueId(item)).filter(Boolean))
    .map((id) => getAttackTechniqueById(id))
    .filter(Boolean);
}

function inferLikelihood(finding = {}) {
  if (finding.likelihood) {
    return normalizeFindingLikelihood(finding.likelihood);
  }
  const cvssScore = normalizeFindingCvssScore(finding.cvssScore ?? finding.cvss_score);
  if (cvssScore !== null) {
    if (cvssScore >= 8) return 'high';
    if (cvssScore >= 5) return 'medium';
    return 'low';
  }
  const severity = String(finding.severity || 'medium').trim().toLowerCase();
  if (severity === 'critical' || severity === 'high') return 'high';
  if (severity === 'medium') return 'medium';
  return 'low';
}

function computeRiskFromMatrix(severity = 'medium', likelihood = 'medium', cvssScore = null) {
  const severityScore = SEVERITY_RANK[String(severity || 'medium').toLowerCase()] || SEVERITY_RANK.medium;
  const likelihoodScore = LIKELIHOOD_RANK[normalizeFindingLikelihood(likelihood)] || LIKELIHOOD_RANK.medium;
  const matrixScore = severityScore * likelihoodScore;
  const cvssSeverity = cvssSeverityLabel(cvssScore).toLowerCase();
  const cvssBump = SEVERITY_RANK[cvssSeverity] || 0;
  const score = Math.max(matrixScore, cvssBump * 2);

  if (score >= 9) return { riskLevel: 'critical', riskScore: score };
  if (score >= 6) return { riskLevel: 'high', riskScore: score };
  if (score >= 3) return { riskLevel: 'medium', riskScore: score };
  return { riskLevel: 'low', riskScore: score };
}

function normalizeRelatedIds(values = []) {
  return unique(asArray(values)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0)
    .map((item) => Math.floor(item)));
}

function shouldMarkDuplicate(left, right) {
  const leftTitle = normalizeText(left.title).toLowerCase();
  const rightTitle = normalizeText(right.title).toLowerCase();
  if (!leftTitle || !rightTitle) return false;
  if (leftTitle === rightTitle) return true;

  const similarity = titleSimilarity(leftTitle, rightTitle);
  const sharedEvidence = intersectionCount(left.evidenceEventIds || [], right.evidenceEventIds || []);
  const sharedTechniques = intersectionCount(left.attackTechniqueIds || [], right.attackTechniqueIds || []);
  const sharedTags = intersectionCount(left.tags || [], right.tags || []);

  return similarity >= 0.72
    || (similarity >= 0.5 && (sharedEvidence > 0 || sharedTechniques > 0 || sharedTags >= 2));
}

function shouldRelate(left, right) {
  const sharedEvidence = intersectionCount(left.evidenceEventIds || [], right.evidenceEventIds || []);
  const sharedTechniques = intersectionCount(left.attackTechniqueIds || [], right.attackTechniqueIds || []);
  const sharedTags = intersectionCount(left.tags || [], right.tags || []);
  const similarity = titleSimilarity(left.title, right.title);
  return sharedEvidence > 0 || sharedTechniques > 0 || sharedTags >= 2 || similarity >= 0.35;
}

function chooseCanonicalFinding(left, right) {
  const leftRank = SEVERITY_RANK[left.severity] || 0;
  const rightRank = SEVERITY_RANK[right.severity] || 0;
  if (leftRank !== rightRank) return leftRank > rightRank ? left : right;
  const leftCvss = normalizeFindingCvssScore(left.cvssScore);
  const rightCvss = normalizeFindingCvssScore(right.cvssScore);
  if ((leftCvss || 0) !== (rightCvss || 0)) return (leftCvss || 0) >= (rightCvss || 0) ? left : right;
  const leftId = Number(left.id || 0) || Number.MAX_SAFE_INTEGER;
  const rightId = Number(right.id || 0) || Number.MAX_SAFE_INTEGER;
  return leftId <= rightId ? left : right;
}

export function enrichFindings(findings = []) {
  const base = (Array.isArray(findings) ? findings : []).map((finding) => {
    const cvssScore = normalizeFindingCvssScore(finding.cvssScore ?? finding.cvss_score);
    const likelihood = inferLikelihood(finding);
    const attackTechniqueIds = deriveAttackTechniqueIds(finding);
    const attackTechniques = expandAttackTechniqueIds(attackTechniqueIds);
    const risk = computeRiskFromMatrix(finding.severity, likelihood, cvssScore);
    return {
      ...finding,
      tags: unique(asArray(finding.tags).map((tag) => String(tag || '').trim()).filter(Boolean)),
      evidenceEventIds: unique(asArray(finding.evidenceEventIds).map((id) => String(id || '').trim()).filter(Boolean)),
      cvssScore,
      cvssVector: normalizeText(finding.cvssVector ?? finding.cvss_vector) || '',
      likelihood,
      attackTechniqueIds,
      attackTechniques,
      relatedFindingIds: normalizeRelatedIds(finding.relatedFindingIds || finding.related_finding_ids),
      duplicateOf: Number(finding.duplicateOf ?? finding.duplicate_of) || null,
      duplicateGroup: normalizeText(finding.duplicateGroup ?? finding.duplicate_group) || '',
      cvssSeverity: cvssSeverityLabel(cvssScore),
      riskLevel: risk.riskLevel,
      riskScore: risk.riskScore,
      isDuplicate: false,
    };
  });

  const related = new Map(base.map((finding) => [Number(finding.id), new Set(finding.relatedFindingIds)]));

  for (let index = 0; index < base.length; index += 1) {
    for (let inner = index + 1; inner < base.length; inner += 1) {
      const left = base[index];
      const right = base[inner];

      if (shouldMarkDuplicate(left, right)) {
        const canonical = chooseCanonicalFinding(left, right);
        const duplicate = canonical === left ? right : left;
        duplicate.duplicateOf = Number(canonical.id) || duplicate.duplicateOf;
        duplicate.duplicateGroup = `dup-${canonical.id}`;
        canonical.duplicateGroup = canonical.duplicateGroup || `dup-${canonical.id}`;
      } else if (shouldRelate(left, right)) {
        if (Number(left.id) > 0 && Number(right.id) > 0) {
          related.get(Number(left.id))?.add(Number(right.id));
          related.get(Number(right.id))?.add(Number(left.id));
        }
      }
    }
  }

  return base.map((finding) => {
    const relatedIds = related.get(Number(finding.id)) || new Set();
    const relationshipIds = [...relatedIds]
      .filter((id) => id !== Number(finding.id))
      .filter((id) => id !== Number(finding.duplicateOf))
      .sort((left, right) => left - right);
    return {
      ...finding,
      relatedFindingIds: relationshipIds,
      isDuplicate: Boolean(finding.duplicateOf),
    };
  });
}

export function filterFindings(findings = [], filters = {}) {
  const normalized = normalizeReportFilters(filters);
  const minimumRank = normalized.minimumSeverity === 'all'
    ? 0
    : SEVERITY_RANK[normalized.minimumSeverity] || 0;

  return enrichFindings(findings).filter((finding) => {
    if (!normalized.includeDuplicates && finding.isDuplicate) return false;
    const severityRank = SEVERITY_RANK[String(finding.severity || 'medium').toLowerCase()] || 0;
    if (severityRank < minimumRank) return false;
    if (normalized.tag && !(finding.tags || []).includes(normalized.tag)) return false;
    if (normalized.techniqueId && !(finding.attackTechniqueIds || []).includes(normalized.techniqueId)) return false;
    return true;
  });
}

export function buildRiskMatrix(findings = []) {
  const matrix = {
    high: { low: 0, medium: 0, high: 0, critical: 0 },
    medium: { low: 0, medium: 0, high: 0, critical: 0 },
    low: { low: 0, medium: 0, high: 0, critical: 0 },
  };

  for (const finding of enrichFindings(findings)) {
    const likelihood = normalizeFindingLikelihood(finding.likelihood);
    const severity = String(finding.severity || 'medium').toLowerCase();
    if (!matrix[likelihood] || matrix[likelihood][severity] === undefined) continue;
    matrix[likelihood][severity] += 1;
  }

  return matrix;
}

export function buildAttackCoverage(findings = []) {
  const counters = new Map();
  for (const finding of enrichFindings(findings)) {
    for (const technique of finding.attackTechniques || []) {
      const current = counters.get(technique.id) || { ...technique, count: 0 };
      current.count += 1;
      counters.set(technique.id, current);
    }
  }

  return [...counters.values()].sort((left, right) => right.count - left.count || left.id.localeCompare(right.id));
}
