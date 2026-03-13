'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ShellTabs from '@/components/shells/ShellTabs';
import ShellTerminal from '@/components/shells/ShellTerminal';

const EMPTY_REVERSE = {
  label: '',
  bindHost: '127.0.0.1',
  bindPort: '',
  notes: '',
};

const EMPTY_WEBSHELL = {
  label: '',
  webshellUrl: '',
  webshellMethod: 'POST',
  webshellCommandField: 'cmd',
  webshellBodyTemplate: '',
  notes: '',
};

const EMPTY_BIND = {
  label: '',
  remoteHost: '',
  remotePort: '',
  notes: '',
};

function formatTimestamp(value) {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleString();
}

function formatDiffLine(change) {
  if (!change) return '  ';
  if (change.type === 'add') return '+ ';
  if (change.type === 'remove') return '- ';
  return '  ';
}

function diffColor(change) {
  if (!change) return 'var(--text-main)';
  if (change.type === 'add') return '#3fb950';
  if (change.type === 'remove') return '#f85149';
  return 'var(--text-main)';
}

export default function ShellHub({
  shellSessions = [],
  activeShell = null,
  activeShellId = null,
  transcriptsByShell = {},
  unreadByShell = {},
  loading = false,
  creating = false,
  busyByShell = {},
  error = '',
  streamStatus = 'idle',
  onSelectShell,
  onCreateShellSession,
  onSendInput,
  onResizeShell,
  onDisconnectShell,
  onClearLocalShell,
  onSearchTranscript,
  onDiffTranscriptChunks,
  onCreateShellArtifact,
}) {
  const [mode, setMode] = useState('reverse');
  const [reverseDraft, setReverseDraft] = useState(EMPTY_REVERSE);
  const [webshellDraft, setWebshellDraft] = useState(EMPTY_WEBSHELL);
  const [bindDraft, setBindDraft] = useState(EMPTY_BIND);
  const [inputValue, setInputValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchDirection, setSearchDirection] = useState('all');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selectedChunkIds, setSelectedChunkIds] = useState([]);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffResult, setDiffResult] = useState(null);
  const [diffError, setDiffError] = useState('');
  const terminalApiRef = useRef(null);

  const registerTerminalApi = useCallback((api) => {
    terminalApiRef.current = api;
  }, []);

  const handleTerminalResize = useCallback((dims) => {
    if (!activeShellId) return;
    void onResizeShell?.(activeShellId, dims);
  }, [activeShellId, onResizeShell]);

  const transcriptChunks = activeShellId ? (transcriptsByShell[activeShellId] || []) : [];
  const latestOutputChunk = [...transcriptChunks].reverse().find((chunk) => chunk.direction !== 'input') || null;
  const visibleChunks = searchPerformed && searchQuery.trim()
    ? searchResults
    : [...transcriptChunks].reverse().slice(0, 20);

  const resolveChunkById = (chunkId) => {
    if (!chunkId) return null;
    return transcriptChunks.find((chunk) => chunk.id === chunkId)
      || searchResults.find((chunk) => chunk.id === chunkId)
      || null;
  };

  useEffect(() => {
    setSearchQuery('');
    setSearchDirection('all');
    setSearchResults([]);
    setSearching(false);
    setSearchPerformed(false);
    setSearchError('');
    setSelectedChunkIds([]);
    setDiffLoading(false);
    setDiffResult(null);
    setDiffError('');
  }, [activeShellId]);

  const createReverse = async () => {
    const shellSession = await onCreateShellSession?.({
      type: 'reverse',
      label: reverseDraft.label,
      bindHost: reverseDraft.bindHost,
      bindPort: reverseDraft.bindPort || undefined,
      notes: reverseDraft.notes,
    });
    if (shellSession?.id) {
      setReverseDraft(EMPTY_REVERSE);
    }
  };

  const createWebshell = async () => {
    const shellSession = await onCreateShellSession?.({
      type: 'webshell',
      label: webshellDraft.label,
      webshellUrl: webshellDraft.webshellUrl,
      webshellMethod: webshellDraft.webshellMethod,
      webshellCommandField: webshellDraft.webshellCommandField,
      webshellBodyTemplate: webshellDraft.webshellBodyTemplate,
      notes: webshellDraft.notes,
    });
    if (shellSession?.id) {
      setWebshellDraft(EMPTY_WEBSHELL);
    }
  };

  const createBind = async () => {
    const shellSession = await onCreateShellSession?.({
      type: 'bind',
      label: bindDraft.label,
      remoteHost: bindDraft.remoteHost,
      remotePort: bindDraft.remotePort || undefined,
      notes: bindDraft.notes,
    });
    if (shellSession?.id) {
      setBindDraft(EMPTY_BIND);
    }
  };

  const submitInput = async () => {
    if (!activeShellId || !inputValue.trim()) return;
    await onSendInput?.(activeShellId, inputValue);
    setInputValue('');
  };

  const saveSelection = async () => {
    if (!activeShell) return;
    const selection = terminalApiRef.current?.getSelection?.() || '';
    const transcript = selection.trim() || terminalApiRef.current?.getTranscript?.() || '';
    if (!transcript.trim()) return;
    await onCreateShellArtifact?.({
      shellSessionId: activeShell.id,
      filename: `${activeShell.label || activeShell.id}-selection.txt`,
      content: transcript,
      notes: 'Saved from shell terminal selection',
    });
  };

  const saveChunkArtifact = async (chunk = latestOutputChunk) => {
    if (!activeShell || !chunk?.content) return;
    await onCreateShellArtifact?.({
      shellSessionId: activeShell.id,
      sourceTranscriptChunkId: chunk.id,
      filename: `${activeShell.label || activeShell.id}-chunk-${chunk.seq}.txt`,
      notes: `Saved from transcript chunk ${chunk.seq}`,
    });
  };

  const toggleChunkSelection = useCallback((chunkId) => {
    setSelectedChunkIds((current) => (
      current.includes(chunkId)
        ? current.filter((value) => value !== chunkId)
        : [...current, chunkId]
    ));
  }, []);

  const runTranscriptSearch = async () => {
    if (!activeShellId || !searchQuery.trim()) {
      setSearchResults([]);
      setSearchPerformed(false);
      setSearchError('');
      return;
    }
    setSearching(true);
    setSearchError('');
    try {
      const results = await onSearchTranscript?.(activeShellId, {
        query: searchQuery,
        direction: searchDirection,
      });
      setSearchResults(Array.isArray(results) ? results : []);
      setSearchPerformed(true);
    } catch (nextError) {
      setSearchResults([]);
      setSearchPerformed(true);
      setSearchError(nextError?.message || 'Failed to search transcript.');
    } finally {
      setSearching(false);
    }
  };

  const resetTranscriptSearch = () => {
    setSearchQuery('');
    setSearchDirection('all');
    setSearchResults([]);
    setSearchPerformed(false);
    setSearchError('');
  };

  const saveSelectedChunks = async () => {
    if (!activeShell || selectedChunkIds.length === 0) return;
    const selectedChunks = selectedChunkIds
      .map((chunkId) => resolveChunkById(chunkId))
      .filter(Boolean)
      .sort((left, right) => Number(left.seq || 0) - Number(right.seq || 0));
    for (const chunk of selectedChunks) {
      await onCreateShellArtifact?.({
        shellSessionId: activeShell.id,
        sourceTranscriptChunkId: chunk.id,
        filename: `${activeShell.label || activeShell.id}-chunk-${chunk.seq}.txt`,
        notes: `Bulk-saved from transcript chunk ${chunk.seq}`,
      });
    }
    setSelectedChunkIds([]);
  };

  const compareSelectedChunks = async () => {
    if (!activeShellId || selectedChunkIds.length !== 2) return;
    setDiffLoading(true);
    setDiffError('');
    try {
      const result = await onDiffTranscriptChunks?.(activeShellId, {
        leftChunkId: selectedChunkIds[0],
        rightChunkId: selectedChunkIds[1],
      });
      setDiffResult(result || null);
    } catch (nextError) {
      setDiffResult(null);
      setDiffError(nextError?.message || 'Failed to diff transcript chunks.');
    } finally {
      setDiffLoading(false);
    }
  };

  return (
    <div className="animate-fade" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) minmax(0, 1fr)', gap: '0.8rem', alignItems: 'start' }}>
        <div style={{ border: '1px solid rgba(88,166,255,0.18)', borderRadius: '10px', background: 'rgba(1,4,9,0.38)', padding: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.55rem' }}>
            <div className="mono" style={{ color: 'var(--accent-secondary)', fontSize: '0.86rem' }}>Shell Hub</div>
            <span className="mono" style={{ fontSize: '0.72rem', color: streamStatus === 'connected' ? '#3fb950' : 'var(--text-muted)' }}>
              stream {streamStatus}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.6rem' }}>
            <button type="button" className="btn-secondary mono" onClick={() => setMode('reverse')} style={{ fontSize: '0.74rem', padding: '3px 8px', borderColor: mode === 'reverse' ? 'var(--accent-secondary)' : undefined, color: mode === 'reverse' ? 'var(--accent-secondary)' : undefined }}>
              Reverse
            </button>
            <button type="button" className="btn-secondary mono" onClick={() => setMode('bind')} style={{ fontSize: '0.74rem', padding: '3px 8px', borderColor: mode === 'bind' ? 'var(--accent-secondary)' : undefined, color: mode === 'bind' ? 'var(--accent-secondary)' : undefined }}>
              Bind
            </button>
            <button type="button" className="btn-secondary mono" onClick={() => setMode('webshell')} style={{ fontSize: '0.74rem', padding: '3px 8px', borderColor: mode === 'webshell' ? 'var(--accent-secondary)' : undefined, color: mode === 'webshell' ? 'var(--accent-secondary)' : undefined }}>
              Webshell
            </button>
          </div>

          {mode === 'reverse' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <input className="mono" value={reverseDraft.label} onChange={(event) => setReverseDraft((prev) => ({ ...prev, label: event.target.value }))} placeholder="Label" style={fieldStyle} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '0.4rem' }}>
                <input className="mono" value={reverseDraft.bindHost} onChange={(event) => setReverseDraft((prev) => ({ ...prev, bindHost: event.target.value }))} placeholder="Bind host" style={fieldStyle} />
                <input className="mono" value={reverseDraft.bindPort} onChange={(event) => setReverseDraft((prev) => ({ ...prev, bindPort: event.target.value }))} placeholder="Port" style={fieldStyle} />
              </div>
              <textarea className="mono" value={reverseDraft.notes} onChange={(event) => setReverseDraft((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Notes" style={{ ...fieldStyle, minHeight: '58px', resize: 'vertical' }} />
              <button type="button" className="btn-secondary mono" onClick={createReverse} disabled={creating} style={{ fontSize: '0.76rem', padding: '5px 10px' }}>
                {creating ? 'Creating…' : 'Create Reverse Listener'}
              </button>
            </div>
          ) : mode === 'bind' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <input className="mono" value={bindDraft.label} onChange={(event) => setBindDraft((prev) => ({ ...prev, label: event.target.value }))} placeholder="Label" style={fieldStyle} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '0.4rem' }}>
                <input className="mono" value={bindDraft.remoteHost} onChange={(event) => setBindDraft((prev) => ({ ...prev, remoteHost: event.target.value }))} placeholder="Remote host" style={fieldStyle} />
                <input className="mono" value={bindDraft.remotePort} onChange={(event) => setBindDraft((prev) => ({ ...prev, remotePort: event.target.value }))} placeholder="Port" style={fieldStyle} />
              </div>
              <textarea className="mono" value={bindDraft.notes} onChange={(event) => setBindDraft((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Notes" style={{ ...fieldStyle, minHeight: '58px', resize: 'vertical' }} />
              <button type="button" className="btn-secondary mono" onClick={createBind} disabled={creating || !bindDraft.remoteHost.trim() || !bindDraft.remotePort.trim()} style={{ fontSize: '0.76rem', padding: '5px 10px' }}>
                {creating ? 'Creating…' : 'Connect Bind Shell'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <input className="mono" value={webshellDraft.label} onChange={(event) => setWebshellDraft((prev) => ({ ...prev, label: event.target.value }))} placeholder="Label" style={fieldStyle} />
              <input className="mono" value={webshellDraft.webshellUrl} onChange={(event) => setWebshellDraft((prev) => ({ ...prev, webshellUrl: event.target.value }))} placeholder="Webshell URL" style={fieldStyle} />
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.4rem' }}>
                <select value={webshellDraft.webshellMethod} onChange={(event) => setWebshellDraft((prev) => ({ ...prev, webshellMethod: event.target.value }))} style={fieldStyle}>
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                </select>
                <input className="mono" value={webshellDraft.webshellCommandField} onChange={(event) => setWebshellDraft((prev) => ({ ...prev, webshellCommandField: event.target.value }))} placeholder="Command field" style={fieldStyle} />
              </div>
              <textarea className="mono" value={webshellDraft.webshellBodyTemplate} onChange={(event) => setWebshellDraft((prev) => ({ ...prev, webshellBodyTemplate: event.target.value }))} placeholder="Optional body template. Use {{command}}." style={{ ...fieldStyle, minHeight: '68px', resize: 'vertical' }} />
              <textarea className="mono" value={webshellDraft.notes} onChange={(event) => setWebshellDraft((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Notes" style={{ ...fieldStyle, minHeight: '58px', resize: 'vertical' }} />
              <button type="button" className="btn-secondary mono" onClick={createWebshell} disabled={creating || !webshellDraft.webshellUrl.trim()} style={{ fontSize: '0.76rem', padding: '5px 10px' }}>
                {creating ? 'Creating…' : 'Create Webshell Session'}
              </button>
            </div>
          )}

          {error && (
            <div className="mono" style={{ marginTop: '0.6rem', fontSize: '0.72rem', color: 'var(--accent-danger)' }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ border: '1px solid rgba(88,166,255,0.18)', borderRadius: '10px', background: 'rgba(1,4,9,0.34)', padding: '0.75rem', minHeight: '100%' }}>
          <ShellTabs
            shellSessions={shellSessions}
            activeShellId={activeShellId}
            unreadByShell={unreadByShell}
            onSelect={onSelectShell}
          />
          {loading && shellSessions.length === 0 && (
            <div className="mono" style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Loading shell sessions…</div>
          )}
          {!loading && shellSessions.length === 0 && (
            <div className="mono" style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
              No shell sessions yet. Create a reverse listener, bind shell, or configure a webshell on the left.
            </div>
          )}
          {activeShell && (
            <div style={{ marginTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="mono" style={{ fontSize: '0.74rem', color: 'var(--accent-secondary)' }}>{activeShell.label}</span>
                <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{activeShell.type}</span>
                <span className="mono" style={{ fontSize: '0.72rem', color: activeShell.status === 'connected' ? '#3fb950' : 'var(--text-muted)' }}>{activeShell.status}</span>
                {activeShell.bindPort && (
                  <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    bind {activeShell.bindHost || '127.0.0.1'}:{activeShell.bindPort}
                  </span>
                )}
                {activeShell.remoteHost && (
                  <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    remote {activeShell.remoteHost}{activeShell.remotePort ? `:${activeShell.remotePort}` : ''}
                  </span>
                )}
                <span className="mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                  last {formatTimestamp(activeShell.lastActivityAt || activeShell.updatedAt) || 'n/a'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {activeShell && (
        <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) 360px', gap: '0.8rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', minHeight: 0 }}>
            <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn-secondary mono" onClick={saveSelection} style={{ fontSize: '0.74rem', padding: '3px 9px' }}>
                Save Selection
              </button>
              <button type="button" className="btn-secondary mono" onClick={() => saveChunkArtifact()} disabled={!latestOutputChunk} style={{ fontSize: '0.74rem', padding: '3px 9px' }}>
                Save Latest Output
              </button>
              <button type="button" className="btn-secondary mono" onClick={() => onClearLocalShell?.(activeShell.id)} style={{ fontSize: '0.74rem', padding: '3px 9px' }}>
                Clear Local Tab
              </button>
              <button type="button" className="btn-secondary mono" onClick={() => onDisconnectShell?.(activeShell.id)} disabled={Boolean(busyByShell[activeShell.id])} style={{ fontSize: '0.74rem', padding: '3px 9px', color: 'var(--accent-danger)', borderColor: 'rgba(248,81,73,0.4)' }}>
                {busyByShell[activeShell.id] ? 'Working…' : 'Disconnect'}
              </button>
            </div>

            <ShellTerminal
              key={activeShell.id}
              shellSessionId={activeShell.id}
              chunks={transcriptChunks}
              registerTerminalApi={registerTerminalApi}
              onResize={handleTerminalResize}
            />

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '0.45rem' }}>
              <textarea
                className="mono"
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                placeholder={
                  activeShell.type === 'webshell'
                    ? 'Send command to webshell…'
                    : activeShell.type === 'bind'
                      ? 'Send command to connected bind shell…'
                      : 'Send command to connected reverse shell…'
                }
                style={{ ...fieldStyle, minHeight: '72px', resize: 'vertical' }}
              />
              <button type="button" className="btn-primary mono" onClick={submitInput} disabled={Boolean(busyByShell[activeShell.id]) || !inputValue.trim()} style={{ fontSize: '0.82rem', padding: '0.55rem 0.9rem', alignSelf: 'stretch' }}>
                Send
              </button>
            </div>
          </div>

          <div style={{ border: '1px solid rgba(88,166,255,0.18)', borderRadius: '10px', background: 'rgba(1,4,9,0.34)', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.55rem', overflowY: 'auto' }}>
            <div className="mono" style={{ fontSize: '0.76rem', color: 'var(--accent-secondary)' }}>
              Transcript Evidence
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 92px', gap: '0.45rem' }}>
              <input
                className="mono"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void runTranscriptSearch();
                  }
                }}
                placeholder="Search transcript..."
                style={fieldStyle}
              />
              <select value={searchDirection} onChange={(event) => setSearchDirection(event.target.value)} style={fieldStyle}>
                <option value="all">All</option>
                <option value="output">Output</option>
                <option value="input">Input</option>
                <option value="status">Status</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn-secondary mono" onClick={() => void runTranscriptSearch()} disabled={searching || !searchQuery.trim()} style={{ fontSize: '0.7rem', padding: '3px 8px' }}>
                {searching ? 'Searching…' : 'Search'}
              </button>
              <button type="button" className="btn-secondary mono" onClick={resetTranscriptSearch} style={{ fontSize: '0.7rem', padding: '3px 8px' }}>
                Reset
              </button>
              <button type="button" className="btn-secondary mono" onClick={() => void saveSelectedChunks()} disabled={selectedChunkIds.length === 0} style={{ fontSize: '0.7rem', padding: '3px 8px' }}>
                Save Selected ({selectedChunkIds.length})
              </button>
              <button type="button" className="btn-secondary mono" onClick={() => void compareSelectedChunks()} disabled={selectedChunkIds.length !== 2 || diffLoading} style={{ fontSize: '0.7rem', padding: '3px 8px' }}>
                {diffLoading ? 'Comparing…' : 'Compare Selected'}
              </button>
            </div>

            {searchError && (
              <div className="mono" style={{ fontSize: '0.7rem', color: 'var(--accent-danger)' }}>
                {searchError}
              </div>
            )}
            {diffError && (
              <div className="mono" style={{ fontSize: '0.7rem', color: 'var(--accent-danger)' }}>
                {diffError}
              </div>
            )}

            {visibleChunks.length === 0 ? (
              <span className="mono" style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>
                {searchPerformed && searchQuery.trim() ? 'No matching transcript chunks.' : 'No transcript yet.'}
              </span>
            ) : (
              visibleChunks.map((chunk) => {
                const selected = selectedChunkIds.includes(chunk.id);
                return (
                  <div key={chunk.id} style={{ border: '1px solid rgba(88,166,255,0.12)', borderRadius: '8px', padding: '0.5rem', background: selected ? 'rgba(16, 44, 80, 0.52)' : 'rgba(8,17,29,0.72)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem', marginBottom: '0.3rem' }}>
                      <label className="mono" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.68rem', color: chunk.direction === 'input' ? 'var(--accent-warning)' : 'var(--accent-secondary)' }}>
                        <input type="checkbox" checked={selected} onChange={() => toggleChunkSelection(chunk.id)} />
                        {chunk.direction.toUpperCase()} #{chunk.seq}
                      </label>
                      <button type="button" className="btn-secondary mono" onClick={() => void saveChunkArtifact(chunk)} style={{ fontSize: '0.66rem', padding: '2px 7px' }}>
                        Save
                      </button>
                    </div>
                    <div className="mono" style={{ marginBottom: '0.25rem', fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                      {formatTimestamp(chunk.createdAt) || 'timestamp unavailable'}
                    </div>
                    <pre className="mono" style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.7rem', color: 'var(--text-main)', maxHeight: '140px', overflow: 'auto' }}>
                      {chunk.content}
                    </pre>
                  </div>
                );
              })
            )}

            {diffResult && (
              <div style={{ borderTop: '1px solid rgba(88,166,255,0.14)', paddingTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                <div className="mono" style={{ fontSize: '0.74rem', color: 'var(--accent-secondary)' }}>
                  Diff Preview
                </div>
                <div className="mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                  left #{diffResult?.leftChunk?.seq || '?'} vs right #{diffResult?.rightChunk?.seq || '?'} · +{diffResult?.summary?.additions || 0} / -{diffResult?.summary?.removals || 0}
                </div>
                <div style={{ border: '1px solid rgba(88,166,255,0.12)', borderRadius: '8px', background: 'rgba(8,17,29,0.72)', maxHeight: '260px', overflow: 'auto', padding: '0.45rem' }}>
                  {(diffResult?.changes || []).map((change, index) => (
                    <pre key={`${change.type}-${index}`} className="mono" style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.68rem', color: diffColor(change) }}>
                      {formatDiffLine(change)}{change.line}
                    </pre>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const fieldStyle = {
  width: '100%',
  fontSize: '0.74rem',
  padding: '6px 8px',
  background: 'rgba(1,4,9,0.6)',
  border: '1px solid var(--border-color)',
  borderRadius: '6px',
  color: 'var(--text-main)',
};
