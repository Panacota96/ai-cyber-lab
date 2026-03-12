const streamState = globalThis.__helmsExecutionStreamState || (globalThis.__helmsExecutionStreamState = {
  listenersBySession: new Map(),
  sequence: 0,
});

export function subscribeToExecutionStream(sessionId, listener) {
  const normalizedSessionId = String(sessionId || '');
  if (!normalizedSessionId || typeof listener !== 'function') {
    return () => {};
  }

  let listeners = streamState.listenersBySession.get(normalizedSessionId);
  if (!listeners) {
    listeners = new Set();
    streamState.listenersBySession.set(normalizedSessionId, listeners);
  }

  listeners.add(listener);

  return () => {
    const current = streamState.listenersBySession.get(normalizedSessionId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) {
      streamState.listenersBySession.delete(normalizedSessionId);
    }
  };
}

export function publishExecutionStreamEvent(sessionId, payload = {}) {
  const normalizedSessionId = String(sessionId || '');
  const listeners = streamState.listenersBySession.get(normalizedSessionId);
  if (!listeners || listeners.size === 0) {
    return 0;
  }

  const message = {
    id: ++streamState.sequence,
    sessionId: normalizedSessionId,
    sentAt: new Date().toISOString(),
    ...payload,
  };

  let delivered = 0;
  for (const listener of listeners) {
    try {
      listener(message);
      delivered += 1;
    } catch {
      // Best-effort fanout; dead listeners are cleaned up by the route unsubscribe.
    }
  }

  return delivered;
}

export function formatSseEvent(eventName, data, id = null) {
  const lines = [];
  if (id !== null && id !== undefined) {
    lines.push(`id: ${id}`);
  }
  lines.push(`event: ${eventName}`);
  lines.push(`data: ${JSON.stringify(data)}`);
  return `${lines.join('\n')}\n\n`;
}

export function clearExecutionStreamStateForTests() {
  streamState.listenersBySession.clear();
  streamState.sequence = 0;
}
