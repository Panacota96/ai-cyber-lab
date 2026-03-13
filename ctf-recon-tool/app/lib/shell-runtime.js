import net from 'node:net';
import { logger } from '@/lib/logger';
import {
  appendShellTranscriptChunk,
  getShellSession,
  listShellSessions,
  updateShellSession,
} from '@/lib/shell-repository';
import { publishShellStreamEvent } from '@/lib/shell-stream';
import { isShellHubEnabled } from '@/lib/security';

const runtimeState = globalThis.__helmsShellRuntimeState || (globalThis.__helmsShellRuntimeState = {
  sessions: new Map(),
});

function setRuntime(shellSessionId, entry) {
  runtimeState.sessions.set(shellSessionId, entry);
}

function getRuntime(shellSessionId) {
  return runtimeState.sessions.get(shellSessionId) || null;
}

function clearRuntime(shellSessionId) {
  runtimeState.sessions.delete(shellSessionId);
}

function publishState(sessionId, session) {
  if (!session) return;
  publishShellStreamEvent(sessionId, {
    type: 'shell-state',
    shellSessionId: session.id,
    shellSession: session,
  });
}

function publishChunk(sessionId, shellSessionId, chunk) {
  if (!chunk) return;
  publishShellStreamEvent(sessionId, {
    type: 'shell-chunk',
    shellSessionId,
    chunk,
  });
}

function upsertStatusChunk(sessionId, shellSessionId, content) {
  const chunk = appendShellTranscriptChunk(sessionId, shellSessionId, {
    direction: 'status',
    content,
  });
  publishChunk(sessionId, shellSessionId, chunk);
  return chunk;
}

function captureSocketActivity(sessionId, shellSessionId, content, direction = 'output') {
  const chunk = appendShellTranscriptChunk(sessionId, shellSessionId, {
    direction,
    content,
  });
  publishChunk(sessionId, shellSessionId, chunk);
  return chunk;
}

function closeReverseRuntime(runtime) {
  try {
    runtime?.socket?.destroy();
  } catch {
    // ignore best effort close
  }
  try {
    runtime?.server?.close();
  } catch {
    // ignore best effort close
  }
}

function closeSocketRuntime(runtime) {
  try {
    runtime?.socket?.destroy();
  } catch {
    // ignore best effort close
  }
}

function finalizeReverseSession(sessionId, shellSessionId, { status = 'closed', error = null } = {}) {
  const current = getShellSession(sessionId, shellSessionId);
  const next = updateShellSession(sessionId, shellSessionId, {
    status,
    closedAt: new Date().toISOString(),
    metadata: {
      ...(current?.metadata || {}),
      lastError: error ? String(error) : current?.metadata?.lastError || null,
    },
  });
  if (error) {
    upsertStatusChunk(sessionId, shellSessionId, `[session] ${String(error)}`);
  }
  publishState(sessionId, next);
  clearRuntime(shellSessionId);
  return next;
}

function finalizeBindSession(sessionId, shellSessionId, { status = 'closed', error = null } = {}) {
  const current = getShellSession(sessionId, shellSessionId);
  const next = updateShellSession(sessionId, shellSessionId, {
    status,
    closedAt: new Date().toISOString(),
    metadata: {
      ...(current?.metadata || {}),
      lastError: error ? String(error) : current?.metadata?.lastError || null,
    },
  });
  if (error) {
    upsertStatusChunk(sessionId, shellSessionId, `[session] ${String(error)}`);
  }
  publishState(sessionId, next);
  clearRuntime(shellSessionId);
  return next;
}

