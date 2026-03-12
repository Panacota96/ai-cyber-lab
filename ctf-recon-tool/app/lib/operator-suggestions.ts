type SuggestionContext = {
  activeTargetId?: string | null;
  target?: string | null;
  user?: string | null;
  hash?: string | null;
  hashfile?: string | null;
  file?: string | null;
  lhost?: string | null;
  lport?: string | null;
};

type SuggestionEntry = {
  id: string;
  kind: 'toolbox' | 'history' | 'service' | 'graph';
  label: string;
  subtitle?: string;
  description?: string;
  command: string;
  sourceLabel: string;
  category?: string;
  confidence?: number;
  targetIds?: string[];
  sourceNodeIds?: string[];
  baseScore?: number;
  sortHint?: number;
};

function normalizeText(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function tokenize(value: unknown): string[] {
  return normalizeText(value)
    .split(/[^a-z0-9._:/-]+/i)
    .map((token) => token.trim())
    .filter(Boolean);
}

function normalizeTargetIds(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))];
}

function mergeTargetIds(...values: unknown[]): string[] {
  return [...new Set(values.flatMap((value) => normalizeTargetIds(value)))];
}

function truncateLabel(value: string, maxLength = 72): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}...`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function subsequenceScore(query: string, candidate: string): number {
  if (!query || !candidate) return 0;
  let queryIndex = 0;
  let streak = 0;
  let score = 0;

  for (let index = 0; index < candidate.length && queryIndex < query.length; index += 1) {
    if (candidate[index] !== query[queryIndex]) continue;
    streak += 1;
    score += 4 + streak;
    queryIndex += 1;
  }

  return queryIndex === query.length ? score : 0;
}

function scoreEntry(entry: SuggestionEntry, query: string, activeTargetId = ''): number {
  const baseScore = Number(entry.baseScore || 0);
  const normalizedQuery = normalizeText(query);
  const label = normalizeText(entry.label);
  const subtitle = normalizeText(entry.subtitle);
  const command = normalizeText(entry.command);
  const description = normalizeText(entry.description);
  const category = normalizeText(entry.category || entry.sourceLabel);
  const haystack = `${label} ${subtitle} ${command} ${description} ${category}`.trim();

  let score = baseScore;
  if (activeTargetId && normalizeTargetIds(entry.targetIds).includes(activeTargetId)) {
    score += 70;
  }

  if (!normalizedQuery) {
    score += Number(entry.confidence || 0) * 40;
    return score;
  }

  const tokens = tokenize(normalizedQuery);
  if (tokens.length === 0) return score;

  for (const token of tokens) {
    const inLabel = label.includes(token);
    const inSubtitle = subtitle.includes(token);
    const inCommand = command.includes(token);
    const inDescription = description.includes(token);
    const inCategory = category.includes(token);
    const subsequence = Math.max(
      subsequenceScore(token, label),
      subsequenceScore(token, command),
      subsequenceScore(token, subtitle),
    );

    if (!(inLabel || inSubtitle || inCommand || inDescription || inCategory || subsequence > 0)) {
      return Number.NEGATIVE_INFINITY;
    }

    if (inLabel) score += 120;
    if (inSubtitle) score += 65;
    if (inCommand) score += 95;
    if (inDescription) score += 35;
    if (inCategory) score += 18;
    if (!inLabel && !inCommand && subsequence > 0) score += Math.min(42, subsequence);
  }

  if (label.startsWith(normalizedQuery)) score += 160;
  if (command.startsWith(normalizedQuery)) score += 140;
  if (haystack.includes(normalizedQuery)) score += 48;
  score += Number(entry.confidence || 0) * 45;

  return score;
}

export function replaceCommandPlaceholders(template: unknown, context: SuggestionContext = {}): string {
  let command = String(template || '').trim();
  const replacements: Record<string, string> = {
    target: String(context.target || '').trim(),
    user: String(context.user || 'admin').trim(),
    hash: String(context.hash || 'HASH').trim(),
    hashfile: String(context.hashfile || 'hash.txt').trim(),
    file: String(context.file || 'artifact.bin').trim(),
    lhost: String(context.lhost || 'tun0-ip').trim(),
    lport: String(context.lport || '4444').trim(),
  };

  for (const [key, value] of Object.entries(replacements)) {
    if (!value) continue;
    command = command.replace(new RegExp(`\\{${escapeRegex(key)}\\}`, 'gi'), value);
  }

  return command;
}

function buildToolboxEntries(staticSuggestions: any[] = [], context: SuggestionContext = {}): SuggestionEntry[] {
  return (Array.isArray(staticSuggestions) ? staticSuggestions : []).flatMap((group, groupIndex) => {
    const category = String(group?.category || `Category ${groupIndex + 1}`).trim();
    const items = Array.isArray(group?.items) ? group.items : [];

    return items.map((item: any, itemIndex: number) => ({
      id: `toolbox:${category}:${itemIndex}`,
      kind: 'toolbox' as const,
      label: String(item?.label || 'Command').trim(),
      subtitle: category,
      description: `Toolbox command from ${category}.`,
      command: replaceCommandPlaceholders(item?.command, context),
      sourceLabel: 'Toolbox',
      category,
      targetIds: context.activeTargetId ? [context.activeTargetId] : [],
      baseScore: 150,
      sortHint: groupIndex * 100 + itemIndex,
    }));
  });
}

function buildHistoryEntries(historyCommands: unknown[] = [], context: SuggestionContext = {}): SuggestionEntry[] {
  const seen = new Set<string>();
  const commands = Array.isArray(historyCommands) ? historyCommands : [];

  return commands.flatMap((raw, index) => {
    const command = replaceCommandPlaceholders(raw, context);
    const normalized = normalizeText(command);
    if (!normalized || seen.has(normalized)) return [];
    seen.add(normalized);

    return [{
      id: `history:${index}:${normalized}`,
      kind: 'history' as const,
      label: truncateLabel(command),
      subtitle: 'Recent command',
      description: 'Previously executed command in this session.',
      command,
      sourceLabel: 'History',
      category: 'Recent commands',
      targetIds: context.activeTargetId ? [context.activeTargetId] : [],
      baseScore: 250 - Math.min(index, 80),
      sortHint: index,
    }];
  });
}

function buildServiceEntries(serviceSuggestions: any[] = []): SuggestionEntry[] {
  return (Array.isArray(serviceSuggestions) ? serviceSuggestions : []).map((suggestion, index) => ({
    id: String(suggestion?.id || `service:${index}`),
    kind: 'service' as const,
    label: String(suggestion?.title || 'Service suggestion').trim(),
    subtitle: [suggestion?.service, suggestion?.host].filter(Boolean).join(' @ '),
    description: String(suggestion?.rationale || '').trim(),
    command: String(suggestion?.command || '').trim(),
    sourceLabel: 'Service',
    category: 'Advisory follow-up',
    confidence: Number(suggestion?.confidence || 0),
    targetIds: normalizeTargetIds(suggestion?.targetIds),
    sourceNodeIds: Array.isArray(suggestion?.sourceNodeIds) ? suggestion.sourceNodeIds : [],
    baseScore: 285 + Math.round(Number(suggestion?.confidence || 0) * 50),
    sortHint: index,
  })).filter((item) => item.command);
}

export function buildOperatorSuggestions({
  staticSuggestions = [],
  serviceSuggestions = [],
  historyCommands = [],
  context = {},
}: {
  staticSuggestions?: any[];
  serviceSuggestions?: any[];
  historyCommands?: unknown[];
  context?: SuggestionContext;
}): SuggestionEntry[] {
  const deduped = new Map<string, SuggestionEntry>();
  const entries = [
    ...buildServiceEntries(serviceSuggestions),
    ...buildHistoryEntries(historyCommands, context),
    ...buildToolboxEntries(staticSuggestions, context),
  ];

  for (const entry of entries) {
    const key = normalizeText(entry.command);
    if (!key) continue;
    const previous = deduped.get(key);
    if (!previous || Number(previous.baseScore || 0) < Number(entry.baseScore || 0)) {
      deduped.set(key, entry);
    }
  }

  return [...deduped.values()];
}

export function rankOperatorSuggestions(
  entries: SuggestionEntry[] = [],
  query = '',
  options: { limit?: number; activeTargetId?: string | null } = {},
): SuggestionEntry[] {
  const limit = Number(options.limit || 0) > 0 ? Number(options.limit) : 12;
  const activeTargetId = String(options.activeTargetId || '').trim();

  return [...(Array.isArray(entries) ? entries : [])]
    .map((entry) => ({
      entry,
      score: scoreEntry(entry, query, activeTargetId),
    }))
    .filter((item) => Number.isFinite(item.score))
    .sort((left, right) => (
      right.score - left.score
      || Number(right.entry.baseScore || 0) - Number(left.entry.baseScore || 0)
      || Number(left.entry.sortHint || 0) - Number(right.entry.sortHint || 0)
      || String(left.entry.label).localeCompare(String(right.entry.label))
    ))
    .slice(0, limit)
    .map((item) => item.entry);
}

export function findInlineOperatorSuggestion(
  entries: SuggestionEntry[] = [],
  input = '',
  options: { activeTargetId?: string | null } = {},
): SuggestionEntry | null {
  const normalizedInput = normalizeText(input);
  if (!normalizedInput) return null;
  const [top] = rankOperatorSuggestions(entries, normalizedInput, {
    limit: 1,
    activeTargetId: options.activeTargetId,
  });
  if (!top) return null;
  if (normalizeText(top.command) === normalizedInput) return null;
  return top;
}

function parseServiceNode(node: any = {}) {
  const label = String(node?.data?.label || '').trim();
  const details = node?.data?.details || {};
  const match = label.match(/^([a-z0-9._-]+):(\d+)\/(tcp|udp)$/i);

  return {
    label,
    service: String(details?.service || match?.[1] || '').trim().toLowerCase(),
    port: Number(details?.port || match?.[2] || 0) || null,
    protocol: String(details?.protocol || match?.[3] || 'tcp').trim().toLowerCase(),
  };
}

function dedupeGraphActions(actions: SuggestionEntry[]): SuggestionEntry[] {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = normalizeText(action.command);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildGraphContextActions({
  node = null,
  nodes = [],
  edges = [],
  serviceSuggestions = [],
  activeTargetId = '',
}: {
  node?: any;
  nodes?: any[];
  edges?: any[];
  serviceSuggestions?: any[];
  activeTargetId?: string | null;
}): SuggestionEntry[] {
  if (!node?.id) return [];

  const nodeType = String(node?.data?.nodeType || '').trim().toLowerCase();
  const label = String(node?.data?.label || '').trim();
  const relevantServiceSuggestions = (Array.isArray(serviceSuggestions) ? serviceSuggestions : [])
    .filter((suggestion) => (
      Array.isArray(suggestion?.sourceNodeIds) && suggestion.sourceNodeIds.includes(node.id)
      && (!activeTargetId || !Array.isArray(suggestion?.targetIds) || suggestion.targetIds.length === 0 || suggestion.targetIds.includes(activeTargetId))
    ))
    .map((suggestion, index) => ({
      id: `graph-service:${suggestion.id}:${index}`,
      kind: 'graph' as const,
      label: String(suggestion.title || 'Related service action').trim(),
      subtitle: [suggestion.service, suggestion.host].filter(Boolean).join(' @ '),
      description: String(suggestion.rationale || '').trim(),
      command: String(suggestion.command || '').trim(),
      sourceLabel: 'Graph',
      category: 'Node context',
      confidence: Number(suggestion.confidence || 0),
      targetIds: normalizeTargetIds(suggestion.targetIds),
      sourceNodeIds: Array.isArray(suggestion.sourceNodeIds) ? suggestion.sourceNodeIds : [],
      baseScore: 300 + Math.round(Number(suggestion.confidence || 0) * 45),
    }));

  const actions: SuggestionEntry[] = [...relevantServiceSuggestions];

  if (nodeType === 'host' && label) {
    actions.push(
      {
        id: `graph-host-scan:${node.id}`,
        kind: 'graph' as const,
        label: 'Quick service scan',
        subtitle: label,
        description: 'Run a fast version-detection scan against the selected host.',
        command: `nmap -Pn -sV ${label}`,
        sourceLabel: 'Graph',
        category: 'Host context',
        targetIds: normalizeTargetIds(node?.data?.targetIds),
        baseScore: 260,
      },
      {
        id: `graph-host-full:${node.id}`,
        kind: 'graph' as const,
        label: 'Aggressive full scan',
        subtitle: label,
        description: 'Deepen recon with a full-port aggressive Nmap scan.',
        command: `nmap -Pn -A -p- ${label}`,
        sourceLabel: 'Graph',
        category: 'Host context',
        targetIds: normalizeTargetIds(node?.data?.targetIds),
        baseScore: 240,
      },
    );
  }

  if (nodeType === 'service') {
    const parsed = parseServiceNode(node);
    const nodeMap = new Map((Array.isArray(nodes) ? nodes : []).map((item) => [item.id, item]));
    const hostEdge = (Array.isArray(edges) ? edges : []).find((edge) => (
      String(edge?.label || '').toLowerCase() === 'found'
      && edge?.target === node.id
      && nodeMap.get(edge?.source)?.data?.nodeType === 'host'
    ));
    const hostNode = hostEdge ? nodeMap.get(hostEdge.source) : null;
    const hostLabel = String(hostNode?.data?.label || '').trim();

    if (hostLabel && parsed.port) {
      actions.push({
        id: `graph-service-verify:${node.id}`,
        kind: 'graph' as const,
        label: 'Re-verify service metadata',
        subtitle: `${parsed.service}:${parsed.port}/${parsed.protocol}`,
        description: 'Confirm service fingerprinting for the selected endpoint.',
        command: `nmap -Pn -sV -p ${parsed.port} ${hostLabel}`,
        sourceLabel: 'Graph',
        category: 'Service context',
        targetIds: mergeTargetIds(node?.data?.targetIds, hostNode?.data?.targetIds),
        sourceNodeIds: [node.id, hostNode?.id].filter(Boolean) as string[],
        baseScore: 255,
      });
    }
  }

  if (nodeType === 'vulnerability' && /^cve-\d{4}-\d+/i.test(label)) {
    actions.push({
      id: `graph-cve-search:${node.id}`,
      kind: 'graph' as const,
      label: 'Research exploit references',
      subtitle: label.toUpperCase(),
      description: 'Search local exploit references for the selected CVE.',
      command: `searchsploit ${label.toUpperCase()}`,
      sourceLabel: 'Graph',
      category: 'Vulnerability context',
      targetIds: normalizeTargetIds(node?.data?.targetIds),
      baseScore: 275,
    });
  }

  return dedupeGraphActions(actions).slice(0, 8);
}
