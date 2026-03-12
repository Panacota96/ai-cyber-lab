'use client';

import { useEffect, useState } from 'react';

function toCsv(values) {
  return Array.isArray(values) ? values.join(', ') : '';
}

function parseCsv(value, { numeric = false } = {}) {
  const parts = String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (!numeric) return parts;
  return parts
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0)
    .map((item) => Math.floor(item));
}

function toEditShape(credential) {
  return {
    label: credential.label || '',
    username: credential.username || '',
    secret: credential.secret || '',
    hash: credential.hash || '',
    hashType: credential.hashType || '',
    host: credential.host || '',
    port: credential.port ?? '',
    service: credential.service || '',
    notes: credential.notes || '',
    findingIdsCsv: toCsv(credential.findingIds),
    graphNodeIdsCsv: toCsv(credential.graphNodeIds),
  };
}

const EMPTY_DRAFT = {
  label: '',
  username: '',
  secret: '',
  hash: '',
  hashType: '',
  host: '',
  port: '',
  service: '',
  notes: '',
  findingIdsCsv: '',
  graphNodeIdsCsv: '',
};

function formatDateTime(value) {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleString();
}

function formatConfidence(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return '0%';
  return `${Math.round(numeric * 100)}%`;
}

function getVerificationTone(status = '') {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'matched') {
    return {
      color: '#3fb950',
      background: 'rgba(63,185,80,0.12)',
      border: 'rgba(63,185,80,0.3)',
    };
  }
  if (normalized === 'running' || normalized === 'pending') {
    return {
      color: 'var(--accent-warning)',
      background: 'rgba(210,153,34,0.12)',
      border: 'rgba(210,153,34,0.3)',
    };
  }
  if (normalized === 'advisory') {
    return {
      color: 'var(--accent-secondary)',
      background: 'rgba(88,166,255,0.12)',
      border: 'rgba(88,166,255,0.3)',
    };
  }
  return {
    color: 'var(--accent-danger)',
    background: 'rgba(248,81,73,0.12)',
    border: 'rgba(248,81,73,0.3)',
  };
}

