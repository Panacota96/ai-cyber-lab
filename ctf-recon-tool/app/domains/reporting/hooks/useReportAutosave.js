'use client';

import { useCallback, useEffect, useRef } from 'react';
import { buildReportAutosaveKey, parseAutosavePayload } from '@/lib/report-autosave';

function serializeBlocks(blocks) {
  try {
    return JSON.stringify(Array.isArray(blocks) ? blocks : []);
  } catch {
    return '';
  }
}

export function useReportAutosave({
  sessionId,
  reportFormat,
  reportBlocks,
  showReportModal,
  prefsHydrated,
}) {
  const signatureRef = useRef('');

  const readLocalReportDraft = useCallback((targetSessionId = sessionId, targetFormat = reportFormat) => {
    try {
      const rawValue = localStorage.getItem(buildReportAutosaveKey(targetSessionId, targetFormat));
      return parseAutosavePayload(rawValue);
    } catch {
      return null;
    }
  }, [reportFormat, sessionId]);

  const clearLocalReportDraft = useCallback((targetSessionId = sessionId, targetFormat = reportFormat) => {
    try {
      localStorage.removeItem(buildReportAutosaveKey(targetSessionId, targetFormat));
    } catch {
      // localStorage unavailable
    }
  }, [reportFormat, sessionId]);

  const markReportAutosaveSignature = useCallback((blocks = reportBlocks) => {
    signatureRef.current = serializeBlocks(blocks);
  }, [reportBlocks]);

  useEffect(() => {
    if (!showReportModal || !prefsHydrated) return undefined;
    const interval = setInterval(() => {
      try {
        const serializedBlocks = serializeBlocks(reportBlocks);
        if (!serializedBlocks || serializedBlocks === signatureRef.current) {
          return;
        }
        localStorage.setItem(buildReportAutosaveKey(sessionId, reportFormat), JSON.stringify({
          savedAt: new Date().toISOString(),
          blocks: JSON.parse(serializedBlocks),
        }));
        signatureRef.current = serializedBlocks;
      } catch {
        // localStorage unavailable
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [prefsHydrated, reportBlocks, reportFormat, sessionId, showReportModal]);

  return {
    readLocalReportDraft,
    clearLocalReportDraft,
    markReportAutosaveSignature,
  };
}
