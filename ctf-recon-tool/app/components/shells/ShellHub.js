'use client';

import { useCallback, useRef, useState } from 'react';
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

function formatTimestamp(value) {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleString();
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
  onCreateTranscriptArtifact,
}) {
  const [mode, setMode] = useState('reverse');
  const [reverseDraft, setReverseDraft] = useState(EMPTY_REVERSE);
  const [webshellDraft, setWebshellDraft] = useState(EMPTY_WEBSHELL);
  const [inputValue, setInputValue] = useState('');
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
    await onCreateTranscriptArtifact?.({
      shellSessionId: activeShell.id,
      filename: `${activeShell.label || activeShell.id}-selection.txt`,
      content: transcript,
      notes: 'Saved from shell terminal selection',
    });
  };

  const saveLatestOutput = async (chunk = latestOutputChunk) => {
    if (!activeShell || !chunk?.content) return;
    await onCreateTranscriptArtifact?.({
      shellSessionId: activeShell.id,
      sourceTranscriptChunkId: chunk.id,
      filename: `${activeShell.label || activeShell.id}-chunk-${chunk.seq}.txt`,
      notes: `Saved from transcript chunk ${chunk.seq}`,
    });
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
              <textarea className="mono" value={webshellDraft.webshellBodyTemplate} onChange={(event) => setWebshellDraft((prev) => ({ ...prev, webshellBodyTemplate: event.target.value }))} placeholder='Optional body template. Use {{command}}.' style={{ ...fieldStyle, minHeight: '68px', resize: 'vertical' }} />
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
              No shell sessions yet. Create a reverse listener or configure a webshell on the left.
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
        <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) 320px', gap: '0.8rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', minHeight: 0 }}>
            <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn-secondary mono" onClick={saveSelection} style={{ fontSize: '0.74rem', padding: '3px 9px' }}>
                Save Selection
              </button>
              <button type="button" className="btn-secondary mono" onClick={() => saveLatestOutput()} disabled={!latestOutputChunk} style={{ fontSize: '0.74rem', padding: '3px 9px' }}>
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
                placeholder={activeShell.type === 'webshell' ? 'Send command to webshell…' : 'Send command to connected reverse shell…'}
                style={{ ...fieldStyle, minHeight: '72px', resize: 'vertical' }}
              />
              <button type="button" className="btn-primary mono" onClick={submitInput} disabled={Boolean(busyByShell[activeShell.id]) || !inputValue.trim()} style={{ fontSize: '0.82rem', padding: '0.55rem 0.9rem', alignSelf: 'stretch' }}>
                Send
              </button>
            </div>
          </div>

          <div style={{ border: '1px solid rgba(88,166,255,0.18)', borderRadius: '10px', background: 'rgba(1,4,9,0.34)', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.55rem', overflowY: 'auto' }}>
            <div className="mono" style={{ fontSize: '0.76rem', color: 'var(--accent-secondary)' }}>
              Transcript Chunks
            </div>
            {transcriptChunks.length === 0 ? (
              <span className="mono" style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>
                No transcript yet.
              </span>
            ) : (
              [...transcriptChunks].reverse().slice(0, 20).map((chunk) => (
                <div key={chunk.id} style={{ border: '1px solid rgba(88,166,255,0.12)', borderRadius: '8px', padding: '0.5rem', background: 'rgba(8,17,29,0.72)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem', marginBottom: '0.3rem' }}>
                    <span className="mono" style={{ fontSize: '0.68rem', color: chunk.direction === 'input' ? 'var(--accent-warning)' : 'var(--accent-secondary)' }}>
                      {chunk.direction.toUpperCase()} #{chunk.seq}
                    </span>
                    <button type="button" className="btn-secondary mono" onClick={() => saveLatestOutput(chunk)} style={{ fontSize: '0.66rem', padding: '2px 7px' }}>
                      Save
                    </button>
                  </div>
                  <pre className="mono" style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.7rem', color: 'var(--text-main)', maxHeight: '140px', overflow: 'auto' }}>
                    {chunk.content}
                  </pre>
                </div>
              ))
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
