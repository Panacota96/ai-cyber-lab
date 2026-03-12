'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';

function ArtifactPreview({ artifact }) {
  if (!artifact) {
    return (
      <div className="mono" style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
        Select an artifact to preview it.
      </div>
    );
  }

  if (artifact.previewKind === 'image') {
    return (
      <Image
        src={artifact.downloadPath}
        alt={artifact.filename}
        width={1200}
        height={800}
        unoptimized
        style={{ width: '100%', height: 'auto', borderRadius: '8px', border: '1px solid rgba(88,166,255,0.18)', background: '#050a11' }}
      />
    );
  }

  if (artifact.previewKind === 'text') {
    return (
      <pre className="mono" style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.72rem', color: 'var(--text-main)', maxHeight: '220px', overflow: 'auto', padding: '0.55rem', borderRadius: '8px', border: '1px solid rgba(88,166,255,0.18)', background: 'rgba(5,10,17,0.88)' }}>
        {artifact.previewText || 'No preview available.'}
      </pre>
    );
  }

  return (
    <div style={{ border: '1px solid rgba(88,166,255,0.18)', borderRadius: '8px', padding: '0.6rem', background: 'rgba(5,10,17,0.88)' }}>
      <div className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-main)' }}>
        {artifact.filename}
      </div>
      <div className="mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
        {artifact.mimeType || 'application/octet-stream'} • {artifact.sizeBytes} bytes
      </div>
    </div>
  );
}

export default function ArtifactsPanel({
  artifacts = [],
  selectedArtifact = null,
  selectedArtifactId = null,
  loading = false,
  uploading = false,
  error = '',
  onSelectArtifact,
  onUploadArtifact,
  onDeleteArtifact,
  onInsertArtifactIntoReport,
}) {
  const fileInputRef = useRef(null);
  const [uploadNotes, setUploadNotes] = useState('');

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await onUploadArtifact?.({ file, notes: uploadNotes });
    setUploadNotes('');
    event.target.value = '';
  };

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
      <div style={{ border: '1px solid rgba(88,166,255,0.18)', borderRadius: '8px', padding: '0.65rem', background: 'rgba(9,20,34,0.34)' }}>
        <div className="mono" style={{ color: 'var(--accent-secondary)', marginBottom: '0.5rem', fontSize: '0.84rem' }}>
          Artifact Manager
        </div>
        <input ref={fileInputRef} type="file" onChange={handleUpload} style={{ display: 'none' }} />
        <textarea
          className="mono"
          value={uploadNotes}
          onChange={(event) => setUploadNotes(event.target.value)}
          placeholder="Optional upload notes"
          style={{ width: '100%', minHeight: '58px', resize: 'vertical', fontSize: '0.74rem', padding: '6px 8px', background: 'rgba(1,4,9,0.6)', border: '1px solid var(--border-color)', borderRadius: '5px', color: 'var(--text-main)' }}
        />
        <button className="btn-secondary mono" onClick={() => fileInputRef.current?.click()} disabled={uploading} style={{ marginTop: '0.55rem', fontSize: '0.76rem', padding: '4px 10px' }}>
          {uploading ? 'Uploading…' : 'Upload Artifact'}
        </button>
        {error && (
          <div className="mono" style={{ marginTop: '0.45rem', fontSize: '0.72rem', color: 'var(--accent-danger)' }}>
            {error}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', maxHeight: '28vh', overflowY: 'auto' }}>
        {loading ? (
          <span className="mono" style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>Loading artifacts…</span>
        ) : artifacts.length === 0 ? (
          <span className="mono" style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>No artifacts saved for this session yet.</span>
        ) : artifacts.map((artifact) => (
          <button
            key={artifact.id}
            type="button"
            onClick={() => onSelectArtifact?.(artifact.id)}
            className="mono"
            style={{
              textAlign: 'left',
              border: `1px solid ${artifact.id === selectedArtifactId ? 'rgba(88,166,255,0.45)' : 'rgba(88,166,255,0.12)'}`,
              borderRadius: '8px',
              padding: '0.5rem',
              background: artifact.id === selectedArtifactId ? 'rgba(16,39,63,0.4)' : 'rgba(1,4,9,0.35)',
              color: 'var(--text-main)',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.35rem' }}>
              <span>{artifact.filename}</span>
              <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>{artifact.kind}</span>
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              {artifact.previewKind} • {artifact.sizeBytes} bytes
            </div>
          </button>
        ))}
      </div>

      <div style={{ border: '1px solid rgba(88,166,255,0.18)', borderRadius: '8px', padding: '0.65rem', background: 'rgba(9,20,34,0.24)' }}>
        <ArtifactPreview artifact={selectedArtifact} />
        {selectedArtifact && (
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.55rem' }}>
            <a href={selectedArtifact.downloadPath} target="_blank" rel="noopener noreferrer" className="btn-secondary mono" style={{ fontSize: '0.72rem', padding: '3px 8px', textDecoration: 'none' }}>
              Open
            </a>
            <button className="btn-secondary mono" onClick={() => onInsertArtifactIntoReport?.(selectedArtifact)} style={{ fontSize: '0.72rem', padding: '3px 8px' }}>
              Insert into Report
            </button>
            <button className="btn-secondary mono" onClick={() => onDeleteArtifact?.(selectedArtifact.id)} style={{ fontSize: '0.72rem', padding: '3px 8px', color: 'var(--accent-danger)', borderColor: 'rgba(248,81,73,0.4)' }}>
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
