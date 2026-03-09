/**
 * graph-derive.js
 * Pure functions that extract graph nodes and edges from timeline events.
 * Called client-side (no DB imports) — works on the raw event array.
 */

const NODE_TYPES = {
  host: 'host',
  service: 'service',
  vulnerability: 'vulnerability',
  exploit: 'exploit',
  credential: 'credential',
  flag: 'flag',
  note: 'note',
};

/** Deterministic stable ID from a string label + type */
function nodeId(type, label) {
  return `${type}::${label.toLowerCase().replace(/\s+/g, '-')}`;
}

function edgeId(sourceId, targetId, label) {
  return `edge::${sourceId}--${targetId}--${label}`;
}

/** Phase assignment based on node type */
export const NODE_PHASE = {
  host:          'Information Gathering',
  service:       'Enumeration',
  vulnerability: 'Vulnerability Assessment',
  exploit:       'Exploitation',
  credential:    'Post-Exploitation',
  flag:          'Proof-of-Concept',
  note:          'Any',
};

/** Color map matching the cyberpunk CSS variables */
export const NODE_COLORS = {
  host:          '#39d353', // --accent-primary green
  service:       '#58a6ff', // --accent-secondary blue
  vulnerability: '#f85149', // --accent-danger red
  exploit:       '#e09400', // orange
  credential:    '#d29922', // gold
  flag:          '#ffd700', // bright gold
  note:          '#8b949e', // muted
};

// ── Extraction patterns ────────────────────────────────────────────────────

