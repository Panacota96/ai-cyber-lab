import { isToolAvailable } from '@/lib/tool-availability';

function asNumber(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function normalizeTargetIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))];
}

function mergeTargetIds(...values) {
  return [...new Set(values.flatMap((value) => normalizeTargetIds(value)))];
}

function parseServiceLabel(label = '') {
  const match = String(label || '').trim().match(/^([a-z0-9._-]+):(\d+)\/(tcp|udp)$/i);
  if (!match) return { service: '', port: null, protocol: 'tcp' };
  return {
    service: String(match[1] || '').toLowerCase(),
    port: Number(match[2] || 0) || null,
    protocol: String(match[3] || 'tcp').toLowerCase(),
  };
}

function normalizeHostNode(node = {}) {
  return {
    id: node.id,
    label: String(node?.data?.label || '').trim(),
    nodeType: String(node?.data?.nodeType || '').trim(),
    targetIds: normalizeTargetIds(node?.data?.targetIds),
  };
}

function normalizeServiceNode(node = {}) {
  const details = node?.data?.details || {};
  const parsed = parseServiceLabel(node?.data?.label);
  return {
    id: node.id,
    label: String(node?.data?.label || '').trim(),
    service: String(details?.service || node?.data?.service || parsed.service || '').toLowerCase(),
    port: asNumber(details?.port ?? node?.data?.port ?? parsed.port),
    protocol: String(details?.protocol || parsed.protocol || 'tcp').toLowerCase(),
    product: String(details?.product || '').trim(),
    version: String(details?.version || '').trim(),
    targetIds: mergeTargetIds(node?.data?.targetIds, details?.targetIds),
  };
}

const SERVICE_CATALOG = {
  http: [
    {
      id: 'whatweb',
      title: 'Fingerprint the web stack',
      rationale: 'Detect server technologies before deeper content discovery.',
      command: ({ host }) => `whatweb http://${host}`,
      binary: 'whatweb',
      confidence: 0.98,
    },
    {
      id: 'gobuster-dir',
      title: 'Enumerate web content',
      rationale: 'Run a common dirb wordlist against the discovered HTTP service.',
      command: ({ host, port }) => `gobuster dir -u http://${host}${port && port !== 80 ? `:${port}` : ''} -w /usr/share/wordlists/dirb/common.txt`,
      binary: 'gobuster',
      confidence: 0.95,
    },
    {
      id: 'ffuf-basic',
      title: 'Fuzz common paths',
      rationale: 'Quickly probe for hidden files and directories.',
      command: ({ host, port }) => `ffuf -u http://${host}${port && port !== 80 ? `:${port}` : ''}/FUZZ -w /usr/share/wordlists/dirb/common.txt`,
      binary: 'ffuf',
      confidence: 0.9,
    },
  ],
  https: [
    {
      id: 'whatweb-https',
      title: 'Fingerprint the HTTPS stack',
      rationale: 'Collect server and framework fingerprints on the TLS endpoint.',
      command: ({ host, port }) => `whatweb https://${host}${port && port !== 443 ? `:${port}` : ''}`,
      binary: 'whatweb',
      confidence: 0.98,
    },
    {
      id: 'sslscan',
      title: 'Inspect TLS configuration',
      rationale: 'Enumerate ciphers, protocol versions, and certificate posture.',
      command: ({ host, port }) => `sslscan ${host}${port && port !== 443 ? `:${port}` : ''}`,
      binary: 'sslscan',
      confidence: 0.94,
    },
    {
      id: 'gobuster-https',
      title: 'Enumerate HTTPS content',
      rationale: 'Run lightweight content discovery over HTTPS.',
      command: ({ host, port }) => `gobuster dir -u https://${host}${port && port !== 443 ? `:${port}` : ''} -w /usr/share/wordlists/dirb/common.txt`,
      binary: 'gobuster',
      confidence: 0.9,
    },
  ],
  smb: [
    {
      id: 'smb-list',
      title: 'List SMB shares',
      rationale: 'Check anonymous or available shares on the discovered SMB service.',
      command: ({ host, port }) => `smbclient -L //${host} -p ${port || 445} -N`,
      binary: 'smbclient',
      confidence: 0.97,
    },
    {
      id: 'nmap-smb',
      title: 'Run SMB NSE scripts',
      rationale: 'Gather SMB versioning and share metadata with Nmap scripts.',
      command: ({ host, port }) => `nmap -Pn -p ${port || 445} --script smb-os-discovery,smb-enum-shares ${host}`,
      binary: 'nmap',
      confidence: 0.92,
    },
  ],
  ldap: [
    {
      id: 'ldap-rootdse',
      title: 'Query LDAP RootDSE',
      rationale: 'Collect naming contexts and domain metadata from LDAP.',
      command: ({ host, port }) => `ldapsearch -x -H ldap://${host}:${port || 389} -b "" -s base namingContexts`,
      binary: 'ldapsearch',
      confidence: 0.96,
    },
    {
      id: 'nmap-ldap',
      title: 'Run LDAP NSE discovery',
      rationale: 'Use Nmap LDAP scripts to collect base directory details.',
      command: ({ host, port }) => `nmap -Pn -p ${port || 389} --script ldap-rootdse ${host}`,
      binary: 'nmap',
      confidence: 0.88,
    },
  ],
  ftp: [
    {
      id: 'curl-ftp',
      title: 'Test anonymous FTP access',
      rationale: 'Quickly check whether FTP allows anonymous listing.',
      command: ({ host, port }) => `curl --silent --show-error ftp://${host}:${port || 21}/ --user anonymous:anonymous`,
      binary: 'curl',
      confidence: 0.9,
    },
    {
      id: 'nmap-ftp-anon',
      title: 'Run ftp-anon NSE script',
      rationale: 'Use Nmap to validate anonymous FTP access and banner details.',
      command: ({ host, port }) => `nmap -Pn -p ${port || 21} --script ftp-anon ${host}`,
      binary: 'nmap',
      confidence: 0.86,
    },
  ],
  ssh: [
    {
      id: 'nmap-ssh-auth',
      title: 'Enumerate SSH auth methods',
      rationale: 'Check whether password or pubkey auth is enabled before using credentials.',
      command: ({ host, port }) => `nmap -Pn -p ${port || 22} --script ssh-auth-methods ${host}`,
      binary: 'nmap',
      confidence: 0.89,
    },
  ],
  mysql: [
    {
      id: 'nmap-mysql-info',
      title: 'Collect MySQL service metadata',
      rationale: 'Gather version and auth posture before attempting credentials.',
      command: ({ host, port }) => `nmap -Pn -p ${port || 3306} --script mysql-info ${host}`,
      binary: 'nmap',
      confidence: 0.88,
    },
  ],
  mssql: [
    {
      id: 'nmap-mssql-info',
      title: 'Collect MSSQL service metadata',
      rationale: 'Gather Microsoft SQL discovery details using NSE.',
      command: ({ host, port }) => `nmap -Pn -p ${port || 1433} --script ms-sql-info ${host}`,
      binary: 'nmap',
      confidence: 0.86,
    },
  ],
};

