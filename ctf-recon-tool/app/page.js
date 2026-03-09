"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { CHEATSHEET } from '@/lib/cheatsheet';
import { SUGGESTIONS, DIFFICULTY_COLORS, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH, SIDEBAR_DEFAULT_WIDTH, SIDEBAR_RAIL_WIDTH, SUGGESTED_TAGS } from '@/lib/constants';

function loadFavorites() {
  try { return new Set(JSON.parse(localStorage.getItem('flagFavorites') || '[]')); }
  catch { return new Set(); }
}

function makeBlockId(prefix = 'blk') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function newSectionBlock(title = 'Section', content = '') {
  return { id: makeBlockId('sec'), blockType: 'section', title, content };
}

function newCodeBlock(title = 'Code Snippet', content = '', language = 'bash') {
  return { id: makeBlockId('code'), blockType: 'code', title, content, language };
}

function newImageBlock(title = 'Screenshot Evidence', imageUrl = '', alt = 'Screenshot', caption = '', content = '') {
  return { id: makeBlockId('img'), blockType: 'image', title, imageUrl, alt, caption, content };
}

function reportBlocksToMarkdown(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) return '';

  return blocks.map((block) => {
    if (block.blockType === 'code') {
      const title = (block.title || 'Code Snippet').trim();
      const lang = (block.language || 'bash').trim();
      const body = (block.content || '').trim();
      return `### ${title}\n\`\`\`${lang}\n${body}\n\`\`\``;
    }

    if (block.blockType === 'image') {
      const title = (block.title || 'Screenshot Evidence').trim();
      const alt = (block.alt || 'Screenshot').trim();
      const imageUrl = (block.imageUrl || '').trim();
      const caption = (block.caption || '').trim();
      const notes = (block.content || '').trim();
      const parts = [
        `### ${title}`,
        imageUrl ? `![${alt}](${imageUrl})` : '_No image selected_',
      ];
      if (caption) parts.push(`*${caption}*`);
      if (notes) parts.push(notes);
      return parts.join('\n\n');
    }

    const title = (block.title || 'Section').trim();
    const body = (block.content || '').trim();
    return `## ${title}\n${body}`;
  }).join('\n\n').trim();
}

