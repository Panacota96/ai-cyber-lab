'use client';

function formatConfidence(value) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return 'n/a';
  return `${Math.round(normalized * 100)}%`;
}

export default function ServiceSuggestionsPanel({
  suggestions = [],
  loading = false,
  error = '',
  onInsertCommand,
}) {
  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
      <div style={{ border: '1px solid rgba(88,166,255,0.18)', borderRadius: '8px', padding: '0.65rem', background: 'rgba(9,20,34,0.34)' }}>
        <div className="mono" style={{ color: 'var(--accent-secondary)', marginBottom: '0.4rem', fontSize: '0.84rem' }}>
          Service Suggestions
        </div>
        <div className="mono" style={{ color: 'var(--text-muted)', fontSize: '0.74rem', lineHeight: 1.5 }}>
          Advisory-only next steps built from discovered services. Insert a command to review or edit it before execution.
        </div>
      </div>

      {loading && (
        <div className="mono" style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
          Loading service suggestions...
        </div>
      )}

      {!loading && error && (
        <div className="mono" style={{ color: 'var(--accent-danger)', fontSize: '0.75rem' }}>
          {error}
        </div>
      )}

      {!loading && !error && suggestions.length === 0 && (
        <div className="mono" style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
          No advisory suggestions yet. Run discovery commands that populate the graph first.
        </div>
      )}

      {!loading && !error && suggestions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', maxHeight: '30vh', overflowY: 'auto' }}>
          {suggestions.map((suggestion) => (
            <div key={suggestion.id} style={{ border: '1px solid rgba(88,166,255,0.14)', borderRadius: '8px', padding: '0.55rem', background: 'rgba(1,4,9,0.38)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                <span className="mono" style={{ fontSize: '0.78rem', color: 'var(--text-main)' }}>
                  {suggestion.title}
                </span>
                <span className="mono" style={{ fontSize: '0.68rem', padding: '2px 7px', borderRadius: '999px', border: '1px solid rgba(88,166,255,0.3)', color: 'var(--accent-secondary)', background: 'rgba(88,166,255,0.1)' }}>
                  {suggestion.service} @ {suggestion.host}
                </span>
                <span className="mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                  confidence {formatConfidence(suggestion.confidence)}
                </span>
              </div>
              <div className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.45, marginBottom: '0.45rem' }}>
                {suggestion.rationale}
              </div>
              <pre className="mono" style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.72rem', background: 'rgba(1,4,9,0.72)', border: '1px solid rgba(88,166,255,0.12)', borderRadius: '6px', padding: '0.5rem', color: 'var(--text-main)' }}>
                {suggestion.command}
              </pre>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.45rem' }}>
                <button
                  className="btn-secondary"
                  onClick={() => onInsertCommand?.(suggestion.command)}
                  style={{ fontSize: '0.74rem', padding: '3px 9px' }}
                >
                  Insert Command
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