function serviceVariants(service = '') {
  const normalized = String(service || '').trim().toLowerCase();
  if (!normalized) return [];
  if (normalized === 'ssl/http' || normalized === 'http-proxy') return ['https', 'http'];
  if (normalized === 'microsoft-ds') return ['smb'];
  if (normalized === 'ldaps') return ['ldap'];
  return [normalized];
}

export function buildServiceSuggestionsFromGraph(graphState = {}) {
  const nodes = Array.isArray(graphState?.nodes) ? graphState.nodes : [];
  const edges = Array.isArray(graphState?.edges) ? graphState.edges : [];
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const suggestionMap = new Map();

  for (const edge of edges) {
    if (String(edge?.label || '').toLowerCase() !== 'found') continue;
    const hostNode = normalizeHostNode(nodeMap.get(edge.source));
    const serviceNode = normalizeServiceNode(nodeMap.get(edge.target));
    if (!hostNode.id || !serviceNode.id || !hostNode.label) continue;

    for (const variant of serviceVariants(serviceNode.service)) {
      const templates = SERVICE_CATALOG[variant] || [];
      for (const template of templates) {
        if (!isToolAvailable(template.binary)) continue;
        const command = template.command({
          host: hostNode.label,
          port: serviceNode.port,
          service: serviceNode.service,
          product: serviceNode.product,
          version: serviceNode.version,
        });
        const suggestionId = `${hostNode.id}:${serviceNode.id}:${template.id}`;
        suggestionMap.set(suggestionId, {
          id: suggestionId,
          title: template.title,
          rationale: template.rationale,
          command,
          service: serviceNode.service,
          host: hostNode.label,
          confidence: template.confidence,
          sourceNodeIds: [hostNode.id, serviceNode.id],
          targetIds: mergeTargetIds(hostNode.targetIds, serviceNode.targetIds),
        });
      }
    }
  }

  return [...suggestionMap.values()].sort((a, b) => (
    Number(b.confidence || 0) - Number(a.confidence || 0)
    || String(a.host).localeCompare(String(b.host))
    || String(a.service).localeCompare(String(b.service))
  ));
}
