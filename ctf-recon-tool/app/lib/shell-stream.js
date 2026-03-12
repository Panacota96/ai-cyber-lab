import { formatSseEvent } from '@/lib/execution-stream';

const shellStreamState = globalThis.__helmsShellStreamState || (globalThis.__helmsShellStreamState = {
  listenersBySession: new Map(),
  sequence: 0,
});

export { formatSseEvent };

export function subscribeToShellStream(sessionId, listener) {
  const normalizedSessionId = String(sessionId || '');
  if (!normalizedSessionId || typeof listener !== 'function') {
    return () => {};
  }

  let listeners = shellStreamState.listenersBySession.get(normalizedSessionId);
  if (!listeners) {
    listeners = new Set();
    shellStreamState.listenersBySession.set(normalizedSessionId, listeners);
  }

  listeners.add(listener);

  return () => {
    const current = shellStreamState.listenersBySession.get(normalizedSessionId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) {
      shellStreamState.listenersBySession.delete(normalizedSessionId);
    }
  };
}

export function publishShellStreamEvent(sessionId, payload = {}) {
  const normalizedSessionId = String(sessionId || '');
  const listeners = shellStreamState.listenersBySession.get(normalizedSessionId);
  if (!listeners || listeners.size === 0) {
    return 0;
  }

  const message = {
    id: ++shellStreamState.sequence,
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
      // Best effort fanout.
    }
  }

  return delivered;
}

export function clearShellStreamStateForTests() {
  shellStreamState.listenersBySession.clear();
  shellStreamState.sequence = 0;
}
