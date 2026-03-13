'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useApiClient } from '@/hooks/useApiClient';
import { useReportAutosave } from '@/domains/reporting/hooks/useReportAutosave';
import {
  duplicateStudioBlock,
  buildImageBlockFromArtifact,
  buildSectionActionEvidenceContext,
  buildStudioOutline,
  collectImageArtifacts,
  createReportBlockByType,
  deleteStudioBlock,
  getDefaultStudioTargetSection,
  reorderStudioBlocks,
} from '@/domains/reporting/lib/report-studio';
import {
  mergeReportPatches,
  markdownToReportBlocks,
  parseWriteupBlocks,
  reportBlocksToMarkdown,
  reportFormatLabel,
} from '@/domains/reporting/lib/report-blocks';
import styles from './ReportStudio.module.css';
import { chooseReportDraftSource } from '@/lib/report-autosave';
import { applyTemplatePlaceholders, buildReportTemplateContext } from '@/lib/report-template-utils';

function SortableBlockCard({ id, children }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.55 : 1,
      }}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

function blockTypeLabel(blockType) {
  if (blockType === 'code') return 'CODE';
  if (blockType === 'image') return 'IMAGE';
  return 'SECTION';
}

function normalizeResponseJson(response, fallback = {}) {
  return response.json().catch(() => fallback);
}

function formatDateTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString();
}

function parseWriteupPayload(payload) {
  const content = String(payload?.content || '');
  const contentJson = Array.isArray(payload?.contentJson) && payload.contentJson.length > 0
    ? payload.contentJson
    : markdownToReportBlocks(content);
  return {
    content,
    contentJson,
    status: payload?.status || 'draft',
    visibility: payload?.visibility || 'draft',
    updatedAt: payload?.updated_at || payload?.updatedAt || null,
  };
}

