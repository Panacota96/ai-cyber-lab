'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createToastRecord } from '@/lib/notifications';

const MAX_TOASTS = 5;

export function useToastQueue() {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  const dismissToast = useCallback((toastId) => {
    if (!toastId) return;
    const timer = timersRef.current.get(toastId);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(toastId);
    }
    setToasts((prev) => prev.filter((toast) => toast.id !== toastId));
  }, []);

  const pushToast = useCallback((input) => {
    const toast = createToastRecord(input || {});
    setToasts((prev) => [toast, ...prev].slice(0, MAX_TOASTS));

    if (toast.durationMs > 0) {
      const timer = setTimeout(() => {
        timersRef.current.delete(toast.id);
        setToasts((prev) => prev.filter((item) => item.id !== toast.id));
      }, toast.durationMs);
      timersRef.current.set(toast.id, timer);
    }

    return toast.id;
  }, []);

  useEffect(() => () => {
    for (const timer of timersRef.current.values()) {
      clearTimeout(timer);
    }
    timersRef.current.clear();
  }, []);

  return {
    toasts,
    pushToast,
    dismissToast,
  };
}