function VerificationHistory({ entries = [] }) {
  if (entries.length === 0) {
    return (
      <div className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
        No verification runs recorded yet.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.5rem' }}>
      {entries.slice(0, 4).map((entry) => {
        const tone = getVerificationTone(entry.status);
        return (
          <div key={entry.id} style={{ border: `1px solid ${tone.border}`, borderRadius: '6px', padding: '0.4rem', background: tone.background }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.2rem' }}>
              <span className="mono" style={{ fontSize: '0.68rem', color: tone.color }}>
                {(entry.status || 'pending').toUpperCase()}
              </span>
              <span className="mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                {entry.targetService || 'service'} @ {entry.targetHost || 'host'}{entry.targetPort ? `:${entry.targetPort}` : ''}
              </span>
              {entry.mode && (
                <span className="mono" style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>
                  {entry.mode}
                </span>
              )}
            </div>
            {entry.summary && (
              <div className="mono" style={{ fontSize: '0.7rem', color: 'var(--text-main)', lineHeight: 1.45 }}>
                {entry.summary}
              </div>
            )}
            {entry.advisoryCommand && (
              <pre className="mono" style={{ margin: '0.35rem 0 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.68rem', color: 'var(--text-muted)', background: 'rgba(1,4,9,0.55)', borderRadius: '4px', padding: '0.35rem' }}>
                {entry.advisoryCommand}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}

function HashAnalysisSummary({ analysis, onInsertCommand }) {
  if (!analysis) return null;

  const bestCandidate = analysis.bestCandidate || null;
  const candidates = Array.isArray(analysis.candidates) ? analysis.candidates : [];

  return (
    <div style={{ marginTop: '0.55rem', border: '1px solid rgba(240,136,62,0.22)', borderRadius: '7px', padding: '0.5rem', background: 'rgba(35,18,5,0.28)' }}>
      <div className="mono" style={{ fontSize: '0.68rem', color: 'var(--accent-warning)', marginBottom: '0.25rem' }}>
        Hash Identification
      </div>
      <div className="mono" style={{ fontSize: '0.7rem', color: 'var(--text-main)', lineHeight: 1.45 }}>
        {analysis.summary || 'No confident fingerprint detected.'}
      </div>

      {bestCandidate && (
        <div style={{ marginTop: '0.45rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--accent-secondary)' }}>
              {bestCandidate.label}
            </span>
            <span className="mono" style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>
              {formatConfidence(bestCandidate.confidence)}
            </span>
            {bestCandidate.family && (
              <span className="mono" style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>
                {bestCandidate.family}
              </span>
            )}
          </div>
          {bestCandidate.description && (
            <div className="mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
              {bestCandidate.description}
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            {bestCandidate.hashcatCommand && (
              <button className="btn-secondary" onClick={() => onInsertCommand?.(bestCandidate.hashcatCommand)} style={{ fontSize: '0.68rem', padding: '2px 8px' }}>
                Insert Hashcat
              </button>
            )}
            {bestCandidate.johnCommand && (
              <button className="btn-secondary" onClick={() => onInsertCommand?.(bestCandidate.johnCommand)} style={{ fontSize: '0.68rem', padding: '2px 8px' }}>
                Insert John
              </button>
            )}
          </div>
        </div>
      )}

      {candidates.length > 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', marginTop: '0.45rem' }}>
          {candidates.slice(1, 4).map((candidate) => (
            <div key={candidate.id} className="mono" style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>
              {candidate.label} · {formatConfidence(candidate.confidence)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CredentialEditor({
  credential,
  verificationHistory = [],
  isVerifying = false,
  hashAnalysis = null,
  isIdentifyingHash = false,
  onUpdate,
  onDelete,
  onVerify,
  onIdentifyHash,
  onInsertCommand,
}) {
  const [edit, setEdit] = useState(() => toEditShape(credential));

  useEffect(() => {
    setEdit(toEditShape(credential));
  }, [credential]);

  const commitUpdate = async (patch = null) => {
    const next = patch ? { ...edit, ...patch } : edit;
    if (patch) {
      setEdit(next);
    }
    await onUpdate?.(credential.id, {
      label: next.label,
      username: next.username,
      secret: next.secret,
      hash: next.hash,
      hashType: next.hashType,
      host: next.host,
      port: next.port,
      service: next.service,
      notes: next.notes,
      findingIds: parseCsv(next.findingIdsCsv, { numeric: true }),
      graphNodeIds: parseCsv(next.graphNodeIdsCsv),
    });
  };

  const verificationLabel = credential.verified
    ? `Verified ${formatDateTime(credential.lastVerifiedAt) || 'recently'}`
    : 'Not verified';
  const latestVerification = verificationHistory[0] || null;
  const verificationTone = latestVerification ? getVerificationTone(latestVerification.status) : null;

  return (
    <div style={{ border: '1px solid rgba(88,166,255,0.14)', borderRadius: '8px', padding: '0.55rem', background: 'rgba(1,4,9,0.38)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '0.45rem' }}>
        <span className="mono" style={{ fontSize: '0.76rem', color: credential.verified ? '#3fb950' : 'var(--text-muted)' }}>
          {verificationLabel}
        </span>
        {verificationTone && (
          <span className="mono" style={{ fontSize: '0.68rem', padding: '2px 7px', borderRadius: '999px', color: verificationTone.color, background: verificationTone.background, border: `1px solid ${verificationTone.border}` }}>
            {(latestVerification.status || 'pending').toUpperCase()}
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem' }}>
        <input className="mono" value={edit.label} onChange={(event) => setEdit((prev) => ({ ...prev, label: event.target.value }))} onBlur={() => void commitUpdate()} placeholder="Label" style={fieldStyle} />
        <input className="mono" value={edit.username} onChange={(event) => setEdit((prev) => ({ ...prev, username: event.target.value }))} onBlur={() => void commitUpdate()} placeholder="Username" style={fieldStyle} />
        <input className="mono" value={edit.secret} onChange={(event) => setEdit((prev) => ({ ...prev, secret: event.target.value }))} onBlur={() => void commitUpdate()} placeholder="Password / secret" style={fieldStyle} />
        <input className="mono" value={edit.hash} onChange={(event) => setEdit((prev) => ({ ...prev, hash: event.target.value }))} onBlur={() => void commitUpdate()} placeholder="Hash" style={fieldStyle} />
        <input className="mono" value={edit.hashType} onChange={(event) => setEdit((prev) => ({ ...prev, hashType: event.target.value }))} onBlur={() => void commitUpdate()} placeholder="Hash type" style={fieldStyle} />
        <input className="mono" value={edit.service} onChange={(event) => setEdit((prev) => ({ ...prev, service: event.target.value }))} onBlur={() => void commitUpdate()} placeholder="Service" style={fieldStyle} />
        <input className="mono" value={edit.host} onChange={(event) => setEdit((prev) => ({ ...prev, host: event.target.value }))} onBlur={() => void commitUpdate()} placeholder="Host" style={fieldStyle} />
        <input className="mono" value={String(edit.port ?? '')} onChange={(event) => setEdit((prev) => ({ ...prev, port: event.target.value }))} onBlur={() => void commitUpdate()} placeholder="Port" style={fieldStyle} />
      </div>
      <textarea className="mono" value={edit.notes} onChange={(event) => setEdit((prev) => ({ ...prev, notes: event.target.value }))} onBlur={() => void commitUpdate()} placeholder="Notes" style={{ ...fieldStyle, width: '100%', minHeight: '48px', marginTop: '0.35rem', resize: 'vertical' }} />
      <input className="mono" value={edit.findingIdsCsv} onChange={(event) => setEdit((prev) => ({ ...prev, findingIdsCsv: event.target.value }))} onBlur={() => void commitUpdate()} placeholder="Finding IDs (comma separated)" style={{ ...fieldStyle, width: '100%', marginTop: '0.35rem' }} />
      <input className="mono" value={edit.graphNodeIdsCsv} onChange={(event) => setEdit((prev) => ({ ...prev, graphNodeIdsCsv: event.target.value }))} onBlur={() => void commitUpdate()} placeholder="Graph node IDs (comma separated)" style={{ ...fieldStyle, width: '100%', marginTop: '0.35rem' }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.45rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          <button className="btn-secondary" onClick={() => onIdentifyHash?.(credential.id)} disabled={isIdentifyingHash || !edit.hash.trim()} style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
            {isIdentifyingHash ? 'Identifying…' : 'Identify Hash'}
          </button>
          <button className="btn-secondary" onClick={() => onVerify?.(credential.id, 'single')} disabled={isVerifying} style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
            {isVerifying ? 'Working…' : 'Verify Target'}
          </button>
          <button className="btn-secondary" onClick={() => onVerify?.(credential.id, 'blast-radius')} disabled={isVerifying} style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
            Blast Radius
          </button>
        </div>
        <button className="btn-secondary" onClick={() => void onDelete?.(credential.id)} style={{ fontSize: '0.7rem', padding: '2px 7px', color: 'var(--accent-danger)', borderColor: 'var(--accent-danger)' }}>
          Delete
        </button>
      </div>

      <HashAnalysisSummary analysis={hashAnalysis} onInsertCommand={onInsertCommand} />
      <VerificationHistory entries={verificationHistory} />
    </div>
  );
}

export default function CredentialsPanel({
  credentials = [],
  findings = [],
  verificationsByCredential = {},
  verificationBusy = {},
  hashAnalysisByCredential = {},
  hashIdentificationBusy = {},
  onCreate,
  onUpdate,
  onDelete,
  onVerify,
  onIdentifyHash,
  onInsertCommand,
}) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);

  const commitCreate = async () => {
    if (!draft.label.trim() && !draft.username.trim() && !draft.secret.trim() && !draft.hash.trim()) {
      return;
    }
    await onCreate?.({
      label: draft.label,
      username: draft.username,
      secret: draft.secret,
      hash: draft.hash,
      hashType: draft.hashType,
      host: draft.host,
      port: draft.port,
      service: draft.service,
      notes: draft.notes,
      findingIds: parseCsv(draft.findingIdsCsv, { numeric: true }),
      graphNodeIds: parseCsv(draft.graphNodeIdsCsv),
    });
    setDraft(EMPTY_DRAFT);
  };

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
      <div style={{ border: '1px solid rgba(88,166,255,0.18)', borderRadius: '8px', padding: '0.65rem', background: 'rgba(9,20,34,0.34)' }}>
        <div className="mono" style={{ color: 'var(--accent-secondary)', marginBottom: '0.5rem', fontSize: '0.84rem' }}>
          Credential Manager
        </div>
        <div className="mono" style={{ color: 'var(--text-muted)', marginBottom: '0.55rem', fontSize: '0.72rem', lineHeight: 1.45 }}>
          Verification status is derived from recorded verification runs. Use hash identification to fingerprint stored hashes and generate John/Hashcat commands, then use the verification controls to validate a single target or run a blast-radius pass.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
          <input className="mono" value={draft.label} onChange={(event) => setDraft((prev) => ({ ...prev, label: event.target.value }))} placeholder="Label" style={fieldStyle} />
          <input className="mono" value={draft.username} onChange={(event) => setDraft((prev) => ({ ...prev, username: event.target.value }))} placeholder="Username" style={fieldStyle} />
          <input className="mono" value={draft.secret} onChange={(event) => setDraft((prev) => ({ ...prev, secret: event.target.value }))} placeholder="Password / secret" style={fieldStyle} />
          <input className="mono" value={draft.hash} onChange={(event) => setDraft((prev) => ({ ...prev, hash: event.target.value }))} placeholder="Hash" style={fieldStyle} />
          <input className="mono" value={draft.hashType} onChange={(event) => setDraft((prev) => ({ ...prev, hashType: event.target.value }))} placeholder="Hash type" style={fieldStyle} />
          <input className="mono" value={draft.service} onChange={(event) => setDraft((prev) => ({ ...prev, service: event.target.value }))} placeholder="Service" style={fieldStyle} />
          <input className="mono" value={draft.host} onChange={(event) => setDraft((prev) => ({ ...prev, host: event.target.value }))} placeholder="Host" style={fieldStyle} />
          <input className="mono" value={draft.port} onChange={(event) => setDraft((prev) => ({ ...prev, port: event.target.value }))} placeholder="Port" style={fieldStyle} />
        </div>
        <textarea className="mono" value={draft.notes} onChange={(event) => setDraft((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Notes" style={{ ...fieldStyle, width: '100%', minHeight: '54px', marginTop: '0.4rem', resize: 'vertical' }} />
        <input className="mono" value={draft.findingIdsCsv} onChange={(event) => setDraft((prev) => ({ ...prev, findingIdsCsv: event.target.value }))} placeholder={`Finding IDs (e.g. ${findings.slice(0, 3).map((item) => item.id).join(', ') || '1,2'})`} style={{ ...fieldStyle, width: '100%', marginTop: '0.4rem' }} />
        <input className="mono" value={draft.graphNodeIdsCsv} onChange={(event) => setDraft((prev) => ({ ...prev, graphNodeIdsCsv: event.target.value }))} placeholder="Graph node IDs (comma separated)" style={{ ...fieldStyle, width: '100%', marginTop: '0.4rem' }} />
        <button className="btn-secondary" onClick={commitCreate} style={{ marginTop: '0.55rem', fontSize: '0.76rem', padding: '4px 10px' }}>
          Add Credential
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', maxHeight: '55vh', overflowY: 'auto' }}>
        {credentials.length === 0 ? (
          <span className="mono" style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
            No credentials stored for this session yet.
          </span>
        ) : credentials.map((credential) => (
          <CredentialEditor
            key={`${credential.id}-${credential.updatedAt || 'pending'}`}
            credential={credential}
            verificationHistory={verificationsByCredential[credential.id] || []}
            isVerifying={Boolean(verificationBusy[credential.id])}
            hashAnalysis={hashAnalysisByCredential[credential.id] || null}
            isIdentifyingHash={Boolean(hashIdentificationBusy[credential.id])}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onVerify={onVerify}
            onIdentifyHash={onIdentifyHash}
            onInsertCommand={onInsertCommand}
          />
        ))}
      </div>
    </div>
  );
}

const fieldStyle = {
  fontSize: '0.74rem',
  padding: '5px 7px',
  background: 'rgba(1,4,9,0.6)',
  border: '1px solid var(--border-color)',
  borderRadius: '5px',
  color: 'var(--text-main)',
};
