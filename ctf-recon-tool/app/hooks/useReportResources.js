'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { reportFormatLabel } from '@/lib/report-blocks';

function clearBusyEntry(map, key) {
  const next = { ...map };
  delete next[key];
  return next;
}

async function copyToClipboard(value) {
  if (!value || typeof navigator === 'undefined' || !navigator?.clipboard?.writeText) return;
  await navigator.clipboard.writeText(value);
}

export function useReportResources({
  sessionId,
  sessionData,
  showReportModal,
  reportFormat,
  reportBlocks,
  normalizedReportFilters,
  analystName,
  autoWriteupEnabled,
  autoWriteupSuggestionsEnabled,
  apiFetch,
  pushToast,
  getReportMarkdown,
  onWriteupLoaded,
}) {
  const [reportTemplates, setReportTemplates] = useState([]);
  const [selectedReportTemplateId, setSelectedReportTemplateId] = useState('');
  const [reportTemplateName, setReportTemplateName] = useState('');
  const [reportTemplateDescription, setReportTemplateDescription] = useState('');
  const [reportTemplatesLoading, setReportTemplatesLoading] = useState(false);
  const [reportTemplateBusy, setReportTemplateBusy] = useState(false);
  const [reportShares, setReportShares] = useState([]);
  const [reportSharesLoading, setReportSharesLoading] = useState(false);
  const [reportShareBusy, setReportShareBusy] = useState(false);
  const [writeupSuggestions, setWriteupSuggestions] = useState([]);
  const [writeupSuggestionsLoading, setWriteupSuggestionsLoading] = useState(false);
  const [writeupSuggestionBusy, setWriteupSuggestionBusy] = useState({});
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [writeupVersions, setWriteupVersions] = useState([]);
  const writeupSuggestionToastRef = useRef({ readyCount: 0, sessionId: '' });
  const selectedReportTemplate = reportTemplates.find((entry) => entry.id === selectedReportTemplateId) || null;

  const fetchReportTemplates = useCallback(async () => {
    if (!sessionId) return [];
    setReportTemplatesLoading(true);
    try {
      const res = await apiFetch(`/api/report/templates?sessionId=${sessionId}&format=${encodeURIComponent(reportFormat)}`);
      const data = await res.json();
      const templates = Array.isArray(data?.templates) ? data.templates : [];
      setReportTemplates(templates);
      return templates;
    } catch (error) {
      console.error('Failed to fetch report templates', error);
      setReportTemplates([]);
      return [];
    } finally {
      setReportTemplatesLoading(false);
    }
  }, [apiFetch, reportFormat, sessionId]);

  const fetchReportShares = useCallback(async () => {
    if (!sessionId) return [];
    setReportSharesLoading(true);
    try {
      const res = await apiFetch(`/api/writeup/share?sessionId=${sessionId}`);
      const data = await res.json();
      const shares = Array.isArray(data?.shares) ? data.shares : [];
      setReportShares(shares);
      return shares;
    } catch (error) {
      console.error('Failed to fetch report shares', error);
      setReportShares([]);
      return [];
    } finally {
      setReportSharesLoading(false);
    }
  }, [apiFetch, sessionId]);

  const refreshWriteupSuggestions = useCallback(async ({ silent = false } = {}) => {
    if (!sessionId || !autoWriteupEnabled || !autoWriteupSuggestionsEnabled) {
      setWriteupSuggestions([]);
      return [];
    }
    if (!silent) setWriteupSuggestionsLoading(true);
    try {
      const res = await apiFetch(`/api/writeup/suggestions?sessionId=${sessionId}`);
      const data = await res.json();
      const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];
      setWriteupSuggestions(suggestions);
      return suggestions;
    } catch (error) {
      console.error('Failed to fetch writeup suggestions', error);
      if (!silent) setWriteupSuggestions([]);
      return [];
    } finally {
      if (!silent) setWriteupSuggestionsLoading(false);
    }
  }, [apiFetch, autoWriteupEnabled, autoWriteupSuggestionsEnabled, sessionId]);

  const applyQueuedWriteupSuggestion = useCallback(async (suggestionId) => {
    if (!suggestionId || !sessionId) return;
    setWriteupSuggestionBusy((prev) => ({ ...prev, [suggestionId]: 'apply' }));
    try {
      const res = await apiFetch('/api/writeup/suggestions/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, suggestionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Failed to apply suggestion.');
        return;
      }
      if (data?.writeup) {
        onWriteupLoaded(data.writeup, { openModal: true });
      }
      await refreshWriteupSuggestions({ silent: true });
      pushToast({
        tone: 'success',
        title: 'Suggestion applied',
        message: 'The queued writeup patch was merged into the saved draft.',
        durationMs: 3200,
      });
    } catch (error) {
      console.error('Failed to apply queued writeup suggestion', error);
    } finally {
      setWriteupSuggestionBusy((prev) => clearBusyEntry(prev, suggestionId));
    }
  }, [apiFetch, onWriteupLoaded, pushToast, refreshWriteupSuggestions, sessionId]);

  const dismissQueuedWriteupSuggestion = useCallback(async (suggestionId) => {
    if (!suggestionId || !sessionId) return;
    setWriteupSuggestionBusy((prev) => ({ ...prev, [suggestionId]: 'dismiss' }));
    try {
      const res = await apiFetch('/api/writeup/suggestions/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, suggestionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Failed to dismiss suggestion.');
        return;
      }
      await refreshWriteupSuggestions({ silent: true });
      pushToast({
        tone: 'warning',
        title: 'Suggestion dismissed',
        message: 'The queued writeup patch was dismissed without changing the draft.',
        durationMs: 2800,
      });
    } catch (error) {
      console.error('Failed to dismiss queued writeup suggestion', error);
    } finally {
      setWriteupSuggestionBusy((prev) => clearBusyEntry(prev, suggestionId));
    }
  }, [apiFetch, pushToast, refreshWriteupSuggestions, sessionId]);

  const saveReportTemplate = useCallback(async () => {
    if (!sessionId) return;
    const templateName = reportTemplateName.trim() || `${sessionData?.name || sessionId} ${reportFormatLabel(reportFormat)}`;
    try {
      setReportTemplateBusy(true);
      const markdown = getReportMarkdown(reportBlocks);
      const payload = {
        sessionId,
        name: templateName,
        description: reportTemplateDescription.trim(),
        format: reportFormat,
        content: markdown,
        contentJson: reportBlocks,
      };
      const saveMode = selectedReportTemplateId && selectedReportTemplate?.scope !== 'system' ? 'PATCH' : 'POST';
      const res = await apiFetch('/api/report/templates', {
        method: saveMode,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(saveMode === 'PATCH' ? { id: selectedReportTemplateId, ...payload } : payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Failed to save template');
        return;
      }
      const savedTemplate = data?.template || null;
      if (savedTemplate?.id) {
        setSelectedReportTemplateId(savedTemplate.id);
        setReportTemplateName(savedTemplate.name || '');
        setReportTemplateDescription(savedTemplate.description || '');
      }
      await fetchReportTemplates();
      pushToast({
        tone: 'success',
        title: 'Template saved',
        message: templateName,
        durationMs: 2600,
      });
    } catch (error) {
      console.error('Failed to save report template', error);
    } finally {
      setReportTemplateBusy(false);
    }
  }, [
    apiFetch,
    fetchReportTemplates,
    getReportMarkdown,
    pushToast,
    reportBlocks,
    reportFormat,
    reportTemplateDescription,
    reportTemplateName,
    selectedReportTemplate,
    selectedReportTemplateId,
    sessionData?.name,
    sessionId,
  ]);

  const deleteSelectedReportTemplate = useCallback(async () => {
    if (selectedReportTemplate?.scope === 'system') {
      pushToast({
        tone: 'info',
        title: 'Built-in template',
        message: 'Template packs are read-only. Save a copy if you want to customize one.',
        durationMs: 2800,
      });
      return;
    }
    if (!selectedReportTemplateId || !confirm('Delete this report template?')) return;
    try {
      setReportTemplateBusy(true);
      const res = await apiFetch(`/api/report/templates?id=${encodeURIComponent(selectedReportTemplateId)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Failed to delete template');
        return;
      }
      if (selectedReportTemplate?.scope !== 'system') {
        setSelectedReportTemplateId('');
      }
      setReportTemplateName('');
      setReportTemplateDescription('');
      await fetchReportTemplates();
      pushToast({
        tone: 'warning',
        title: 'Template deleted',
        message: 'The saved report template was removed.',
        durationMs: 2400,
      });
    } catch (error) {
      console.error('Failed to delete report template', error);
    } finally {
      setReportTemplateBusy(false);
    }
  }, [apiFetch, fetchReportTemplates, pushToast, selectedReportTemplate, selectedReportTemplateId]);

  const createReportShare = useCallback(async () => {
    if (!sessionId) return;
    try {
      setReportShareBusy(true);
      const markdown = getReportMarkdown(reportBlocks);
      const meta = {
        sessionName: sessionData?.name || sessionId,
        target: sessionData?.target || '',
        difficulty: sessionData?.difficulty || '',
        objective: sessionData?.objective || '',
      };
      const res = await apiFetch('/api/writeup/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          title: `${sessionData?.name || sessionId} ${reportFormatLabel(reportFormat)}`,
          format: reportFormat,
          analystName: (analystName || '').trim() || 'Unknown',
          reportMarkdown: markdown,
          reportContentJson: reportBlocks,
          reportFilters: normalizedReportFilters,
          meta,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.share) {
        alert(data.error || 'Failed to create share link');
        return;
      }
      await fetchReportShares();
      await copyToClipboard(data.share.shareUrl);
      pushToast({
        tone: 'success',
        title: 'Share link created',
        message: 'Copied the read-only report URL to the clipboard.',
        durationMs: 3200,
      });
    } catch (error) {
      console.error('Failed to create report share', error);
    } finally {
      setReportShareBusy(false);
    }
  }, [
    analystName,
    apiFetch,
    fetchReportShares,
    getReportMarkdown,
    normalizedReportFilters,
    pushToast,
    reportBlocks,
    reportFormat,
    sessionData,
    sessionId,
  ]);

  const revokeReportShare = useCallback(async (shareId) => {
    if (!shareId || !sessionId || !confirm('Revoke this share link?')) return;
    try {
      setReportShareBusy(true);
      const res = await apiFetch('/api/writeup/share', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, id: shareId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Failed to revoke share');
        return;
      }
      await fetchReportShares();
      pushToast({
        tone: 'warning',
        title: 'Share link revoked',
        message: 'The public report URL has been disabled.',
        durationMs: 2600,
      });
    } catch (error) {
      console.error('Failed to revoke report share', error);
    } finally {
      setReportShareBusy(false);
    }
  }, [apiFetch, fetchReportShares, pushToast, sessionId]);

  const loadVersionHistory = useCallback(async () => {
    if (!sessionId) return [];
    try {
      const res = await apiFetch(`/api/writeup/history?sessionId=${sessionId}`);
      const data = await res.json().catch(() => ([]));
      const versions = Array.isArray(data) ? data : [];
      setWriteupVersions(versions);
      setShowVersionHistory(true);
      return versions;
    } catch (error) {
      console.error('Failed to load writeup history', error);
      setWriteupVersions([]);
      return [];
    }
  }, [apiFetch, sessionId]);

  const restoreVersion = useCallback(async (versionId) => {
    if (!versionId || !sessionId) return;
    try {
      const res = await apiFetch(`/api/writeup/history?sessionId=${sessionId}&versionId=${versionId}`);
      const data = await res.json().catch(() => ({}));
      const hasContent = Boolean(
        String(data?.content || '').trim()
        || (Array.isArray(data?.contentJson) && data.contentJson.length > 0)
      );
      if (!hasContent) return;
      onWriteupLoaded(data, { openModal: true });
      setShowVersionHistory(false);
    } catch (error) {
      console.error('Failed to restore writeup version', error);
    }
  }, [apiFetch, onWriteupLoaded, sessionId]);

  useEffect(() => {
    setReportTemplates([]);
    setSelectedReportTemplateId('');
    setReportTemplateName('');
    setReportTemplateDescription('');
    setReportShares([]);
    setWriteupSuggestions([]);
    setWriteupSuggestionBusy({});
    setShowVersionHistory(false);
    setWriteupVersions([]);
    writeupSuggestionToastRef.current = { readyCount: 0, sessionId: sessionId || '' };
  }, [sessionId]);

  useEffect(() => {
    if (!showReportModal || !sessionId) return;
    void fetchReportTemplates();
    void fetchReportShares();
  }, [fetchReportShares, fetchReportTemplates, sessionId, showReportModal]);

  useEffect(() => {
    if (!autoWriteupSuggestionsEnabled || !sessionId || !autoWriteupEnabled) {
      setWriteupSuggestions([]);
      writeupSuggestionToastRef.current = { readyCount: 0, sessionId: sessionId || '' };
      return;
    }
    void refreshWriteupSuggestions();
  }, [autoWriteupEnabled, autoWriteupSuggestionsEnabled, refreshWriteupSuggestions, sessionId]);

  useEffect(() => {
    if (!autoWriteupSuggestionsEnabled || !sessionId || !autoWriteupEnabled) return undefined;
    const interval = setInterval(() => {
      void refreshWriteupSuggestions({ silent: true });
    }, 30000);
    return () => clearInterval(interval);
  }, [autoWriteupEnabled, autoWriteupSuggestionsEnabled, refreshWriteupSuggestions, sessionId]);

  useEffect(() => {
    if (!sessionId || !autoWriteupEnabled) return;
    const readyCount = writeupSuggestions.filter((entry) => entry.status === 'ready').length;
    const previous = writeupSuggestionToastRef.current;
    if (previous.sessionId !== sessionId) {
      writeupSuggestionToastRef.current = { readyCount, sessionId };
      return;
    }
    if (readyCount > previous.readyCount) {
      pushToast({
        tone: 'info',
        title: 'Writeup suggestion ready',
        message: `${readyCount} reviewable AI patch suggestion${readyCount === 1 ? '' : 's'} available.`,
        durationMs: 3200,
      });
    }
    writeupSuggestionToastRef.current = { readyCount, sessionId };
  }, [autoWriteupEnabled, pushToast, sessionId, writeupSuggestions]);

  useEffect(() => {
    const template = selectedReportTemplate;
    if (!template) return;
    setReportTemplateName(template.name || '');
    setReportTemplateDescription(template.description || '');
  }, [selectedReportTemplate]);

  return {
    reportTemplates,
    selectedReportTemplate,
    selectedReportTemplateId,
    setSelectedReportTemplateId,
    reportTemplateName,
    setReportTemplateName,
    reportTemplateDescription,
    setReportTemplateDescription,
    reportTemplatesLoading,
    reportTemplateBusy,
    reportShares,
    reportSharesLoading,
    reportShareBusy,
    writeupSuggestions,
    writeupSuggestionsLoading,
    writeupSuggestionBusy,
    showVersionHistory,
    setShowVersionHistory,
    writeupVersions,
    fetchReportTemplates,
    fetchReportShares,
    refreshWriteupSuggestions,
    applyQueuedWriteupSuggestion,
    dismissQueuedWriteupSuggestion,
    saveReportTemplate,
    deleteSelectedReportTemplate,
    createReportShare,
    revokeReportShare,
    loadVersionHistory,
    restoreVersion,
  };
}
