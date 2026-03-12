'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export default function CommandPalette({
  open = false,
  query = '',
  entries = [],
  onClose,
  onQueryChange,
  onSelect,
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const safeActiveIndex = Math.min(activeIndex, Math.max(entries.length - 1, 0));

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, Math.max(entries.length - 1, 0)));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (event.key === 'Enter') {
        const selected = entries[safeActiveIndex];
        if (!selected) return;
        event.preventDefault();
        onSelect?.(selected);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [entries, onSelect, open, safeActiveIndex]);

  const activeEntry = useMemo(() => entries[safeActiveIndex] || null, [entries, safeActiveIndex]);

  if (!open) return null;

  return (
    <div className="overlay" onClick={() => onClose?.()}>
      <div
        className="modal glass-panel"
        onClick={(event) => event.stopPropagation()}
        style={{ width: '760px', maxWidth: '96vw', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
          <div>
            <h3 style={{ marginBottom: '0.2rem' }}>Command Palette</h3>
            <div className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Search across advisory follow-ups, recent commands, and toolbox templates.
            </div>
          </div>
          <button className="btn-secondary" onClick={() => onClose?.()}>Close</button>
        </div>

        <input
          ref={inputRef}
          className="mono"
          value={query}
          onChange={(event) => {
            setActiveIndex(0);
            onQueryChange?.(event.target.value);
          }}
          placeholder="Search commands, services, hosts, or categories..."
          style={{ fontSize: '0.9rem', padding: '10px 12px', background: 'rgba(1,4,9,0.66)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '8px', outline: 'none' }}
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(260px, 0.7fr)', gap: '0.8rem', minHeight: '340px' }}>
          <div style={{ border: '1px solid rgba(88,166,255,0.18)', borderRadius: '10px', overflow: 'hidden', background: 'rgba(1,4,9,0.38)' }}>
            <div className="mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', padding: '0.55rem 0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {entries.length} result{entries.length === 1 ? '' : 's'}
            </div>
            <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
              {entries.length === 0 && (
                <div className="mono" style={{ padding: '0.9rem 0.75rem', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                  No matching commands.
                </div>
              )}
              {entries.map((entry, index) => {
                const isActive = index === safeActiveIndex;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => onSelect?.(entry)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '0.7rem 0.75rem',
                      background: isActive ? 'rgba(88,166,255,0.12)' : 'transparent',
                      border: 'none',
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.22rem',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className="mono" style={{ fontSize: '0.82rem', color: isActive ? 'var(--accent-primary)' : 'var(--text-main)' }}>
                        {entry.label}
                      </span>
                      <span className="mono" style={{ fontSize: '0.64rem', padding: '2px 7px', borderRadius: '999px', border: '1px solid rgba(88,166,255,0.24)', color: 'var(--accent-secondary)', background: 'rgba(88,166,255,0.08)' }}>
                        {entry.sourceLabel}
                      </span>
                      {entry.subtitle && (
                        <span className="mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                          {entry.subtitle}
                        </span>
                      )}
                    </div>
                    <div className="mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                      {entry.description || entry.category || 'Command suggestion'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ border: '1px solid rgba(88,166,255,0.18)', borderRadius: '10px', background: 'rgba(1,4,9,0.38)', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <div className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Preview
            </div>
            {activeEntry ? (
              <>
                <div>
                  <div className="mono" style={{ fontSize: '0.84rem', color: 'var(--text-main)', marginBottom: '0.2rem' }}>
                    {activeEntry.label}
                  </div>
                  <div className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                    {activeEntry.description || activeEntry.subtitle || activeEntry.category || 'Command suggestion'}
                  </div>
                </div>
                <pre className="mono" style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.72rem', lineHeight: 1.55, borderRadius: '8px', padding: '0.7rem', background: 'rgba(1,4,9,0.82)', border: '1px solid rgba(255,255,255,0.07)', color: 'var(--text-main)' }}>
                  {activeEntry.command}
                </pre>
                <div className="mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                  <div>Enter to insert command</div>
                  <div>Up/Down to move</div>
                  <div>Esc to close</div>
                </div>
              </>
            ) : (
              <div className="mono" style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                Select a command to preview and insert it into the command box.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