function markdownToReportBlocks(markdown) {
  const source = String(markdown || '').replace(/\r\n/g, '\n').trim();
  if (!source) {
    return [newSectionBlock('Walkthrough', '')];
  }

  const lines = source.split('\n');
  const blocks = [];
  let currentSection = null;
  let pendingTitle = '';

  const pushCurrentSection = () => {
    if (!currentSection) return;
    const content = currentSection.content.join('\n').trim();
    if (currentSection.title || content) {
      blocks.push(newSectionBlock(currentSection.title || 'Section', content));
    }
    currentSection = null;
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('# ')) {
      if (trimmed.slice(2).trim()) pendingTitle = trimmed.slice(2).trim();
      i++;
      continue;
    }

    const heading2 = trimmed.match(/^##\s+(.+)$/);
    if (heading2) {
      pushCurrentSection();
      currentSection = { title: heading2[1].trim(), content: [] };
      i++;
      continue;
    }

    const heading3 = trimmed.match(/^###\s+(.+)$/);
    if (heading3) {
      pushCurrentSection();
      pendingTitle = heading3[1].trim();
      i++;
      continue;
    }

    const codeFence = trimmed.match(/^```([\w+-]+)?$/);
    if (codeFence) {
      pushCurrentSection();
      const language = (codeFence[1] || 'bash').trim();
      i++;
      const codeLines = [];
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      blocks.push(newCodeBlock(pendingTitle || 'Code Snippet', codeLines.join('\n').trim(), language));
      pendingTitle = '';
      continue;
    }

    const imageMatch = trimmed.match(/^!\[(.*?)\]\((.*?)\)$/);
    if (imageMatch) {
      pushCurrentSection();
      let caption = '';
      let lookahead = i + 1;
      while (lookahead < lines.length && lines[lookahead].trim() === '') lookahead++;
      if (lookahead < lines.length) {
        const capMatch = lines[lookahead].trim().match(/^\*(.+)\*$/);
        if (capMatch) {
          caption = capMatch[1].trim();
          i = lookahead;
        }
      }
      blocks.push(newImageBlock(
        pendingTitle || 'Screenshot Evidence',
        imageMatch[2].trim(),
        (imageMatch[1] || 'Screenshot').trim(),
        caption,
        ''
      ));
      pendingTitle = '';
      i++;
      continue;
    }

    if (!currentSection) {
      currentSection = { title: pendingTitle || 'Walkthrough', content: [] };
      pendingTitle = '';
    }
    currentSection.content.push(line);
    i++;
  }

  pushCurrentSection();
  if (blocks.length === 0) {
    blocks.push(newSectionBlock(pendingTitle || 'Walkthrough', source));
  }
  return blocks;
}

const TIMELINE_AUTO_EXPAND_COUNT = 5;

function newestTimelineIds(events, count = TIMELINE_AUTO_EXPAND_COUNT) {
  return [...events]
    .filter((event) => event?.id)
    .slice(-count)
    .map((event) => event.id);
}

// C.8 — LCS-based unified line diff. Returns array of {type:'equal'|'add'|'remove', text} objects.
function computeLineDiff(a, b) {
  const aLines = a.split('\n');
  const bLines = b.split('\n');
  const m = aLines.length, n = bLines.length;
  // Build LCS table
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = aLines[i-1] === bLines[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);
  // Backtrack
  const ops = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && aLines[i-1] === bLines[j-1]) {
      ops.push({ type: 'equal', text: aLines[i-1] }); i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
      ops.push({ type: 'add', text: bLines[j-1] }); j--;
    } else {
      ops.push({ type: 'remove', text: aLines[i-1] }); i--;
    }
  }
  return ops.reverse();
}

function summarizeTimelineEvent(event) {
  if (!event) return '';
  if (event.type === 'command') return event.command || '(command)';
  if (event.type === 'note') return (event.content || '').replace(/\s+/g, ' ').trim();
  if (event.type === 'screenshot') return event.name || event.filename || 'Screenshot';
  return event.content || '';
}

function clipPocOutput(text, max = 900) {
  const value = String(text || '');
  if (value.length <= max) return value;
  return `${value.slice(0, max)}... [truncated]`;
}

function buildPocSectionMarkdown(sessionId, pocSteps = []) {
  if (!Array.isArray(pocSteps) || pocSteps.length === 0) return '';

  const sorted = [...pocSteps].sort((a, b) => Number(a.stepOrder || 0) - Number(b.stepOrder || 0));
  let md = '## Proof of Concept\n\n';
  sorted.forEach((step, idx) => {
    const title = step.title || `Step ${idx + 1}`;
    const execution = step.executionEvent || null;
    const note = step.noteEvent || null;
    const screenshot = step.screenshotEvent || null;
    md += `### ${idx + 1}. ${title}\n\n`;
    md += `**Goal:** ${step.goal || '_Not specified_'}\n\n`;
    if (execution) {
      md += `**Execution:** \`${execution.command || '(command unavailable)'}\`\n\n`;
      if (execution.output) {
        md += `\`\`\`text\n${clipPocOutput(execution.output, 1000)}\n\`\`\`\n\n`;
      }
    } else if (step.executionEventId) {
      md += `**Execution:** _Linked command not found (${step.executionEventId})_\n\n`;
    } else {
      md += `**Execution:** _Not linked_\n\n`;
    }
    if (screenshot?.filename) {
      md += `**Evidence:** ${screenshot.name || 'Screenshot'}\n\n`;
      md += `![${screenshot.name || 'Screenshot'}](/api/media/${sessionId}/${screenshot.filename})\n\n`;
    } else if (step.screenshotEventId) {
      md += `**Evidence:** _Linked screenshot not found (${step.screenshotEventId})_\n\n`;
    } else {
      md += `**Evidence:** _Not linked_\n\n`;
    }
    const observation = step.observation || note?.content || '';
    md += `**Observation:** ${observation || '_Not specified_'}\n\n`;
  });
  return md.trim();
}

export default function Home() {
  // Core state
  const [timeline, setTimeline] = useState([]);
  const [inputVal, setInputVal] = useState('');
  const [inputType, setInputType] = useState('command');
  const [inputTags, setInputTags] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessions, setSessions] = useState([{ id: 'default', name: 'Default Session' }]);
  const [currentSession, setCurrentSession] = useState('default');

  // Session modal state
  const [showNewSessionModal, setShowNewSessionModal] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [newSessionTarget, setNewSessionTarget] = useState('');
  const [newSessionDifficulty, setNewSessionDifficulty] = useState('medium');
  const [newSessionObjective, setNewSessionObjective] = useState('');

  // Sidebar state
  const [expandedCats, setExpandedCats] = useState([]);
  const [hiddenCats, setHiddenCats] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('ui.hiddenCats') || '[]')); } catch { return new Set(); }
  });
  const [showCatManager, setShowCatManager] = useState(false);
  const [toolboxSearch, setToolboxSearch] = useState('');
  const [sidebarTab, setSidebarTab] = useState('tools'); // 'tools' | 'flags' | 'history'
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarDrawerOpen, setSidebarDrawerOpen] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1600));
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [favorites, setFavorites] = useState(() => (typeof window !== 'undefined' ? loadFavorites() : new Set()));
  const [collapsedTools, setCollapsedTools] = useState(() => new Set(CHEATSHEET.map((_, i) => i)));
  const [cmdHistory, setCmdHistory] = useState([]);
  const [historySearch, setHistorySearch] = useState('');

  // Command timeout (seconds)
  const [cmdTimeout, setCmdTimeout] = useState(120);

  // DB maintenance modal
  const [showDbModal, setShowDbModal] = useState(false);
  const [dbStats, setDbStats] = useState(null);

  // AI Coach panel
  const [showCoachPanel, setShowCoachPanel] = useState(false);
  const [coachResult, setCoachResult] = useState('');
  const [isCoaching, setIsCoaching] = useState(false);
  const [coachSkill, setCoachSkill] = useState('enum-target');
  // E.6 — Multi-model compare mode
  const [coachCompareMode, setCoachCompareMode] = useState(false);
  const [coachCompareResults, setCoachCompareResults] = useState([]);
  const [coachCompareTab, setCoachCompareTab] = useState(0);

  // Timeline filter state — persisted to localStorage
  const [filterType, setFilterType] = useState(() => {
    try { return localStorage.getItem('filter.type') || 'all'; } catch { return 'all'; }
  });
  const [filterStatus, setFilterStatus] = useState(() => {
    try { return localStorage.getItem('filter.status') || 'all'; } catch { return 'all'; }
  });
  const [filterKeyword, setFilterKeyword] = useState(() => {
    try { return localStorage.getItem('filter.keyword') || ''; } catch { return ''; }
  });
  const [filterTag, setFilterTag] = useState(() => {
    try { return localStorage.getItem('filter.tag') || ''; } catch { return ''; }
  });

  // Connection / sync status
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting'); // 'connected'|'disconnected'|'connecting'
  const [healthData, setHealthData] = useState(null); // null = loading, otherwise /api/health response
  const [timelineAtTop, setTimelineAtTop] = useState(true);
  const [timelineAtBottom, setTimelineAtBottom] = useState(true);
  const [timelineFollowEnabled, setTimelineFollowEnabled] = useState(true);
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);
  const [expandedTimelineEvents, setExpandedTimelineEvents] = useState(new Set());

  // Bulk screenshot selection
  const [selectedScreenshots, setSelectedScreenshots] = useState(new Set());

  // Collapsible output state
  const [expandedOutputs, setExpandedOutputs] = useState(new Set());

  // Collapsible input area
  const [inputCollapsed, setInputCollapsed] = useState(false);

  // Copy-to-clipboard feedback
  const [copiedEventId, setCopiedEventId] = useState(null);

  // Screenshot inline editing state
  const [editingScreenshot, setEditingScreenshot] = useState(null); // { id, name, tag }

  // Command input history (arrow key cycling)
  const [inputHistory, setInputHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);

  // Report modal state
  const [reportDraft, setReportDraft] = useState('');
  const [reportBlocks, setReportBlocks] = useState([newSectionBlock('Walkthrough', '')]);
  const [selectedReportBlocks, setSelectedReportBlocks] = useState([]);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportFormat, setReportFormat] = useState('technical-walkthrough');
  const [pdfStyle, setPdfStyle] = useState('terminal-dark');
  const [pocSteps, setPocSteps] = useState([]);
  const [pocBusyEventId, setPocBusyEventId] = useState(null);
  const [writeupVisibility, setWriteupVisibility] = useState('draft');
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [aiProvider, setAiProvider] = useState('claude');
  const [aiSkill, setAiSkill] = useState('enhance');
  const [analystName, setAnalystName] = useState(() => {
    try { return localStorage.getItem('report.analystName') || ''; } catch { return ''; }
  });
  const [analystNameError, setAnalystNameError] = useState(false);
  const [aiUsageSummary, setAiUsageSummary] = useState(null);
  const [apiKeys, setApiKeys] = useState(() => {
    try { return JSON.parse(localStorage.getItem('aiApiKeys') || '{}'); }
    catch { return {}; }
  });

  // Version history modal
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [writeupVersions, setWriteupVersions] = useState([]);

  // D.9 — CVSS score for note input
  const [cvssScore, setCvssScore] = useState('');

  // E.4 — Coach feedback (hash → rating)
  const [coachFeedbackRatings, setCoachFeedbackRatings] = useState({});

  // C.8 — Output diff view
  const [compareEventIds, setCompareEventIds] = useState(new Set());
  const [showDiffModal, setShowDiffModal] = useState(false);

  const bottomRef = useRef(null);
  const timelineFeedRef = useRef(null);
  const fileInputRef = useRef(null);
  const inputRef = useRef(null);
  const resizeStateRef = useRef({ startX: 0, startWidth: SIDEBAR_DEFAULT_WIDTH });
  const timelineSeenIdsRef = useRef(new Set());
  const filterKeywordRef = useRef(null);

  const apiFetch = useCallback((url, options = {}) => {
    const headers = new Headers(options.headers || {});
    try {
      const apiToken = localStorage.getItem('appApiToken') || '';
      if (apiToken) headers.set('x-api-token', apiToken);
    } catch (_) {
      // localStorage not available (SSR) or blocked
    }
    return fetch(url, { ...options, headers });
  }, []);

  const syncTimelineScrollFlags = useCallback(() => {
    const feed = timelineFeedRef.current;
    if (!feed) return { nearTop: true, nearBottom: true };
    const nearTop = feed.scrollTop <= 20;
    const distanceFromBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight;
    const nearBottom = distanceFromBottom <= 48;
    setTimelineAtTop(nearTop);
    setTimelineAtBottom(nearBottom);
    return { nearTop, nearBottom };
  }, []);

  const handleTimelineScroll = useCallback(() => {
    const { nearBottom } = syncTimelineScrollFlags();
    setTimelineFollowEnabled(nearBottom);
  }, [syncTimelineScrollFlags]);

  const scrollTimelineToBottom = useCallback((behavior = 'smooth') => {
    const feed = timelineFeedRef.current;
    if (!feed) return;
    feed.scrollTo({ top: feed.scrollHeight, behavior });
    setTimelineFollowEnabled(true);
    requestAnimationFrame(() => {
      syncTimelineScrollFlags();
    });
  }, [syncTimelineScrollFlags]);

  const scrollTimelineToTop = useCallback((behavior = 'smooth') => {
    const feed = timelineFeedRef.current;
    if (!feed) return;
    feed.scrollTo({ top: 0, behavior });
    requestAnimationFrame(() => {
      syncTimelineScrollFlags();
    });
  }, [syncTimelineScrollFlags]);

  // ── Data fetching ────────────────────────────────────────────────────────────

  const fetchSessions = useCallback(async () => {
    try {
      const res = await apiFetch('/api/sessions');
      const data = await res.json();
      if (data && data.length > 0) setSessions(data);
    } catch (e) { console.error('Failed to fetch sessions', e); }
  }, [apiFetch]);

  const fetchTimeline = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/timeline?sessionId=${currentSession}`);
      const data = await res.json();
      setTimeline(data);
      setLastSyncTime(Date.now());
      setConnectionStatus('connected');
    } catch (e) {
      console.error('Failed to fetch timeline', e);
      setConnectionStatus('disconnected');
    }
  }, [currentSession, apiFetch]);

  const fetchCommandHistory = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/timeline?sessionId=${currentSession}`);
      const data = await res.json();
      const cmds = data.filter(e => e.type === 'command').reverse();
      setCmdHistory(cmds);
      setInputHistory(cmds.map(e => e.command).filter(Boolean));
    } catch (e) { /* silent */ }
  }, [currentSession, apiFetch]);

  const fetchAiUsage = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/ai/usage?sessionId=${currentSession}`);
      if (!res.ok) {
        setAiUsageSummary(null);
        return;
      }
      const data = await res.json();
      setAiUsageSummary(data);
    } catch (_) {
      setAiUsageSummary(null);
    }
  }, [currentSession, apiFetch]);

  const fetchPocSteps = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/poc?sessionId=${currentSession}`);
      if (!res.ok) {
        setPocSteps([]);
        return;
      }
      const data = await res.json();
      setPocSteps(Array.isArray(data) ? data : []);
    } catch (_) {
      setPocSteps([]);
    }
  }, [currentSession, apiFetch]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);
  useEffect(() => { fetchAiUsage(); }, [fetchAiUsage]);
  useEffect(() => { fetchPocSteps(); }, [fetchPocSteps]);

  useEffect(() => {
    fetchTimeline();
    const interval = setInterval(fetchTimeline, 3000);
    return () => clearInterval(interval);
  }, [fetchTimeline]);

  useEffect(() => {
    timelineSeenIdsRef.current = new Set();
    setExpandedTimelineEvents(new Set());
    setPocSteps([]);
  }, [currentSession]);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      setHealthData(data);
    } catch {
      setHealthData({ status: 'error' });
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  useEffect(() => {
    const feed = timelineFeedRef.current;
    if (!feed) return;
    const distanceFromBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight;
    const nearBottom = distanceFromBottom <= 48;
    if (timelineFollowEnabled || nearBottom) {
      feed.scrollTo({ top: feed.scrollHeight, behavior: 'auto' });
      setTimelineFollowEnabled(true);
    }
    syncTimelineScrollFlags();
  }, [timeline, timelineFollowEnabled, syncTimelineScrollFlags]);

  useEffect(() => { fetchCommandHistory(); }, [fetchCommandHistory]);

  useEffect(() => {
    if (sidebarTab === 'history') fetchCommandHistory();
  }, [sidebarTab, fetchCommandHistory]);

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    try {
      const storedWidth = Number(localStorage.getItem('ui.sidebarWidth') || '');
      const storedCollapsed = localStorage.getItem('ui.sidebarCollapsed');
      const storedTimelineCollapsed = localStorage.getItem('ui.timelineCollapsed');
      if (Number.isFinite(storedWidth) && storedWidth > 0) {
        setSidebarWidth(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, storedWidth)));
      }
      if (storedCollapsed === 'true' || storedCollapsed === 'false') {
        setSidebarCollapsed(storedCollapsed === 'true');
      } else if (window.innerWidth >= 1200 && window.innerWidth <= 1365) {
        setSidebarCollapsed(true);
      }
      if (storedTimelineCollapsed === 'true' || storedTimelineCollapsed === 'false') {
        setTimelineCollapsed(storedTimelineCollapsed === 'true');
      }
    } catch (_) {
      // localStorage unavailable
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('ui.sidebarWidth', String(Math.round(sidebarWidth)));
      localStorage.setItem('ui.sidebarCollapsed', sidebarCollapsed ? 'true' : 'false');
      localStorage.setItem('ui.hiddenCats', JSON.stringify([...hiddenCats]));
      localStorage.setItem('report.analystName', analystName);
    } catch (_) {
      // localStorage unavailable
    }
  }, [sidebarWidth, sidebarCollapsed, hiddenCats, analystName]);

  useEffect(() => {
    try {
      localStorage.setItem('ui.timelineCollapsed', timelineCollapsed ? 'true' : 'false');
    } catch (_) {
      // localStorage unavailable
    }
  }, [timelineCollapsed]);

  // Persist filter state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('filter.type', filterType);
      localStorage.setItem('filter.status', filterStatus);
      localStorage.setItem('filter.keyword', filterKeyword);
      localStorage.setItem('filter.tag', filterTag);
    } catch (_) { /* localStorage unavailable */ }
  }, [filterType, filterStatus, filterKeyword, filterTag]);

  // A.10 — Keyboard shortcuts
  useEffect(() => {
    const isInputFocused = () => {
      const el = document.activeElement;
      return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
    };
    const onKeyDown = (e) => {
      // Ctrl/Cmd+F → focus search filter
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        filterKeywordRef.current?.focus();
        return;
      }
      // Escape → clear filters and blur
      if (e.key === 'Escape') {
        setFilterType('all');
        setFilterStatus('all');
        setFilterKeyword('');
        setFilterTag('');
        document.activeElement?.blur();
        return;
      }
      // J/K vim-style scroll (only when no input focused)
      if (!isInputFocused()) {
        const feed = timelineFeedRef.current;
        if (!feed) return;
        if (e.key === 'j') { feed.scrollTop += 80; }
        if (e.key === 'k') { feed.scrollTop -= 80; }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (viewportWidth < 1200) {
      setSidebarDrawerOpen(false);
      return;
    }
    if (viewportWidth >= 1200 && viewportWidth <= 1365) {
      setSidebarCollapsed(true);
    }
  }, [viewportWidth]);

  // ── Submission handlers ───────────────────────────────────────────────────

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputVal.trim()) return;
    setIsLoading(true);
    const val = inputVal;
    const tags = inputTags.split(',').map(t => t.trim()).filter(Boolean);
    const cvss = cvssScore.trim();
    setInputVal('');
    setInputTags('');
    setCvssScore('');
    setHistoryIdx(-1);
    if (inputType === 'command') {
      setInputHistory(prev => [val, ...prev.slice(0, 49)]);
    }

    try {
      if (inputType === 'command') {
        const sessionTarget = sessions.find(s => s.id === currentSession)?.target || '';
        const resolvedCmd = sessionTarget ? val.replace(/\{TARGET\}/gi, sessionTarget) : val;
        const res = await apiFetch('/api/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: resolvedCmd, sessionId: currentSession, tags, timeout: cmdTimeout * 1000 })
        });
        const newEvent = await res.json();
        setTimeline(prev => [...prev, newEvent]);
      } else {
        const res = await apiFetch('/api/timeline', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'note', content: cvss ? `CVSS:${cvss} | ${val}` : val, sessionId: currentSession, tags })
        });
        const newEvent = await res.json();
        setTimeline(prev => [...prev, newEvent]);
      }
    } catch (error) { console.error('Submission failed', error); }
    finally { setIsLoading(false); }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.min(historyIdx + 1, inputHistory.length - 1);
      setHistoryIdx(next);
      if (inputHistory[next] !== undefined) setInputVal(inputHistory[next]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.max(historyIdx - 1, -1);
      setHistoryIdx(next);
      setInputVal(next === -1 ? '' : inputHistory[next]);
    } else if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const MAX_MB = 10;
    if (file.size > MAX_MB * 1024 * 1024) {
      alert(`File too large. Maximum size is ${MAX_MB}MB.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    const formData = new FormData();
    formData.append('file', file);
    formData.append('sessionId', currentSession);
    formData.append('name', file.name);
    try {
      setIsLoading(true);
      const res = await apiFetch('/api/upload', { method: 'POST', body: formData });
      const newEvent = await res.json();
      setTimeline(prev => [...prev, newEvent]);
    } catch (error) { console.error('Upload failed', error); }
    finally { setIsLoading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  // ── Session handlers ──────────────────────────────────────────────────────

  const createSession = async () => {
    if (!newSessionName.trim()) return;
    const name = newSessionName.trim();
    const id = name.toLowerCase().replace(/\s+/g, '-');
    try {
      setIsLoading(true);
      const res = await apiFetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name, target: newSessionTarget, difficulty: newSessionDifficulty, objective: newSessionObjective })
      });
      const newSess = await res.json();
      setSessions(prev => [newSess, ...prev]);
      setCurrentSession(newSess.id);
      setNewSessionName(''); setNewSessionTarget(''); setNewSessionObjective('');
      setShowNewSessionModal(false);
    } catch (error) { console.error('Failed to create session', error); }
    finally { setIsLoading(false); }
  };

  const deleteSession = async () => {
    if (currentSession === 'default') return;
    if (!confirm(`Delete session "${sessions.find(s => s.id === currentSession)?.name}"? This cannot be undone.`)) return;
    try {
      setIsLoading(true);
      await apiFetch(`/api/sessions?id=${currentSession}`, { method: 'DELETE' });
      setSessions(prev => prev.filter(s => s.id !== currentSession));
      setCurrentSession('default');
    } catch (error) { console.error('Failed to delete session', error); }
    finally { setIsLoading(false); }
  };

  const deleteEvent = async (id) => {
    if (!confirm('Delete this event? This cannot be undone.')) return;
    try {
      const res = await apiFetch(`/api/timeline?sessionId=${currentSession}&id=${id}`, { method: 'DELETE' });
      if (res.ok) setTimeline(prev => prev.filter(e => e.id !== id));
    } catch (error) { console.error('Failed to delete event', error); }
  };

  // ── Screenshot edit handlers ──────────────────────────────────────────────

  const saveScreenshotEdit = async () => {
    if (!editingScreenshot) return;
    try {
      await apiFetch('/api/timeline', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSession, id: editingScreenshot.id, name: editingScreenshot.name, tag: editingScreenshot.tag }),
      });
      setTimeline(prev => prev.map(e => e.id === editingScreenshot.id ? { ...e, name: editingScreenshot.name, tag: editingScreenshot.tag } : e));
    } catch (err) { console.error('Failed to update screenshot', err); }
    finally { setEditingScreenshot(null); }
  };

  // ── PoC step handlers ─────────────────────────────────────────────────────

  const upsertPocStepLocal = useCallback((step) => {
    if (!step?.id) return;
    setPocSteps((prev) => {
      const next = [...prev.filter((item) => item.id !== step.id), step];
      next.sort((a, b) => Number(a.stepOrder || 0) - Number(b.stepOrder || 0));
      return next;
    });
  }, []);

  const updatePocFieldLocal = (stepId, field, value) => {
    setPocSteps((prev) => prev.map((step) => (
      step.id === stepId ? { ...step, [field]: value } : step
    )));
  };

  const addEventToPoc = async (event, allowDuplicate = false) => {
    if (!event?.id || !['command', 'note', 'screenshot'].includes(event.type)) return;
    setPocBusyEventId(event.id);
    try {
      const res = await apiFetch('/api/poc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSession,
          sourceEventId: event.id,
          sourceEventType: event.type,
          allowDuplicate,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Failed to add event to PoC');
        return;
      }
      if (data?.step) {
        upsertPocStepLocal(data.step);
      }
    } catch (error) {
      console.error('Failed to add PoC step', error);
    } finally {
      setPocBusyEventId(null);
    }
  };

  const addManualPocStep = async () => {
    try {
      const res = await apiFetch('/api/poc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSession,
          title: `Step ${pocSteps.length + 1}`,
          goal: '',
          observation: '',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Failed to create PoC step');
        return;
      }
      if (data?.step) upsertPocStepLocal(data.step);
    } catch (error) {
      console.error('Failed to create PoC step', error);
    }
  };

  const persistPocStepUpdate = async (id, patch) => {
    try {
      const res = await apiFetch('/api/poc', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSession, id, ...patch }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Failed to update PoC step');
        return;
      }
      if (data?.step) upsertPocStepLocal(data.step);
    } catch (error) {
      console.error('Failed to update PoC step', error);
    }
  };

  const movePocStepEntry = async (id, direction) => {
    try {
      const res = await apiFetch('/api/poc', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSession, id, direction }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to reorder PoC step');
        return;
      }
      await fetchPocSteps();
    } catch (error) {
      console.error('Failed to reorder PoC step', error);
    }
  };

  const deletePocStepEntry = async (id) => {
    if (!confirm('Delete this PoC step?')) return;
    try {
      const res = await apiFetch(`/api/poc?sessionId=${currentSession}&id=${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to delete PoC step');
        return;
      }
      setPocSteps((prev) => prev.filter((step) => step.id !== id));
      fetchPocSteps();
    } catch (error) {
      console.error('Failed to delete PoC step', error);
    }
  };

  // ── Report handlers ───────────────────────────────────────────────────────

  const applyReportBlocks = useCallback((nextBlocks) => {
    const normalized = Array.isArray(nextBlocks) && nextBlocks.length > 0
      ? nextBlocks
      : [newSectionBlock('Walkthrough', '')];
    setReportBlocks(normalized);
    setReportDraft(reportBlocksToMarkdown(normalized));
  }, []);

  const loadReportPayload = useCallback((payload) => {
    const content = String(payload?.content || '');
    if (Array.isArray(payload?.contentJson) && payload.contentJson.length > 0) {
      applyReportBlocks(payload.contentJson);
      return;
    }
    applyReportBlocks(markdownToReportBlocks(content));
  }, [applyReportBlocks]);

  const getReportMarkdownWithPoc = useCallback((blocks = reportBlocks) => {
    const baseMarkdown = reportBlocksToMarkdown(blocks).trim();
    const formatNeedsPoc = reportFormat === 'technical-walkthrough' || reportFormat === 'pentest';
    if (!formatNeedsPoc || pocSteps.length === 0) {
      return baseMarkdown;
    }
    if (/^##\s+Proof of Concept\b/im.test(baseMarkdown)) {
      return baseMarkdown;
    }
    const pocSection = buildPocSectionMarkdown(currentSession, pocSteps);
    if (!pocSection) return baseMarkdown;
    if (!baseMarkdown) return pocSection;
    return `${baseMarkdown}\n\n${pocSection}`;
  }, [reportBlocks, reportFormat, pocSteps, currentSession]);

  const addReportBlock = (blockType = 'section') => {
    let newBlock = newSectionBlock('New Section', '');
    if (blockType === 'code') newBlock = newCodeBlock('Code Snippet', '', 'bash');
    if (blockType === 'image') newBlock = newImageBlock('Screenshot Evidence', '', 'Screenshot', '', '');
    applyReportBlocks([...reportBlocks, newBlock]);
  };

  const updateReportBlock = (blockId, updates) => {
    applyReportBlocks(reportBlocks.map((block) => (
      block.id === blockId ? { ...block, ...updates } : block
    )));
  };

  const removeReportBlock = (blockId) => {
    applyReportBlocks(reportBlocks.filter(block => block.id !== blockId));
    setSelectedReportBlocks(prev => prev.filter(id => id !== blockId));
  };

  const moveReportBlock = (blockId, direction) => {
    const idx = reportBlocks.findIndex(b => b.id === blockId);
    if (idx === -1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= reportBlocks.length) return;
    const next = [...reportBlocks];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    applyReportBlocks(next);
  };

  const generateReport = async (fmt = reportFormat) => {
    if (!analystName.trim()) {
      setAnalystNameError(true);
      return;
    }
    setAnalystNameError(false);
    try {
      setIsLoading(true);
      await fetchPocSteps();
      const existingRes = await apiFetch(`/api/writeup?sessionId=${currentSession}`);
      const existing = await existingRes.json().catch(() => null);
      const hasExisting = Boolean(
        existing && (
          String(existing.content || '').trim() ||
          (Array.isArray(existing.contentJson) && existing.contentJson.length > 0)
        )
      );

      if (hasExisting) {
        loadReportPayload(existing);
      } else {
        const res = await apiFetch(`/api/report?sessionId=${currentSession}&format=${fmt}&analystName=${encodeURIComponent(analystName.trim())}`);
        const data = await res.json();
        if (data.report) {
          applyReportBlocks(markdownToReportBlocks(data.report));
        }
      }
      setSelectedReportBlocks([]);
      setShowReportModal(true);
    } catch (error) { console.error('Report generation failed', error); }
    finally { setIsLoading(false); }
  };

  const onFormatChange = async (fmt) => {
    setReportFormat(fmt);
    if (showReportModal) {
      try {
        const res = await apiFetch(`/api/report?sessionId=${currentSession}&format=${fmt}&analystName=${encodeURIComponent(analystName.trim())}`);
        const data = await res.json();
        if (data.report) {
          applyReportBlocks(markdownToReportBlocks(data.report));
          setSelectedReportBlocks([]);
        }
      } catch (_) {}
    }
  };

  const saveReport = async () => {
    try {
      setIsLoading(true);
      const markdown = getReportMarkdownWithPoc(reportBlocks);
      await apiFetch('/api/writeup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSession,
          content: markdown,
          contentJson: reportBlocks,
          status: writeupVisibility,
          visibility: writeupVisibility,
        })
      });
      setReportDraft(markdown);
      setShowReportModal(false);
      alert('Write-up saved!');
    } catch (error) { console.error('Failed to save report', error); }
    finally { setIsLoading(false); }
  };

  const enhanceReport = async () => {
    if (!reportDraft && reportBlocks.length === 0) return;
    setIsEnhancing(true);
    try {
      const markdown = getReportMarkdownWithPoc(reportBlocks);
      const evidenceContext = timeline.slice(-60).map((e) => {
        if (e.type === 'command') return `[${e.timestamp}] COMMAND ${e.status || ''}: ${e.command || ''}`;
        if (e.type === 'note') return `[${e.timestamp}] NOTE: ${e.content || ''}`;
        return `[${e.timestamp}] SCREENSHOT: ${e.name || e.filename || 'unnamed'}`;
      }).join('\n');

      const res = await apiFetch('/api/writeup/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSession,
          reportContent: markdown,
          provider: aiProvider,
          apiKey: apiKeys[aiProvider] || '',
          skill: aiSkill,
          mode: 'section-patch',
          reportBlocks,
          selectedSectionIds: selectedReportBlocks,
          evidenceContext,
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || `AI enhancement unavailable. Check the API key for ${aiProvider.toUpperCase()}.`);
        return;
      }

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        if (Array.isArray(data.patches) && data.patches.length > 0) {
          const nextBlocks = reportBlocks.map((block) => {
            const patch = data.patches.find(p => p.sectionId === block.id);
            if (!patch) return block;
            return {
              ...block,
              ...(typeof patch.title === 'string' ? { title: patch.title } : {}),
              ...(typeof patch.content === 'string' ? { content: patch.content } : {}),
              ...(typeof patch.caption === 'string' ? { caption: patch.caption } : {}),
              ...(typeof patch.alt === 'string' ? { alt: patch.alt } : {}),
            };
          });
          applyReportBlocks(nextBlocks);
        }
      } else {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let enhanced = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          enhanced += decoder.decode(value, { stream: true });
          setReportDraft(enhanced);
        }
        applyReportBlocks(markdownToReportBlocks(enhanced));
      }
    } catch (error) { console.error('Enhancement failed', error); }
    finally {
      setIsEnhancing(false);
      fetchAiUsage();
    }
  };

  const runCoach = async () => {
    setIsCoaching(true);
    setCoachResult('');
    setCoachCompareResults([]);
    setShowCoachPanel(true);
    try {
      // E.6 — Compare mode: non-streaming, all providers in parallel
      if (coachCompareMode) {
        const res = await apiFetch('/api/coach', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: currentSession, provider: aiProvider, apiKey: apiKeys[aiProvider] || '', skill: coachSkill, compare: true }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setCoachResult(`Error: ${err.error || 'Coach unavailable.'}`);
          return;
        }
        const { responses } = await res.json();
        setCoachCompareResults(responses || []);
        setCoachCompareTab(0);
        return;
      }

      // Normal streaming mode
      const res = await apiFetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSession, provider: aiProvider, apiKey: apiKeys[aiProvider] || '', skill: coachSkill }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setCoachResult(`Error: ${err.error || 'Coach unavailable. Check your API key.'}`);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let result = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        result += decoder.decode(value, { stream: true });
        setCoachResult(result);
      }
    } catch (error) {
      setCoachResult(`Error: ${error.message}`);
    } finally {
      setIsCoaching(false);
      fetchAiUsage();
    }
  };

  // E.4 — Submit coach feedback (thumbs up/down)
  const submitCoachFeedback = async (responseText, rating) => {
    if (!responseText) return;
    try {
      const encoder = new TextEncoder();
      const buf = await crypto.subtle.digest('SHA-256', encoder.encode(responseText));
      const hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
      setCoachFeedbackRatings(prev => ({ ...prev, [hash]: rating }));
      await apiFetch('/api/coach/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSession, hash, rating }),
      });
    } catch (_) { /* silently ignore */ }
  };

  // C.8 — Toggle a command event into the compare selection (max 2)
  const toggleCompareEvent = (id) => {
    setCompareEventIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else if (next.size < 2) { next.add(id); }
      return next;
    });
  };

  const downloadMarkdown = async (inlineImages = true) => {
    try {
      const res = await apiFetch('/api/export/markdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSession,
          format: reportFormat,
          analystName: analystName.trim() || 'Unknown',
          inlineImages,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        alert(`Markdown export failed: ${err.detail || err.error}`);
        return;
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const sessionName = sessions.find(s => s.id === currentSession)?.name?.replace(/\s+/g, '-') || currentSession;
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${sessionName}-${reportFormat}.md`;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      alert(`Markdown download error: ${err.message}`);
    }
  };

  const downloadPdf = async () => {
    try {
      const markdown = getReportMarkdownWithPoc(reportBlocks);
      const res = await apiFetch('/api/export/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: markdown, pdfStyle, sessionId: currentSession, analystName: analystName.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        alert(`PDF failed: ${err.detail || err.error}`);
        return;
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const sessionName = sessions.find(s => s.id === currentSession)?.name?.replace(/\s+/g, '-') || currentSession;
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${sessionName}-writeup.pdf`;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      alert(`PDF download error: ${err.message}`);
    }
  };

  const toggleTag = (tag) => {
    const current = inputTags.split(',').map(t => t.trim()).filter(Boolean);
    const idx = current.indexOf(tag);
    if (idx >= 0) current.splice(idx, 1);
    else current.push(tag);
    setInputTags(current.join(', '));
  };

  const loadDbStats = async () => {
    try {
      const res = await apiFetch('/api/admin/cleanup');
      const data = await res.json();
      setDbStats(data);
      setShowDbModal(true);
    } catch (e) { console.error('Failed to load DB stats', e); }
  };

  const runCleanup = async (action) => {
    try {
      const res = await apiFetch('/api/admin/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.stats) setDbStats(data.stats);
    } catch (e) { console.error('Cleanup failed', e); }
  };

  const exportTimeline = () => {
    const blob = new Blob([JSON.stringify(timeline, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentSession}-timeline.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadVersionHistory = async () => {
    try {
      const res = await apiFetch(`/api/writeup/history?sessionId=${currentSession}`);
      const data = await res.json();
      setWriteupVersions(data);
      setShowVersionHistory(true);
    } catch (_) {}
  };

  const restoreVersion = async (versionId) => {
    try {
      const res = await apiFetch(`/api/writeup/history?sessionId=${currentSession}&versionId=${versionId}`);
      const data = await res.json();
      if (data.content) {
        if (Array.isArray(data.contentJson) && data.contentJson.length > 0) {
          applyReportBlocks(data.contentJson);
        } else {
          applyReportBlocks(markdownToReportBlocks(data.content));
        }
        setSelectedReportBlocks([]);
        setShowVersionHistory(false);
      }
    } catch (_) {}
  };

  // ── Sidebar helpers ───────────────────────────────────────────────────────

  const toggleCategory = (cat) => {
    setExpandedCats(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  };

  const toggleSidebarCollapse = () => {
    setSidebarCollapsed(prev => !prev);
  };

  const startSidebarResize = (e) => {
    if (viewportWidth < 1200 || sidebarCollapsed) return;
    e.preventDefault();
    resizeStateRef.current = { startX: e.clientX, startWidth: sidebarWidth };
    setIsResizingSidebar(true);

    const onMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - resizeStateRef.current.startX;
      const nextWidth = resizeStateRef.current.startWidth + deltaX;
      setSidebarWidth(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, nextWidth)));
    };

    const onMouseUp = () => {
      setIsResizingSidebar(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const appendFlag = (flag) => {
    const sessionTarget = sessions.find(s => s.id === currentSession)?.target || '';
    const resolved = sessionTarget ? flag.replace(/\{TARGET\}/gi, sessionTarget) : flag;
    setInputType('command');
    setInputVal(prev => prev.includes(resolved) ? prev : `${prev} ${resolved}`.trim());
  };

  const toggleFavorite = (flag) => {
    setFavorites(prev => {
      const next = new Set(prev);
      next.has(flag) ? next.delete(flag) : next.add(flag);
      localStorage.setItem('flagFavorites', JSON.stringify([...next]));
      return next;
    });
  };

  const handleCancelCommand = async (eventId, sessionId) => {
    try {
      await apiFetch('/api/execute/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, sessionId }),
      });
      setTimeline(prev => prev.map(e =>
        e.id === eventId ? { ...e, status: 'cancelled', output: '[Cancelled by user]' } : e
      ));
    } catch (err) { console.error('Cancel failed', err); }
  };

  const toggleOutput = (id) => {
    setExpandedOutputs(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const copyOutput = (id, text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedEventId(id);
      setTimeout(() => setCopiedEventId(null), 1500);
    }).catch(() => {});
  };

  const collapseTimelineEvents = () => {
    setTimelineCollapsed(true);
    setExpandedTimelineEvents(new Set(newestTimelineIds(timeline)));
  };

  const expandTimelineEvents = () => {
    setTimelineCollapsed(false);
  };

  const toggleTimelineEventDetails = (eventId) => {
    setExpandedTimelineEvents(prev => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  };

  useEffect(() => {
    const currentIds = timeline.map(event => event.id).filter(Boolean);
    const currentSet = new Set(currentIds);
    if (!timelineCollapsed) {
      timelineSeenIdsRef.current = currentSet;
      return;
    }

    const seenIds = timelineSeenIdsRef.current;
    const newestIds = newestTimelineIds(timeline);
    const autoExpandIds = seenIds.size === 0
      ? newestIds
      : newestIds.filter(id => !seenIds.has(id));

    setExpandedTimelineEvents(prev => {
      const next = new Set([...prev].filter(id => currentSet.has(id)));
      for (const id of autoExpandIds) {
        next.add(id);
      }
      return next;
    });
    timelineSeenIdsRef.current = currentSet;
  }, [timeline, timelineCollapsed]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const isOverlaySidebar = viewportWidth < 1200;
  const activeSidebarWidth = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, sidebarWidth));
  const layoutSidebarWidth = sidebarCollapsed ? 0 : activeSidebarWidth;
  const layoutVars = {
    '--sidebar-width': `${layoutSidebarWidth}px`,
    '--resizer-width': isOverlaySidebar || sidebarCollapsed ? '0px' : '10px',
  };

  const currentSessionData = sessions.find(s => s.id === currentSession);

  const allTimelineTags = [...new Set(timeline.flatMap(e => {
    try { return JSON.parse(e.tags || '[]'); } catch { return []; }
  }))].sort();

  const filteredTimeline = timeline.filter(event => {
    if (filterType !== 'all' && event.type !== filterType) return false;
    if (filterStatus !== 'all' && event.status !== filterStatus) return false;
    if (filterTag) {
      const evTags = (() => { try { return JSON.parse(event.tags || '[]'); } catch { return []; } })();
      if (!evTags.includes(filterTag)) return false;
    }
    if (filterKeyword) {
      const kw = filterKeyword.toLowerCase();
      return (event.command || '').toLowerCase().includes(kw) ||
             (event.content || '').toLowerCase().includes(kw) ||
             (event.output || '').toLowerCase().includes(kw);
    }
    return true;
  });

  const reportScreenshotOptions = timeline
    .filter(e => e.type === 'screenshot' && e.filename)
    .map(e => ({
      id: e.id,
      label: `${e.name || e.filename}${e.tag ? ` #${e.tag}` : ''}`,
      url: `/api/media/${currentSession}/${e.filename}`,
    }));

  const pocLinkedEventIds = new Set();
  pocSteps.forEach((step) => {
    if (step.executionEventId) pocLinkedEventIds.add(step.executionEventId);
    if (step.noteEventId) pocLinkedEventIds.add(step.noteEventId);
    if (step.screenshotEventId) pocLinkedEventIds.add(step.screenshotEventId);
  });

  const pocCommandOptions = timeline
    .filter((event) => event.type === 'command')
    .map((event) => ({
      id: event.id,
      label: event.command || '(command)',
    }));

  const pocNoteOptions = timeline
    .filter((event) => event.type === 'note')
    .map((event) => ({
      id: event.id,
      label: summarizeTimelineEvent(event) || '(note)',
    }));

  const pocScreenshotOptions = timeline
    .filter((event) => event.type === 'screenshot')
    .map((event) => ({
      id: event.id,
      label: event.name || event.filename || 'Screenshot',
    }));

  const aiTotals = aiUsageSummary?.totals || null;
  const aiUsageLabel = aiTotals
    ? `AI $${Number(aiTotals.estimatedCostUsd || 0).toFixed(4)} · ${aiTotals.calls || 0} calls · ${aiTotals.totalTokens || 0} tok`
    : 'AI usage unavailable';
  const aiUsageTitle = aiTotals
    ? [
        `Session AI usage`,
        `Calls: ${aiTotals.calls || 0}`,
        `Prompt tokens: ${aiTotals.promptTokens || 0}`,
        `Completion tokens: ${aiTotals.completionTokens || 0}`,
        `Total tokens: ${aiTotals.totalTokens || 0}`,
        `Estimated cost: $${Number(aiTotals.estimatedCostUsd || 0).toFixed(6)}`,
      ].join('\n')
    : 'No AI usage recorded for this session yet.';

  const favFlagItems = [];
  const allFlags = [];
  CHEATSHEET.forEach(tool => tool.categories.forEach(cat => cat.flags.forEach(f => {
    allFlags.push({ ...f, tool: tool.tool, cat: cat.name });
    if (favorites.has(f.flag)) favFlagItems.push({ ...f, tool: tool.tool, cat: cat.name });
  })));

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="container">
      <header className="header glass-panel">
        <div className="header-row">
          {/* Brand */}
          <span className="dnd-title header-brand">HW</span>

          {/* Session selector + contextual meta */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flex: '1 1 auto', minWidth: 0, overflow: 'hidden' }}>
            {(isOverlaySidebar || sidebarCollapsed) && (
              <button className="btn-secondary btn-compact" onClick={() => setSidebarDrawerOpen(true)} title="Toolbox">☰</button>
            )}
            <select value={currentSession} onChange={(e) => setCurrentSession(e.target.value)}
              style={{ flex: '1 1 140px', maxWidth: '240px' }}>
              {sessions.map((s, idx) => <option key={`${s.id}-${idx}`} value={s.id}>{s.name}</option>)}
            </select>
            {currentSessionData?.difficulty && (
              <span className="mono" style={{ fontSize: '0.7rem', padding: '2px 7px', borderRadius: '4px', whiteSpace: 'nowrap', background: DIFFICULTY_COLORS[currentSessionData.difficulty] + '22', color: DIFFICULTY_COLORS[currentSessionData.difficulty], border: `1px solid ${DIFFICULTY_COLORS[currentSessionData.difficulty]}44` }}>
                {currentSessionData.difficulty.toUpperCase()}
              </span>
            )}
            {currentSessionData?.target && (
              <span className="mono" title={currentSessionData.target}
                style={{ fontSize: '0.76rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>
                ⌖ {currentSessionData.target}
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
<button className="btn-secondary btn-compact" onClick={() => setShowNewSessionModal(true)} title="New Session">+</button>
            {currentSession !== 'default' && (
              <button className="btn-compact" onClick={deleteSession} title="Delete Session"
                style={{ color: 'var(--accent-danger, #f85149)', border: '1px solid var(--accent-danger, #f85149)', borderRadius: '6px', background: 'transparent' }}>✕</button>
            )}
            <button className="btn-secondary btn-compact" onClick={runCoach} disabled={isCoaching}
              style={{ color: 'var(--accent-secondary)', borderColor: 'var(--accent-secondary)' }}>
              {isCoaching ? '…' : 'Coach'}
            </button>
            <button className="btn-primary btn-compact" onClick={() => generateReport()}
              style={{ background: 'var(--accent-secondary)', color: '#fff' }}>Report</button>
            <span className="mono ai-usage-pill" title={aiUsageTitle}>{aiUsageLabel}</span>
          </div>

          {/* Status dots */}
          <div className="mono" style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', fontSize: '0.72rem', color: 'var(--text-muted)', flexShrink: 0 }}>
            {(() => {
              const s = healthData?.status;
              const dotClass = s === 'ok' ? 'connected' : s === 'degraded' ? 'syncing' : 'disconnected';
              const label = s === 'ok' ? 'System OK' : s === 'degraded' ? 'Degraded' : s === 'error' ? 'Unreachable' : '…';
              const tip = healthData ? [
                `Status: ${healthData.status}`,
                `DB: ${healthData.db?.status ?? '?'}`,
                `AI: ${Object.entries(healthData.ai || {}).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none'}`,
                `Disk: ${healthData.disk?.dataDir ?? '?'}`,
                `v${healthData.version ?? '?'}`,
              ].join('\n') : 'Checking health…';
              return (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'default' }} title={tip}>
                  <span className={`conn-dot conn-dot--${dotClass}`} />
                  <span>{label}</span>
                </span>
              );
            })()}
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'default' }}
              title={`Timeline: ${connectionStatus}${lastSyncTime ? ` — last synced ${Math.round((Date.now() - lastSyncTime) / 1000)}s ago` : ''}`}>
              <span className={`conn-dot conn-dot--${connectionStatus === 'connected' ? 'connected' : connectionStatus === 'disconnected' ? 'disconnected' : 'syncing'}`} />
              <span>{connectionStatus === 'connected' && lastSyncTime
                ? `${Math.round((Date.now() - lastSyncTime) / 1000)}s`
                : connectionStatus === 'disconnected' ? 'offline' : '…'}</span>
            </span>
          </div>
        </div>
      </header>

      {currentSessionData?.objective && (
        <div className="glass-panel objective-bar">
          <span style={{ color: 'var(--accent-secondary)' }}>Objective:</span> {currentSessionData.objective}
        </div>
      )}

      {/* ── New Session Modal ─────────────────────────────────────────────── */}
      {showNewSessionModal && (
        <div className="overlay">
          <div className="modal glass-panel">
            <h3>Start New Session</h3>
            <p className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Challenge Name *</p>
            <input type="text" value={newSessionName} onChange={(e) => setNewSessionName(e.target.value)}
              placeholder="e.g. Mangler-HTB" autoFocus style={{ marginBottom: '0.75rem' }} />
            <p className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Target IP / URL</p>
            <input type="text" value={newSessionTarget} onChange={(e) => setNewSessionTarget(e.target.value)}
              placeholder="e.g. 10.10.11.42" style={{ marginBottom: '0.75rem' }} />
            <p className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Difficulty</p>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
              {['easy', 'medium', 'hard'].map(d => (
                <button key={d} type="button"
                  onClick={() => setNewSessionDifficulty(d)}
                  style={{ padding: '4px 12px', borderRadius: '4px', border: `1px solid ${DIFFICULTY_COLORS[d]}`, background: newSessionDifficulty === d ? DIFFICULTY_COLORS[d] + '33' : 'transparent', color: DIFFICULTY_COLORS[d], cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                  {d.toUpperCase()}
                </button>
              ))}
            </div>
            <p className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Objective</p>
            <input type="text" value={newSessionObjective} onChange={(e) => setNewSessionObjective(e.target.value)}
              placeholder="e.g. Find user.txt and root.txt" style={{ marginBottom: '1rem' }} />
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setShowNewSessionModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={createSession}>Start</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Report Modal ──────────────────────────────────────────────────── */}
      {showReportModal && (
        <div className="overlay">
          <div className="modal glass-panel report-modal">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <h3 className="dnd-title" style={{ fontSize: '1.2rem' }}>Helm&apos;s Watch Chronicle</h3>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <select value={reportFormat} onChange={(e) => onFormatChange(e.target.value)}
                  style={{ fontSize: '0.8rem', padding: '4px 8px' }}>
                  <option value="lab-report">Lab Report</option>
                  <option value="executive-summary">Executive Summary</option>
                  <option value="technical-walkthrough">Technical Walkthrough</option>
                  <option value="ctf-solution">CTF Solution</option>
                  <option value="bug-bounty">Bug Bounty</option>
                  <option value="pentest">Pentest Report</option>
                </select>
                <select value={pdfStyle} onChange={(e) => setPdfStyle(e.target.value)}
                  style={{ fontSize: '0.8rem', padding: '4px 8px' }}>
                  <option value="terminal-dark">Terminal Dark</option>
                  <option value="professional">Professional</option>
                  <option value="minimal">Minimal</option>
                  <option value="cyber-neon-grid">Cyber Neon Grid</option>
                  <option value="cyber-synthwave">Cyber Synthwave</option>
                  <option value="cyber-matrix-terminal">Cyber Matrix Terminal</option>
                  <option value="htb-professional">HTB Professional</option>
                </select>
                <button className="btn-secondary" onClick={() => setShowReportModal(false)}>Close</button>
              </div>
            </div>

            {/* Analyst + Date row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
              <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Analyst *</label>
              <input
                type="text"
                value={analystName}
                onChange={e => { setAnalystName(e.target.value); setAnalystNameError(false); }}
                placeholder="Your name (required)"
                style={{
                  flex: 1, minWidth: '160px', fontSize: '0.82rem', padding: '4px 10px',
                  background: 'rgba(1,4,9,0.6)',
                  border: `1px solid ${analystNameError ? 'var(--accent-danger, #f85149)' : 'var(--border-color)'}`,
                  borderRadius: '4px', color: 'var(--text-main)', outline: 'none',
                }}
              />
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {new Date().toLocaleDateString()}
              </span>
              {analystNameError && (
                <span style={{ fontSize: '0.78rem', color: 'var(--accent-danger, #f85149)' }}>required</span>
              )}
            </div>

            {/* Visibility selector */}
            <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
              <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Visibility:</span>
              {['draft', 'public', 'private'].map(v => (
                <label key={v} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '0.8rem', color: writeupVisibility === v ? 'var(--accent-primary)' : 'var(--text-muted)' }}>
                  <input type="radio" name="visibility" value={v} checked={writeupVisibility === v}
                    onChange={() => setWriteupVisibility(v)} style={{ accentColor: 'var(--accent-primary)' }} />
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </label>
              ))}
            </div>

            <div className="report-toolbar">
              <span className="mono" style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                Add Block:
              </span>
              <button type="button" className="btn-secondary mono" style={{ fontSize: '0.78rem', padding: '4px 10px' }} onClick={() => addReportBlock('section')}>+ Section</button>
              <button type="button" className="btn-secondary mono" style={{ fontSize: '0.78rem', padding: '4px 10px' }} onClick={() => addReportBlock('code')}>+ Code</button>
              <button type="button" className="btn-secondary mono" style={{ fontSize: '0.78rem', padding: '4px 10px' }} onClick={() => addReportBlock('image')}>+ Screenshot</button>
              <span className="mono" style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                AI scope: {selectedReportBlocks.length > 0 ? `${selectedReportBlocks.length} selected` : 'all blocks'}
              </span>
            </div>

            <div className="report-editor">
              {reportBlocks.length === 0 && (
                <p className="mono" style={{ color: 'var(--text-muted)', fontSize: '0.86rem' }}>The chronicle is empty...</p>
              )}

              {reportBlocks.map((block, idx) => (
                <div key={block.id} className="report-block-card"
                  draggable
                  onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(idx)); }}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
                    if (isNaN(fromIdx) || fromIdx === idx) return;
                    const next = [...reportBlocks];
                    const [moved] = next.splice(fromIdx, 1);
                    next.splice(idx, 0, moved);
                    applyReportBlocks(next);
                  }}
                  style={{ cursor: 'grab' }}>
                  <div className="report-block-header">
                    <label className="mono" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: selectedReportBlocks.includes(block.id) ? 'var(--accent-secondary)' : 'var(--text-muted)' }}>
                      <input
                        type="checkbox"
                        checked={selectedReportBlocks.includes(block.id)}
                        onChange={() => setSelectedReportBlocks(prev => prev.includes(block.id) ? prev.filter(id => id !== block.id) : [...prev, block.id])}
                        style={{ accentColor: 'var(--accent-secondary)' }}
                      />
                      AI
                    </label>
                    <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {block.blockType.toUpperCase()}
                    </span>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.35rem' }}>
                      <button type="button" className="btn-secondary mono" style={{ fontSize: '0.72rem', padding: '2px 7px' }} disabled={idx === 0} onClick={() => moveReportBlock(block.id, 'up')}>↑</button>
                      <button type="button" className="btn-secondary mono" style={{ fontSize: '0.72rem', padding: '2px 7px' }} disabled={idx === reportBlocks.length - 1} onClick={() => moveReportBlock(block.id, 'down')}>↓</button>
                      <button type="button" className="btn-secondary mono" style={{ fontSize: '0.72rem', padding: '2px 7px', color: 'var(--accent-danger)', borderColor: 'var(--accent-danger)' }} onClick={() => removeReportBlock(block.id)}>✕</button>
                    </div>
                  </div>

                  <input
                    value={block.title || ''}
                    onChange={(e) => updateReportBlock(block.id, { title: e.target.value })}
                    className="mono"
                    placeholder="Block title"
                    style={{ fontSize: '0.82rem', marginBottom: '0.45rem' }}
                  />

                  {block.blockType === 'section' && (
                    <textarea
                      value={block.content || ''}
                      onChange={(e) => updateReportBlock(block.id, { content: e.target.value })}
                      className="mono"
                      placeholder="Write section content..."
                      style={{ minHeight: '100px', resize: 'vertical', fontSize: '0.86rem', lineHeight: 1.55 }}
                    />
                  )}

                  {block.blockType === 'code' && (
                    <>
                      <input
                        value={block.language || 'bash'}
                        onChange={(e) => updateReportBlock(block.id, { language: e.target.value })}
                        className="mono"
                        placeholder="Language (bash, python, sql...)"
                        style={{ width: '220px', marginBottom: '0.45rem', fontSize: '0.78rem' }}
                      />
                      <textarea
                        value={block.content || ''}
                        onChange={(e) => updateReportBlock(block.id, { content: e.target.value })}
                        className="mono"
                        placeholder="Paste command/output snippet..."
                        style={{ minHeight: '120px', resize: 'vertical', fontSize: '0.84rem', lineHeight: 1.5 }}
                      />
                    </>
                  )}

                  {block.blockType === 'image' && (
                    <>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginBottom: '0.5rem' }}>
                        <select
                          value={block.imageUrl || ''}
                          onChange={(e) => {
                            const picked = reportScreenshotOptions.find(opt => opt.url === e.target.value);
                            updateReportBlock(block.id, {
                              imageUrl: e.target.value,
                              alt: block.alt || picked?.label || 'Screenshot',
                            });
                          }}
                          style={{ minWidth: '280px', fontSize: '0.8rem', padding: '4px 8px' }}
                        >
                          <option value="">Select screenshot from timeline...</option>
                          {reportScreenshotOptions.map(opt => (
                            <option key={opt.id} value={opt.url}>{opt.label}</option>
                          ))}
                        </select>
                        <input
                          value={block.alt || ''}
                          onChange={(e) => updateReportBlock(block.id, { alt: e.target.value })}
                          placeholder="Alt text"
                          className="mono"
                          style={{ minWidth: '170px', fontSize: '0.78rem' }}
                        />
                        <input
                          value={block.caption || ''}
                          onChange={(e) => updateReportBlock(block.id, { caption: e.target.value })}
                          placeholder="Caption"
                          className="mono"
                          style={{ minWidth: '200px', fontSize: '0.78rem' }}
                        />
                      </div>
                      {block.imageUrl ? (
                        <Image src={block.imageUrl} alt={block.alt || 'Screenshot'} width={920} height={500} unoptimized style={{ width: '100%', height: 'auto', maxHeight: '220px', objectFit: 'contain', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.35)' }} />
                      ) : (
                        <div className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', border: '1px dashed var(--border-color)', borderRadius: '6px', padding: '0.8rem' }}>No screenshot selected.</div>
                      )}
                      <textarea
                        value={block.content || ''}
                        onChange={(e) => updateReportBlock(block.id, { content: e.target.value })}
                        className="mono"
                        placeholder="Notes for this screenshot block..."
                        style={{ minHeight: '80px', resize: 'vertical', fontSize: '0.82rem', lineHeight: 1.5, marginTop: '0.5rem' }}
                      />
                    </>
                  )}
                </div>
              ))}
            </div>

            <div className="poc-editor">
              <div className="poc-editor-header">
                <span className="mono" style={{ fontSize: '0.8rem', color: 'var(--accent-secondary)' }}>PoC Steps</span>
                <button
                  type="button"
                  className="btn-secondary mono"
                  style={{ fontSize: '0.75rem', padding: '3px 9px' }}
                  onClick={addManualPocStep}
                >
                  + Step
                </button>
              </div>
              {pocSteps.length === 0 && (
                <div className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', border: '1px dashed var(--border-color)', borderRadius: '6px', padding: '0.65rem' }}>
                  Add timeline evidence using <strong>Add to PoC</strong>, or create a manual step here.
                </div>
              )}
              {pocSteps.map((step, idx) => (
                <div key={step.id} className="poc-step-card">
                  <div className="poc-step-header">
                    <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Step {idx + 1}</span>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.3rem' }}>
                      <button
                        type="button"
                        className="btn-secondary mono"
                        style={{ fontSize: '0.72rem', padding: '2px 7px' }}
                        disabled={idx === 0}
                        onClick={() => movePocStepEntry(step.id, 'up')}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn-secondary mono"
                        style={{ fontSize: '0.72rem', padding: '2px 7px' }}
                        disabled={idx === pocSteps.length - 1}
                        onClick={() => movePocStepEntry(step.id, 'down')}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="btn-secondary mono"
                        style={{ fontSize: '0.72rem', padding: '2px 7px', color: 'var(--accent-danger)', borderColor: 'var(--accent-danger)' }}
                        onClick={() => deletePocStepEntry(step.id)}
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  <input
                    value={step.title || ''}
                    onChange={(e) => updatePocFieldLocal(step.id, 'title', e.target.value)}
                    onBlur={(e) => persistPocStepUpdate(step.id, { title: e.target.value })}
                    className="mono"
                    placeholder="Step title"
                    style={{ fontSize: '0.8rem', marginBottom: '0.4rem' }}
                  />

                  <input
                    value={step.goal || ''}
                    onChange={(e) => updatePocFieldLocal(step.id, 'goal', e.target.value)}
                    onBlur={(e) => persistPocStepUpdate(step.id, { goal: e.target.value })}
                    className="mono"
                    placeholder="Goal"
                    style={{ fontSize: '0.8rem', marginBottom: '0.4rem' }}
                  />

                  <div className="poc-step-links">
                    <select
                      value={step.executionEventId || ''}
                      onChange={(e) => {
                        const value = e.target.value || null;
                        updatePocFieldLocal(step.id, 'executionEventId', value);
                        persistPocStepUpdate(step.id, { executionEventId: value });
                      }}
                      style={{ fontSize: '0.76rem', padding: '4px 8px' }}
                    >
                      <option value="">Execution command...</option>
                      {pocCommandOptions.map((option) => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </select>
                    <select
                      value={step.noteEventId || ''}
                      onChange={(e) => {
                        const value = e.target.value || null;
                        updatePocFieldLocal(step.id, 'noteEventId', value);
                        persistPocStepUpdate(step.id, { noteEventId: value });
                      }}
                      style={{ fontSize: '0.76rem', padding: '4px 8px' }}
                    >
                      <option value="">Observation note...</option>
                      {pocNoteOptions.map((option) => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </select>
                    <select
                      value={step.screenshotEventId || ''}
                      onChange={(e) => {
                        const value = e.target.value || null;
                        updatePocFieldLocal(step.id, 'screenshotEventId', value);
                        persistPocStepUpdate(step.id, { screenshotEventId: value });
                      }}
                      style={{ fontSize: '0.76rem', padding: '4px 8px' }}
                    >
                      <option value="">Screenshot evidence...</option>
                      {pocScreenshotOptions.map((option) => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </select>
                  </div>

                  <textarea
                    value={step.observation || ''}
                    onChange={(e) => updatePocFieldLocal(step.id, 'observation', e.target.value)}
                    onBlur={(e) => persistPocStepUpdate(step.id, { observation: e.target.value })}
                    className="mono"
                    placeholder="Observation"
                    style={{ minHeight: '72px', resize: 'vertical', fontSize: '0.8rem', lineHeight: 1.45 }}
                  />
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'space-between', marginTop: '0.75rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn-secondary" onClick={loadVersionHistory} style={{ fontSize: '0.8rem' }}>
                  [ Version History ]
                </button>
                <select value={aiSkill} onChange={(e) => setAiSkill(e.target.value)}
                  style={{ fontSize: '0.8rem', padding: '4px 8px' }} title="AI enhancement skill">
                  <optgroup label="General">
                    <option value="enhance">✦ Quick Enhance</option>
                    <option value="writeup-refiner">✦ Writeup Refiner</option>
                    <option value="report">✦ Structured Report</option>
                  </optgroup>
                </select>
                <select value={aiProvider} onChange={(e) => setAiProvider(e.target.value)}
                  style={{ fontSize: '0.8rem', padding: '4px 8px' }}>
                  <option value="claude">Claude</option>
                  <option value="gemini">Gemini</option>
                  <option value="openai">OpenAI</option>
                </select>
                <input
                  type="password"
                  value={apiKeys[aiProvider] || ''}
                  onChange={(e) => {
                    const updated = { ...apiKeys, [aiProvider]: e.target.value };
                    setApiKeys(updated);
                    localStorage.setItem('aiApiKeys', JSON.stringify(updated));
                  }}
                  placeholder={`${aiProvider} API key`}
                  className="mono"
                  style={{ fontSize: '0.75rem', padding: '4px 8px', width: '160px', background: 'rgba(1,4,9,0.6)', border: `1px solid ${apiKeys[aiProvider] ? 'var(--accent-secondary)' : 'var(--border-color)'}`, color: 'var(--text-muted)', borderRadius: '4px', outline: 'none' }}
                />
                <button className="btn-secondary" onClick={enhanceReport} disabled={isEnhancing} style={{ fontSize: '0.8rem', color: 'var(--accent-secondary)', borderColor: 'var(--accent-secondary)' }}>
                  {isEnhancing ? '[ Enhancing... ]' : '[ Enhance with AI ]'}
                </button>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn-secondary" onClick={() => downloadMarkdown(true)} style={{ fontSize: '0.8rem' }}>
                  [ Download Markdown ]
                </button>
                <button className="btn-secondary" onClick={downloadPdf} style={{ fontSize: '0.8rem' }}>
                  [ Download PDF ]
                </button>
                <button className="btn-primary" onClick={saveReport}>[ Save Write-up ]</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Version History Modal ─────────────────────────────────────────── */}
      {showVersionHistory && (
        <div className="overlay">
          <div className="modal glass-panel" style={{ width: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3>Version History</h3>
              <button className="btn-secondary" onClick={() => setShowVersionHistory(false)}>Close</button>
            </div>
            {writeupVersions.length === 0 ? (
              <p className="mono" style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No previous versions saved.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '400px', overflowY: 'auto' }}>
                {writeupVersions.map(v => (
                  <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', background: 'rgba(1,4,9,0.4)', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
                    <div>
                      <span className="mono" style={{ fontSize: '0.8rem', color: 'var(--accent-secondary)' }}>v{v.version_number}</span>
                      <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '1rem' }}>{new Date(v.created_at).toLocaleString()}</span>
                      <span className="mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>({Math.round(v.char_count / 100) / 10}k chars)</span>
                    </div>
                    <button className="btn-secondary" style={{ fontSize: '0.75rem', padding: '2px 8px' }} onClick={() => restoreVersion(v.id)}>Restore</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── C.8 — Output Diff Modal ───────────────────────────────────────── */}
      {showDiffModal && (() => {
        const ids = [...compareEventIds];
        const evA = timeline.find(e => e.id === ids[0]);
        const evB = timeline.find(e => e.id === ids[1]);
        if (!evA || !evB) return null;
        const diff = computeLineDiff(evA.output || '', evB.output || '');
        const hasChanges = diff.some(d => d.type !== 'equal');
        return (
          <div className="overlay" onClick={() => setShowDiffModal(false)}>
            <div className="modal glass-panel" style={{ width: '760px', maxWidth: '95vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexShrink: 0 }}>
                <h3 style={{ fontSize: '1rem', margin: 0 }}>Output Diff</h3>
                <button className="btn-secondary" onClick={() => setShowDiffModal(false)}>Close</button>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexShrink: 0 }}>
                <div style={{ flex: 1, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <span style={{ background: 'rgba(248,81,73,0.15)', border: '1px solid rgba(248,81,73,0.4)', borderRadius: '4px', padding: '2px 6px', color: '#f85149' }}>A</span>
                  {' '}<span className="mono">{evA.command}</span>
                </div>
                <div style={{ flex: 1, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <span style={{ background: 'rgba(63,185,80,0.15)', border: '1px solid rgba(63,185,80,0.4)', borderRadius: '4px', padding: '2px 6px', color: '#3fb950' }}>B</span>
                  {' '}<span className="mono">{evB.command}</span>
                </div>
              </div>
              <pre className="mono" style={{ flex: 1, overflowY: 'auto', fontSize: '0.75rem', lineHeight: 1.5, padding: '0.5rem', background: 'rgba(1,4,9,0.5)', borderRadius: '4px', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {!hasChanges ? (
                  <span style={{ color: 'var(--text-muted)' }}>Outputs are identical.</span>
                ) : diff.map((line, i) => {
                  if (line.type === 'equal') return <span key={i} style={{ color: 'var(--text-muted)' }}>{' '}{line.text}{'\n'}</span>;
                  if (line.type === 'remove') return <span key={i} style={{ color: '#f85149', background: 'rgba(248,81,73,0.08)', display: 'block' }}>{'- '}{line.text}</span>;
                  return <span key={i} style={{ color: '#3fb950', background: 'rgba(63,185,80,0.08)', display: 'block' }}>{'+  '}{line.text}</span>;
                })}
              </pre>
            </div>
          </div>
        );
      })()}

      {/* ── AI Coach Panel ────────────────────────────────────────────────── */}
      {showCoachPanel && (
        <div style={{ position: 'fixed', bottom: 0, right: 0, width: '420px', maxHeight: '60vh', zIndex: 200, display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary, #161b22)', border: '1px solid var(--accent-secondary)', borderBottom: 'none', borderRadius: '8px 8px 0 0', boxShadow: '0 -4px 24px rgba(0,0,0,0.5)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--accent-secondary)' }}>AI Coach</span>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <select
                value={coachSkill}
                onChange={(e) => setCoachSkill(e.target.value)}
                style={{ fontSize: '0.72rem', padding: '2px 6px', maxWidth: '130px' }}
                title="Coach pentest focus"
              >
                <option value="enum-target">Enum Target</option>
                <option value="web-solve">Web Solve</option>
                <option value="privesc">Priv Esc</option>
                <option value="crypto-solve">Crypto Solve</option>
                <option value="pwn-solve">Pwn Solve</option>
                <option value="reversing-solve">Reversing Solve</option>
                <option value="stego">Stego</option>
                <option value="analyze-file">Analyze File</option>
              </select>
              <button
                onClick={() => setCoachCompareMode(m => !m)}
                className="btn-secondary"
                style={{ fontSize: '0.7rem', padding: '2px 8px', opacity: coachCompareMode ? 1 : 0.55, border: coachCompareMode ? '1px solid var(--accent-secondary)' : undefined }}
                title="Compare all configured AI providers">
                Compare
              </button>
              <button className="btn-secondary" onClick={runCoach} disabled={isCoaching} style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                {isCoaching ? 'Thinking...' : 'Refresh'}
              </button>
              <button onClick={() => setShowCoachPanel(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}>×</button>
            </div>
          </div>
          <div className="mono" style={{ padding: '0.75rem', overflowY: 'auto', flex: 1, fontSize: '0.78rem', lineHeight: 1.6, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {/* E.6 — Compare mode tabbed view */}
            {coachCompareMode && (isCoaching || coachCompareResults.length > 0) && (() => {
              if (isCoaching) return <span style={{ color: 'var(--text-muted)' }}>Querying all models...</span>;
              return (
                <div>
                  <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                    {coachCompareResults.map((r, i) => (
                      <button key={r.provider} onClick={() => setCoachCompareTab(i)}
                        style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '4px', border: `1px solid ${i === coachCompareTab ? 'var(--accent-secondary)' : 'var(--border-color)'}`, background: i === coachCompareTab ? 'rgba(88,166,255,0.12)' : 'transparent', color: i === coachCompareTab ? 'var(--accent-secondary)' : 'var(--text-muted)', cursor: 'pointer' }}>
                        {r.provider}
                        {!r.ok && <span style={{ color: '#f85149', marginLeft: '4px' }}>✗</span>}
                      </button>
                    ))}
                  </div>
                  {coachCompareResults[coachCompareTab] && (
                    <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: coachCompareResults[coachCompareTab].ok ? 'var(--text-primary)' : '#f85149' }}>
                      {coachCompareResults[coachCompareTab].content}
                    </div>
                  )}
                </div>
              );
            })()}
            {(!coachCompareMode || (!isCoaching && coachCompareResults.length === 0)) && (isCoaching && !coachResult ? <span style={{ color: 'var(--text-muted)' }}>Analyzing timeline...</span> : (() => {
              if (!coachResult) return <span style={{ color: 'var(--text-muted)' }}>Click Refresh to get a coaching suggestion.</span>;
              // E.7 — Parse confidence line
              const confMatch = coachResult.match(/\nConfidence:\s*(low|medium|high)\s*[—–-]\s*(.+)$/im);
              const displayText = confMatch ? coachResult.slice(0, confMatch.index).trimEnd() : coachResult;
              const confLevel = confMatch?.[1]?.toLowerCase();
              const confRationale = confMatch?.[2]?.trim();
              const confColors = { low: '#e09400', medium: '#388bfd', high: '#3fb950' };
              const confBg = { low: 'rgba(224,148,0,0.12)', medium: 'rgba(56,139,253,0.12)', high: 'rgba(63,185,80,0.12)' };
              return <>
                {displayText}
                {confLevel && (
                  <div style={{ marginTop: '0.6rem', padding: '0.35rem 0.65rem', background: confBg[confLevel], border: `1px solid ${confColors[confLevel]}40`, borderRadius: '5px', fontSize: '0.74rem', display: 'flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'normal' }}>
                    <span style={{ color: confColors[confLevel], fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Confidence: {confLevel}</span>
                    {confRationale && <span style={{ color: 'var(--text-muted)' }}>— {confRationale}</span>}
                  </div>
                )}
              </>;
            })())}
            {!isCoaching && coachResult && (() => {
              const DANGEROUS = /rm\s+-rf|dd\s+if=|mkfs\.|:\s*\(\)\s*\{|>\s*\/dev\/sd[a-z]|chmod\s+[0-7]*7[0-7]*\s+\/|fork\s+bomb|shred\s+-/i;
              const codeBlocks = [...coachResult.matchAll(/```[\w]*\n?([\s\S]*?)```/g)].map(m => m[1]);
              const hasDanger = codeBlocks.some(b => DANGEROUS.test(b)) || DANGEROUS.test(coachResult);
              // E.4 — derive feedback hash from raw response (sync, approximate)
              const displayText = coachResult.replace(/\nConfidence:\s*(low|medium|high)[^\n]*/i, '').trim();
              const currentHash = (() => {
                // Use a simple FNV-like hash for immediate UI state; the real SHA-256 is computed async on click
                let h = 0;
                for (let i = 0; i < Math.min(displayText.length, 500); i++) {
                  h = (Math.imul(31, h) + displayText.charCodeAt(i)) | 0;
                }
                return String(h);
              })();
              const currentRating = coachFeedbackRatings[currentHash];
              return <>
                {hasDanger && (
                  <div style={{ marginTop: '0.6rem', padding: '0.4rem 0.65rem', background: 'rgba(210,153,34,0.12)', border: '1px solid rgba(210,153,34,0.4)', borderRadius: '5px', color: 'var(--accent-warning)', fontSize: '0.75rem' }}>
                    ⚠ Potentially destructive command detected — verify carefully before running
                  </div>
                )}
                <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Was this helpful?</span>
                  <button onClick={() => submitCoachFeedback(displayText, 1)} title="Thumbs up"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', opacity: currentRating === 1 ? 1 : 0.4, transition: 'opacity 0.15s' }}>👍</button>
                  <button onClick={() => submitCoachFeedback(displayText, -1)} title="Thumbs down"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', opacity: currentRating === -1 ? 1 : 0.4, transition: 'opacity 0.15s' }}>👎</button>
                </div>
              </>;
            })()}
          </div>
        </div>
      )}

      {showDbModal && (
        <div className="overlay">
          <div className="modal glass-panel" style={{ width: '420px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3>DB Maintenance</h3>
              <button className="btn-secondary" onClick={() => setShowDbModal(false)}>Close</button>
            </div>
            {dbStats ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  {[['Sessions', dbStats.sessions], ['Timeline Events', dbStats.events], ['App Logs', dbStats.logs], ['Writeup Versions', dbStats.writeupVersions]].map(([label, count]) => (
                    <div key={label} style={{ padding: '0.5rem', background: 'rgba(1,4,9,0.4)', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
                      <div className="mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{label}</div>
                      <div className="mono" style={{ fontSize: '1.1rem', color: 'var(--accent-secondary)' }}>{count}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                  <button className="btn-secondary mono" style={{ fontSize: '0.78rem' }} onClick={() => runCleanup('logs')}>
                    Clear Logs
                  </button>
                  <button className="btn-secondary mono" style={{ fontSize: '0.78rem' }} onClick={() => runCleanup('vacuum')}>
                    Vacuum DB
                  </button>
                  <button className="btn-primary mono" style={{ fontSize: '0.78rem' }} onClick={() => runCleanup('all')}>
                    Clear Logs + Vacuum
                  </button>
                </div>
              </div>
            ) : (
              <p className="mono" style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading stats...</p>
            )}
          </div>
        </div>
      )}

      <div className={`layout ${isOverlaySidebar ? 'layout-overlay' : ''} ${sidebarCollapsed ? 'layout-collapsed' : ''}`} style={layoutVars}>
        {(isOverlaySidebar || sidebarCollapsed) && sidebarDrawerOpen && (
          <div className="sidebar-backdrop" onClick={() => setSidebarDrawerOpen(false)} />
        )}

        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <aside className={`sidebar glass-panel ${(isOverlaySidebar || sidebarCollapsed) ? 'overlay' : ''} ${sidebarDrawerOpen ? 'open' : ''}`}>
          <div className="sidebar-header">
            <h3>Toolbox</h3>
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              {!isOverlaySidebar && (
                <button className="btn-secondary mono sidebar-toggle-btn" onClick={toggleSidebarCollapse} title={sidebarCollapsed ? 'Pin sidebar' : 'Collapse sidebar'}>
                  {sidebarCollapsed ? '»' : '«'}
                </button>
              )}
              {(isOverlaySidebar || sidebarCollapsed) && (
                <button className="btn-secondary mono sidebar-toggle-btn" onClick={() => setSidebarDrawerOpen(false)} title="Close toolbox">
                  ×
                </button>
              )}
            </div>
          </div>

          <>
              <div className="tab-switcher mono" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                {[['tools', 'TOOLS'], ['flags', 'FLAGS'], ['history', 'HIST']].map(([tab, label]) => (
                  <span key={tab} style={{ cursor: 'pointer', whiteSpace: 'nowrap', color: sidebarTab === tab ? 'var(--accent-primary)' : 'var(--text-muted)', fontSize: '0.82rem', letterSpacing: '0.5px' }}
                    onClick={() => setSidebarTab(tab)}>
                    [{label}]
                  </span>
                ))}
              </div>

              {sidebarTab === 'tools' && (
                <div className="suggestion-groups">
                  <input
                    type="text"
                    placeholder="Search commands..."
                    value={toolboxSearch}
                    onChange={(e) => setToolboxSearch(e.target.value)}
                    className="mono"
                    style={{ width: '100%', padding: '6px 10px', fontSize: '0.82rem', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '4px', outline: 'none', marginBottom: '0.4rem', boxSizing: 'border-box' }}
                  />
                  {!toolboxSearch && (
                    <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                      <button className="btn-secondary" onClick={() => setExpandedCats(SUGGESTIONS.map(g => g.category))} style={{ fontSize: '0.8rem', padding: '3px 8px' }}>Expand All</button>
                      <button className="btn-secondary" onClick={() => setExpandedCats([])} style={{ fontSize: '0.8rem', padding: '3px 8px' }}>Collapse All</button>
                      <button className="btn-secondary" onClick={() => setShowCatManager(v => !v)} style={{ fontSize: '0.8rem', padding: '3px 8px', marginLeft: 'auto', color: hiddenCats.size > 0 ? 'var(--accent-warning)' : undefined }} title="Show/hide categories">
                        ⚙{hiddenCats.size > 0 ? ` (${hiddenCats.size})` : ''}
                      </button>
                    </div>
                  )}
                  {showCatManager && !toolboxSearch && (
                    <div style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.5rem 0.65rem', marginBottom: '0.5rem' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Show / hide categories</div>
                      {SUGGESTIONS.map(g => (
                        <label key={g.category} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', cursor: 'pointer', padding: '2px 0', color: hiddenCats.has(g.category) ? 'var(--text-muted)' : 'var(--text-main)' }}>
                          <input type="checkbox" checked={!hiddenCats.has(g.category)}
                            onChange={() => setHiddenCats(prev => { const next = new Set(prev); next.has(g.category) ? next.delete(g.category) : next.add(g.category); return next; })} />
                          {g.category}
                        </label>
                      ))}
                    </div>
                  )}
                  {SUGGESTIONS.map((group, i) => {
                    if (hiddenCats.has(group.category) && !toolboxSearch) return null;
                    const q = toolboxSearch.toLowerCase();
                    const filteredItems = toolboxSearch
                      ? group.items.filter(item => item.label.toLowerCase().includes(q) || item.command.toLowerCase().includes(q))
                      : group.items;
                    if (toolboxSearch && filteredItems.length === 0) return null;
                    const isOpen = toolboxSearch ? true : expandedCats.includes(group.category);
                    return (
                      <div key={i} className="group-container">
                        <div className="group-header mono" onClick={() => !toolboxSearch && toggleCategory(group.category)}>
                          {isOpen ? '▼' : '▶'} {group.category}
                        </div>
                        {isOpen && (
                          <ul className="suggestion-list">
                            {filteredItems.map((item, j) => (
                              <li key={`${group.category}-${j}`}>
                                <button className="btn-suggestion" onClick={() => { setInputType('command'); setInputVal(item.command); }}>
                                  {item.label}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {sidebarTab === 'flags' && (
                <div className="cheatsheet-area animate-fade">
                  {favFlagItems.length > 0 && (
                    <div style={{ marginBottom: '1.5rem' }}>
                      <div className="mono" style={{ color: '#e3b341', borderBottom: '1px solid rgba(227,179,65,0.2)', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                        ★ Favorites
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                        {favFlagItems.map((f, k) => (
                          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                            <button className="flag-btn mono" title={f.desc} onClick={() => appendFlag(f.flag)}>{f.flag}</button>
                            <button onClick={() => toggleFavorite(f.flag)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e3b341', fontSize: '0.7rem', padding: '0 2px' }} title="Remove from favorites">★</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.5rem' }}>
                    <button className="btn-secondary" onClick={() => setCollapsedTools(new Set())} style={{ fontSize: '0.8rem', padding: '3px 8px' }}>Expand All</button>
                    <button className="btn-secondary" onClick={() => setCollapsedTools(new Set(CHEATSHEET.map((_, i) => i)))} style={{ fontSize: '0.8rem', padding: '3px 8px' }}>Collapse All</button>
                  </div>
                  {CHEATSHEET.map((tool, i) => {
                    const isCollapsed = collapsedTools.has(i);
                    return (
                      <div key={i} style={{ marginBottom: '0.6rem', borderRadius: '6px', border: '1px solid rgba(88,166,255,0.12)', overflow: 'hidden' }}>
                        {/* Tool header — click to collapse */}
                        <div
                          className="mono"
                          onClick={() => setCollapsedTools(prev => {
                            const next = new Set(prev);
                            next.has(i) ? next.delete(i) : next.add(i);
                            return next;
                          })}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '0.38rem 0.55rem', background: 'rgba(88,166,255,0.07)', color: 'var(--accent-secondary)', fontSize: '0.84rem', userSelect: 'none' }}>
                          <span>{tool.tool}</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', transition: 'transform 0.15s', display: 'inline-block', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▼</span>
                        </div>
                        {/* Collapsible content */}
                        {!isCollapsed && (
                          <div style={{ padding: '0.45rem 0.55rem 0.55rem' }}>
                            {tool.link && (
                              <a href={tool.link} target="_blank" rel="noopener noreferrer"
                                style={{ display: 'inline-block', fontSize: '0.74rem', color: 'var(--accent-primary)', border: '1px solid var(--accent-primary)', borderRadius: '4px', padding: '2px 8px', textDecoration: 'none', marginBottom: '0.45rem' }}>
                                → Open {tool.tool} ↗
                              </a>
                            )}
                            {tool.categories.map((cat, j) => (
                              <div key={j} style={{ marginBottom: '0.5rem' }}>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.25rem', letterSpacing: '0.3px' }}>{cat.name}</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                  {cat.flags.map((f, k) => (
                                    <div key={`${f.flag}-${k}`} style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                      <button className="flag-btn mono" title={f.desc} onClick={() => appendFlag(f.flag)}>{f.flag}</button>
                                      <button onClick={() => toggleFavorite(f.flag)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: favorites.has(f.flag) ? '#e3b341' : 'var(--text-muted)', fontSize: '0.65rem', padding: '0 2px' }} title={favorites.has(f.flag) ? 'Remove from favorites' : 'Add to favorites'}>
                                        {favorites.has(f.flag) ? '★' : '☆'}
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {sidebarTab === 'history' && (
                <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', overflowY: 'auto' }}>
                  <input
                    type="text"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="Search history..."
                    className="mono"
                    style={{ fontSize: '0.78rem', padding: '3px 6px', background: 'rgba(1,4,9,0.6)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-primary)', outline: 'none' }}
                  />
                  {cmdHistory.filter(cmd => !historySearch || cmd.command.toLowerCase().includes(historySearch.toLowerCase())).length === 0 ? (
                    <p className="mono" style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No commands yet.</p>
                  ) : (
                    cmdHistory.filter(cmd => !historySearch || cmd.command.toLowerCase().includes(historySearch.toLowerCase())).map((cmd, i) => (
                      <div key={cmd.id || i} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(1,4,9,0.4)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '4px 6px' }}>
                        <span className={`badge badge-${cmd.status}`} style={{ fontSize: '0.65rem', padding: '1px 4px', whiteSpace: 'nowrap' }}>{(cmd.status || '?').toUpperCase()}</span>
                        <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cmd.command}>{cmd.command}</span>
                        <button onClick={() => { setInputType('command'); setInputVal(cmd.command); setSidebarTab('tools'); inputRef.current?.focus(); }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-primary)', fontSize: '0.75rem', padding: '0 2px', whiteSpace: 'nowrap' }} title="Re-use command">↩</button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
        </aside>

        {!isOverlaySidebar && !sidebarCollapsed && (
          <div className={`sidebar-resizer ${isResizingSidebar ? 'active' : ''}`} onMouseDown={startSidebarResize} role="separator" aria-orientation="vertical" aria-label="Resize toolbox panel" />
        )}

        {/* ── Timeline ──────────────────────────────────────────────────────── */}
        <section className="timeline-container glass-panel">
          {/* Filter bar — single row */}
          <div className="filter-toolbar">
            <div className="filter-row">
              {sidebarCollapsed && !isOverlaySidebar && (
                <button className="btn-secondary mono sidebar-toggle-btn" onClick={toggleSidebarCollapse} title="Pin sidebar" style={{ marginRight: '0.25rem' }}>»</button>
              )}
              {['all', 'command', 'note', 'screenshot'].map(t => (
                <button key={t} onClick={() => setFilterType(t)}
                  className="mono"
                  style={{ fontSize: '0.78rem', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: filterType === t ? 'var(--accent-primary)' : 'transparent', color: filterType === t ? '#000' : 'var(--text-muted)', cursor: 'pointer', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>
                  {t === 'all' ? 'ALL' : t === 'command' ? 'CMD' : t === 'screenshot' ? 'SS' : t.toUpperCase()}
                </button>
              ))}
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
                style={{ fontSize: '0.78rem', padding: '3px 6px', background: 'rgba(1,4,9,0.6)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', borderRadius: '4px' }}>
                <option value="all">Any status</option>
                <option value="success">Success</option>
                <option value="failed">Failed</option>
                <option value="running">Running</option>
              </select>
              <select value={filterTag} onChange={(e) => setFilterTag(e.target.value)}
                style={{ fontSize: '0.78rem', padding: '3px 6px', background: 'rgba(1,4,9,0.6)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', borderRadius: '4px', maxWidth: '140px' }}>
                <option value="">Any tag</option>
                {allTimelineTags.map(t => <option key={t} value={t}>#{t}</option>)}
              </select>
              <input
                ref={filterKeywordRef}
                type="text" value={filterKeyword} onChange={(e) => setFilterKeyword(e.target.value)}
                placeholder="Search... (Ctrl+F)" className="mono"
                style={{ fontSize: '0.8rem', padding: '3px 8px', background: 'rgba(1,4,9,0.6)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '4px', flex: '1 1 120px', outline: 'none', minWidth: '80px' }}
              />
              {(filterType !== 'all' || filterStatus !== 'all' || filterKeyword || filterTag) && (
                <button onClick={() => { setFilterType('all'); setFilterStatus('all'); setFilterKeyword(''); setFilterTag(''); }}
                  className="mono" style={{ fontSize: '0.78rem', padding: '3px 8px', borderRadius: '4px', border: '1px solid rgba(248,81,73,0.4)', color: 'rgba(248,81,73,0.8)', background: 'transparent', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  ✕
                </button>
              )}
              <button
                onClick={collapseTimelineEvents}
                className="mono btn-secondary"
                style={{ fontSize: '0.78rem', padding: '3px 8px', whiteSpace: 'nowrap' }}
                title="Collapse timeline events"
                disabled={timelineCollapsed}
              >
                Collapse All
              </button>
              <button
                onClick={expandTimelineEvents}
                className="mono btn-secondary"
                style={{ fontSize: '0.78rem', padding: '3px 8px', whiteSpace: 'nowrap' }}
                title="Expand timeline events"
                disabled={!timelineCollapsed}
              >
                Expand All
              </button>
              <button onClick={exportTimeline} className="mono btn-secondary"
                style={{ fontSize: '0.78rem', padding: '3px 8px', whiteSpace: 'nowrap' }} title="Export timeline">
                ↓
              </button>
              <button onClick={loadDbStats} className="mono btn-secondary"
                style={{ fontSize: '0.78rem', padding: '3px 8px', whiteSpace: 'nowrap' }} title="DB stats">
                ⚙
              </button>
              {compareEventIds.size === 2 && (
                <>
                  <button
                    onClick={() => setShowDiffModal(true)}
                    className="mono"
                    style={{ fontSize: '0.78rem', padding: '3px 8px', whiteSpace: 'nowrap', borderRadius: '4px', border: '1px solid rgba(88,166,255,0.5)', color: 'var(--accent-secondary)', background: 'transparent', cursor: 'pointer' }}
                    title="Compare selected command outputs">
                    Diff →
                  </button>
                  <button onClick={() => setCompareEventIds(new Set())} className="mono btn-secondary"
                    style={{ fontSize: '0.78rem', padding: '3px 8px', whiteSpace: 'nowrap' }} title="Clear diff selection">✕</button>
                </>
              )}
              {selectedScreenshots.size > 0 && (
                <>
                  <button
                    onClick={async () => {
                      if (!confirm(`Delete ${selectedScreenshots.size} screenshot(s)?`)) return;
                      for (const id of selectedScreenshots) {
                        await apiFetch(`/api/timeline?sessionId=${currentSession}&id=${id}`, { method: 'DELETE' });
                      }
                      setTimeline(prev => prev.filter(e => !selectedScreenshots.has(e.id)));
                      setSelectedScreenshots(new Set());
                    }}
                    className="mono"
                    style={{ fontSize: '0.78rem', padding: '3px 8px', whiteSpace: 'nowrap', borderRadius: '4px', border: '1px solid var(--accent-danger)', color: 'var(--accent-danger)', background: 'transparent', cursor: 'pointer' }}>
                    🗑 {selectedScreenshots.size}
                  </button>
                  <button onClick={() => setSelectedScreenshots(new Set())} className="mono btn-secondary"
                    style={{ fontSize: '0.78rem', padding: '3px 8px', whiteSpace: 'nowrap' }}>✕</button>
                </>
              )}
            </div>
          </div>

          <div className="timeline-scroll-shell">
            <div ref={timelineFeedRef} onScroll={handleTimelineScroll} className="timeline-feed">
              {filteredTimeline.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '2rem' }}>
                  <p>{timeline.length === 0 ? `Session "${currentSession}" is empty. Start your recon!` : 'No events match the current filter.'}</p>
                </div>
              )}

              {filteredTimeline.map((event, idx) => {
                const outputLines = (event.output || '').split('\n');
                const PREVIEW_LINES = 4;
                const isLong = outputLines.length > PREVIEW_LINES;
                const isExpanded = expandedOutputs.has(event.id);
                const visibleOutput = isExpanded ? event.output : outputLines.slice(0, PREVIEW_LINES).join('\n');
                const isTimelineEventExpanded = !timelineCollapsed || expandedTimelineEvents.has(event.id);
                const compactSummary = summarizeTimelineEvent(event);
                const isEventInPoc = pocLinkedEventIds.has(event.id);
                const tags = (() => { try { return JSON.parse(event.tags || '[]'); } catch { return []; } })();

                return (
                  <div key={event.id || idx} className="timeline-event">
                    <div className="event-header">
                      <span className="mono" style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </span>
                      <span className={`badge badge-${event.type === 'note' ? 'note' : (event.type === 'screenshot' ? 'screenshot' : event.status)}`}>
                        {(event.type || 'EVENT').toUpperCase()}
                      </span>
                      {tags.length > 0 && tags.map(t => (
                        <span key={t} style={{ fontSize: '0.74rem', padding: '2px 7px', borderRadius: '10px', background: 'rgba(88,166,255,0.12)', color: 'var(--accent-secondary)', border: '1px solid rgba(88,166,255,0.2)' }}>#{t}</span>
                      ))}
                      {isEventInPoc && (
                        <span className="mono" style={{ fontSize: '0.7rem', padding: '2px 7px', borderRadius: '10px', border: '1px solid rgba(63,185,80,0.45)', color: '#3fb950', background: 'rgba(63,185,80,0.1)' }}>
                          In PoC
                        </span>
                      )}
                      <button
                        onClick={() => addEventToPoc(event, isEventInPoc)}
                        className="mono"
                        style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(88,166,255,0.35)', color: 'var(--accent-secondary)', background: 'transparent', cursor: 'pointer', lineHeight: 1.4 }}
                        title={isEventInPoc ? 'Add another PoC step from this event' : 'Add event to PoC steps'}
                        disabled={pocBusyEventId === event.id}
                      >
                        {pocBusyEventId === event.id ? '…' : (isEventInPoc ? 'Add again' : 'Add to PoC')}
                      </button>
                      {timelineCollapsed && (
                        <button
                          onClick={() => toggleTimelineEventDetails(event.id)}
                          className="mono"
                          style={{ marginLeft: 'auto', fontSize: '0.74rem', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(88,166,255,0.35)', color: 'var(--accent-secondary)', background: 'transparent', cursor: 'pointer', lineHeight: 1.4 }}
                          title={isTimelineEventExpanded ? 'Hide event details' : 'Show event details'}
                        >
                          {isTimelineEventExpanded ? 'Hide' : 'Show'}
                        </button>
                      )}
                      <button
                        onClick={() => deleteEvent(event.id)}
                        title="Delete event"
                        className="mono"
                        style={{ marginLeft: timelineCollapsed ? '0' : 'auto', fontSize: '0.78rem', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(248,81,73,0.3)', color: 'rgba(248,81,73,0.6)', background: 'transparent', cursor: 'pointer', lineHeight: 1.4 }}
                      >✕</button>
                    </div>

                    {timelineCollapsed && !isTimelineEventExpanded && (
                      <div className="mono event-collapsed-summary">
                        {compactSummary || '(empty event)'}
                      </div>
                    )}

                    {isTimelineEventExpanded && (
                      <>
                        {event.type === 'command' && (
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <input
                                type="checkbox"
                                title="Select for diff comparison"
                                checked={compareEventIds.has(event.id)}
                                onChange={() => toggleCompareEvent(event.id)}
                                disabled={!compareEventIds.has(event.id) && compareEventIds.size >= 2}
                                style={{ accentColor: 'var(--accent-secondary)', cursor: 'pointer', flexShrink: 0 }}
                              />
                              <div className="event-command" style={{ flex: 1 }}><span style={{ color: 'var(--accent-primary)' }}>$</span> {event.command}</div>
                              {(event.status === 'failed' || event.status === 'error') && (
                                <button onClick={() => { setInputType('command'); setInputVal(event.command); inputRef.current?.focus(); }}
                                  className="mono" style={{ fontSize: '0.8rem', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--accent-warning)', color: 'var(--accent-warning)', background: 'transparent', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                  ↩ Retry
                                </button>
                              )}
                            </div>
                            {event.status !== 'running' && event.status !== 'queued' && event.output && (
                              <>
                                <div style={{ position: 'relative' }}>
                                  <pre className="event-output mono">{visibleOutput || 'No output.'}</pre>
                                  <button
                                    onClick={() => copyOutput(event.id, event.output)}
                                    title="Copy output"
                                    className="mono"
                                    style={{ position: 'absolute', top: '6px', right: '6px', fontSize: '0.72rem', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', color: copiedEventId === event.id ? 'var(--accent-primary)' : 'var(--text-muted)', background: 'rgba(1,4,9,0.85)', cursor: 'pointer', lineHeight: 1.5 }}
                                  >{copiedEventId === event.id ? '✓ Copied' : 'Copy'}</button>
                                </div>
                                {isLong && (
                                  <button onClick={() => toggleOutput(event.id)} className="mono"
                                    style={{ fontSize: '0.8rem', background: 'transparent', border: 'none', color: 'var(--accent-secondary)', cursor: 'pointer', padding: '3px 0', display: 'block' }}>
                                    {isExpanded ? `▲ Collapse` : `▼ Show more (${outputLines.length - PREVIEW_LINES} more lines)`}
                                  </button>
                                )}
                              </>
                            )}
                            {event.status !== 'running' && event.status !== 'queued' && !event.output && (
                              <pre className="event-output mono">No output.</pre>
                            )}
                            {(event.status === 'running' || event.status === 'queued') && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--accent-warning)', fontSize: '0.85rem' }}>
                                <span className="status-dot status-dot--running" />
                                <span className="mono">
                                  {`${Math.floor((Date.now() - new Date(event.timestamp).getTime()) / 1000)}s elapsed`}
                                </span>
                                <button
                                  onClick={() => handleCancelCommand(event.id, event.session_id || currentSession)}
                                  style={{ background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.3)', borderRadius: '4px', color: '#ff5050', fontSize: '0.75rem', padding: '1px 6px', cursor: 'pointer' }}
                                >✕ Cancel</button>
                              </div>
                            )}
                          </>
                        )}

                        {event.type === 'note' && (() => {
                          const cvssMatch = (event.content || '').match(/^CVSS:([\d.]+(?:\/[^\s|]+)?)\s*\|\s*/);
                          const noteText = cvssMatch ? event.content.slice(cvssMatch[0].length) : event.content;
                          const score = cvssMatch ? parseFloat(cvssMatch[1]) : null;
                          const cvssColor = score === null ? null : score >= 9 ? '#f85149' : score >= 7 ? '#e09400' : score >= 4 ? '#d29922' : '#388bfd';
                          const cvssLabel = score === null ? null : score >= 9 ? 'Critical' : score >= 7 ? 'High' : score >= 4 ? 'Medium' : 'Low';
                          return (
                            <div className="event-note">
                              {cvssMatch && (
                                <span style={{ marginRight: '0.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                  <span style={{ background: `${cvssColor}22`, border: `1px solid ${cvssColor}66`, color: cvssColor, borderRadius: '4px', padding: '1px 6px', fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.5px' }}>
                                    {cvssLabel} {cvssMatch[1]}
                                  </span>
                                </span>
                              )}
                              {noteText}
                            </div>
                          );
                        })()}

                        {event.type === 'screenshot' && (
                          <div className="event-screenshot">
                            <label style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', cursor: 'pointer', zIndex: 1 }} title="Select for bulk delete">
                              <input type="checkbox" checked={selectedScreenshots.has(event.id)}
                                onChange={() => setSelectedScreenshots(prev => { const next = new Set(prev); next.has(event.id) ? next.delete(event.id) : next.add(event.id); return next; })} />
                            </label>
                            <a href={`/api/media/${currentSession}/${event.filename}`} target="_blank" rel="noopener noreferrer">
                              <Image
                                src={`/api/media/${currentSession}/${event.filename}`}
                                alt={event.name || 'Screenshot'}
                                width={1200}
                                height={675}
                                unoptimized
                                style={{ maxHeight: '180px', width: '100%', objectFit: 'contain', cursor: 'pointer' }}
                              />
                            </a>
                            {editingScreenshot?.id === event.id ? (
                              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', padding: '6px 0', flexWrap: 'wrap' }}>
                                <input
                                  value={editingScreenshot.name}
                                  onChange={(e) => setEditingScreenshot(s => ({ ...s, name: e.target.value }))}
                                  placeholder="Name"
                                  className="mono"
                                  style={{ fontSize: '0.8rem', padding: '3px 6px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '4px', outline: 'none', flex: '1', minWidth: '100px' }}
                                />
                                <input
                                  value={editingScreenshot.tag}
                                  onChange={(e) => setEditingScreenshot(s => ({ ...s, tag: e.target.value }))}
                                  placeholder="Tag"
                                  className="mono"
                                  style={{ fontSize: '0.8rem', padding: '3px 6px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '4px', outline: 'none', width: '100px' }}
                                />
                                <button className="btn-primary" onClick={saveScreenshotEdit} style={{ fontSize: '0.75rem', padding: '3px 10px' }}>Save</button>
                                <button className="btn-secondary" onClick={() => setEditingScreenshot(null)} style={{ fontSize: '0.75rem', padding: '3px 10px' }}>Cancel</button>
                              </div>
                            ) : (
                              <div className="screenshot-info mono" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <span>{event.name}</span>
                                {event.tag && <span style={{ color: 'var(--accent-primary)' }}>#{event.tag}</span>}
                                <button
                                  onClick={() => setEditingScreenshot({ id: event.id, name: event.name || '', tag: event.tag || '' })}
                                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem', padding: '0 2px' }}
                                  title="Edit name / tag"
                                >✏</button>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {(!timelineAtTop || !timelineAtBottom) && (
              <div className="timeline-jump-controls" aria-label="Timeline navigation controls">
                {!timelineAtTop && (
                  <button
                    className="mono btn-secondary timeline-jump-arrow"
                    onClick={() => scrollTimelineToTop()}
                    aria-label="Scroll to top"
                    title="Scroll to top"
                  >
                    ↑
                  </button>
                )}
                {!timelineAtBottom && (
                  <button
                    className="mono btn-secondary timeline-jump-arrow"
                    onClick={() => scrollTimelineToBottom()}
                    aria-label="Scroll to bottom"
                    title="Scroll to bottom"
                  >
                    ↓
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Input area ────────────────────────────────────────────────── */}
          <form className="input-area" onSubmit={handleSubmit}>
            <div className="input-toolbar">
              <select value={inputType} onChange={(e) => setInputType(e.target.value)} style={{ width: '120px' }}>
                <option value="command">Command</option>
                <option value="note">Note</option>
              </select>
              {inputType === 'command' && (
                <div className="input-timeout">
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Timeout:</span>
                  <select value={cmdTimeout} onChange={(e) => setCmdTimeout(Number(e.target.value))}
                    style={{ fontSize: '0.84rem', padding: '4px 8px', background: 'rgba(1,4,9,0.6)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', borderRadius: '4px', width: '96px' }}>
                    <option value={30}>30s</option>
                    <option value={60}>1 min</option>
                    <option value={120}>2 min</option>
                    <option value={300}>5 min</option>
                    <option value={600}>10 min</option>
                  </select>
                </div>
              )}
              <div className="input-extras">
                <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} accept="image/*" />
                <button type="button" className="upload-btn mono" onClick={() => fileInputRef.current?.click()}>
                  [+] Screenshot
                </button>
              </div>
            </div>
            {/* D.9 — CVSS score input (note mode only) */}
            {inputType === 'note' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                <input
                  type="text" value={cvssScore} onChange={(e) => setCvssScore(e.target.value)}
                  placeholder="CVSS score (e.g. 7.5)" className="mono"
                  style={{ fontSize: '0.82rem', padding: '4px 10px', background: 'rgba(1,4,9,0.6)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', borderRadius: '4px', width: '180px', outline: 'none' }}
                />
                <a href="https://www.first.org/cvss/calculator/3.1" target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', opacity: 0.7, whiteSpace: 'nowrap' }}>
                  ↗ CVSS Calculator
                </a>
              </div>
            )}
            {/* Stage tag selector */}
            {inputType !== 'screenshot' && (
              <div className="tag-block">
                <div className="tag-input-row" style={{ gap: '0.5rem' }}>
                  <select
                    value=""
                    onChange={(e) => { if (e.target.value) toggleTag(e.target.value); }}
                    className="mono"
                    style={{ fontSize: '0.82rem', padding: '4px 8px', background: 'rgba(1,4,9,0.6)',
                      border: '1px solid var(--border-color)', color: 'var(--text-muted)',
                      borderRadius: '4px', minWidth: '160px' }}>
                    <option value="">— phase / category —</option>
                    <optgroup label="Pentest Phases">
                      {SUGGESTED_TAGS.slice(0, 9).map(t => {
                        const active = inputTags.split(',').map(s => s.trim()).includes(t);
                        return <option key={t} value={t}>{active ? '✓ ' : ''}{t}</option>;
                      })}
                    </optgroup>
                    <optgroup label="CTF Categories">
                      {SUGGESTED_TAGS.slice(9).map(t => {
                        const active = inputTags.split(',').map(s => s.trim()).includes(t);
                        return <option key={t} value={t}>{active ? '✓ ' : ''}{t}</option>;
                      })}
                    </optgroup>
                  </select>
                  <input
                    type="text" value={inputTags} onChange={(e) => setInputTags(e.target.value)}
                    placeholder="tag (optional)" className="mono"
                    style={{
                      fontSize: '0.82rem', padding: '4px 10px',
                      background: 'rgba(1,4,9,0.6)',
                      border: `1px solid var(--border-color)`,
                      color: 'var(--text-muted)',
                      borderRadius: '4px', width: '180px', outline: 'none',
                    }}
                  />
                  {inputTags && inputTags.split(',').map(t => t.trim()).filter(Boolean).map(t => (
                    <span key={t} className="mono" onClick={() => toggleTag(t)}
                      style={{ fontSize: '0.74rem', padding: '2px 7px', borderRadius: '10px',
                        background: 'rgba(88,166,255,0.15)', color: 'var(--accent-primary)',
                        border: '1px solid var(--accent-primary)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      {t} ×
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                ref={inputRef}
                type="text"
                className="mono flex-grow"
                value={inputVal}
                onChange={(e) => { setInputVal(e.target.value); setHistoryIdx(-1); }}
                onKeyDown={handleKeyDown}
                placeholder={inputType === 'command' ? '$ command... use {TARGET} for session IP  (↑↓ history)' : 'Type a note...'}
                disabled={isLoading}
              />
              <button type="submit" className="btn-primary" disabled={isLoading || !inputVal.trim()}>
                {isLoading ? '...' : (inputType === 'command' ? 'Execute' : 'Add Note')}
              </button>
            </div>
          </form>
        </section>
      </div>

      <style jsx>{`
        .container { width: min(96vw, 1880px); margin: 0 auto; padding: clamp(12px, 1.2vw, 24px); height: calc(100vh - clamp(12px, 1.2vw, 24px) - var(--version-bar-height, 0px)); display: flex; flex-direction: column; gap: 0.5rem; }
        .header { padding: 0.45rem 1.2rem; display: flex; flex-direction: row; align-items: center; gap: 0.6rem; }
.header-row { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 0.45rem; flex-wrap: nowrap; min-height: unset; }
        .header-brand { font-size: 1.0rem; letter-spacing: 2px; white-space: nowrap; flex-shrink: 0; }
        .btn-compact { min-height: 30px !important; padding: 0.2rem 0.55rem !important; font-size: 0.8rem !important; }
        .ai-usage-pill { font-size: 0.7rem; color: var(--text-muted); border: 1px solid rgba(88,166,255,0.25); border-radius: 999px; padding: 0.22rem 0.52rem; background: rgba(1,4,9,0.5); white-space: nowrap; }
        .objective-bar { padding: 0.7rem 1.2rem; font-size: 0.92rem; color: var(--text-muted); border-top: none; }

        .report-modal { width: 88%; max-width: 1240px; height: 88vh; padding: 1.25rem; gap: 0.75rem; overflow: hidden; }
        .report-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 0.45rem; border: 1px solid var(--border-color); border-radius: 8px; padding: 0.5rem 0.6rem; background: rgba(1,4,9,0.45); }
        .report-editor { flex-grow: 1; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 8px; background: rgba(1,4,9,0.5); padding: 0.7rem; display: flex; flex-direction: column; gap: 0.6rem; }
        .report-block-card { border: 1px solid rgba(88,166,255,0.22); border-radius: 8px; background: rgba(1,4,9,0.58); padding: 0.65rem; display: flex; flex-direction: column; }
        .report-block-header { display: flex; align-items: center; gap: 0.45rem; margin-bottom: 0.42rem; }
        .poc-editor { border: 1px solid var(--border-color); border-radius: 8px; background: rgba(1,4,9,0.46); padding: 0.7rem; max-height: 32vh; overflow-y: auto; display: flex; flex-direction: column; gap: 0.55rem; }
        .poc-editor-header { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
        .poc-step-card { border: 1px solid rgba(63,185,80,0.3); border-radius: 8px; background: rgba(12,25,16,0.45); padding: 0.6rem; display: flex; flex-direction: column; gap: 0.4rem; }
        .poc-step-header { display: flex; align-items: center; gap: 0.45rem; }
        .poc-step-links { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.4rem; }

        .layout { position: relative; display: grid; grid-template-columns: var(--sidebar-width) var(--resizer-width) minmax(400px, 1fr); flex-grow: 1; min-height: 0; gap: 0.75rem; margin-top: 0.75rem; }
.layout.layout-overlay { grid-template-columns: minmax(0, 1fr); }
        .layout.layout-collapsed { grid-template-columns: minmax(0, 1fr); }
        .sidebar { width: 100%; padding: 1rem 1rem 1.1rem; display: flex; flex-direction: column; overflow-y: auto; min-height: 0; }
        .sidebar.collapsed { padding: 0.75rem 0.45rem; overflow: hidden; }
        .sidebar-header { display: flex; align-items: center; justify-content: space-between; gap: 0.4rem; margin-bottom: 0.8rem; }
        .sidebar-toggle-btn { min-width: 32px; min-height: 32px; padding: 0.1rem 0.35rem; font-size: 0.86rem; }
        .sidebar-rail { display: flex; flex-direction: column; gap: 0.4rem; margin-top: 0.4rem; }
        .rail-btn { min-height: 38px; padding: 0.2rem; font-size: 0.85rem; }
        .sidebar-backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.52); z-index: 1100; }
        .sidebar.overlay { position: fixed; top: 14px; left: 14px; bottom: calc(14px + var(--version-bar-height, 0px)); width: min(86vw, 420px); transform: translateX(calc(-100% - 24px)); transition: transform 0.22s ease; z-index: 1200; }
        .sidebar.overlay.open { transform: translateX(0); }
        .sidebar-resizer { width: 100%; border-radius: 8px; cursor: col-resize; background: rgba(88, 166, 255, 0.09); border: 1px solid rgba(88, 166, 255, 0.2); }
        .sidebar-resizer.active { background: rgba(88, 166, 255, 0.2); border-color: rgba(88, 166, 255, 0.4); }
        .group-container { margin-bottom: 1rem; }
        .group-header { background: rgba(48, 54, 61, 0.4); padding: 0.5rem; border-radius: 4px; cursor: pointer; font-size: 0.85rem; font-weight: bold; color: var(--accent-secondary); margin-bottom: 0.5rem; transition: background 0.2s; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .group-header:hover { background: rgba(48, 54, 61, 0.7); }
        .suggestion-list { list-style: none; padding-left: 0.5rem; }
        .btn-suggestion { width: 100%; text-align: left; background: transparent; color: var(--text-muted); font-size: 0.8rem; padding: 0.4rem 0.5rem; border-radius: 4px; border: 1px solid transparent; transition: all 0.2s; }
        .btn-suggestion:hover { background: rgba(57, 211, 83, 0.05); border-color: rgba(57, 211, 83, 0.3); color: var(--accent-primary); }
        .timeline-container { flex-grow: 1; min-width: 0; display: flex; flex-direction: column; padding: 1.2rem; position: relative; overflow-x: hidden; }
        .filter-toolbar { display: flex; flex-direction: column; gap: 0; margin-bottom: 0.55rem; }
        .filter-row { display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; }
        .input-area--collapsed { display: none; }
        .timeline-scroll-shell { flex-grow: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: stretch; gap: 0.55rem; margin-bottom: 1rem; }
        .timeline-feed { flex-grow: 1; overflow-y: auto; overflow-x: hidden; padding-right: 0.85rem; margin-bottom: 0; display: flex; flex-direction: column; gap: 1rem; min-height: 0; }
        .timeline-jump-controls { display: flex; flex-direction: column; justify-content: flex-end; gap: 0.35rem; padding-bottom: 0.2rem; }
        .timeline-jump-arrow { width: 32px; height: 32px; min-width: 32px; min-height: 32px; padding: 0; display: inline-flex; align-items: center; justify-content: center; font-size: 1rem; line-height: 1; backdrop-filter: blur(3px); background: rgba(1,4,9,0.75); }
        .timeline-event { background: rgba(1, 4, 9, 0.4); border: 1px solid var(--border-color); border-radius: 8px; padding: 1.15rem; position: relative; }
        .event-collapsed-summary { padding: 0.45rem 0.65rem; background: rgba(88,166,255,0.06); border-left: 2px solid rgba(88,166,255,0.45); border-radius: 4px; font-size: 0.82rem; color: var(--text-muted); white-space: pre-wrap; word-break: break-word; }
        .event-command { font-family: var(--font-mono); font-size: 1rem; margin-bottom: 0.5rem; color: #fff; }
        .event-output { background: rgba(1, 4, 9, 0.8); padding: 1rem; border-radius: 6px; font-size: 0.9rem; max-height: 320px; overflow-y: auto; border-left: 2px solid var(--accent-primary); white-space: pre-wrap; word-break: break-all; margin-bottom: 2px; }
        .event-note { font-size: 1.05rem; padding: 0.5rem 1rem; border-left: 3px solid var(--accent-secondary); background: rgba(88, 166, 255, 0.05); }
.loader { width: 12px; height: 12px; border: 2px solid var(--accent-warning); border-bottom-color: transparent; border-radius: 50%; display: inline-block; animation: rotation 1s linear infinite; }
        @keyframes rotation { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .input-area { background: rgba(1, 4, 9, 0.6); padding: 1.15rem; border-radius: 8px; border: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 0.5rem; }
        .input-toolbar { display: flex; justify-content: space-between; margin-bottom: 0.45rem; flex-wrap: wrap; gap: 0.5rem; }
        .input-timeout { display: flex; align-items: center; gap: 6px; }
        .input-extras { display: flex; gap: 0.5rem; align-items: center; flex: 1; min-width: 0; justify-content: flex-end; }
        .tag-block { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 0.4rem; }
        .tag-chip-row { display: flex; flex-wrap: nowrap; gap: 6px; overflow-x: auto; overflow-y: hidden; padding-bottom: 2px; }
        .tag-input-row { display: flex; align-items: center; gap: 0.45rem; flex-wrap: wrap; }
        .flex-grow { flex-grow: 1; }
        .tab-switcher span { transition: all 0.2s; }
        .tab-switcher span:hover { filter: brightness(1.2); }
        .flag-btn { border: 1px solid var(--border-color); background: rgba(1,4,9,0.3); color: var(--text-main); font-size: 0.75rem; padding: 0.2rem 0.4rem; border-radius: 4px; transition: all 0.2s; }
        .flag-btn:hover { background: var(--accent-secondary); color: #fff; border-color: var(--accent-secondary); box-shadow: 0 0 8px rgba(88,166,255,0.3); }
        .animate-fade { animation: fadeIn 0.3s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        .event-header { display: flex; align-items: center; gap: 0.55rem; margin-bottom: 0.6rem; flex-wrap: wrap; }

        @media (min-width: 1600px) {
          .timeline-container { padding: 1.35rem; }
          .sidebar { padding: 1.2rem; }
        }

        @media (max-width: 1599px) and (min-width: 1366px) {
          .timeline-container { padding: 1.1rem; }
          .sidebar { padding: 0.95rem; }
          .input-area { padding: 1.05rem; }
        }

        @media (max-width: 1365px) {
          .timeline-container { padding: 1rem; }
          .timeline-feed { padding-right: 0.6rem; }
          .input-toolbar { gap: 0.4rem; margin-bottom: 0.35rem; }
          .input-extras { justify-content: flex-start; }
          .ai-usage-pill { display: none; }
        }

        @media (max-width: 1280px) and (min-width: 1200px) {
          .layout { gap: 0.58rem; margin-top: 0.5rem; }
          .sidebar { padding: 0.72rem 0.74rem 0.78rem; }
          .sidebar-header { margin-bottom: 0.58rem; }
          .sidebar-toggle-btn { min-width: 28px; min-height: 28px; font-size: 0.76rem; }
          .timeline-container { padding: 0.84rem; }
          .filter-toolbar { gap: 0.42rem; margin-bottom: 0.55rem; }
          .filter-row { gap: 0.38rem; }
          .filter-row :global(button), .filter-row :global(select) { font-size: 0.76rem !important; padding: 3px 7px !important; }
          .filter-row :global(input) { font-size: 0.78rem !important; padding: 5px 8px !important; min-width: 160px !important; }
          .timeline-feed { gap: 0.74rem; margin-bottom: 0.64rem; }
          .timeline-event { padding: 0.86rem; }
          .event-header { gap: 0.42rem; margin-bottom: 0.48rem; }
          .event-command { font-size: 0.93rem; margin-bottom: 0.38rem; }
          .event-output { font-size: 0.82rem; max-height: 245px; padding: 0.84rem; }
          .event-note { font-size: 0.95rem; padding: 0.44rem 0.78rem; }
          .poc-step-links { grid-template-columns: 1fr; }
          .input-area { padding: 0.76rem; gap: 0.35rem; }
          .input-toolbar { margin-bottom: 0.2rem; gap: 0.36rem; }
          .input-timeout { gap: 4px; }
          .input-extras :global(button) { padding: 0.3rem 0.5rem; font-size: 0.76rem; }
          .tag-block { gap: 0.25rem; margin-bottom: 0.24rem; }
          .tag-input-row :global(input) { width: 140px !important; font-size: 0.76rem !important; padding: 3px 8px !important; }
          .tag-input-row :global(span) { font-size: 0.72rem !important; }
          .input-area .flex-grow { min-height: 34px; font-size: 0.84rem; }
          .input-area :global(.btn-primary) { min-height: 34px; font-size: 0.82rem; padding: 0.34rem 0.72rem; }
        }

        @media (max-height: 820px) and (min-width: 1200px) {
          .layout { margin-top: 0.55rem; }
          .timeline-container { padding: 0.95rem; }
          .timeline-feed { gap: 0.85rem; margin-bottom: 0.75rem; }
          .timeline-event { padding: 1rem; }
          .input-area { padding: 0.95rem; gap: 0.4rem; }
        }

        @media (max-width: 1199px) {
          .container { width: min(98vw, 1880px); height: auto; min-height: calc(100vh - var(--version-bar-height, 0px)); }
          .layout { margin-top: 0.65rem; }
          .filter-row-secondary { gap: 0.4rem; }
          .report-modal { width: 96%; height: 92vh; padding: 0.9rem; }
          .poc-step-links { grid-template-columns: 1fr; }
          .timeline-scroll-shell { grid-template-columns: minmax(0, 1fr); gap: 0.45rem; margin-bottom: 0.65rem; }
          .timeline-jump-controls { flex-direction: row; justify-content: flex-end; align-items: center; padding-bottom: 0; }
          .timeline-jump-arrow { width: 30px; height: 30px; min-width: 30px; min-height: 30px; }
        }
      `}</style>
    </main>
  );
}
