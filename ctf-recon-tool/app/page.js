"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { CHEATSHEET } from '@/lib/cheatsheet';

const SUGGESTIONS = [
  {
    category: 'Network Recon',
    items: [
      { label: 'Nmap Fast', command: 'nmap -F {target}' },
      { label: 'Nmap Full Aggressive', command: 'nmap -A -p- -T4 {target}' },
      { label: 'UDP Scan', command: 'nmap -sU -T4 {target}' },
      { label: 'Whois Lookup', command: 'whois {target}' },
      { label: 'DNS Dig', command: 'dig {target} ANY' },
      { label: 'Ping Loop', command: 'ping -c 4 {target}' }
    ]
  },
  {
    category: 'Web Enumeration',
    items: [
      { label: 'WhatWeb', command: 'whatweb {target}' },
      { label: 'Gobuster Dir', command: 'gobuster dir -u http://{target} -w /usr/share/wordlists/dirb/common.txt' },
      { label: 'FFUF Fuzz', command: 'ffuf -u http://{target}/FUZZ -w /usr/share/wordlists/dirb/common.txt' },
      { label: 'Curl Headers', command: 'curl -I http://{target}/' },
      { label: 'Curl Verbose', command: 'curl -v http://{target}/' },
      { label: 'Curl Pass Cookie', command: 'curl -b "session=123" http://{target}/' },
      { label: 'Curl Burp Proxy', command: 'curl -x http://localhost:8080 http://{target}/' }
    ]
  },
  {
    category: 'Windows/AD Recon',
    items: [
      { label: 'SMB Null Session', command: 'smbclient -L //{target} -N' },
      { label: 'Enum4Linux (sim)', command: 'smbclient -L //{target} -N' },
      { label: 'LDAP Search', command: 'ldapsearch -x -H ldap://{target} -b "dc=example,dc=com"' }
    ]
  },
  {
    category: 'Database SQLi',
    items: [
      { label: 'Auto Scan', command: 'sqlmap -u "http://{target}/" --batch' },
      { label: 'List Databases', command: 'sqlmap -u "http://{target}/" --dbs' },
      { label: 'Dump DB', command: 'sqlmap -u "http://{target}/" --dump-all --batch' },
      { label: 'OS Shell', command: 'sqlmap -u "http://{target}/" --os-shell' }
    ]
  },
  {
    category: 'Advanced Recon',
    items: [
      { label: 'DNS Std Scan', command: 'dnsrecon -d {target} -t std' },
      { label: 'SSL/TLS Scan', command: 'sslscan {target}' },
      { label: 'Traceroute', command: 'traceroute {target}' }
    ]
  }
];

const DIFFICULTY_COLORS = { easy: '#3fb950', medium: '#d29922', hard: '#f85149' };

const SUGGESTED_TAGS = [
  // Pentest stages (HackTheBox methodology)
  'pre-engagement', 'information-gathering', 'enumeration', 'vulnerability-assessment',
  'exploitation', 'post-exploitation', 'lateral-movement', 'proof-of-concept', 'post-engagement',
  // CTF categories
  'web', 'network', 'crypto', 'forensics', 'reverse-engineering', 'steganography',
  'privilege-escalation', 'password-cracking', 'finding', 'flag',
];

