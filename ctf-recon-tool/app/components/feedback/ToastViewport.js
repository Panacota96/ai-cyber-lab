'use client';

const TOAST_TONES = {
  info: {
    border: 'rgba(88,166,255,0.35)',
    background: 'rgba(9,22,38,0.92)',
    title: 'var(--accent-secondary)',
  },
  success: {
    border: 'rgba(63,185,80,0.35)',
    background: 'rgba(12,25,16,0.94)',
    title: '#3fb950',
  },
  warning: {
    border: 'rgba(210,153,34,0.35)',
    background: 'rgba(36,26,10,0.94)',
    title: 'var(--accent-warning)',
  },
  error: {
    border: 'rgba(248,81,73,0.35)',
    background: 'rgba(42,14,14,0.94)',
    title: 'var(--accent-danger)',
  },
};

export default function ToastViewport({ toasts = [], onDismiss }) {
  if (!Array.isArray(toasts) || toasts.length === 0) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: 'fixed',
        right: '18px',
        bottom: 'calc(18px + var(--version-bar-height, 0px))',
        zIndex: 1600,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.55rem',
        width: 'min(360px, calc(100vw - 36px))',
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => {
        const tone = TOAST_TONES[toast.tone] || TOAST_TONES.info;
        return (
          <div
            key={toast.id}
            role="status"
            style={{
              pointerEvents: 'auto',
              border: `1px solid ${tone.border}`,
              borderRadius: '10px',
              background: tone.background,
              boxShadow: '0 12px 28px rgba(0,0,0,0.28)',
              padding: '0.72rem 0.78rem',
              backdropFilter: 'blur(10px)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.7rem' }}>
              <div style={{ minWidth: 0 }}>
                <div className="mono" style={{ fontSize: '0.76rem', letterSpacing: '0.4px', color: tone.title }}>
                  {toast.title}
                </div>
                {toast.message && (
                  <div className="mono" style={{ marginTop: '0.22rem', fontSize: '0.72rem', lineHeight: 1.5, color: 'var(--text-main)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {toast.message}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="mono"
                onClick={() => onDismiss?.(toast.id)}
                aria-label={`Dismiss ${toast.title}`}
                style={{
                  border: '1px solid rgba(139,148,158,0.28)',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  borderRadius: '999px',
                  cursor: 'pointer',
                  fontSize: '0.68rem',
                  lineHeight: 1,
                  padding: '4px 7px',
                  flexShrink: 0,
                }}
              >
                ×
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
