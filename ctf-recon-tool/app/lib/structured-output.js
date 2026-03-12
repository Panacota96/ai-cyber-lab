import { XMLBuilder, XMLParser, XMLValidator } from 'fast-xml-parser';

export const STRUCTURED_OUTPUT_MAX_BYTES = 2 * 1024 * 1024;

const CVE_RE = /\b(CVE-\d{4}-\d{4,})\b/gi;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
  allowBooleanAttributes: true,
});

const xmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  format: true,
  suppressEmptyNode: true,
});

function byteLength(value) {
  return Buffer.byteLength(String(value || ''), 'utf8');
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function clipText(value, max = 240) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function extractTextFragments(value, bucket = []) {
  if (value === undefined || value === null) return bucket;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    bucket.push(String(value));
    return bucket;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      extractTextFragments(item, bucket);
    }
    return bucket;
  }

  if (typeof value === 'object') {
    for (const item of Object.values(value)) {
      extractTextFragments(item, bucket);
    }
  }

  return bucket;
}

function normalizeCvesFromText(...parts) {
  const found = new Set();
  const text = parts
    .flatMap((part) => extractTextFragments(part, []))
    .filter(Boolean)
    .join('\n');

  for (const match of text.matchAll(CVE_RE)) {
    found.add(String(match[1] || '').toUpperCase());
  }

  return [...found];
}

function parseXmlDocument(rawOutput) {
  const trimmed = String(rawOutput || '').trim();
  if (!trimmed || (!trimmed.startsWith('<') && !trimmed.startsWith('<?xml'))) {
    return null;
  }

  const valid = XMLValidator.validate(trimmed);
  if (valid !== true) return null;

  try {
    const parsed = xmlParser.parse(trimmed);
    const pretty = xmlBuilder.build(parsed);
    return { parsed, pretty };
  } catch {
    return null;
  }
}

function normalizeHostScripts(rawScripts) {
  return asArray(rawScripts).map((script) => ({
    id: String(script?.id || '').trim(),
    output: clipText(script?.output || extractTextFragments(script, []).join(' '), 400),
    cves: normalizeCvesFromText(script),
  })).filter((script) => script.id || script.output || script.cves.length > 0);
}

function normalizeNmapPort(rawPort) {
  const service = rawPort?.service || {};
  const scripts = normalizeHostScripts(rawPort?.script);
  return {
    port: Number(rawPort?.portid || 0) || null,
    protocol: String(rawPort?.protocol || 'tcp').toLowerCase(),
    state: String(rawPort?.state?.state || '').toLowerCase() || 'unknown',
    service: String(service?.name || 'unknown').toLowerCase(),
    product: String(service?.product || '').trim(),
    version: String(service?.version || '').trim(),
    extrainfo: String(service?.extrainfo || '').trim(),
    tunnel: String(service?.tunnel || '').trim(),
    cpes: asArray(service?.cpe).map((item) => String(item || '').trim()).filter(Boolean),
    scripts,
    cves: normalizeCvesFromText(service, scripts),
  };
}

