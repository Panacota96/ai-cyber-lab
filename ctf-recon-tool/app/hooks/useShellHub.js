'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

function upsertSession(sessions, nextSession) {
  const current = Array.isArray(sessions) ? sessions : [];
  if (!nextSession?.id) return current;
  const existingIndex = current.findIndex((item) => item.id === nextSession.id);
  if (existingIndex === -1) {
    return [nextSession, ...current];
  }
  const next = [...current];
  next[existingIndex] = { ...next[existingIndex], ...nextSession };
  return next.sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0));
}

function appendChunk(chunksByShell, shellSessionId, chunk) {
  const current = Array.isArray(chunksByShell[shellSessionId]) ? chunksByShell[shellSessionId] : [];
  if (!chunk?.id) return chunksByShell;
  if (current.some((item) => item.id === chunk.id)) return chunksByShell;
  return {
    ...chunksByShell,
    [shellSessionId]: [...current, chunk].sort((left, right) => Number(left.seq || 0) - Number(right.seq || 0)),
  };
}

export function useShellHub({ sessionId, targetId = null, apiFetch, enabled = true }) {
  const [shellSessions, setShellSessions] = useState([]);
  const [activeShellId, setActiveShellId] = useState(null);
  const [transcriptsByShell, setTranscriptsByShell] = useState({});
  const [transcriptCursorByShell, setTranscriptCursorByShell] = useState({});
  const [unreadByShell, setUnreadByShell] = useState({});
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busyByShell, setBusyByShell] = useState({});
  const [error, setError] = useState('');
  const [streamStatus, setStreamStatus] = useState('idle');
  const activeShellIdRef = useRef(activeShellId);

  useEffect(() => {
    activeShellIdRef.current = activeShellId;
  }, [activeShellId]);

  const refreshShellSessions = useCallback(async () => {
    if (!enabled || !sessionId) return [];
    setLoading(true);
    try {
      const response = await apiFetch(`/api/shell/sessions?sessionId=${encodeURIComponent(sessionId)}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load shell sessions.');
      }
      const nextSessions = Array.isArray(payload?.shellSessions) ? payload.shellSessions : [];
      setShellSessions(nextSessions);
      setError('');
      return nextSessions;
    } catch (fetchError) {
      setShellSessions([]);
      setError(fetchError?.message || 'Failed to load shell sessions.');
      return [];
    } finally {
      setLoading(false);
    }
  }, [apiFetch, enabled, sessionId]);

  const loadTranscript = useCallback(async (shellSessionId, { cursor = 0, append = false } = {}) => {
    if (!enabled || !sessionId || !shellSessionId) return [];
    const response = await apiFetch(`/api/shell/sessions/${encodeURIComponent(shellSessionId)}/transcript?sessionId=${encodeURIComponent(sessionId)}&cursor=${encodeURIComponent(cursor)}&limit=250`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to load shell transcript.');
    }
    const chunks = Array.isArray(payload?.chunks) ? payload.chunks : [];
    setTranscriptsByShell((prev) => append
      ? chunks.reduce((acc, chunk) => appendChunk(acc, shellSessionId, chunk), prev)
      : { ...prev, [shellSessionId]: chunks });
    setTranscriptCursorByShell((prev) => ({
      ...prev,
      [shellSessionId]: Number(payload?.cursor || cursor || 0),
    }));
    return chunks;
  }, [apiFetch, enabled, sessionId]);

  const searchTranscript = useCallback(async (shellSessionId, { query = '', direction = 'all', limit = 50 } = {}) => {
    if (!enabled || !sessionId || !shellSessionId) return [];
    const response = await apiFetch(`/api/shell/sessions/${encodeURIComponent(shellSessionId)}/search?sessionId=${encodeURIComponent(sessionId)}&q=${encodeURIComponent(query)}&direction=${encodeURIComponent(direction)}&limit=${encodeURIComponent(limit)}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to search shell transcript.');
    }
    return Array.isArray(payload?.chunks) ? payload.chunks : [];
  }, [apiFetch, enabled, sessionId]);

  const diffTranscriptChunks = useCallback(async (shellSessionId, { leftChunkId, rightChunkId } = {}) => {
    if (!enabled || !sessionId || !shellSessionId) return null;
    const response = await apiFetch(`/api/shell/sessions/${encodeURIComponent(shellSessionId)}/diff?sessionId=${encodeURIComponent(sessionId)}&leftChunkId=${encodeURIComponent(leftChunkId)}&rightChunkId=${encodeURIComponent(rightChunkId)}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to diff shell transcript chunks.');
    }
    return payload;
  }, [apiFetch, enabled, sessionId]);

  const selectShell = useCallback(async (shellSessionId) => {
    setActiveShellId(shellSessionId);
    setUnreadByShell((prev) => ({ ...prev, [shellSessionId]: 0 }));
    if (!transcriptsByShell[shellSessionId]) {
      await loadTranscript(shellSessionId, { cursor: 0, append: false });
    }
  }, [loadTranscript, transcriptsByShell]);

  const createShellSession = useCallback(async (input) => {
    if (!enabled || !sessionId) return null;
    setCreating(true);
    try {
      const response = await apiFetch('/api/shell/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, sessionId, targetId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to create shell session.');
      }
      const shellSession = payload?.shellSession || null;
      if (shellSession?.id) {
        setShellSessions((prev) => upsertSession(prev, shellSession));
        setActiveShellId(shellSession.id);
        setUnreadByShell((prev) => ({ ...prev, [shellSession.id]: 0 }));
      }
      setError('');
      return shellSession;
    } catch (createError) {
      setError(createError?.message || 'Failed to create shell session.');
      return null;
    } finally {
      setCreating(false);
    }
  }, [apiFetch, enabled, sessionId, targetId]);

  const callShellMutation = useCallback(async (shellSessionId, path, body = {}) => {
    setBusyByShell((prev) => ({ ...prev, [shellSessionId]: true }));
    try {
      const response = await apiFetch(`/api/shell/sessions/${encodeURIComponent(shellSessionId)}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, ...body }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || `Failed to ${path}.`);
      }
      if (payload?.shellSession) {
        setShellSessions((prev) => upsertSession(prev, payload.shellSession));
      }
      return payload;
    } finally {
      setBusyByShell((prev) => ({ ...prev, [shellSessionId]: false }));
    }
  }, [apiFetch, sessionId]);

  const sendInput = useCallback(async (shellSessionId, input) => {
    return callShellMutation(shellSessionId, 'input', { input });
  }, [callShellMutation]);

  const resizeSession = useCallback(async (shellSessionId, dims) => {
    return callShellMutation(shellSessionId, 'resize', dims);
  }, [callShellMutation]);

  const disconnectSession = useCallback(async (shellSessionId) => {
    return callShellMutation(shellSessionId, 'disconnect');
  }, [callShellMutation]);

  const clearLocalTabState = useCallback((shellSessionId) => {
    setTranscriptsByShell((prev) => ({ ...prev, [shellSessionId]: [] }));
    setTranscriptCursorByShell((prev) => ({ ...prev, [shellSessionId]: 0 }));
    setUnreadByShell((prev) => ({ ...prev, [shellSessionId]: 0 }));
  }, []);

  useEffect(() => {
    setShellSessions([]);
    setActiveShellId(null);
    setTranscriptsByShell({});
    setTranscriptCursorByShell({});
    setUnreadByShell({});
    setError('');
    setStreamStatus(enabled ? 'connecting' : 'idle');
  }, [enabled, sessionId]);

  useEffect(() => {
    if (!enabled || !sessionId) return;
    void refreshShellSessions();
  }, [enabled, refreshShellSessions, sessionId]);

  useEffect(() => {
    if (!enabled || !sessionId || typeof window === 'undefined' || typeof EventSource === 'undefined') {
      setStreamStatus(enabled ? 'disconnected' : 'idle');
      return undefined;
    }

    const source = new EventSource(`/api/shell/stream?sessionId=${encodeURIComponent(sessionId)}`);
    source.addEventListener('ready', () => setStreamStatus('connected'));
    source.addEventListener('ping', () => setStreamStatus('connected'));
    source.addEventListener('shell', (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload?.type === 'shell-state' && payload?.shellSession) {
          setShellSessions((prev) => upsertSession(prev, payload.shellSession));
        }
        if (payload?.type === 'shell-chunk' && payload?.shellSessionId && payload?.chunk) {
          setTranscriptsByShell((prev) => appendChunk(prev, payload.shellSessionId, payload.chunk));
          setTranscriptCursorByShell((prev) => ({
            ...prev,
            [payload.shellSessionId]: Math.max(
              Number(prev[payload.shellSessionId] || 0),
              Number(payload.chunk?.seq || 0)
            ),
          }));
          if (payload.shellSessionId !== activeShellIdRef.current) {
            setUnreadByShell((prev) => ({
              ...prev,
              [payload.shellSessionId]: Number(prev[payload.shellSessionId] || 0) + 1,
            }));
          }
        }
      } catch {
        // ignore malformed shell stream payloads
      }
    });
    source.onerror = () => {
      setStreamStatus('disconnected');
    };

    return () => {
      source.close();
    };
  }, [enabled, sessionId]);

  useEffect(() => {
    if (!shellSessions.length) {
      setActiveShellId(null);
      return;
    }
    if (!activeShellId || !shellSessions.some((session) => session.id === activeShellId)) {
      setActiveShellId(shellSessions[0].id);
    }
  }, [activeShellId, shellSessions]);

  useEffect(() => {
    if (!activeShellId || transcriptsByShell[activeShellId]) return;
    void loadTranscript(activeShellId, { cursor: 0, append: false });
  }, [activeShellId, loadTranscript, transcriptsByShell]);

  const activeShell = shellSessions.find((session) => session.id === activeShellId) || null;

  return {
    shellSessions,
    activeShell,
    activeShellId,
    transcriptsByShell,
    transcriptCursorByShell,
    unreadByShell,
    loading,
    creating,
    busyByShell,
    error,
    streamStatus,
    refreshShellSessions,
    loadTranscript,
    searchTranscript,
    diffTranscriptChunks,
    selectShell,
    createShellSession,
    sendInput,
    resizeSession,
    disconnectSession,
    clearLocalTabState,
  };
}
