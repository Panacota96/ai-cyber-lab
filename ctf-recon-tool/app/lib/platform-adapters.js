import { normalizePlainText } from '@/lib/text-sanitize';

export const PLATFORM_TYPES = ['htb', 'thm', 'ctfd'];

import pkg from '../../package.json';

const MCP_PROTOCOL_VERSION = '2025-06-18';

function normalizePlatformType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return PLATFORM_TYPES.includes(normalized) ? normalized : null;
}

function inferTargetKind(target) {
  if (!target) return 'host';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(target)) return 'url';
  if (target.includes('/')) return 'cidr';
  if (target.includes(':') && !target.includes('://')) return 'host-port';
  return 'host';
}

function normalizeImportedTarget(target, label = '') {
  const normalizedTarget = normalizePlainText(target, 2048);
  if (!normalizedTarget) return null;
  const normalizedLabel = normalizePlainText(label, 255) || normalizedTarget;
  return {
    label: normalizedLabel,
    target: normalizedTarget,
    kind: inferTargetKind(normalizedTarget),
    notes: '',
  };
}

function uniqueTargets(targets = []) {
  const seen = new Set();
  const output = [];
  for (const target of Array.isArray(targets) ? targets : []) {
    const normalized = normalizeImportedTarget(target?.target || target, target?.label || '');
    if (!normalized) continue;
    const key = `${normalized.kind}:${normalized.target}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
  }
  return output;
}

function extractTargetsFromText(...values) {
  const joined = values
    .map((value) => {
      if (!value) return '';
      if (typeof value === 'string') return value;
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    })
    .join('\n');
  if (!joined) return [];

  const targets = [];
  const urlMatches = joined.match(/\bhttps?:\/\/[^\s"'<>)]+/gi) || [];
  for (const match of urlMatches) {
    targets.push(normalizeImportedTarget(match, 'Imported URL'));
  }
  const ipMatches = joined.match(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?\b/g) || [];
  for (const match of ipMatches) {
    targets.push(normalizeImportedTarget(match, 'Imported Host'));
  }
  return uniqueTargets(targets);
}

function buildCapability(type, configured, extra = {}) {
  return {
    type,
    configured: Boolean(configured),
    metadata: Boolean(configured),
    flagSubmit: Boolean(configured && extra.flagSubmit !== false),
    reason: configured ? '' : (extra.reason || 'Missing server-side credentials'),
    ...extra,
  };
}

function getPlatformEnvConfig() {
  return {
    htb: {
      token: process.env.HTB_API_TOKEN || '',
      baseUrl: process.env.HTB_MCP_URL || 'https://mcp.hackthebox.ai/v1/ctf/mcp/',
    },
    thm: {
      token: process.env.THM_API_TOKEN || '',
      baseUrl: process.env.THM_API_BASE_URL || 'https://tryhackme.com',
    },
    ctfd: {
      token: process.env.CTFD_API_TOKEN || '',
      baseUrl: process.env.CTFD_BASE_URL || '',
    },
  };
}

export function getPlatformCapabilities() {
  const config = getPlatformEnvConfig();
  return {
    htb: buildCapability('htb', Boolean(config.htb.token), {
      source: 'htb-mcp',
      baseUrl: config.htb.baseUrl,
      flagSubmit: Boolean(config.htb.token),
    }),
    thm: buildCapability('thm', Boolean(config.thm.token), {
      source: 'tryhackme-enterprise-api',
      baseUrl: config.thm.baseUrl,
      flagSubmit: Boolean(config.thm.token),
      flagMode: 'validation',
    }),
    ctfd: buildCapability('ctfd', Boolean(config.ctfd.token && config.ctfd.baseUrl), {
      source: 'ctfd-api-v1',
      baseUrl: config.ctfd.baseUrl,
      reason: config.ctfd.token && !config.ctfd.baseUrl ? 'Missing CTFD_BASE_URL' : 'Missing CTFd credentials',
      flagSubmit: Boolean(config.ctfd.token && config.ctfd.baseUrl),
    }),
  };
}

function getPlatformCapability(type) {
  return getPlatformCapabilities()[normalizePlatformType(type)] || null;
}

async function readJsonResponse(response) {
  const rawText = await response.text();
  let data = null;
  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      const eventChunks = rawText
        .split(/\r?\n\r?\n/)
        .map((chunk) => chunk
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.replace(/^data:\s*/, ''))
          .join('\n'))
        .filter(Boolean);
      for (let index = eventChunks.length - 1; index >= 0; index -= 1) {
        try {
          data = JSON.parse(eventChunks[index]);
          break;
        } catch {
          // keep scanning
        }
      }
    }
  }
  return { rawText, data };
}

async function fetchPlatformJson(url, { method = 'GET', headers = {}, body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json, text/event-stream',
      ...headers,
    },
    body,
    cache: 'no-store',
  });
  const payload = await readJsonResponse(response);
  return { response, ...payload };
}

function describePayload(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function findObjectWithId(value, targetId) {
  if (!value || targetId === null || targetId === undefined || targetId === '') return null;
  const desired = String(targetId);
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findObjectWithId(item, desired);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== 'object') return null;
  if (
    String(value.id ?? '') === desired
    || String(value.challenge_id ?? '') === desired
    || String(value.challengeId ?? '') === desired
    || String(value._id ?? '') === desired
  ) {
    return value;
  }
  for (const nested of Object.values(value)) {
    const found = findObjectWithId(nested, desired);
    if (found) return found;
  }
  return null;
}

function flattenMcpContent(result) {
  const blocks = Array.isArray(result?.content) ? result.content : [];
  const text = blocks
    .map((block) => {
      if (typeof block?.text === 'string') return block.text;
      if (block?.type === 'text' && typeof block?.content === 'string') return block.content;
      if (block?.type === 'json' && block?.json !== undefined) return describePayload(block.json);
      return '';
    })
    .filter(Boolean)
    .join('\n');

  let structured = result?.structuredContent ?? result?.content?.find?.((block) => block?.json)?.json ?? null;
  if (!structured && text) {
    try {
      structured = JSON.parse(text);
    } catch {
      structured = null;
    }
  }
  return { text, structured };
}

async function initializeHtbSession(token, baseUrl) {
  const initializeRes = await fetchPlatformJson(baseUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: {
          name: 'helms-watch',
          version: String(pkg.version || '0.0.0'),
        },
      },
    }),
  });

  if (!initializeRes.response.ok) {
    throw new Error(`HTB MCP initialize failed: ${initializeRes.response.status}`);
  }

  const sessionId = initializeRes.response.headers.get('mcp-session-id')
    || initializeRes.response.headers.get('Mcp-Session-Id')
    || initializeRes.response.headers.get('x-mcp-session-id')
    || '';

  await fetchPlatformJson(baseUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
      ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {},
    }),
  });

  return sessionId;
}

async function htbToolsList(token, baseUrl, sessionId) {
  const result = await fetchPlatformJson(baseUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
      ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    }),
  });
  if (!result.response.ok) {
    throw new Error(`HTB MCP tools/list failed: ${result.response.status}`);
  }
  return Array.isArray(result?.data?.result?.tools) ? result.data.result.tools : [];
}

function findHtbTool(tools, keywords = []) {
  const normalizedKeywords = keywords.map((keyword) => String(keyword || '').toLowerCase());
  return (Array.isArray(tools) ? tools : []).find((tool) => {
    const haystack = `${tool?.name || ''} ${tool?.title || ''} ${tool?.description || ''}`.toLowerCase();
    return normalizedKeywords.every((keyword) => haystack.includes(keyword));
  }) || null;
}

async function callHtbTool(token, baseUrl, sessionId, tool, args) {
  const result = await fetchPlatformJson(baseUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
      ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: tool.name,
        arguments: args,
      },
    }),
  });
  if (!result.response.ok) {
    throw new Error(`HTB MCP tools/call failed: ${result.response.status}`);
  }
  return result?.data?.result || null;
}

async function syncHtbLink({ remoteId, label, context = {}, capability }) {
  const config = getPlatformEnvConfig().htb;
  if (!capability?.configured) {
    return { ok: false, capability };
  }

  const eventId = normalizePlainText(context?.eventId || remoteId, 128);
  const challengeId = normalizePlainText(context?.challengeId, 128);
  if (!eventId) {
    return {
      ok: false,
      capability: { ...capability, metadata: false, reason: 'HTB event ID is required to sync metadata.' },
    };
  }

  const sessionId = await initializeHtbSession(config.token, config.baseUrl);
  const tools = await htbToolsList(config.token, config.baseUrl, sessionId);
  const metadataTool = findHtbTool(tools, ['retrieve', 'ctf', 'details']) || findHtbTool(tools, ['ctf', 'details']);
  if (!metadataTool) {
    return {
      ok: false,
      capability: { ...capability, metadata: false, reason: 'HTB metadata tool was not advertised by the MCP server.' },
    };
  }

  const attempts = [
    { eventId },
    { event_id: eventId },
    { ctfId: eventId },
    { ctf_id: eventId },
    { id: eventId },
    { slug: eventId },
  ];

  let rawResult = null;
  for (const args of attempts) {
    try {
      rawResult = await callHtbTool(config.token, config.baseUrl, sessionId, metadataTool, args);
      if (rawResult) break;
    } catch {
      // try the next argument shape
    }
  }

  const { text, structured } = flattenMcpContent(rawResult);
  const challenge = challengeId ? findObjectWithId(structured || rawResult, challengeId) : null;
  const source = challenge || structured || rawResult || {};
  const remoteLabel = normalizePlainText(
    label
    || challenge?.name
    || challenge?.title
    || source?.name
    || source?.title
    || `HTB ${eventId}`,
    255
  );

  return {
    ok: true,
    platform: {
      type: 'htb',
      remoteId: eventId,
      label: remoteLabel,
      remoteLabel,
      syncedAt: new Date().toISOString(),
      source: capability?.source || 'htb-mcp',
      capabilities: {
        metadata: true,
        flagSubmit: capability?.flagSubmit && Boolean(challengeId),
        flagMode: 'submit',
      },
      remoteContext: {
        eventId,
        challengeId: challengeId || null,
      },
      importedTargets: extractTargetsFromText(challenge || structured || text),
      details: {
        summary: normalizePlainText(challenge?.description || source?.description || text, 2000) || '',
        eventName: normalizePlainText(source?.name || source?.title, 255) || '',
        challengeName: normalizePlainText(challenge?.name || challenge?.title, 255) || '',
      },
    },
    raw: rawResult,
  };
}

function classifySubmissionResult(payload, fallbackSummary = '') {
  const text = describePayload(payload).toLowerCase();
  const summary = normalizePlainText(
    payload?.message
      || payload?.status
      || payload?.result
      || payload?.summary
      || fallbackSummary
      || describePayload(payload),
    255
  ) || 'Submission completed.';

  if (/correct|accepted|valid|already[_\s-]?solved|already[_\s-]?owned|success/.test(text)) {
    return { status: 'accepted', accepted: true, summary };
  }
  if (/incorrect|invalid|wrong|rejected|not[_\s-]?correct|failed/.test(text)) {
    return { status: 'rejected', accepted: false, summary };
  }
  return { status: 'submitted', accepted: null, summary };
}

async function submitHtbFlag({ platformLink, flagValue, capability }) {
  const config = getPlatformEnvConfig().htb;
  if (!capability?.configured) {
    return { ok: false, capability };
  }
  const eventId = normalizePlainText(platformLink?.remoteContext?.eventId || platformLink?.remoteId, 128);
  const challengeId = normalizePlainText(platformLink?.remoteContext?.challengeId, 128);
  if (!challengeId) {
    return {
      ok: false,
      capability: { ...capability, flagSubmit: false, reason: 'HTB flag submission requires a linked challenge ID.' },
    };
  }

  const sessionId = await initializeHtbSession(config.token, config.baseUrl);
  const tools = await htbToolsList(config.token, config.baseUrl, sessionId);
  const submitTool = findHtbTool(tools, ['submit', 'flag']);
  if (!submitTool) {
    return {
      ok: false,
      capability: { ...capability, flagSubmit: false, reason: 'HTB flag submission tool was not advertised by the MCP server.' },
    };
  }

  const attempts = [
    { flag: flagValue, challengeId, eventId },
    { flag: flagValue, challenge_id: challengeId, event_id: eventId },
    { submission: flagValue, challengeId, eventId },
    { submission: flagValue, challenge_id: challengeId, event_id: eventId },
    { flag: flagValue, challengeId },
    { flag: flagValue, challenge_id: challengeId },
    { submission: flagValue, challengeId },
    { submission: flagValue, challenge_id: challengeId },
  ];

  let rawResult = null;
  for (const args of attempts) {
    try {
      rawResult = await callHtbTool(config.token, config.baseUrl, sessionId, submitTool, args);
      if (rawResult) break;
    } catch {
      // try next argument shape
    }
  }

  const { text, structured } = flattenMcpContent(rawResult);
  const classified = classifySubmissionResult(structured || rawResult || text, text);
  return {
    ok: true,
    capability: { ...capability, flagSubmit: true },
    mode: 'submit',
    ...classified,
    raw: rawResult,
  };
}

async function syncThmLink({ remoteId, label, capability }) {
  const config = getPlatformEnvConfig().thm;
  if (!capability?.configured) {
    return { ok: false, capability };
  }
  const roomCode = normalizePlainText(remoteId, 128);
  if (!roomCode) {
    return {
      ok: false,
      capability: { ...capability, metadata: false, reason: 'THM room code is required.' },
    };
  }

  const roomResponse = await fetchPlatformJson(`${config.baseUrl.replace(/\/$/, '')}/api/v2/external/rooms?code=${encodeURIComponent(roomCode)}`, {
    headers: {
      'THM-API-KEY': config.token,
    },
  });
  if (!roomResponse.response.ok) {
    return {
      ok: false,
      capability: { ...capability, metadata: false, reason: `THM metadata request failed (${roomResponse.response.status}).` },
    };
  }

  const room = Array.isArray(roomResponse?.data?.data)
    ? roomResponse.data.data[0]
    : (roomResponse?.data?.data || roomResponse?.data?.room || null);
  const remoteLabel = normalizePlainText(label || room?.title || room?.name || roomCode, 255) || roomCode;
  return {
    ok: true,
    platform: {
      type: 'thm',
      remoteId: roomCode,
      label: remoteLabel,
      remoteLabel,
      syncedAt: new Date().toISOString(),
      source: capability?.source || 'tryhackme-enterprise-api',
      capabilities: {
        metadata: true,
        flagSubmit: true,
        flagMode: 'validation',
      },
      remoteContext: {
        roomCode,
      },
      importedTargets: extractTargetsFromText(room?.deployUrl, room?.connectionInfo, room?.description),
      details: {
        summary: normalizePlainText(room?.description || room?.summary, 2000) || '',
        difficulty: normalizePlainText(room?.difficulty || room?.level, 64) || '',
        taskCount: Array.isArray(room?.tasks) ? room.tasks.length : undefined,
      },
    },
    raw: roomResponse.data,
  };
}

async function submitThmFlag({ platformLink, flagValue, capability }) {
  const config = getPlatformEnvConfig().thm;
  if (!capability?.configured) {
    return { ok: false, capability };
  }
  const roomCode = normalizePlainText(platformLink?.remoteContext?.roomCode || platformLink?.remoteId, 128);
  if (!roomCode) {
    return {
      ok: false,
      capability: { ...capability, flagSubmit: false, reason: 'THM room code is required for validation.' },
    };
  }

  const response = await fetchPlatformJson(`${config.baseUrl.replace(/\/$/, '')}/api/v2/external/questions?roomCode=${encodeURIComponent(roomCode)}`, {
    headers: {
      'THM-API-KEY': config.token,
    },
  });
  if (!response.response.ok) {
    return {
      ok: false,
      capability: { ...capability, flagSubmit: false, reason: `THM question lookup failed (${response.response.status}).` },
    };
  }

  const questions = Array.isArray(response?.data?.data)
    ? response.data.data
    : (Array.isArray(response?.data?.questions) ? response.data.questions : []);
  const normalizedFlag = String(flagValue || '').trim();
  const matchedQuestion = questions.find((question) => String(question?.answer || '').trim() === normalizedFlag);
  return {
    ok: true,
    capability: { ...capability, flagSubmit: true, flagMode: 'validation' },
    mode: 'validation',
    status: matchedQuestion ? 'accepted' : 'rejected',
    accepted: Boolean(matchedQuestion),
    summary: matchedQuestion
      ? `Validated against THM room question ${matchedQuestion.questionNo || matchedQuestion._id || ''}.`
      : 'Flag did not match any answer returned for the linked THM room.',
    raw: {
      matchedQuestionId: matchedQuestion?._id || null,
      matchedQuestionNo: matchedQuestion?.questionNo || null,
      totalQuestions: questions.length,
    },
  };
}

async function syncCtfdLink({ remoteId, label, capability }) {
  const config = getPlatformEnvConfig().ctfd;
  if (!capability?.configured) {
    return { ok: false, capability };
  }
  const challengeId = normalizePlainText(remoteId, 128);
  if (!challengeId) {
    return {
      ok: false,
      capability: { ...capability, metadata: false, reason: 'CTFd challenge ID is required.' },
    };
  }

  const response = await fetchPlatformJson(`${config.baseUrl.replace(/\/$/, '')}/api/v1/challenges/${encodeURIComponent(challengeId)}`, {
    headers: {
      Authorization: `Token ${config.token}`,
    },
  });
  if (!response.response.ok) {
    return {
      ok: false,
      capability: { ...capability, metadata: false, reason: `CTFd metadata request failed (${response.response.status}).` },
    };
  }

  const challenge = response?.data?.data || response?.data?.challenge || null;
  const remoteLabel = normalizePlainText(label || challenge?.name || `CTFd Challenge ${challengeId}`, 255) || String(challengeId);
  return {
    ok: true,
    platform: {
      type: 'ctfd',
      remoteId: String(challenge?.id || challengeId),
      label: remoteLabel,
      remoteLabel,
      syncedAt: new Date().toISOString(),
      source: capability?.source || 'ctfd-api-v1',
      capabilities: {
        metadata: true,
        flagSubmit: true,
        flagMode: 'submit',
      },
      remoteContext: {
        challengeId: String(challenge?.id || challengeId),
      },
      importedTargets: extractTargetsFromText(challenge?.connection_info, challenge?.description),
      details: {
        summary: normalizePlainText(challenge?.description, 2000) || '',
        category: normalizePlainText(challenge?.category, 255) || '',
        connectionInfo: normalizePlainText(challenge?.connection_info, 1000) || '',
        value: challenge?.value ?? null,
      },
    },
    raw: response.data,
  };
}

async function submitCtfdFlag({ platformLink, flagValue, capability }) {
  const config = getPlatformEnvConfig().ctfd;
  if (!capability?.configured) {
    return { ok: false, capability };
  }
  const challengeId = Number(platformLink?.remoteContext?.challengeId || platformLink?.remoteId);
  if (!Number.isFinite(challengeId) || challengeId <= 0) {
    return {
      ok: false,
      capability: { ...capability, flagSubmit: false, reason: 'CTFd flag submission requires a numeric challenge ID.' },
    };
  }

  const response = await fetchPlatformJson(`${config.baseUrl.replace(/\/$/, '')}/api/v1/challenges/attempt`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      challenge_id: challengeId,
      submission: flagValue,
    }),
  });
  if (!response.response.ok) {
    return {
      ok: false,
      capability: { ...capability, flagSubmit: false, reason: `CTFd flag submission failed (${response.response.status}).` },
      raw: response.data || response.rawText,
    };
  }
  const payload = response?.data?.data || response?.data || {};
  const classified = classifySubmissionResult(payload, response.rawText);
  return {
    ok: true,
    capability: { ...capability, flagSubmit: true },
    mode: 'submit',
    ...classified,
    raw: payload,
  };
}

export async function syncPlatformLink({ platformType, remoteId, label = '', context = {} } = {}) {
  const normalizedType = normalizePlatformType(platformType);
  const capability = getPlatformCapability(normalizedType);
  if (!normalizedType || !capability) {
    return {
      ok: false,
      capability: { type: normalizedType || 'unknown', configured: false, metadata: false, flagSubmit: false, reason: 'Unsupported platform type.' },
    };
  }

  if (normalizedType === 'htb') return syncHtbLink({ remoteId, label, context, capability });
  if (normalizedType === 'thm') return syncThmLink({ remoteId, label, context, capability });
  return syncCtfdLink({ remoteId, label, context, capability });
}

export async function submitPlatformFlag({ platformLink, flagValue } = {}) {
  const normalizedType = normalizePlatformType(platformLink?.type);
  const capability = getPlatformCapability(normalizedType);
  if (!normalizedType || !capability) {
    return {
      ok: false,
      capability: { type: normalizedType || 'unknown', configured: false, metadata: false, flagSubmit: false, reason: 'Unsupported platform type.' },
    };
  }

  if (normalizedType === 'htb') return submitHtbFlag({ platformLink, flagValue, capability });
  if (normalizedType === 'thm') return submitThmFlag({ platformLink, flagValue, capability });
  return submitCtfdFlag({ platformLink, flagValue, capability });
}
