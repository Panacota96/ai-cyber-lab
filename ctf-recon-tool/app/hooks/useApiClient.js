'use client';

import { useCallback, useRef, useState } from 'react';

function isUnsafeMethod(method = 'GET') {
  return !['GET', 'HEAD', 'OPTIONS'].includes(String(method || 'GET').toUpperCase());
}

export function useApiClient() {
  const csrfTokenRef = useRef('');
  const csrfRequestRef = useRef(null);
  const [csrfReady, setCsrfReady] = useState(false);

  const ensureCsrfToken = useCallback(async () => {
    if (csrfTokenRef.current) return csrfTokenRef.current;
    if (csrfRequestRef.current) return csrfRequestRef.current;

    csrfRequestRef.current = fetch('/api/auth/csrf', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.csrfToken) {
          throw new Error(payload?.error || 'Failed to initialize CSRF protection.');
        }
        csrfTokenRef.current = String(payload.csrfToken);
        setCsrfReady(true);
        return csrfTokenRef.current;
      })
      .finally(() => {
        csrfRequestRef.current = null;
      });

    return csrfRequestRef.current;
  }, []);

  const apiFetch = useCallback(async (url, options = {}) => {
    const headers = new Headers(options.headers || {});

    try {
      const apiToken = localStorage.getItem('appApiToken') || '';
      if (apiToken) headers.set('x-api-token', apiToken);
    } catch (_) {
      // localStorage not available or blocked
    }

    const method = String(options.method || 'GET').toUpperCase();
    if (isUnsafeMethod(method) && !headers.has('x-csrf-token')) {
      const csrfToken = await ensureCsrfToken();
      if (csrfToken) headers.set('x-csrf-token', csrfToken);
    }

    return fetch(url, {
      ...options,
      headers,
      credentials: 'same-origin',
    });
  }, [ensureCsrfToken]);

  return {
    apiFetch,
    csrfReady,
    ensureCsrfToken,
  };
}
