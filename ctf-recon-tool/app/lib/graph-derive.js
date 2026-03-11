const NODE_TYPES = {
  host: 'host',
  subdomain: 'subdomain',
  service: 'service',
  vulnerability: 'vulnerability',
  exploit: 'exploit',
  credential: 'credential',
  username: 'username',
  hash: 'hash',
  database: 'database',
  directory: 'directory',
  'api-endpoint': 'api-endpoint',
  flag: 'flag',
  note: 'note',
};

export const PHASE_ORDER = [
  'Information Gathering',
  'Enumeration',
  'Vulnerability Assessment',
  'Exploitation',
  'Post-Exploitation',
  'Proof-of-Concept',
  'Any',
];

export const NODE_PHASE = {
  host: 'Information Gathering',
  subdomain: 'Information Gathering',
  service: 'Enumeration',
  database: 'Enumeration',
  directory: 'Enumeration',
  'api-endpoint': 'Enumeration',
  vulnerability: 'Vulnerability Assessment',
  exploit: 'Exploitation',
  credential: 'Post-Exploitation',
  username: 'Post-Exploitation',
  hash: 'Post-Exploitation',
  flag: 'Proof-of-Concept',
  note: 'Any',
};

export const NODE_COLORS = {
  host: '#39d353',
  subdomain: '#2ea043',
  service: '#58a6ff',
  database: '#1f6feb',
  directory: '#7ee787',
  'api-endpoint': '#79c0ff',
  vulnerability: '#f85149',
  exploit: '#ff7b72',
  credential: '#d29922',
  username: '#e3b341',
  hash: '#c297ff',
  flag: '#ffd700',
  note: '#8b949e',
};

export const NODE_ICONS = {
  host: 'IP',
  subdomain: 'DNS',
  service: 'SVC',
  database: 'DB',
  directory: 'DIR',
  'api-endpoint': 'API',
  vulnerability: 'VULN',
  exploit: 'EXP',
  credential: 'CRED',
  username: 'USER',
  hash: 'HASH',
  flag: 'FLAG',
  note: 'NOTE',
};

const COL_WIDTH = 240;
const ROW_HEIGHT = 108;
const LAYOUT_PADDING_X = 40;
const LAYOUT_PADDING_Y = 48;