export default function ReportStudioClient({ sessionId, initialReportFormat = 'technical-walkthrough' }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const { apiFetch } = useApiClient();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sessionData, setSessionData] = useState(null);
  const [reportFormat, setReportFormat] = useState(initialReportFormat || 'technical-walkthrough');
  const [reportBlocks, setReportBlocks] = useState(markdownToReportBlocks(''));
  const [writeupStatus, setWriteupStatus] = useState('draft');
  const [writeupVisibility, setWriteupVisibility] = useState('draft');
  const [reportRestoreNotice, setReportRestoreNotice] = useState('');
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateBusy, setTemplateBusy] = useState(false);
  const [artifacts, setArtifacts] = useState([]);
  const [artifactsLoading, setArtifactsLoading] = useState(false);
  const [findings, setFindings] = useState([]);
  const [credentials, setCredentials] = useState([]);
  const [previewVisible, setPreviewVisible] = useState(true);
  const [focusedBlockId, setFocusedBlockId] = useState('');
  const [bindArtifactsToSelectedSection, setBindArtifactsToSelectedSection] = useState(true);
  const [saveState, setSaveState] = useState({ busy: false, savedAt: null, message: '' });
  const [pendingPatchState, setPendingPatchState] = useState({ busy: false, action: '', sectionId: '', patches: [], error: '' });
  const blockRefs = useRef({});

  const {
    readLocalReportDraft,
    clearLocalReportDraft,
    markReportAutosaveSignature,
  } = useReportAutosave({
    sessionId,
    reportFormat,
    reportBlocks,
    showReportModal: true,
    prefsHydrated: true,
  });

  const reportMarkdown = useMemo(() => reportBlocksToMarkdown(reportBlocks), [reportBlocks]);
  const outlineItems = useMemo(() => buildStudioOutline(reportBlocks), [reportBlocks]);
  const imageArtifacts = useMemo(() => collectImageArtifacts(artifacts), [artifacts]);
  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) || null,
    [selectedTemplateId, templates],
  );
  const focusedBlock = useMemo(
    () => reportBlocks.find((block) => String(block?.id || '') === String(focusedBlockId || '')) || null,
    [focusedBlockId, reportBlocks],
  );

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const response = await apiFetch(`/api/report/templates?sessionId=${encodeURIComponent(sessionId)}&format=${encodeURIComponent(reportFormat)}`);
      const data = await normalizeResponseJson(response, { templates: [] });
      setTemplates(Array.isArray(data?.templates) ? data.templates : []);
    } catch (studioError) {
      console.error('Failed to load report templates', studioError);
      setTemplates([]);
    } finally {
      setTemplatesLoading(false);
    }
  }, [apiFetch, reportFormat, sessionId]);

  const loadArtifacts = useCallback(async () => {
    setArtifactsLoading(true);
    try {
      const response = await apiFetch(`/api/artifacts?sessionId=${encodeURIComponent(sessionId)}`);
      const data = await normalizeResponseJson(response, { artifacts: [] });
      setArtifacts(Array.isArray(data?.artifacts) ? data.artifacts : []);
    } catch (studioError) {
      console.error('Failed to load artifacts', studioError);
      setArtifacts([]);
    } finally {
      setArtifactsLoading(false);
    }
  }, [apiFetch, sessionId]);

  const loadStudio = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [sessionsResponse, writeupResponse, findingsResponse, credentialsResponse] = await Promise.all([
        apiFetch('/api/sessions'),
        apiFetch(`/api/writeup?sessionId=${encodeURIComponent(sessionId)}`),
        apiFetch(`/api/findings?sessionId=${encodeURIComponent(sessionId)}`),
        apiFetch(`/api/credentials?sessionId=${encodeURIComponent(sessionId)}`),
      ]);

      const sessions = await normalizeResponseJson(sessionsResponse, []);
      const writeupPayload = parseWriteupPayload(await normalizeResponseJson(writeupResponse, {}));
      const findingsPayload = await normalizeResponseJson(findingsResponse, []);
      const credentialsPayload = await normalizeResponseJson(credentialsResponse, []);
      const localDraft = readLocalReportDraft(sessionId, reportFormat);
      const selectedDraft = chooseReportDraftSource({
        localDraft,
        serverUpdatedAt: writeupPayload.updatedAt,
        hasServerContent: Boolean(writeupPayload.content.trim() || writeupPayload.contentJson.length > 0),
      });
      const nextBlocks = selectedDraft.blocks ? parseWriteupBlocks(selectedDraft.blocks) : writeupPayload.contentJson;
      const session = Array.isArray(sessions)
        ? sessions.find((entry) => String(entry?.id || '') === String(sessionId)) || null
        : null;

      setSessionData(session);
      setReportBlocks(nextBlocks);
      setFocusedBlockId(getDefaultStudioTargetSection(nextBlocks) || nextBlocks[0]?.id || '');
      setWriteupStatus(writeupPayload.status);
      setWriteupVisibility(writeupPayload.visibility);
      setReportRestoreNotice(selectedDraft.notice || '');
      setFindings(Array.isArray(findingsPayload) ? findingsPayload : []);
      setCredentials(Array.isArray(credentialsPayload) ? credentialsPayload : []);
      markReportAutosaveSignature(nextBlocks);
      await Promise.all([loadTemplates(), loadArtifacts()]);
    } catch (studioError) {
      console.error('Failed to load report studio', studioError);
      setError('Failed to load the Report Studio workspace.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, loadArtifacts, loadTemplates, markReportAutosaveSignature, readLocalReportDraft, reportFormat, sessionId]);

  useEffect(() => {
    void loadStudio();
  }, [loadStudio]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    const template = selectedTemplate;
    if (!template) return;
    setTemplateName(template.name || '');
    setTemplateDescription(template.description || '');
  }, [selectedTemplate]);

  const handleSaveWriteup = useCallback(async () => {
    try {
      setSaveState((prev) => ({ ...prev, busy: true, message: '' }));
      const response = await apiFetch('/api/writeup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          content: reportMarkdown,
          contentJson: reportBlocks,
          status: writeupStatus,
          visibility: writeupVisibility,
        }),
      });
      const data = await normalizeResponseJson(response, {});
      if (!response.ok) {
        setSaveState((prev) => ({ ...prev, busy: false, message: data?.error || 'Failed to save writeup.' }));
        return;
      }
      clearLocalReportDraft(sessionId, reportFormat);
      markReportAutosaveSignature(reportBlocks);
      setSaveState({
        busy: false,
        savedAt: Date.now(),
        message: 'Saved to Chronicle writeup store.',
      });
    } catch (studioError) {
      console.error('Failed to save writeup', studioError);
      setSaveState((prev) => ({ ...prev, busy: false, message: 'Failed to save writeup.' }));
    }
  }, [
    apiFetch,
    clearLocalReportDraft,
    markReportAutosaveSignature,
    reportBlocks,
    reportFormat,
    reportMarkdown,
    sessionId,
    writeupStatus,
    writeupVisibility,
  ]);

  useEffect(() => {
    const onKeyDown = async (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        await handleSaveWriteup();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd' && focusedBlockId) {
        event.preventDefault();
        setReportBlocks((prev) => duplicateStudioBlock(prev, focusedBlockId));
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === '\\') {
        event.preventDefault();
        setPreviewVisible((prev) => !prev);
        return;
      }
      if (event.altKey && focusedBlockId && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault();
        const index = reportBlocks.findIndex((block) => String(block?.id || '') === String(focusedBlockId));
        if (index === -1) return;
        const nextIndex = event.key === 'ArrowUp' ? index - 1 : index + 1;
        setReportBlocks((prev) => reorderStudioBlocks(prev, index, nextIndex));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusedBlockId, handleSaveWriteup, reportBlocks]);

  const updateBlock = useCallback((blockId, patch = {}) => {
    setReportBlocks((prev) => prev.map((block) => (
      String(block?.id || '') === String(blockId)
        ? { ...block, ...patch }
        : block
    )));
  }, []);

  const addBlock = useCallback((type = 'section') => {
    const nextBlock = createReportBlockByType(type);
    setReportBlocks((prev) => [...prev, nextBlock]);
    setFocusedBlockId(nextBlock.id);
  }, []);

  const removeBlock = useCallback((blockId) => {
    setReportBlocks((prev) => deleteStudioBlock(prev, blockId));
    if (String(focusedBlockId) === String(blockId)) {
      setFocusedBlockId('');
    }
  }, [focusedBlockId]);

  const duplicateBlock = useCallback((blockId) => {
    setReportBlocks((prev) => duplicateStudioBlock(prev, blockId));
  }, []);

  const moveBlock = useCallback((blockId, direction) => {
    const index = reportBlocks.findIndex((block) => String(block?.id || '') === String(blockId || ''));
    if (index === -1) return;
    setReportBlocks((prev) => reorderStudioBlocks(prev, index, direction === 'up' ? index - 1 : index + 1));
  }, [reportBlocks]);

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    if (!active?.id || !over?.id || active.id === over.id) return;
    const fromIndex = reportBlocks.findIndex((block) => String(block?.id || '') === String(active.id));
    const toIndex = reportBlocks.findIndex((block) => String(block?.id || '') === String(over.id));
    if (fromIndex === -1 || toIndex === -1) return;
    setReportBlocks((prev) => reorderStudioBlocks(prev, fromIndex, toIndex));
  }, [reportBlocks]);

  const handleApplyTemplate = useCallback(() => {
    if (!selectedTemplate) return;
    const hydratedBlocks = applyTemplatePlaceholders(
      Array.isArray(selectedTemplate.contentJson) && selectedTemplate.contentJson.length > 0
        ? selectedTemplate.contentJson
        : markdownToReportBlocks(selectedTemplate.content || ''),
      buildReportTemplateContext({
        session: sessionData,
        analystName: 'Unknown',
        format: reportFormat,
        formatLabel: reportFormatLabel(reportFormat),
        generatedAt: new Date(),
        findings,
        reportFindings: findings,
      }),
    );
    const nextBlocks = parseWriteupBlocks(hydratedBlocks);
    setReportBlocks(nextBlocks);
    setFocusedBlockId(getDefaultStudioTargetSection(nextBlocks) || nextBlocks[0]?.id || '');
    setReportRestoreNotice(`Applied template: ${selectedTemplate.name}`);
  }, [findings, reportFormat, selectedTemplate, sessionData]);

  const handleSaveTemplate = useCallback(async () => {
    try {
      setTemplateBusy(true);
      const payload = {
        sessionId,
        name: templateName.trim() || `${sessionData?.name || sessionId} ${reportFormatLabel(reportFormat)}`,
        description: templateDescription.trim(),
        format: reportFormat,
        content: reportMarkdown,
        contentJson: reportBlocks,
      };
      const method = selectedTemplate?.scope === 'user' ? 'PATCH' : 'POST';
      const response = await apiFetch('/api/report/templates', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(method === 'PATCH' ? { id: selectedTemplate.id, ...payload } : payload),
      });
      const data = await normalizeResponseJson(response, {});
      if (!response.ok) {
        setSaveState((prev) => ({ ...prev, message: data?.error || 'Failed to save template.' }));
        return;
      }
      await loadTemplates();
      if (data?.template?.id) setSelectedTemplateId(data.template.id);
      setSaveState((prev) => ({ ...prev, message: 'Template saved.' }));
    } catch (studioError) {
      console.error('Failed to save template', studioError);
      setSaveState((prev) => ({ ...prev, message: 'Failed to save template.' }));
    } finally {
      setTemplateBusy(false);
    }
  }, [
    apiFetch,
    loadTemplates,
    reportBlocks,
    reportFormat,
    reportMarkdown,
    selectedTemplate,
    sessionData?.name,
    sessionId,
    templateDescription,
    templateName,
  ]);

  const handleDeleteTemplate = useCallback(async () => {
    if (!selectedTemplate || selectedTemplate.scope !== 'user') return;
    if (!window.confirm('Delete this saved template?')) return;
    try {
      setTemplateBusy(true);
      const response = await apiFetch(`/api/report/templates?id=${encodeURIComponent(selectedTemplate.id)}`, {
        method: 'DELETE',
      });
      const data = await normalizeResponseJson(response, {});
      if (!response.ok) {
        setSaveState((prev) => ({ ...prev, message: data?.error || 'Failed to delete template.' }));
        return;
      }
      setSelectedTemplateId('');
      setTemplateName('');
      setTemplateDescription('');
      await loadTemplates();
      setSaveState((prev) => ({ ...prev, message: 'Template deleted.' }));
    } catch (studioError) {
      console.error('Failed to delete template', studioError);
      setSaveState((prev) => ({ ...prev, message: 'Failed to delete template.' }));
    } finally {
      setTemplateBusy(false);
    }
  }, [apiFetch, loadTemplates, selectedTemplate]);

  const insertArtifactAsImage = useCallback((artifact) => {
    const linkedSectionId = bindArtifactsToSelectedSection && focusedBlock?.blockType === 'section'
      ? focusedBlock.id
      : focusedBlock?.linkedSectionId || null;
    const imageBlock = buildImageBlockFromArtifact(artifact, { linkedSectionId, layout: 'full' });
    if (!imageBlock) return;
    setReportBlocks((prev) => [...prev, imageBlock]);
    setFocusedBlockId(imageBlock.id);
  }, [bindArtifactsToSelectedSection, focusedBlock]);

  const requestSectionAction = useCallback(async (block, sectionAction) => {
    if (!block) return;
    setPendingPatchState({
      busy: true,
      action: sectionAction,
      sectionId: block.id,
      patches: [],
      error: '',
    });
    try {
      const response = await apiFetch('/api/writeup/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          provider: 'claude',
          skill: 'writeup-refiner',
          mode: 'section-patch',
          reportContent: reportMarkdown || '# Empty draft',
          reportBlocks,
          selectedSectionIds: [block.id],
          sectionAction,
          evidenceContext: buildSectionActionEvidenceContext({
            sectionAction,
            block,
            blocks: reportBlocks,
            artifacts,
            findings,
            credentials,
          }),
        }),
      });
      const data = await normalizeResponseJson(response, {});
      if (!response.ok) {
        setPendingPatchState({
          busy: false,
          action: sectionAction,
          sectionId: block.id,
          patches: [],
          error: data?.error || 'Failed to generate section patch.',
        });
        return;
      }
      setPendingPatchState({
        busy: false,
        action: sectionAction,
        sectionId: block.id,
        patches: Array.isArray(data?.patches) ? data.patches : [],
        error: '',
      });
    } catch (studioError) {
      console.error('Failed to generate section patch', studioError);
      setPendingPatchState({
        busy: false,
        action: sectionAction,
        sectionId: block.id,
        patches: [],
        error: 'Failed to generate section patch.',
      });
    }
  }, [apiFetch, artifacts, credentials, findings, reportBlocks, reportMarkdown, sessionId]);

  const applyPendingPatch = useCallback(() => {
    if (!Array.isArray(pendingPatchState.patches) || pendingPatchState.patches.length === 0) return;
    const nextBlocks = mergeReportPatches(reportBlocks, pendingPatchState.patches, { allowMissingAppend: true });
    setReportBlocks(nextBlocks);
    setPendingPatchState({ busy: false, action: '', sectionId: '', patches: [], error: '' });
  }, [pendingPatchState.patches, reportBlocks]);

  const selectedSectionIdForBinding = focusedBlock?.blockType === 'section'
    ? focusedBlock.id
    : null;

  if (loading) {
    return (
      <main className={styles.studioPage}>
        <div className={styles.panel}>
          <p className="mono">Loading Report Studio…</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className={styles.studioPage}>
        <div className={styles.panel}>
          <p className="mono" style={{ color: 'var(--accent-danger)' }}>{error}</p>
          <div className={styles.inlineActions}>
            <button type="button" className="btn-secondary" onClick={() => void loadStudio()}>Retry</button>
            <Link href="/" className="btn-secondary">Back to Helm&apos;s Watch</Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.studioPage}>
      <section className={`${styles.panel} ${styles.headerBar}`}>
        <div style={{ display: 'grid', gap: '0.25rem' }}>
          <h1 className="dnd-title" style={{ fontSize: '1.35rem' }}>Report Studio</h1>
          <div className={styles.statusLine}>
            <span className={styles.pill}>{sessionData?.name || sessionId}</span>
            <span className={styles.pill}>{reportFormatLabel(reportFormat)}</span>
            {saveState.savedAt ? <span className={styles.pill}>Saved {formatDateTime(saveState.savedAt)}</span> : null}
            {reportRestoreNotice ? <span className={styles.pill}>{reportRestoreNotice}</span> : null}
          </div>
        </div>
        <div className={styles.headerActions}>
          <select
            value={reportFormat}
            onChange={(event) => setReportFormat(event.target.value)}
            className={styles.selectInput}
            style={{ width: 'auto', minWidth: '220px' }}
          >
            <option value="lab-report">Lab Report</option>
            <option value="executive-summary">Executive Summary</option>
            <option value="technical-walkthrough">Technical Walkthrough</option>
            <option value="ctf-solution">CTF Solution</option>
            <option value="bug-bounty">Bug Bounty</option>
            <option value="pentest">Pentest Report</option>
          </select>
          <button type="button" className="btn-secondary mono" onClick={() => setPreviewVisible((prev) => !prev)}>
            {previewVisible ? 'Hide Preview' : 'Show Preview'}
          </button>
          <button type="button" className="btn-primary mono" onClick={() => void handleSaveWriteup()} disabled={saveState.busy}>
            {saveState.busy ? 'Saving…' : 'Save'}
          </button>
          <Link href="/" className="btn-secondary mono">Back to Chronicle</Link>
        </div>
      </section>

      {saveState.message ? (
        <section className={styles.panel}>
          <p className="mono" style={{ fontSize: '0.78rem', color: saveState.message.includes('Failed') ? 'var(--accent-danger)' : 'var(--text-muted)' }}>
            {saveState.message}
          </p>
        </section>
      ) : null}

      <section className={styles.studioShell}>
        <aside className={`${styles.panel} ${styles.outlinePanel}`}>
          <div className={styles.templateHeader}>
            <strong>Outline</strong>
            <span className={styles.studioInfo}>{outlineItems.length} blocks</span>
          </div>
          <div className={styles.stackActions}>
            <button type="button" className="btn-secondary mono" onClick={() => addBlock('section')}>+ Section</button>
            <button type="button" className="btn-secondary mono" onClick={() => addBlock('code')}>+ Code</button>
            <button type="button" className="btn-secondary mono" onClick={() => addBlock('image')}>+ Image</button>
          </div>
          <div className={styles.outlineList}>
            {outlineItems.map((item) => (
              <div
                key={item.id}
                className={`${styles.outlineItem} ${String(item.id) === String(focusedBlockId) ? styles.outlineItemActive : ''}`}
                onClick={() => {
                  setFocusedBlockId(item.id);
                  blockRefs.current[item.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
              >
                <div className={styles.templateHeader}>
                  <strong className="mono" style={{ fontSize: '0.76rem' }}>{item.title}</strong>
                  <span className={styles.outlineMeta}>{blockTypeLabel(item.blockType)}</span>
                </div>
                <div className={styles.inlineActions}>
                  <button type="button" className="btn-secondary mono" style={{ fontSize: '0.72rem', padding: '3px 7px' }} onClick={(event) => { event.stopPropagation(); duplicateBlock(item.id); }}>Duplicate</button>
                  <button type="button" className="btn-secondary mono" style={{ fontSize: '0.72rem', padding: '3px 7px' }} onClick={(event) => { event.stopPropagation(); moveBlock(item.id, 'up'); }}>↑</button>
                  <button type="button" className="btn-secondary mono" style={{ fontSize: '0.72rem', padding: '3px 7px' }} onClick={(event) => { event.stopPropagation(); moveBlock(item.id, 'down'); }}>↓</button>
                  <button type="button" className="btn-secondary mono" style={{ fontSize: '0.72rem', padding: '3px 7px', color: 'var(--accent-danger)', borderColor: 'var(--accent-danger)' }} onClick={(event) => { event.stopPropagation(); removeBlock(item.id); }}>Delete</button>
                </div>
              </div>
            ))}
          </div>

          <div className={styles.templateHeader}>
            <strong>Template Packs</strong>
            <span className={styles.studioInfo}>{templatesLoading ? 'Loading…' : `${templates.length} available`}</span>
          </div>
          <select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)} className={styles.templateSelect}>
            <option value="">Select a built-in or saved template</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.scope === 'system' ? 'Pack' : 'Saved'} · {template.name}
              </option>
            ))}
          </select>
          <input type="text" value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Template name" className={styles.textInput} />
          <input type="text" value={templateDescription} onChange={(event) => setTemplateDescription(event.target.value)} placeholder="Template description" className={styles.textInput} />
          <div className={styles.inlineActions}>
            <button type="button" className="btn-secondary mono" disabled={!selectedTemplate} onClick={handleApplyTemplate}>Apply</button>
            <button type="button" className="btn-secondary mono" disabled={templateBusy} onClick={() => void handleSaveTemplate()}>
              {templateBusy ? 'Saving…' : selectedTemplate?.scope === 'user' ? 'Update' : 'Save Current'}
            </button>
            <button type="button" className="btn-secondary mono" disabled={!selectedTemplate || selectedTemplate.scope !== 'user' || templateBusy} onClick={() => void handleDeleteTemplate()}>
              Delete
            </button>
          </div>

          <div className={styles.templateHeader}>
            <strong>Artifacts</strong>
            <span className={styles.studioInfo}>{artifactsLoading ? 'Loading…' : `${imageArtifacts.length} images`}</span>
          </div>
          <label className="mono" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
            <input
              type="checkbox"
              checked={bindArtifactsToSelectedSection}
              onChange={(event) => setBindArtifactsToSelectedSection(event.target.checked)}
              style={{ accentColor: 'var(--accent-secondary)' }}
            />
            Bind new images to selected section
          </label>
          {selectedSectionIdForBinding ? <div className={styles.artifactBind}>Binding target: {focusedBlock?.title || focusedBlock?.id}</div> : null}
          <div className={styles.artifactList}>
            {imageArtifacts.length === 0 ? (
              <div className={styles.emptyState}>No image artifacts available for insertion.</div>
            ) : imageArtifacts.map((artifact) => (
              <div key={artifact.id} className={styles.artifactItem}>
                <Image src={artifact.downloadPath} alt={artifact.filename} width={1280} height={720} unoptimized className={styles.artifactPreview} />
                <div className={styles.templateHeader}>
                  <strong className="mono" style={{ fontSize: '0.76rem' }}>{artifact.filename}</strong>
                  <span className={styles.outlineMeta}>{artifact.previewKind}</span>
                </div>
                <div className={styles.studioInfo}>{artifact.notes || artifact.previewText || 'No notes available.'}</div>
                <button type="button" className="btn-secondary mono" style={{ marginTop: '0.45rem', width: '100%' }} onClick={() => insertArtifactAsImage(artifact)}>
                  Insert from Artifacts
                </button>
              </div>
            ))}
          </div>
        </aside>

        <section className={`${styles.panel} ${styles.editorPanel}`}>
          <div className={styles.toolbarRow}>
            <strong>Editor</strong>
            <span className={styles.studioInfo}>
              Shortcuts: Save <span className="mono">Ctrl/Cmd+S</span>, Duplicate <span className="mono">Ctrl/Cmd+D</span>, Move <span className="mono">Alt+↑/↓</span>, Preview <span className="mono">Ctrl/Cmd+\</span>
            </span>
          </div>
          <div className={styles.editorScroll}>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={reportBlocks.map((block) => block.id)} strategy={verticalListSortingStrategy}>
                <div className={styles.blockList}>
                  {reportBlocks.map((block) => (
                    <SortableBlockCard key={block.id} id={block.id}>
                      <div
                        ref={(node) => { blockRefs.current[block.id] = node; }}
                        className={styles.blockCard}
                        onClick={() => setFocusedBlockId(block.id)}
                      >
                        <div className={styles.blockHeader}>
                          <strong className="mono" style={{ fontSize: '0.76rem' }}>{blockTypeLabel(block.blockType)}</strong>
                          <div className={styles.inlineActions}>
                            <button type="button" className="btn-secondary mono" style={{ fontSize: '0.72rem', padding: '3px 7px' }} onClick={() => duplicateBlock(block.id)}>Duplicate</button>
                            <button type="button" className="btn-secondary mono" style={{ fontSize: '0.72rem', padding: '3px 7px' }} onClick={() => moveBlock(block.id, 'up')}>↑</button>
                            <button type="button" className="btn-secondary mono" style={{ fontSize: '0.72rem', padding: '3px 7px' }} onClick={() => moveBlock(block.id, 'down')}>↓</button>
                            <button type="button" className="btn-secondary mono" style={{ fontSize: '0.72rem', padding: '3px 7px', color: 'var(--accent-danger)', borderColor: 'var(--accent-danger)' }} onClick={() => removeBlock(block.id)}>Delete</button>
                          </div>
                        </div>

                        <input
                          type="text"
                          value={block.title || ''}
                          onChange={(event) => updateBlock(block.id, { title: event.target.value })}
                          placeholder="Block title"
                          className={styles.textInput}
                        />

                        {block.blockType === 'section' ? (
                          <textarea
                            value={block.content || ''}
                            onChange={(event) => updateBlock(block.id, { content: event.target.value })}
                            placeholder="Write section content..."
                            className={`${styles.textArea} mono`}
                          />
                        ) : null}

                        {block.blockType === 'code' ? (
                          <>
                            <input
                              type="text"
                              value={block.language || 'bash'}
                              onChange={(event) => updateBlock(block.id, { language: event.target.value })}
                              placeholder="Language"
                              className={styles.textInput}
                            />
                            <textarea
                              value={block.content || ''}
                              onChange={(event) => updateBlock(block.id, { content: event.target.value })}
                              placeholder="Paste command/output..."
                              className={`${styles.textArea} ${styles.codeArea} mono`}
                            />
                          </>
                        ) : null}

                        {block.blockType === 'image' ? (
                          <div className={styles.imageGrid}>
                            <input
                              type="text"
                              value={block.imageUrl || ''}
                              onChange={(event) => updateBlock(block.id, { imageUrl: event.target.value })}
                              placeholder="Artifact or screenshot URL"
                              className={styles.textInput}
                            />
                            <select value={block.layout || 'full'} onChange={(event) => updateBlock(block.id, { layout: event.target.value })} className={styles.selectInput}>
                              <option value="full">Full width</option>
                              <option value="split-left">Split left</option>
                              <option value="split-right">Split right</option>
                            </select>
                            <input type="text" value={block.alt || ''} onChange={(event) => updateBlock(block.id, { alt: event.target.value })} placeholder="Alt text" className={styles.textInput} />
                            <input type="text" value={block.caption || ''} onChange={(event) => updateBlock(block.id, { caption: event.target.value })} placeholder="Caption" className={styles.textInput} />
                            <input type="text" value={block.artifactId || ''} onChange={(event) => updateBlock(block.id, { artifactId: event.target.value || null })} placeholder="Linked artifact ID" className={styles.textInput} />
                            <select value={block.linkedSectionId || ''} onChange={(event) => updateBlock(block.id, { linkedSectionId: event.target.value || null })} className={styles.selectInput}>
                              <option value="">No linked section</option>
                              {outlineItems.filter((item) => item.isSection).map((item) => (
                                <option key={item.id} value={item.id}>{item.title}</option>
                              ))}
                            </select>
                            <textarea
                              value={block.content || ''}
                              onChange={(event) => updateBlock(block.id, { content: event.target.value })}
                              placeholder="Analyst note / callout"
                              className={`${styles.textArea} mono ${styles.imageLayoutFull}`}
                              style={{ minHeight: '100px' }}
                            />
                            {block.imageUrl ? (
                              <Image
                                src={block.imageUrl}
                                alt={block.alt || block.title || 'Screenshot'}
                                width={1280}
                                height={720}
                                unoptimized
                                className={`${styles.artifactPreview} ${block.layout === 'split-left' ? styles.imageLayoutSplitLeft : block.layout === 'split-right' ? styles.imageLayoutSplitRight : styles.imageLayoutFull}`}
                              />
                            ) : null}
                          </div>
                        ) : null}

                        <div className={styles.inlineActions}>
                          <button type="button" className="btn-secondary mono" style={{ fontSize: '0.72rem', padding: '3px 7px' }} onClick={() => void requestSectionAction(block, 'refine')}>Refine</button>
                          <button type="button" className="btn-secondary mono" style={{ fontSize: '0.72rem', padding: '3px 7px' }} onClick={() => void requestSectionAction(block, 'summarize')}>Summarize</button>
                          <button type="button" className="btn-secondary mono" style={{ fontSize: '0.72rem', padding: '3px 7px' }} onClick={() => void requestSectionAction(block, 'explain-evidence')}>Explain Evidence</button>
                          <button type="button" className="btn-secondary mono" style={{ fontSize: '0.72rem', padding: '3px 7px' }} onClick={() => void requestSectionAction(block, 'generate-intro')}>Generate Intro</button>
                          <button type="button" className="btn-secondary mono" style={{ fontSize: '0.72rem', padding: '3px 7px' }} onClick={() => void requestSectionAction(block, 'generate-conclusion')}>Generate Conclusion</button>
                        </div>
                      </div>
                    </SortableBlockCard>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        </section>

        <section className={`${styles.panel} ${styles.previewPanel} ${previewVisible ? '' : styles.previewHidden}`}>
          <div className={styles.toolbarRow}>
            <strong>Live Preview</strong>
            <span className={styles.studioInfo}>Preview renders from the same Markdown bundle used by report export.</span>
          </div>

          {pendingPatchState.busy || pendingPatchState.error || pendingPatchState.patches.length > 0 ? (
            <div className={styles.patchCard}>
              <div className={styles.templateHeader}>
                <strong>Section AI Preview</strong>
                <span className={styles.outlineMeta}>{pendingPatchState.action || 'patch'}</span>
              </div>
              {pendingPatchState.busy ? (
                <div className={styles.emptyState}>Generating patch preview…</div>
              ) : pendingPatchState.error ? (
                <div className={styles.emptyState} style={{ color: 'var(--accent-danger)' }}>{pendingPatchState.error}</div>
              ) : (
                <div className={styles.aiPreview}>
                  {pendingPatchState.patches.map((patch) => (
                    <div key={`${patch.sectionId}-${patch.title || 'patch'}`} className={styles.patchPreview}>
                      <strong>{patch.title || patch.sectionId}</strong>
                      {'\n'}
                      {patch.content || '(No patch content returned.)'}
                    </div>
                  ))}
                  <div className={styles.inlineActions}>
                    <button type="button" className="btn-primary mono" onClick={applyPendingPatch}>Apply Patch</button>
                    <button type="button" className="btn-secondary mono" onClick={() => setPendingPatchState({ busy: false, action: '', sectionId: '', patches: [], error: '' })}>Discard</button>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          <div className={styles.previewScroll}>
            <div className={styles.previewMarkdown}>
              <ReactMarkdown>{reportMarkdown || '## Empty Draft\n\nStart adding blocks from the left to compose the report.'}</ReactMarkdown>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