function loadFavorites() {
  try { return new Set(JSON.parse(localStorage.getItem('flagFavorites') || '[]')); }
  catch { return new Set(); }
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
  const [toolboxSearch, setToolboxSearch] = useState('');
  const [sidebarTab, setSidebarTab] = useState('tools'); // 'tools' | 'flags' | 'history'
  const [favorites, setFavorites] = useState(() => (typeof window !== 'undefined' ? loadFavorites() : new Set()));
  const [cmdHistory, setCmdHistory] = useState([]);

  // Command timeout (seconds)
  const [cmdTimeout, setCmdTimeout] = useState(120);

  // Timeline filter state
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterKeyword, setFilterKeyword] = useState('');
  const [filterTag, setFilterTag] = useState('');

  // Collapsible output state
  const [expandedOutputs, setExpandedOutputs] = useState(new Set());

  // Screenshot inline editing state
  const [editingScreenshot, setEditingScreenshot] = useState(null); // { id, name, tag }

  // Command input history (arrow key cycling)
  const [inputHistory, setInputHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);

  // Report modal state
  const [reportDraft, setReportDraft] = useState('');
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportFormat, setReportFormat] = useState('lab-report');
  const [pdfStyle, setPdfStyle] = useState('terminal-dark');
  const [writeupVisibility, setWriteupVisibility] = useState('draft');
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [aiProvider, setAiProvider] = useState('claude');

  // Version history modal
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [writeupVersions, setWriteupVersions] = useState([]);

  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);
  const inputRef = useRef(null);

  // ── Data fetching ────────────────────────────────────────────────────────────

  const fetchSessions = async () => {
    try {
      const res = await fetch('/api/sessions');
      const data = await res.json();
      if (data && data.length > 0) setSessions(data);
    } catch (e) { console.error('Failed to fetch sessions', e); }
  };

  const fetchTimeline = useCallback(async () => {
    try {
      const res = await fetch(`/api/timeline?sessionId=${currentSession}`);
      const data = await res.json();
      setTimeline(data);
    } catch (e) { console.error('Failed to fetch timeline', e); }
  }, [currentSession]);

  const fetchCommandHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/timeline?sessionId=${currentSession}`);
      const data = await res.json();
      const cmds = data.filter(e => e.type === 'command').reverse();
      setCmdHistory(cmds);
      setInputHistory(cmds.map(e => e.command).filter(Boolean));
    } catch (e) { /* silent */ }
  }, [currentSession]);

  useEffect(() => { fetchSessions(); }, []);

  useEffect(() => {
    fetchTimeline();
    const interval = setInterval(fetchTimeline, 3000);
    return () => clearInterval(interval);
  }, [fetchTimeline]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [timeline]);

  useEffect(() => { fetchCommandHistory(); }, [fetchCommandHistory]);

  useEffect(() => {
    if (sidebarTab === 'history') fetchCommandHistory();
  }, [sidebarTab, fetchCommandHistory]);

  // ── Submission handlers ───────────────────────────────────────────────────

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputVal.trim()) return;
    setIsLoading(true);
    const val = inputVal;
    const tags = inputTags.trim() ? inputTags.split(',').map(t => t.trim()).filter(Boolean) : [];
    setInputVal('');
    setInputTags('');
    setHistoryIdx(-1);
    if (inputType === 'command') {
      setInputHistory(prev => [val, ...prev.slice(0, 49)]);
    }

    try {
      if (inputType === 'command') {
        const res = await fetch('/api/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: val, sessionId: currentSession, tags, timeout: cmdTimeout * 1000 })
        });
        const newEvent = await res.json();
        setTimeline(prev => [...prev, newEvent]);
      } else {
        const res = await fetch('/api/timeline', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'note', content: val, sessionId: currentSession, tags })
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
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
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
      const res = await fetch('/api/sessions', {
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
      await fetch(`/api/sessions?id=${currentSession}`, { method: 'DELETE' });
      setSessions(prev => prev.filter(s => s.id !== currentSession));
      setCurrentSession('default');
    } catch (error) { console.error('Failed to delete session', error); }
    finally { setIsLoading(false); }
  };

  const deleteEvent = async (id) => {
    if (!confirm('Delete this event? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/timeline?sessionId=${currentSession}&id=${id}`, { method: 'DELETE' });
      if (res.ok) setTimeline(prev => prev.filter(e => e.id !== id));
    } catch (error) { console.error('Failed to delete event', error); }
  };

  // ── Screenshot edit handlers ──────────────────────────────────────────────

  const saveScreenshotEdit = async () => {
    if (!editingScreenshot) return;
    try {
      await fetch('/api/timeline', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSession, id: editingScreenshot.id, name: editingScreenshot.name, tag: editingScreenshot.tag }),
      });
      setTimeline(prev => prev.map(e => e.id === editingScreenshot.id ? { ...e, name: editingScreenshot.name, tag: editingScreenshot.tag } : e));
    } catch (err) { console.error('Failed to update screenshot', err); }
    finally { setEditingScreenshot(null); }
  };

  // ── Report handlers ───────────────────────────────────────────────────────

  const generateReport = async (fmt = reportFormat) => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/report?sessionId=${currentSession}&format=${fmt}`);
      const data = await res.json();
      if (data.report) {
        setReportDraft(data.report);
        setShowReportModal(true);
      }
    } catch (error) { console.error('Report generation failed', error); }
    finally { setIsLoading(false); }
  };

  const onFormatChange = async (fmt) => {
    setReportFormat(fmt);
    if (showReportModal) {
      try {
        const res = await fetch(`/api/report?sessionId=${currentSession}&format=${fmt}`);
        const data = await res.json();
        if (data.report) setReportDraft(data.report);
      } catch (_) {}
    }
  };

  const saveReport = async () => {
    try {
      setIsLoading(true);
      await fetch('/api/writeup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSession, content: reportDraft, status: writeupVisibility, visibility: writeupVisibility })
      });
      setShowReportModal(false);
      alert('Write-up saved!');
    } catch (error) { console.error('Failed to save report', error); }
    finally { setIsLoading(false); }
  };

  const enhanceReport = async () => {
    if (!reportDraft) return;
    setIsEnhancing(true);
    try {
      const res = await fetch('/api/writeup/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportContent: reportDraft, provider: aiProvider })
      });
      if (!res.ok) { alert(`AI enhancement unavailable. Check the API key for the selected provider (${aiProvider.toUpperCase()}).`); return; }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let enhanced = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        enhanced += decoder.decode(value, { stream: true });
        setReportDraft(enhanced);
      }
    } catch (error) { console.error('Enhancement failed', error); }
    finally { setIsEnhancing(false); }
  };

  const downloadPdf = () => {
    const url = `/api/export/pdf?sessionId=${currentSession}&format=${reportFormat}&pdfStyle=${pdfStyle}`;
    const sessionName = sessions.find(s => s.id === currentSession)?.name?.replace(/\s+/g, '-') || currentSession;
    const a = document.createElement('a');
    a.href = url; a.download = `${sessionName}-${reportFormat}.pdf`; a.click();
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
      const res = await fetch(`/api/writeup/history?sessionId=${currentSession}`);
      const data = await res.json();
      setWriteupVersions(data);
      setShowVersionHistory(true);
    } catch (_) {}
  };

  const restoreVersion = async (versionId) => {
    try {
      const res = await fetch(`/api/writeup/history?sessionId=${currentSession}&versionId=${versionId}`);
      const data = await res.json();
      if (data.content) {
        setReportDraft(data.content);
        setShowVersionHistory(false);
      }
    } catch (_) {}
  };

  // ── Sidebar helpers ───────────────────────────────────────────────────────

  const toggleCategory = (cat) => {
    setExpandedCats(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  };

  const appendFlag = (flag) => {
    setInputType('command');
    setInputVal(prev => prev.includes(flag) ? prev : `${prev} ${flag}`.trim());
  };

  const toggleFavorite = (flag) => {
    setFavorites(prev => {
      const next = new Set(prev);
      next.has(flag) ? next.delete(flag) : next.add(flag);
      localStorage.setItem('flagFavorites', JSON.stringify([...next]));
      return next;
    });
  };

  const toggleOutput = (id) => {
    setExpandedOutputs(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Derived data ──────────────────────────────────────────────────────────

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h1 className="dnd-title">Helm's Watch</h1>
          <div className="session-badge mono">{currentSessionData?.name || currentSession}</div>
          {currentSessionData?.difficulty && (
            <span className="mono" style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', background: DIFFICULTY_COLORS[currentSessionData.difficulty] + '22', color: DIFFICULTY_COLORS[currentSessionData.difficulty], border: `1px solid ${DIFFICULTY_COLORS[currentSessionData.difficulty]}44` }}>
              {currentSessionData.difficulty.toUpperCase()}
            </span>
          )}
          {currentSessionData?.target && (
            <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              ⌖ {currentSessionData.target}
            </span>
          )}
        </div>

        <div className="session-selector">
          <select value={currentSession} onChange={(e) => setCurrentSession(e.target.value)} style={{ minWidth: '150px' }}>
            {sessions.map((s, idx) => <option key={`${s.id}-${idx}`} value={s.id}>{s.name}</option>)}
          </select>
          <button className="btn-secondary" onClick={() => setShowNewSessionModal(true)}>+ New Session</button>
          {currentSession !== 'default' && (
            <button className="btn-secondary" onClick={deleteSession} style={{ color: 'var(--accent-danger, #f85149)', borderColor: 'var(--accent-danger, #f85149)' }}>Delete Session</button>
          )}
          <button className="btn-primary" onClick={() => generateReport()} style={{ background: 'var(--accent-secondary)', color: '#fff' }}>Generate Report</button>
        </div>
      </header>

      {currentSessionData?.objective && (
        <div className="glass-panel" style={{ padding: '0.5rem 1.5rem', fontSize: '0.85rem', color: 'var(--text-muted)', borderTop: 'none' }}>
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
          <div className="modal glass-panel" style={{ width: '82%', maxWidth: '960px', height: '85vh' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h3 className="dnd-title" style={{ fontSize: '1.2rem' }}>Helm's Watch Chronicle</h3>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <select value={reportFormat} onChange={(e) => onFormatChange(e.target.value)}
                  style={{ fontSize: '0.8rem', padding: '4px 8px' }}>
                  <option value="lab-report">Lab Report</option>
                  <option value="executive-summary">Executive Summary</option>
                  <option value="technical-walkthrough">Technical Walkthrough</option>
                  <option value="ctf-solution">CTF Solution</option>
                </select>
                <select value={pdfStyle} onChange={(e) => setPdfStyle(e.target.value)}
                  style={{ fontSize: '0.8rem', padding: '4px 8px' }}>
                  <option value="terminal-dark">Terminal Dark</option>
                  <option value="professional">Professional</option>
                  <option value="minimal">Minimal</option>
                </select>
                <button className="btn-secondary" onClick={() => setShowReportModal(false)}>Close</button>
              </div>
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

            <textarea
              value={reportDraft}
              onChange={(e) => setReportDraft(e.target.value)}
              style={{ flexGrow: 1, padding: '1.5rem', fontSize: '0.9rem', lineHeight: '1.6', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-main)', outline: 'none', resize: 'none' }}
              placeholder="The chronicle is empty..."
            />

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'space-between', marginTop: '0.75rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn-secondary" onClick={loadVersionHistory} style={{ fontSize: '0.8rem' }}>
                  [ Version History ]
                </button>
                <select value={aiProvider} onChange={(e) => setAiProvider(e.target.value)}
                  style={{ fontSize: '0.8rem', padding: '4px 8px' }}>
                  <option value="claude">Claude</option>
                  <option value="gemini">Gemini</option>
                  <option value="openai">OpenAI</option>
                </select>
                <button className="btn-secondary" onClick={enhanceReport} disabled={isEnhancing} style={{ fontSize: '0.8rem', color: 'var(--accent-secondary)', borderColor: 'var(--accent-secondary)' }}>
                  {isEnhancing ? '[ Enhancing... ]' : '[ Enhance with AI ]'}
                </button>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
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

      <div className="layout">
        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <aside className="sidebar glass-panel">
          <h3>Toolbox</h3>
          <div className="tab-switcher mono" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            {[['tools', 'TOOLS'], ['flags', 'FLAGS'], ['history', 'HIST']].map(([tab, label]) => (
              <span key={tab} style={{ cursor: 'pointer', whiteSpace: 'nowrap', color: sidebarTab === tab ? 'var(--accent-primary)' : 'var(--text-muted)', fontSize: '0.78rem', letterSpacing: '0.5px' }}
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
                style={{ width: '100%', padding: '4px 8px', fontSize: '0.78rem', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '4px', outline: 'none', marginBottom: '0.4rem', boxSizing: 'border-box' }}
              />
              {!toolboxSearch && (
                <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.5rem' }}>
                  <button className="btn-secondary" onClick={() => setExpandedCats(SUGGESTIONS.map(g => g.category))} style={{ fontSize: '0.7rem', padding: '2px 6px' }}>Expand All</button>
                  <button className="btn-secondary" onClick={() => setExpandedCats([])} style={{ fontSize: '0.7rem', padding: '2px 6px' }}>Collapse All</button>
                </div>
              )}
              {SUGGESTIONS.map((group, i) => {
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
              {CHEATSHEET.map((tool, i) => (
                <div key={i} style={{ marginBottom: '1.5rem' }}>
                  <div className="mono" style={{ color: 'var(--accent-secondary)', borderBottom: '1px solid rgba(88,166,255,0.2)', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                    {tool.tool}
                  </div>
                  {tool.categories.map((cat, j) => (
                    <div key={j} style={{ marginBottom: '0.8rem' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>{cat.name}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
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
              ))}
            </div>
          )}

          {sidebarTab === 'history' && (
            <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', overflowY: 'auto' }}>
              {cmdHistory.length === 0 ? (
                <p className="mono" style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No commands yet.</p>
              ) : (
                cmdHistory.map((cmd, i) => (
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
        </aside>

        {/* ── Timeline ──────────────────────────────────────────────────────── */}
        <section className="timeline-container glass-panel">
          {/* Filter bar */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {['all', 'command', 'note', 'screenshot'].map(t => (
              <button key={t} onClick={() => setFilterType(t)}
                className="mono"
                style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: filterType === t ? 'var(--accent-primary)' : 'transparent', color: filterType === t ? '#000' : 'var(--text-muted)', cursor: 'pointer', letterSpacing: '0.5px' }}>
                {t === 'all' ? 'ALL' : t.toUpperCase()}
              </button>
            ))}
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
              style={{ fontSize: '0.75rem', padding: '2px 6px', background: 'rgba(1,4,9,0.6)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', borderRadius: '4px' }}>
              <option value="all">Any status</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
              <option value="running">Running</option>
            </select>
            <input
              type="text" value={filterKeyword} onChange={(e) => setFilterKeyword(e.target.value)}
              placeholder="Search..." className="mono"
              style={{ fontSize: '0.75rem', padding: '2px 8px', background: 'rgba(1,4,9,0.6)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '4px', flexGrow: 1, outline: 'none', minWidth: '80px' }}
            />
            <select value={filterTag} onChange={(e) => setFilterTag(e.target.value)}
              style={{ fontSize: '0.75rem', padding: '2px 6px', background: 'rgba(1,4,9,0.6)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', borderRadius: '4px', maxWidth: '140px' }}>
              <option value="">Any tag</option>
              {allTimelineTags.map(t => <option key={t} value={t}>#{t}</option>)}
            </select>
            {(filterType !== 'all' || filterStatus !== 'all' || filterKeyword || filterTag) && (
              <button onClick={() => { setFilterType('all'); setFilterStatus('all'); setFilterKeyword(''); setFilterTag(''); }}
                className="mono" style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(248,81,73,0.4)', color: 'rgba(248,81,73,0.8)', background: 'transparent', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                ✕ Clear
              </button>
            )}
            <button onClick={exportTimeline} className="mono btn-secondary"
              style={{ fontSize: '0.7rem', padding: '2px 8px', whiteSpace: 'nowrap' }}>
              [Export ↓]
            </button>
          </div>

          <div className="timeline-feed">
            {filteredTimeline.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '2rem' }}>
                <p>{timeline.length === 0 ? `Session "${currentSession}" is empty. Start your recon!` : 'No events match the current filter.'}</p>
              </div>
            )}

            {filteredTimeline.map((event, idx) => {
              const outputLines = (event.output || '').split('\n');
              const isLong = outputLines.length > 10;
              const isExpanded = expandedOutputs.has(event.id);
              const visibleOutput = isExpanded ? event.output : outputLines.slice(0, 10).join('\n');
              const tags = (() => { try { return JSON.parse(event.tags || '[]'); } catch { return []; } })();

              return (
                <div key={event.id || idx} className="timeline-event">
                  <div className="event-header">
                    <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </span>
                    <span className={`badge badge-${event.type === 'note' ? 'note' : (event.type === 'screenshot' ? 'screenshot' : event.status)}`}>
                      {(event.type || 'EVENT').toUpperCase()}
                    </span>
                    {tags.length > 0 && tags.map(t => (
                      <span key={t} style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: '10px', background: 'rgba(88,166,255,0.12)', color: 'var(--accent-secondary)', border: '1px solid rgba(88,166,255,0.2)' }}>#{t}</span>
                    ))}
                    <button
                      onClick={() => deleteEvent(event.id)}
                      title="Delete event"
                      className="mono"
                      style={{ marginLeft: 'auto', fontSize: '0.7rem', padding: '1px 6px', borderRadius: '4px', border: '1px solid rgba(248,81,73,0.3)', color: 'rgba(248,81,73,0.6)', background: 'transparent', cursor: 'pointer', lineHeight: 1.4 }}
                    >✕</button>
                  </div>

                  {event.type === 'command' && (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div className="event-command" style={{ flex: 1 }}><span style={{ color: 'var(--accent-primary)' }}>$</span> {event.command}</div>
                        {(event.status === 'failed' || event.status === 'error') && (
                          <button onClick={() => { setInputType('command'); setInputVal(event.command); inputRef.current?.focus(); }}
                            className="mono" style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--accent-warning)', color: 'var(--accent-warning)', background: 'transparent', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            ↩ Retry
                          </button>
                        )}
                      </div>
                      {event.status !== 'running' && event.status !== 'queued' && event.output && (
                        <>
                          <pre className="event-output mono">{visibleOutput || 'No output.'}</pre>
                          {isLong && (
                            <button onClick={() => toggleOutput(event.id)} className="mono"
                              style={{ fontSize: '0.72rem', background: 'transparent', border: 'none', color: 'var(--accent-secondary)', cursor: 'pointer', padding: '2px 0', display: 'block' }}>
                              {isExpanded ? `▲ Collapse` : `▼ Show more (${outputLines.length - 10} more lines)`}
                            </button>
                          )}
                        </>
                      )}
                      {event.status !== 'running' && event.status !== 'queued' && !event.output && (
                        <pre className="event-output mono">No output.</pre>
                      )}
                      {(event.status === 'running' || event.status === 'queued') && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-warning)', fontSize: '0.85rem' }}>
                          <span className="loader"></span> Processing...
                        </div>
                      )}
                    </>
                  )}

                  {event.type === 'note' && <div className="event-note">{event.content}</div>}

                  {event.type === 'screenshot' && (
                    <div className="event-screenshot">
                      <a href={`/api/media/${currentSession}/${event.filename}`} target="_blank" rel="noopener noreferrer">
                        <img
                          src={`/api/media/${currentSession}/${event.filename}`}
                          alt={event.name}
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
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* ── Input area ────────────────────────────────────────────────── */}
          <form className="input-area" onSubmit={handleSubmit}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.4rem' }}>
              <select value={inputType} onChange={(e) => setInputType(e.target.value)} style={{ width: '120px' }}>
                <option value="command">Command</option>
                <option value="note">Note</option>
              </select>
              {inputType === 'command' && (
                <select value={cmdTimeout} onChange={(e) => setCmdTimeout(Number(e.target.value))}
                  title="Command timeout"
                  style={{ fontSize: '0.75rem', padding: '2px 4px', background: 'rgba(1,4,9,0.6)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', borderRadius: '4px', width: '80px' }}>
                  <option value={30}>30s</option>
                  <option value={60}>1 min</option>
                  <option value={120}>2 min</option>
                  <option value={300}>5 min</option>
                  <option value={600}>10 min</option>
                </select>
              )}
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flex: 1, minWidth: 0 }}>
                <input
                  type="text" value={inputTags} onChange={(e) => setInputTags(e.target.value)}
                  list="suggested-tags"
                  placeholder="tags (comma-separated)" className="mono"
                  style={{ fontSize: '0.75rem', padding: '4px 8px', background: 'rgba(1,4,9,0.6)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', borderRadius: '4px', width: '180px', outline: 'none' }}
                />
                <datalist id="suggested-tags">
                  {SUGGESTED_TAGS.map(t => <option key={t} value={t} />)}
                </datalist>
                <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} accept="image/*" />
                <button type="button" className="upload-btn mono" onClick={() => fileInputRef.current?.click()}>
                  [+] Screenshot
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                ref={inputRef}
                type="text"
                className="mono flex-grow"
                value={inputVal}
                onChange={(e) => { setInputVal(e.target.value); setHistoryIdx(-1); }}
                onKeyDown={handleKeyDown}
                placeholder={inputType === 'command' ? '$ Enter command... (↑↓ history)' : 'Type a note...'}
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
        .container { max-width: 1400px; margin: 0 auto; padding: 1.5rem 1rem; height: 100vh; display: flex; flex-direction: column; gap: 0; }
        .header { padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; }
        .header h1 { font-size: 1.5rem; letter-spacing: -0.5px; text-transform: uppercase; }
        .layout { display: flex; flex-grow: 1; gap: 1.5rem; min-height: 0; margin-top: 1.5rem; }
        .sidebar { width: 280px; padding: 1.5rem; display: flex; flex-direction: column; overflow-y: auto; }
        .group-container { margin-bottom: 1rem; }
        .group-header { background: rgba(48, 54, 61, 0.4); padding: 0.5rem; border-radius: 4px; cursor: pointer; font-size: 0.85rem; font-weight: bold; color: var(--accent-secondary); margin-bottom: 0.5rem; transition: background 0.2s; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .group-header:hover { background: rgba(48, 54, 61, 0.7); }
        .suggestion-list { list-style: none; padding-left: 0.5rem; }
        .btn-suggestion { width: 100%; text-align: left; background: transparent; color: var(--text-muted); font-size: 0.8rem; padding: 0.4rem 0.5rem; border-radius: 4px; border: 1px solid transparent; transition: all 0.2s; }
        .btn-suggestion:hover { background: rgba(57, 211, 83, 0.05); border-color: rgba(57, 211, 83, 0.3); color: var(--accent-primary); }
        .timeline-container { flex-grow: 1; min-width: 0; display: flex; flex-direction: column; padding: 1.5rem; position: relative; overflow-x: hidden; }
        .timeline-feed { flex-grow: 1; overflow-y: auto; overflow-x: hidden; padding-right: 1rem; margin-bottom: 1rem; display: flex; flex-direction: column; gap: 1rem; }
        .timeline-event { background: rgba(1, 4, 9, 0.4); border: 1px solid var(--border-color); border-radius: 8px; padding: 1rem; }
        .event-command { font-family: var(--font-mono); font-size: 1rem; margin-bottom: 0.5rem; color: #fff; }
        .event-output { background: rgba(1, 4, 9, 0.8); padding: 1rem; border-radius: 6px; font-size: 0.85rem; max-height: 300px; overflow-y: auto; border-left: 2px solid var(--accent-primary); white-space: pre-wrap; word-break: break-all; margin-bottom: 2px; }
        .event-note { font-size: 1.05rem; padding: 0.5rem 1rem; border-left: 3px solid var(--accent-secondary); background: rgba(88, 166, 255, 0.05); }
        .loader { width: 12px; height: 12px; border: 2px solid var(--accent-warning); border-bottom-color: transparent; border-radius: 50%; display: inline-block; animation: rotation 1s linear infinite; }
        @keyframes rotation { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .input-area { background: rgba(1, 4, 9, 0.6); padding: 1rem; border-radius: 8px; border: 1px solid var(--border-color); }
        .flex-grow { flex-grow: 1; }
        .tab-switcher span { transition: all 0.2s; }
        .tab-switcher span:hover { filter: brightness(1.2); }
        .flag-btn { border: 1px solid var(--border-color); background: rgba(1,4,9,0.3); color: var(--text-main); font-size: 0.75rem; padding: 0.2rem 0.4rem; border-radius: 4px; transition: all 0.2s; }
        .flag-btn:hover { background: var(--accent-secondary); color: #fff; border-color: var(--accent-secondary); box-shadow: 0 0 8px rgba(88,166,255,0.3); }
        .animate-fade { animation: fadeIn 0.3s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        .event-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; flex-wrap: wrap; }
      `}</style>
    </main>
  );
}
