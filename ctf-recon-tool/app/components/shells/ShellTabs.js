'use client';

export default function ShellTabs({
  shellSessions = [],
  activeShellId = null,
  unreadByShell = {},
  onSelect,
}) {
  if (shellSessions.length === 0) {
    return null;
  }

  return (
    <div style={{ display: 'flex', gap: '0.45rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
      {shellSessions.map((shellSession) => {
        const active = shellSession.id === activeShellId;
        const unread = Number(unreadByShell[shellSession.id] || 0);
        const typeLabel = shellSession.type === 'webshell'
          ? 'WEB'
          : shellSession.type === 'bind'
            ? 'BIND'
            : 'REV';
        return (
          <button
            key={shellSession.id}
            type="button"
            onClick={() => onSelect?.(shellSession.id)}
            className="mono"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              minWidth: 'fit-content',
              padding: '0.45rem 0.7rem',
              borderRadius: '8px',
              border: `1px solid ${active ? 'rgba(88,166,255,0.55)' : 'rgba(88,166,255,0.15)'}`,
              background: active ? 'rgba(16,39,63,0.65)' : 'rgba(1,4,9,0.45)',
              color: active ? 'var(--accent-secondary)' : 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            <span>{typeLabel}</span>
            <span>{shellSession.label || shellSession.id}</span>
            <span style={{ fontSize: '0.7rem', color: active ? 'var(--text-main)' : 'var(--text-muted)' }}>
              {shellSession.status}
            </span>
            {shellSession.remoteHost && (
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                {shellSession.remoteHost}{shellSession.remotePort ? `:${shellSession.remotePort}` : ''}
              </span>
            )}
            {unread > 0 && (
              <span style={{ fontSize: '0.68rem', minWidth: '20px', padding: '2px 6px', borderRadius: '999px', color: '#08111d', background: 'var(--accent-primary)' }}>
                {unread}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