const IP_RE = /\b(\d{1,3}(?:\.\d{1,3}){3})\b/g;
const HOSTNAME_RE = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\b/gi;
const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+/gi;
const PORT_RE = /(\d{1,5})\/(tcp|udp)\s+open\s+([a-z0-9._-]+)/gi;
const CVE_RE = /\b(CVE-\d{4}-\d{4,})\b/gi;
const FLAG_RE = /\b(?:HTB|THM|flag|ctf)\{[^}\r\n]{1,200}\}/gi;
const PASSWORD_RE = /\b(?:password|passwd|credentials?|secret|token|api[_-]?key)\s*[:=]\s*([^\s,;]+)/gi;
const USERNAME_RES = [
  /\b(?:user(?:name)?|login|account)\s*[:=]\s*([a-z0-9._-]{2,64})/gi,
  /\bas\s+([a-z0-9._-]{2,64})\b/gi,
  /\buid=\d+\(([^)]+)\)/g,
];
const DB_RES = [
  /\b(?:database|db|schema|catalog)\b\s*[:=]?\s*([a-z0-9_.-]{2,128})/gi,
  /\b(mysql|postgres(?:ql)?|mssql|sqlserver|oracle|mongodb|redis|mariadb)\b/gi,
];
const API_HTTP_RE = /\b(?:GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+((?:https?:\/\/[^\s]+)|\/[a-z0-9._~:/?#[\]@!$&'()*+,;=%-]+)/gi;
const UNIX_PATH_RE = /\b(?:\/(?:etc|var|opt|srv|tmp|usr|home|root|www|app|api|admin)[^\s"'<>]*)/g;
const WINDOWS_PATH_RE = /\b([a-z]:\\(?:[^<>:"|?*\r\n\\]+\\)*[^<>:"|?*\r\n\\]*)/gi;
const UNC_PATH_RE = /(\\\\[a-z0-9_.-]+\\[^\s"'<>]+)/gi;
const HASH_PATTERNS = [
  /\b[a-f0-9]{32}\b/gi,
  /\b[a-f0-9]{40}\b/gi,
  /\b[a-f0-9]{64}\b/gi,
  /\b[a-f0-9]{128}\b/gi,
];

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

export function stableNodeId(type, label) {
  return `${type}::${slugify(label) || 'node'}`;
}

export function stableEdgeId(sourceId, targetId, label = '') {
  const suffix = slugify(label) || 'link';
  return `edge::${sourceId}--${targetId}--${suffix}`;
}

function isIpAddress(value) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(String(value || '').trim());
}

function isIgnoredIp(value) {
  return /^(?:127\.|255\.|0\.0\.0\.0|169\.254\.)/.test(value);
}

function classifyHostname(hostname) {
  return hostname.split('.').length >= 3 ? NODE_TYPES.subdomain : NODE_TYPES.host;
}

function normalizeLabel(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 240);
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function hasValidPosition(node) {
  return Number.isFinite(node?.position?.x) && Number.isFinite(node?.position?.y);
}

function inferOrigin(data = {}) {
  if (data.origin === 'auto' || data.origin === 'manual') return data.origin;
  return data.sourceEventId || data.sourceFindingId ? 'auto' : 'manual';
}

function buildEdgeStyle(stroke = '#30363d') {
  return { stroke };
}

function isHighSignalLabel(label = '') {
  return [
    'vulnerable',
    'credential',
    'hash',
    'flag',
    'exploit',
    'api',
    'username',
    'database',
    'directory',
    'finding',
  ].includes(String(label || '').trim().toLowerCase());
}

function buildEdge(source, target, label = '', stroke = '#30363d', animated = false) {
  return {
    id: stableEdgeId(source, target, label),
    source,
    target,
    label,
    animated,
    style: buildEdgeStyle(stroke),
    markerEnd: {
      type: 'arrowclosed',
      color: stroke,
    },
  };
}

function buildNode(type, label, meta = {}) {
  const normalizedLabel = normalizeLabel(label);
  if (!normalizedLabel) return null;
  const color = meta.color || NODE_COLORS[type] || '#58a6ff';
  return {
    id: stableNodeId(type, normalizedLabel),
    type: 'discovery',
    position: hasValidPosition(meta) ? meta.position : { x: 0, y: 0 },
    data: {
      nodeType: type,
      label: normalizedLabel,
      phase: meta.phase || NODE_PHASE[type] || 'Any',
      color,
      origin: meta.origin || inferOrigin(meta),
      sourceEventId: meta.sourceEventId || undefined,
      sourceFindingId: meta.sourceFindingId || undefined,
      timestamp: meta.timestamp || undefined,
      port: meta.port || undefined,
      service: meta.service || undefined,
      severity: meta.severity || undefined,
    },
  };
}

export function normalizeGraphNode(node) {
  const nodeType = node?.data?.nodeType || 'host';
  const label = normalizeLabel(node?.data?.label || node?.label || node?.id);
  const built = buildNode(nodeType, label, {
    ...node?.data,
    ...node,
    position: hasValidPosition(node) ? node.position : { x: 0, y: 0 },
    origin: inferOrigin(node?.data || {}),
  });
  return {
    ...built,
    id: node?.id || built.id,
  };
}

export function normalizeGraphEdge(edge) {
  if (!edge?.source || !edge?.target) return null;
  const stroke = edge?.style?.stroke || '#30363d';
  const label = edge?.label || '';
  return {
    ...buildEdge(edge.source, edge.target, label, stroke, Boolean(edge.animated)),
    id: edge.id || stableEdgeId(edge.source, edge.target, label),
    style: { ...buildEdgeStyle(stroke), ...(edge.style || {}) },
    markerEnd: edge.markerEnd || { type: 'arrowclosed', color: stroke },
  };
}

export function normalizeGraphState(nodes = [], edges = []) {
  const normalizedNodes = [];
  const nodeMap = new Map();
  for (const rawNode of safeArray(nodes)) {
    if (!rawNode) continue;
    const node = normalizeGraphNode(rawNode);
    if (!node?.id) continue;
    if (!nodeMap.has(node.id)) {
      nodeMap.set(node.id, node);
      normalizedNodes.push(node);
    } else {
      nodeMap.set(node.id, { ...nodeMap.get(node.id), ...node, data: { ...nodeMap.get(node.id).data, ...node.data } });
    }
  }

  const nodeIds = new Set(nodeMap.keys());
  const normalizedEdges = [];
  const edgeMap = new Map();
  for (const rawEdge of safeArray(edges)) {
    const edge = normalizeGraphEdge(rawEdge);
    if (!edge || edge.source === edge.target) continue;
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    if (edgeMap.has(edge.id)) continue;
    edgeMap.set(edge.id, edge);
    normalizedEdges.push(edge);
  }

  return { nodes: [...nodeMap.values()], edges: normalizedEdges };
}

export function mergeGraphState(baseState = {}, incomingState = {}, options = {}) {
  const { preserveLocalManual = false } = options;
  const base = normalizeGraphState(baseState.nodes || [], baseState.edges || []);
  const incoming = normalizeGraphState(incomingState.nodes || [], incomingState.edges || []);

  const nodeMap = new Map();
  for (const node of incoming.nodes) {
    nodeMap.set(node.id, node);
  }

  for (const node of base.nodes) {
    if (!nodeMap.has(node.id) && (!preserveLocalManual || inferOrigin(node.data) === 'manual')) {
      nodeMap.set(node.id, node);
    }
  }

  const mergedNodes = [...nodeMap.values()];
  const nodeIds = new Set(mergedNodes.map((node) => node.id));

  const edgeMap = new Map();
  for (const edge of incoming.edges) {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      edgeMap.set(edge.id, edge);
    }
  }
  for (const edge of base.edges) {
    if (!edgeMap.has(edge.id) && nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      edgeMap.set(edge.id, edge);
    }
  }

  return normalizeGraphState(mergedNodes, [...edgeMap.values()]);
}

function collectMatches(text, regexes) {
  const values = new Set();
  for (const regex of regexes) {
    for (const match of text.matchAll(regex)) {
      const value = normalizeLabel(match[1] || match[0]);
      if (value) values.add(value);
    }
  }
  return [...values];
}

function uniqueValues(values) {
  return [...new Set(values.map((value) => normalizeLabel(value)).filter(Boolean))];
}

function extractUrls(text) {
  const urls = [];
  for (const match of text.matchAll(URL_RE)) {
    try {
      urls.push(new URL(match[0]));
    } catch {
      // ignore invalid URL
    }
  }
  return urls;
}

function extractIpAddresses(text) {
  return uniqueValues(
    [...text.matchAll(IP_RE)]
      .map((match) => match[1])
      .filter((ip) => !isIgnoredIp(ip))
  );
}

function extractHostnames(text, urls = []) {
  const fromUrls = urls.map((url) => url.hostname).filter((hostname) => hostname && !isIpAddress(hostname));
  const fromText = [...text.matchAll(HOSTNAME_RE)]
    .map((match) => match[0].toLowerCase())
    .filter((hostname) => !isIpAddress(hostname));
  return uniqueValues([...fromUrls, ...fromText]);
}

function extractServiceMatches(text) {
  const values = [];
  for (const match of text.matchAll(PORT_RE)) {
    const port = match[1];
    const protocol = String(match[2] || 'tcp').toLowerCase();
    const service = String(match[3] || 'unknown').toLowerCase();
    values.push({ port, protocol, service, label: `${service}:${port}/${protocol}` });
  }
  return values;
}

function extractCredentials(text) {
  return uniqueValues([...text.matchAll(PASSWORD_RE)].map((match) => match[1]));
}

function extractUsernames(text) {
  return uniqueValues(collectMatches(text, USERNAME_RES));
}

function extractHashes(text) {
  const found = [];
  for (const regex of HASH_PATTERNS) {
    found.push(...[...text.matchAll(regex)].map((match) => match[0].toLowerCase()));
  }
  return uniqueValues(found);
}

function extractDatabases(text, services = []) {
  const values = collectMatches(text, DB_RES);
  const fromServices = services
    .filter((item) => /(mysql|postgres|mssql|oracle|mongodb|redis|mariadb)/i.test(item.service))
    .map((item) => item.service);
  return uniqueValues([...values, ...fromServices]);
}

function classifyUrlPath(url) {
  if (!url?.pathname || url.pathname === '/') return null;
  const full = `${url.origin}${url.pathname}`;
  if (/^\/api(?:\/|$)/i.test(url.pathname) || /(graphql|swagger|openapi|rest|v\d+)/i.test(url.pathname)) {
    return { type: NODE_TYPES['api-endpoint'], label: full, edgeLabel: 'api' };
  }

  const normalizedPath = url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname;
  const lastSegment = normalizedPath.split('/').filter(Boolean).pop() || '';
  const hasExtension = /\.[a-z0-9]{1,6}$/i.test(lastSegment);
  if (!hasExtension || /\/(?:admin|uploads|images|assets|config|backup|api)\b/i.test(url.pathname)) {
    return { type: NODE_TYPES.directory, label: full, edgeLabel: 'directory' };
  }
  return null;
}

function extractUrlDerivedNodes(urls) {
  const items = [];
  for (const url of urls) {
    const entry = classifyUrlPath(url);
    if (entry) items.push(entry);
  }
  return items;
}

function extractPathNodes(text) {
  const values = [];
  for (const match of text.matchAll(WINDOWS_PATH_RE)) {
    values.push({ type: NODE_TYPES.directory, label: match[1] });
  }
  for (const match of text.matchAll(UNC_PATH_RE)) {
    values.push({ type: NODE_TYPES.directory, label: match[1] });
  }
  for (const match of text.matchAll(UNIX_PATH_RE)) {
    values.push({ type: NODE_TYPES.directory, label: match[0] });
  }
  return values;
}

function extractApiEndpoints(text) {
  const values = [];
  for (const match of text.matchAll(API_HTTP_RE)) {
    values.push(normalizeLabel(match[1]));
  }
  return uniqueValues(values).map((label) => ({ type: NODE_TYPES['api-endpoint'], label }));
}

function buildAdder(existingNodes = [], existingEdges = [], meta = {}) {
  const nodeMap = new Map(normalizeGraphState(existingNodes, existingEdges).nodes.map((node) => [node.id, node]));
  const edgeMap = new Map(normalizeGraphState(existingNodes, existingEdges).edges.map((edge) => [edge.id, edge]));
  const newNodes = [];
  const newEdges = [];

  const addNode = (type, label, extra = {}) => {
    const node = buildNode(type, label, {
      ...meta,
      ...extra,
      phase: extra.phase || NODE_PHASE[type] || meta.phase || 'Any',
      color: extra.color || NODE_COLORS[type] || meta.color || '#58a6ff',
      origin: extra.origin || meta.origin || 'auto',
    });
    if (!node) return null;
    const existing = nodeMap.get(node.id);
    if (existing) {
      nodeMap.set(node.id, {
        ...existing,
        data: {
          ...existing.data,
          ...node.data,
          origin: inferOrigin(existing.data),
        },
      });
      return existing.id;
    }
    nodeMap.set(node.id, node);
    newNodes.push(node);
    return node.id;
  };

  const addEdge = (source, target, label = '', stroke = '#30363d') => {
    if (!source || !target || source === target) return null;
    const edge = buildEdge(source, target, label, stroke, isHighSignalLabel(label));
    if (edgeMap.has(edge.id)) return edge.id;
    edgeMap.set(edge.id, edge);
    newEdges.push(edge);
    return edge.id;
  };

  return { addNode, addEdge, newNodes, newEdges };
}

function deriveEvidence(text, meta, existingNodes = [], existingEdges = []) {
  const urls = extractUrls(text);
  const hostnames = extractHostnames(text, urls);
  const ips = extractIpAddresses(text);
  const services = extractServiceMatches(text);
  const credentials = extractCredentials(text);
  const usernames = extractUsernames(text);
  const hashes = extractHashes(text);
  const databases = extractDatabases(text, services);
  const pathNodes = extractPathNodes(text);
  const apiNodes = extractApiEndpoints(text);
  const urlDerivedNodes = extractUrlDerivedNodes(urls);

  const { addNode, addEdge, newNodes, newEdges } = buildAdder(existingNodes, existingEdges, meta);
  const primaryTargets = [];

  for (const ip of ips) {
    const nodeId = addNode(NODE_TYPES.host, ip);
    if (nodeId) primaryTargets.push(nodeId);
  }

  for (const hostname of hostnames) {
    const type = classifyHostname(hostname);
    const nodeId = addNode(type, hostname);
    if (nodeId) primaryTargets.push(nodeId);
  }

  const uniquePrimaryTargets = uniqueValues(primaryTargets);
  const attachTargets = uniquePrimaryTargets.length > 0 ? uniquePrimaryTargets : [];

  for (const service of services) {
    const serviceId = addNode(NODE_TYPES.service, service.label, {
      port: service.port,
      service: service.service,
    });
    for (const targetId of attachTargets) {
      addEdge(targetId, serviceId, 'found');
    }
  }

  for (const database of databases) {
    const databaseId = addNode(NODE_TYPES.database, database);
    for (const targetId of attachTargets) {
      addEdge(targetId, databaseId, 'database');
    }
  }

  for (const username of usernames) {
    const usernameId = addNode(NODE_TYPES.username, username);
    for (const targetId of attachTargets) {
      addEdge(targetId, usernameId, 'username');
    }
  }

  for (const hash of hashes) {
    const hashId = addNode(NODE_TYPES.hash, hash);
    for (const targetId of attachTargets) {
      addEdge(targetId, hashId, 'hash');
    }
  }

  for (const credential of credentials) {
    const credentialId = addNode(NODE_TYPES.credential, credential);
    for (const targetId of attachTargets) {
      addEdge(targetId, credentialId, 'credential');
    }
  }

  for (const pathNode of pathNodes) {
    const directoryId = addNode(pathNode.type, pathNode.label);
    for (const targetId of attachTargets) {
      addEdge(targetId, directoryId, 'directory');
    }
  }

  for (const endpoint of [...apiNodes, ...urlDerivedNodes]) {
    const endpointId = addNode(endpoint.type, endpoint.label);
    for (const targetId of attachTargets) {
      addEdge(targetId, endpointId, endpoint.edgeLabel || 'api');
    }
  }

  return { newNodes, newEdges, primaryTargets: attachTargets };
}

export function deriveFromFinding(finding, existingNodes = [], existingEdges = []) {
  if (!finding?.title) return { newNodes: [], newEdges: [] };
  const text = [
    finding.title,
    finding.description,
    finding.impact,
    finding.remediation,
    safeArray(finding.tags).join(' '),
  ].filter(Boolean).join('\n');

  const meta = {
    origin: 'auto',
    sourceFindingId: String(finding.id || ''),
    timestamp: finding.updatedAt || finding.createdAt || undefined,
    severity: finding.severity || undefined,
  };

  const { addNode, addEdge, newNodes, newEdges } = buildAdder(existingNodes, existingEdges, meta);
  const vulnId = addNode(NODE_TYPES.vulnerability, finding.title, {
    severity: finding.severity || undefined,
  });
  const evidence = deriveEvidence(text, meta, [...existingNodes, ...newNodes], [...existingEdges, ...newEdges]);
  newNodes.push(...evidence.newNodes);
  newEdges.push(...evidence.newEdges);

  for (const hostId of evidence.primaryTargets) {
    addEdge(hostId, vulnId, 'finding', '#f85149');
  }

  return { newNodes, newEdges };
}

export function deriveFromEvent(event, existingNodes = [], existingEdges = []) {
  if (!event || !event.type) return { newNodes: [], newEdges: [] };

  if (event.type === 'note' && event.content) {
    const label = normalizeLabel(event.content).slice(0, 80) || 'Note';
    const noteNode = buildNode(NODE_TYPES.note, label, {
      origin: 'auto',
      sourceEventId: event.id,
      timestamp: event.timestamp,
    });
    return noteNode ? { newNodes: [noteNode], newEdges: [] } : { newNodes: [], newEdges: [] };
  }

  if (event.type !== 'command' || String(event.status || '').toLowerCase() !== 'success') {
    return { newNodes: [], newEdges: [] };
  }

  const text = [event.command, event.output, event.content].filter(Boolean).join('\n');
  const meta = {
    origin: 'auto',
    sourceEventId: event.id,
    timestamp: event.timestamp,
  };

  const { addNode, addEdge, newNodes, newEdges } = buildAdder(existingNodes, existingEdges, meta);
  const evidence = deriveEvidence(text, meta, existingNodes, existingEdges);
  newNodes.push(...evidence.newNodes);
  newEdges.push(...evidence.newEdges);

  const targetIds = evidence.primaryTargets;

  const cves = uniqueValues([...text.matchAll(CVE_RE)].map((match) => match[1].toUpperCase()));
  for (const cve of cves) {
    const vulnId = addNode(NODE_TYPES.vulnerability, cve);
    for (const targetId of targetIds) {
      addEdge(targetId, vulnId, 'vulnerable', '#f85149');
    }
  }

  const flags = uniqueValues([...text.matchAll(FLAG_RE)].map((match) => match[0]));
  for (const flag of flags) {
    const flagId = addNode(NODE_TYPES.flag, flag.slice(0, 120));
    for (const targetId of targetIds) {
      addEdge(targetId, flagId, 'flag', '#ffd700');
    }
  }

  const exploitHints = [];
  if (/searchsploit|metasploit|msfconsole|exploit-db/i.test(text)) {
    exploitHints.push('Exploit Research');
  }
  if (/reverse shell|meterpreter|payload|webshell/i.test(text)) {
    exploitHints.push('Shell Access');
  }
  for (const exploit of uniqueValues(exploitHints)) {
    const exploitId = addNode(NODE_TYPES.exploit, exploit);
    for (const targetId of targetIds) {
      addEdge(targetId, exploitId, 'exploit', '#ff7b72');
    }
  }

  return { newNodes, newEdges };
}

export function applyEventToGraphState(state = {}, event) {
  const normalized = normalizeGraphState(state.nodes || [], state.edges || []);
  const { newNodes, newEdges } = deriveFromEvent(event, normalized.nodes, normalized.edges);
  const merged = mergeGraphState(normalized, { nodes: newNodes, edges: newEdges });
  return {
    ...merged,
    nodes: layoutGraphNodes(merged.nodes, { preserveExisting: true }),
  };
}

export function applyFindingsToGraphState(state = {}, findings = []) {
  let current = normalizeGraphState(state.nodes || [], state.edges || []);
  for (const finding of safeArray(findings)) {
    const { newNodes, newEdges } = deriveFromFinding(finding, current.nodes, current.edges);
    current = mergeGraphState(current, { nodes: newNodes, edges: newEdges });
  }
  return {
    ...current,
    nodes: layoutGraphNodes(current.nodes, { preserveExisting: true }),
  };
}

export function deriveFromTimeline(events, existingNodes = [], existingEdges = []) {
  let current = normalizeGraphState(existingNodes, existingEdges);
  for (const event of safeArray(events)) {
    current = applyEventToGraphState(current, event);
  }
  return current;
}

export function layoutGraphNodes(nodes = [], options = {}) {
  const { preserveExisting = true } = options;
  const normalizedNodes = normalizeGraphState(nodes, []).nodes;
  const phaseColumns = new Map();
  const phases = [...PHASE_ORDER];
  for (const node of normalizedNodes) {
    const phase = node.data?.phase || 'Any';
    if (!phaseColumns.has(phase)) phaseColumns.set(phase, []);
    if (!phases.includes(phase)) phases.push(phase);
    phaseColumns.get(phase).push(node);
  }

  const phaseIndex = new Map(phases.map((phase, index) => [phase, index]));
  const counts = new Map();

  return normalizedNodes.map((node) => {
    if (preserveExisting && hasValidPosition(node) && (node.position.x !== 0 || node.position.y !== 0)) {
      const phase = node.data?.phase || 'Any';
      counts.set(phase, Math.max(counts.get(phase) || 0, Math.floor((node.position.y - LAYOUT_PADDING_Y) / ROW_HEIGHT) + 1));
      return node;
    }
    const phase = node.data?.phase || 'Any';
    const col = phaseIndex.get(phase) ?? phaseIndex.get('Any') ?? 0;
    const row = counts.get(phase) || 0;
    counts.set(phase, row + 1);
    return {
      ...node,
      position: {
        x: LAYOUT_PADDING_X + (col * COL_WIDTH),
        y: LAYOUT_PADDING_Y + (row * ROW_HEIGHT),
      },
    };
  });
}

function mermaidId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_]/g, '_');
}

function mermaidLabel(value) {
  return String(value || '').replace(/"/g, "'").replace(/\n+/g, ' ');
}

export function toMermaid(nodes = [], edges = []) {
  const state = normalizeGraphState(nodes, edges);
  const lines = ['flowchart TD'];
  const phaseGroups = new Map();

  for (const node of state.nodes) {
    const phase = node.data?.phase || 'Any';
    if (!phaseGroups.has(phase)) phaseGroups.set(phase, []);
    phaseGroups.get(phase).push(node);
  }

  const orderedPhases = [
    ...PHASE_ORDER.filter((phase) => phaseGroups.has(phase)),
    ...[...phaseGroups.keys()].filter((phase) => !PHASE_ORDER.includes(phase)),
  ];

  for (const phase of orderedPhases) {
    lines.push(`  subgraph ${mermaidId(`phase_${phase}`)}["${mermaidLabel(phase)}"]`);
    for (const node of phaseGroups.get(phase) || []) {
      const nodeId = mermaidId(node.id);
      const icon = NODE_ICONS[node.data?.nodeType] || 'NODE';
      lines.push(`    ${nodeId}["${icon} ${mermaidLabel(node.data?.label || node.id)}"]`);
    }
    lines.push('  end');
  }

  for (const edge of state.edges) {
    const sourceId = mermaidId(edge.source);
    const targetId = mermaidId(edge.target);
    const label = edge.label ? `|${mermaidLabel(edge.label)}|` : '';
    lines.push(`  ${sourceId} -->${label} ${targetId}`);
  }

  for (const [type, color] of Object.entries(NODE_COLORS)) {
    const className = mermaidId(type);
    lines.push(`  classDef ${className} fill:${color},stroke:${color},stroke-width:1px,color:#0d1117;`);
    const ids = state.nodes
      .filter((node) => node.data?.nodeType === type)
      .map((node) => mermaidId(node.id));
    if (ids.length > 0) {
      lines.push(`  class ${ids.join(',')} ${className};`);
    }
  }

  return lines.join('\n');
}