const IP_RE        = /\b(\d{1,3}(?:\.\d{1,3}){3})\b/g;
const PORT_RE      = /(\d{1,5})\/tcp\s+open\s+(\S+)/g;
const CVE_RE       = /\b(CVE-\d{4}-\d{4,})\b/gi;
const FLAG_RE      = /\b(?:flag|HTB|ctf|THM)\{[^}]{1,120}\}/gi;
const CRED_RE      = /(?:password|passwd|hash|shadow|credentials?)[:\s=]+(\S{4,})/gi;
const URL_RE       = /https?:\/\/[\w\-./:%?=#&]+/g;
const PATH_RE      = /(?:\/etc\/passwd|\/etc\/shadow|\/root\/.+|\/home\/\w+\/.+)/g;

/**
 * Derive new nodes and edges from a single timeline event.
 * Returns { nodes: [...], edges: [...] } — caller merges into existing graph.
 *
 * @param {object} event - timeline event (type, command, output, content, tags, timestamp)
 * @param {object[]} existingNodes - current graph nodes (to avoid duplicates)
 */
export function deriveFromEvent(event, existingNodes = []) {
  const existingIds = new Set(existingNodes.map(n => n.id));
  const newNodes = [];
  const newEdges = [];

  const addNode = (type, label, extra = {}) => {
    const id = nodeId(type, label);
    if (existingIds.has(id)) return null;
    existingIds.add(id);
    const n = {
      id,
      type: 'discovery',           // custom React Flow node type
      data: {
        nodeType: type,
        label,
        phase: NODE_PHASE[type],
        color: NODE_COLORS[type],
        sourceEventId: event.id,
        timestamp: event.timestamp,
        ...extra,
      },
      position: { x: 0, y: 0 },    // auto-layout will reposition
    };
    newNodes.push(n);
    return id;
  };

  const addEdge = (source, target, label = '') => {
    if (!source || !target) return;
    const id = edgeId(source, target, label);
    newEdges.push({
      id,
      source,
      target,
      label,
      animated: false,
      style: { stroke: '#30363d' },
    });
  };

  // ── Note events ──────────────────────────────────────────────────────────
  if (event.type === 'note' && event.content) {
    const label = (event.content || '').slice(0, 60).trim();
    addNode(NODE_TYPES.note, label || 'Note');
    return { newNodes, newEdges };
  }

  // ── Command events (only process completed ones) ──────────────────────────
  if (event.type !== 'command' || event.status === 'running') return { newNodes, newEdges };

  const text = `${event.command || ''}\n${event.output || ''}`;

  // 1. IPs → host nodes
  const ips = [...new Set([...text.matchAll(IP_RE)].map(m => m[1]))].filter(ip => {
    // Exclude obviously local/broadcast
    return !ip.startsWith('127.') && !ip.startsWith('255.') && ip !== '0.0.0.0';
  });

  let lastHostId = null;
  for (const ip of ips) {
    const id = addNode(NODE_TYPES.host, ip);
    if (id) lastHostId = id;
    else lastHostId = nodeId(NODE_TYPES.host, ip); // already exists, still track it
  }

  // 2. Open ports → service nodes, linked from last host
  const portMatches = [...text.matchAll(PORT_RE)];
  for (const m of portMatches) {
    const [, port, service] = m;
    const label = `${service}:${port}`;
    const svcId = addNode(NODE_TYPES.service, label, { port, service });
    if (lastHostId) addEdge(lastHostId, svcId || nodeId(NODE_TYPES.service, label), 'found');
  }

  // 3. CVEs → vulnerability nodes, linked from last host
  const cves = [...new Set([...text.matchAll(CVE_RE)].map(m => m[1].toUpperCase()))];
  for (const cve of cves) {
    const vulnId = addNode(NODE_TYPES.vulnerability, cve);
    if (lastHostId) addEdge(lastHostId, vulnId || nodeId(NODE_TYPES.vulnerability, cve), 'vulnerable');
  }

  // 4. Flags → flag nodes
  const flags = [...text.matchAll(FLAG_RE)].map(m => m[0]);
  for (const flag of flags) {
    addNode(NODE_TYPES.flag, flag.slice(0, 60));
  }

  // 5. Credentials → credential nodes
  const credMatches = [...text.matchAll(CRED_RE)];
  for (const m of credMatches) {
    const cred = m[1].slice(0, 40);
    const credId = addNode(NODE_TYPES.credential, cred);
    if (lastHostId) addEdge(lastHostId, credId || nodeId(NODE_TYPES.credential, cred), 'credential');
  }

  // 6. URLs → service nodes (web)
  const urls = [...new Set([...text.matchAll(URL_RE)].map(m => {
    try { return new URL(m[0]).origin; } catch { return null; }
  }).filter(Boolean))];
  for (const url of urls) {
    const svcId = addNode(NODE_TYPES.service, url);
    if (lastHostId) addEdge(lastHostId, svcId || nodeId(NODE_TYPES.service, url), 'web');
  }

  // 7. Sensitive paths → credential nodes
  const paths = [...text.matchAll(PATH_RE)].map(m => m[0]);
  for (const p of paths) {
    addNode(NODE_TYPES.credential, p.slice(0, 50));
  }

  return { newNodes, newEdges };
}

/**
 * Rebuild the full graph from a timeline array.
 * Used when loading a session to sync auto-derived nodes.
 */
export function deriveFromTimeline(events, existingNodes = [], existingEdges = []) {
  let nodes = [...existingNodes];
  let edges = [...existingEdges];

  for (const event of events) {
    const { newNodes, newEdges } = deriveFromEvent(event, nodes);
    nodes = [...nodes, ...newNodes];
    edges = [...edges, ...newEdges];
  }

  return { nodes, edges };
}

/**
 * Generate a Mermaid flowchart string from nodes + edges.
 */
export function toMermaid(nodes, edges) {
  const lines = ['flowchart TD'];
  const icon = { host: '🖥', service: '⚙', vulnerability: '⚠', exploit: '💥', credential: '🔑', flag: '🚩', note: '📝' };

  for (const n of nodes) {
    const { nodeType, label } = n.data || {};
    const safeId = n.id.replace(/[^a-zA-Z0-9_]/g, '_');
    const emoji = icon[nodeType] || '';
    lines.push(`  ${safeId}["${emoji} ${label?.replace(/"/g, "'") || n.id}"]`);
  }

  for (const e of edges) {
    const srcId = e.source.replace(/[^a-zA-Z0-9_]/g, '_');
    const tgtId = e.target.replace(/[^a-zA-Z0-9_]/g, '_');
    const lbl = e.label ? `|${e.label}|` : '';
    lines.push(`  ${srcId} --${lbl}--> ${tgtId}`);
  }

  return lines.join('\n');
}