async function startReverseShellListener(session) {
  const existing = getRuntime(session.id);
  if (existing?.kind === 'reverse') {
    return session;
  }

  const server = net.createServer();
  const runtime = {
    kind: 'reverse',
    sessionId: session.sessionId,
    shellSessionId: session.id,
    server,
    socket: null,
  };
  setRuntime(session.id, runtime);

  server.on('connection', (socket) => {
    if (runtime.socket) {
      socket.end();
      return;
    }

    runtime.socket = socket;
    runtime.server?.close();
    const remoteHost = socket.remoteAddress || '';
    const remotePort = socket.remotePort || null;
    const connected = updateShellSession(session.sessionId, session.id, {
      status: 'connected',
      remoteHost,
      remotePort,
      connectedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
    });
    publishState(session.sessionId, connected);
    upsertStatusChunk(session.sessionId, session.id, `[session] reverse shell connected from ${remoteHost}${remotePort ? `:${remotePort}` : ''}`);

    socket.on('data', (buffer) => {
      captureSocketActivity(session.sessionId, session.id, buffer.toString('utf8'), 'output');
    });

    socket.on('error', (error) => {
      finalizeReverseSession(session.sessionId, session.id, {
        status: 'error',
        error: error?.message || 'Reverse shell socket error.',
      });
    });

    socket.on('close', () => {
      finalizeReverseSession(session.sessionId, session.id, {
        status: 'closed',
      });
    });
  });

  server.on('error', (error) => {
    logger.error('Reverse shell listener failed', error);
    finalizeReverseSession(session.sessionId, session.id, {
      status: 'error',
      error: error?.message || 'Reverse shell listener failed.',
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({
      host: session.bindHost || '127.0.0.1',
      port: session.bindPort || 0,
    }, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  const updated = updateShellSession(session.sessionId, session.id, {
    status: 'listening',
    bindHost: typeof address === 'object' && address?.address ? address.address : session.bindHost,
    bindPort: typeof address === 'object' && address?.port ? address.port : session.bindPort,
    metadata: {
      ...(session.metadata || {}),
      listener: true,
    },
  });
  publishState(session.sessionId, updated);
  upsertStatusChunk(session.sessionId, session.id, `[session] listening on ${(updated?.bindHost || session.bindHost || '127.0.0.1')}:${updated?.bindPort || session.bindPort || 0}`);
  return updated;
}

async function startBindShellConnection(session) {
  const existing = getRuntime(session.id);
  if (existing?.kind === 'bind' && existing.socket && !existing.socket.destroyed) {
    return getShellSession(session.sessionId, session.id) || session;
  }
  if (!session.remoteHost || !session.remotePort) {
    return finalizeBindSession(session.sessionId, session.id, {
      status: 'error',
      error: 'Bind shell requires a remote host and port.',
    });
  }

  const runtime = {
    kind: 'bind',
    sessionId: session.sessionId,
    shellSessionId: session.id,
    socket: null,
  };
  setRuntime(session.id, runtime);

  const startedAt = new Date().toISOString();
  const connecting = updateShellSession(session.sessionId, session.id, {
    status: 'connecting',
    lastActivityAt: startedAt,
  });
  publishState(session.sessionId, connecting);
  upsertStatusChunk(session.sessionId, session.id, `[session] connecting to ${session.remoteHost}:${session.remotePort}`);

  return new Promise((resolve) => {
    const socket = net.createConnection({
      host: session.remoteHost,
      port: session.remotePort,
    });
    runtime.socket = socket;

    const handleConnectError = (error) => {
      logger.warn('Bind shell connection failed', {
        sessionId: session.sessionId,
        shellSessionId: session.id,
        error: error?.message || 'Bind shell connection failed.',
      });
      closeSocketRuntime(runtime);
      resolve(finalizeBindSession(session.sessionId, session.id, {
        status: 'error',
        error: error?.message || 'Bind shell connection failed.',
      }));
    };

    socket.once('error', handleConnectError);
    socket.once('connect', () => {
      socket.off('error', handleConnectError);
      const connectedAt = new Date().toISOString();
      const connected = updateShellSession(session.sessionId, session.id, {
        status: 'connected',
        connectedAt,
        lastActivityAt: connectedAt,
        metadata: {
          ...(session.metadata || {}),
          transport: 'bind',
        },
      });
      publishState(session.sessionId, connected);
      upsertStatusChunk(session.sessionId, session.id, `[session] connected to ${session.remoteHost}:${session.remotePort}`);

      socket.on('data', (buffer) => {
        captureSocketActivity(session.sessionId, session.id, buffer.toString('utf8'), 'output');
      });

      socket.on('error', (error) => {
        finalizeBindSession(session.sessionId, session.id, {
          status: 'error',
          error: error?.message || 'Bind shell socket error.',
        });
      });

      socket.on('close', () => {
        finalizeBindSession(session.sessionId, session.id, {
          status: 'closed',
        });
      });

      resolve(connected);
    });
  });
}

function interpolateTemplate(template = '', command = '') {
  return String(template || '').replace(/\{\{\s*command\s*\}\}/g, command);
}

function buildWebshellRequest(session, input) {
  const method = String(session.webshellMethod || 'POST').toUpperCase();
  const headers = { ...(session.webshellHeaders || {}) };
  const url = new URL(session.webshellUrl);
  const command = String(input || '');

  let body = null;
  if (session.webshellBodyTemplate) {
    body = interpolateTemplate(session.webshellBodyTemplate, command);
  } else if (method === 'GET' || method === 'HEAD') {
    url.searchParams.set(session.webshellCommandField || 'cmd', command);
  } else {
    body = new URLSearchParams({
      [session.webshellCommandField || 'cmd']: command,
    }).toString();
    if (!Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=utf-8';
    }
  }

  return {
    method,
    headers,
    url: url.toString(),
    body,
  };
}

async function executeWebshellInput(session, command) {
  const request = buildWebshellRequest(session, command);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
    });
    const responseText = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      body: responseText,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function ensureShellRuntime(session) {
  if (!isShellHubEnabled() || !session) return session;
  if (session.type === 'reverse' && session.status === 'listening' && !getRuntime(session.id)) {
    return startReverseShellListener(session);
  }
  if (session.type === 'bind' && !getRuntime(session.id) && !['closed', 'error'].includes(String(session.status || ''))) {
    return startBindShellConnection(session);
  }
  return session;
}

export async function ensureShellRuntimesForSession(sessionId) {
  const sessions = listShellSessions(sessionId);
  for (const session of sessions) {
    if (
      (session.type === 'reverse' && session.status === 'listening')
      || (session.type === 'bind' && !['closed', 'error'].includes(String(session.status || '')))
    ) {
      try {
        await ensureShellRuntime(session);
      } catch (error) {
        logger.warn('Failed to ensure shell runtime', {
          sessionId,
          shellSessionId: session.id,
          type: session.type,
          error: error?.message || 'Runtime startup failed.',
        });
      }
    }
  }
  return listShellSessions(sessionId);
}

export async function startShellSessionRuntime(session) {
  if (!isShellHubEnabled()) {
    throw new Error('Shell hub is disabled in this runtime.');
  }
  if (!session) {
    throw new Error('Shell session not found.');
  }

  if (session.type === 'reverse') {
    return startReverseShellListener(session);
  }
  if (session.type === 'bind') {
    return startBindShellConnection(session);
  }

  publishState(session.sessionId, session);
  upsertStatusChunk(session.sessionId, session.id, `[session] webshell ready for ${session.webshellUrl}`);
  return session;
}

export async function sendShellInput({ sessionId, shellSessionId, input }) {
  const session = getShellSession(sessionId, shellSessionId);
  if (!session) {
    throw new Error('Shell session not found.');
  }

  const trimmedInput = String(input || '');
  if (!trimmedInput.trim()) {
    throw new Error('Input is required.');
  }

  const inputChunk = captureSocketActivity(sessionId, shellSessionId, trimmedInput, 'input');
  if (!inputChunk) {
    throw new Error('Input could not be persisted.');
  }

  if (session.type === 'reverse' || session.type === 'bind') {
    const runtime = getRuntime(shellSessionId);
    if (!runtime?.socket) {
      throw new Error(`${session.type === 'bind' ? 'Bind' : 'Reverse'} shell is not connected.`);
    }
    runtime.socket.write(trimmedInput.endsWith('\n') ? trimmedInput : `${trimmedInput}\n`);
    return {
      shellSession: getShellSession(sessionId, shellSessionId),
      inputChunk,
      outputChunk: null,
    };
  }

  const active = updateShellSession(sessionId, shellSessionId, {
    status: 'active',
    lastActivityAt: new Date().toISOString(),
  });
  publishState(sessionId, active);

  try {
    const result = await executeWebshellInput(session, trimmedInput);
    const outputText = [`[response] HTTP ${result.status} ${result.statusText}`.trim(), result.body || '']
      .filter(Boolean)
      .join('\n\n');
    const outputChunk = captureSocketActivity(sessionId, shellSessionId, outputText, 'output');
    const next = updateShellSession(sessionId, shellSessionId, {
      status: result.ok ? 'active' : 'error',
      lastActivityAt: new Date().toISOString(),
      metadata: {
        ...(session.metadata || {}),
        lastHttpStatus: result.status,
      },
    });
    publishState(sessionId, next);
    return {
      shellSession: next,
      inputChunk,
      outputChunk,
    };
  } catch (error) {
    const next = updateShellSession(sessionId, shellSessionId, {
      status: 'error',
      metadata: {
        ...(session.metadata || {}),
        lastError: error?.message || 'Webshell request failed.',
      },
    });
    publishState(sessionId, next);
    const outputChunk = captureSocketActivity(sessionId, shellSessionId, `[error] ${error?.message || 'Webshell request failed.'}`, 'output');
    return {
      shellSession: next,
      inputChunk,
      outputChunk,
    };
  }
}

export function resizeShellSession({ sessionId, shellSessionId, cols, rows }) {
  const session = getShellSession(sessionId, shellSessionId);
  if (!session) {
    throw new Error('Shell session not found.');
  }
  const next = updateShellSession(sessionId, shellSessionId, {
    metadata: {
      ...(session.metadata || {}),
      cols: Number(cols) || null,
      rows: Number(rows) || null,
    },
  });
  publishState(sessionId, next);
  return next;
}

export function disconnectShellSession({ sessionId, shellSessionId }) {
  const session = getShellSession(sessionId, shellSessionId);
  if (!session) {
    throw new Error('Shell session not found.');
  }

  const runtime = getRuntime(shellSessionId);
  if (runtime?.kind === 'reverse') {
    closeReverseRuntime(runtime);
  } else if (runtime?.kind === 'bind') {
    closeSocketRuntime(runtime);
  }

  const next = updateShellSession(sessionId, shellSessionId, {
    status: 'closed',
    closedAt: new Date().toISOString(),
  });
  publishState(sessionId, next);
  upsertStatusChunk(sessionId, shellSessionId, '[session] disconnected by operator');
  clearRuntime(shellSessionId);
  return next;
}

export async function clearShellRuntimeForTests() {
  for (const runtime of runtimeState.sessions.values()) {
    if (runtime?.kind === 'reverse') {
      closeReverseRuntime(runtime);
    } else if (runtime?.kind === 'bind') {
      closeSocketRuntime(runtime);
    }
  }
  runtimeState.sessions.clear();
}
