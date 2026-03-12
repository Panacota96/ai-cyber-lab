'use client';

import { useEffect, useRef, useState } from 'react';

export function useExecutionStream({ sessionId, enabled = true, onEvent }) {
  const onEventRef = useRef(onEvent);
  const [streamStatus, setStreamStatus] = useState('connecting');

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!enabled || !sessionId || typeof window === 'undefined' || typeof EventSource === 'undefined') {
      return undefined;
    }

    const source = new EventSource(`/api/execute/stream?sessionId=${encodeURIComponent(sessionId)}`);

    const handleExecution = (event) => {
      try {
        const payload = JSON.parse(event.data);
        onEventRef.current?.(payload);
      } catch (_) {
        // ignore malformed stream payloads
      }
    };

    source.addEventListener('ready', () => {
      setStreamStatus('connected');
    });
    source.addEventListener('execution', handleExecution);
    source.addEventListener('ping', () => {
      setStreamStatus('connected');
    });
    source.onerror = () => {
      setStreamStatus('disconnected');
    };

    return () => {
      source.close();
    };
  }, [enabled, sessionId]);

  if (!enabled || !sessionId || typeof window === 'undefined' || typeof EventSource === 'undefined') {
    return 'idle';
  }

  return streamStatus;
}