export function normalizeNmapDocument(rawDoc = {}) {
  const root = rawDoc?.nmaprun;
  if (!root || typeof root !== 'object') return null;

  const hosts = asArray(root.host).map((host) => {
    const addresses = asArray(host?.address).map((entry) => ({
      addr: String(entry?.addr || '').trim(),
      addrType: String(entry?.addrtype || '').trim().toLowerCase(),
    })).filter((entry) => entry.addr);

    const hostnames = asArray(host?.hostnames?.hostname).map((entry) => ({
      name: String(entry?.name || '').trim().toLowerCase(),
      type: String(entry?.type || '').trim().toLowerCase(),
    })).filter((entry) => entry.name);

    const ports = asArray(host?.ports?.port)
      .map((port) => normalizeNmapPort(port))
      .filter((port) => port.port && port.state === 'open');

    const hostScripts = normalizeHostScripts(host?.hostscript?.script);
    const status = String(host?.status?.state || '').trim().toLowerCase() || 'unknown';
    const osMatches = asArray(host?.os?.osmatch)
      .map((match) => String(match?.name || '').trim())
      .filter(Boolean);

    return {
      status,
      addresses,
      hostnames,
      ports,
      hostScripts,
      osMatches,
      cves: normalizeCvesFromText(hostScripts),
    };
  }).filter((host) => host.addresses.length > 0 || host.hostnames.length > 0 || host.ports.length > 0);

  const serviceCount = hosts.reduce((sum, host) => sum + host.ports.length, 0);
  const vulnerabilityCount = hosts.reduce((sum, host) => (
    sum
    + host.cves.length
    + host.ports.reduce((portSum, port) => portSum + port.cves.length, 0)
  ), 0);

  return {
    scanner: String(root?.scanner || '').trim() || 'nmap',
    args: String(root?.args || '').trim(),
    start: String(root?.startstr || '').trim() || null,
    hosts,
    summary: {
      hostCount: hosts.length,
      serviceCount,
      vulnerabilityCount,
      hosts: hosts.slice(0, 10).map((host) => ({
        addresses: host.addresses.map((entry) => entry.addr),
        hostnames: host.hostnames.map((entry) => entry.name),
        services: host.ports.slice(0, 12).map((port) => ({
          port: port.port,
          protocol: port.protocol,
          service: port.service,
          product: port.product || '',
          version: port.version || '',
          cves: port.cves,
        })),
      })),
    },
  };
}

function summarizeJsonValue(value) {
  if (Array.isArray(value)) {
    return {
      rootType: 'array',
      itemCount: value.length,
      preview: value.slice(0, 5),
    };
  }

  if (value && typeof value === 'object') {
    return {
      rootType: 'object',
      keyCount: Object.keys(value).length,
      keys: Object.keys(value).slice(0, 12),
    };
  }

  return {
    rootType: typeof value,
    preview: value,
  };
}

function summarizeXmlValue(parsed) {
  const rootKey = Object.keys(parsed || {})[0] || null;
  const rootValue = rootKey ? parsed[rootKey] : null;
  const childKeys = rootValue && typeof rootValue === 'object'
    ? Object.keys(rootValue).slice(0, 12)
    : [];

  return {
    rootType: 'xml',
    rootKey,
    childKeys,
  };
}

export function parseStructuredOutput(rawOutput) {
  const normalized = String(rawOutput || '');
  const trimmed = normalized.trim();
  if (!trimmed || byteLength(trimmed) > STRUCTURED_OUTPUT_MAX_BYTES) {
    return null;
  }

  const parsedXml = parseXmlDocument(trimmed);
  const normalizedNmap = normalizeNmapDocument(parsedXml?.parsed);
  if (parsedXml && normalizedNmap) {
    return {
      format: 'nmap-xml',
      json: normalizedNmap,
      pretty: parsedXml.pretty,
      summary: normalizedNmap.summary,
    };
  }

  try {
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      const parsedJson = JSON.parse(trimmed);
      return {
        format: 'json',
        json: parsedJson,
        pretty: JSON.stringify(parsedJson, null, 2),
        summary: summarizeJsonValue(parsedJson),
      };
    }
  } catch {
    // fall through to XML parsing
  }

  if (parsedXml) {
    return {
      format: 'xml',
      json: parsedXml.parsed,
      pretty: parsedXml.pretty,
      summary: summarizeXmlValue(parsedXml.parsed),
    };
  }

  return null;
}

export function parseStructuredField(rawValue) {
  if (!rawValue) return null;
  if (typeof rawValue === 'object') return rawValue;
  try {
    return JSON.parse(rawValue);
  } catch {
    return null;
  }
}

export function serializeStructuredField(rawValue) {
  return rawValue ? JSON.stringify(rawValue) : null;
}
