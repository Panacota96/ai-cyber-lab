import {
  formatPlatformTypeLabel,
  getPlatformRemoteIdPlaceholder,
  PLATFORM_OPTIONS,
} from '@/domains/session-targets-platform/lib/session-platform';

export default function PlatformLinkPanel({
  linkedPlatform,
  activePlatformCapability,
  platformPanelExpanded,
  platformLinkBusy,
  platformTypeDraft,
  platformRemoteIdDraft,
  platformLabelDraft,
  platformChallengeIdDraft,
  platformCapabilities,
  onToggleExpanded,
  onSync,
  onPlatformTypeChange,
  onPlatformRemoteIdChange,
  onPlatformLabelChange,
  onPlatformChallengeIdChange,
  style,
}) {
  return (
    <div className="glass-panel objective-bar" style={{ display: 'grid', gap: '0.55rem', marginTop: '0.55rem', ...style }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="mono" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          <span style={{ color: 'var(--accent-secondary)' }}>Platform:</span>{' '}
          {linkedPlatform
            ? `${formatPlatformTypeLabel(linkedPlatform.type)} · ${linkedPlatform.label || linkedPlatform.remoteLabel || linkedPlatform.remoteId}`
            : 'Not linked'}
          {linkedPlatform?.syncedAt ? ` · synced ${new Date(linkedPlatform.syncedAt).toLocaleString()}` : ''}
        </div>
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          {activePlatformCapability && (
            <span className="mono" style={{ fontSize: '0.7rem', padding: '2px 7px', borderRadius: '999px', border: '1px solid rgba(88,166,255,0.28)', color: 'var(--accent-secondary)', background: 'rgba(88,166,255,0.08)' }}>
              {activePlatformCapability.flagMode === 'validation' ? 'flag validation' : activePlatformCapability?.flagSubmit ? 'flag submit' : 'metadata only'}
            </span>
          )}
          <button className="btn-secondary btn-compact" onClick={onToggleExpanded}>
            {platformPanelExpanded ? 'Hide Link' : 'Link Platform'}
          </button>
          <button className="btn-secondary btn-compact" onClick={onSync} disabled={platformLinkBusy}>
            {platformLinkBusy ? 'Syncing…' : linkedPlatform ? 'Refresh Link' : 'Sync'}
          </button>
        </div>
      </div>

      {linkedPlatform?.lastFlagSubmission?.summary && (
        <div className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          Last flag result: {linkedPlatform.lastFlagSubmission.summary}
        </div>
      )}

      {platformPanelExpanded && (
        <div style={{ display: 'grid', gap: '0.55rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 1fr', gap: '0.55rem' }}>
            <select value={platformTypeDraft} onChange={(e) => onPlatformTypeChange(e.target.value)} style={{ fontSize: '0.76rem', padding: '4px 8px' }}>
              {PLATFORM_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <input
              type="text"
              value={platformRemoteIdDraft}
              onChange={(e) => onPlatformRemoteIdChange(e.target.value)}
              placeholder={getPlatformRemoteIdPlaceholder(platformTypeDraft)}
            />
            <input
              type="text"
              value={platformLabelDraft}
              onChange={(e) => onPlatformLabelChange(e.target.value)}
              placeholder="Optional local label"
            />
          </div>

          {platformTypeDraft === 'htb' && (
            <input
              type="text"
              value={platformChallengeIdDraft}
              onChange={(e) => onPlatformChallengeIdChange(e.target.value)}
              placeholder="Optional HTB Challenge ID (required for flag submit)"
            />
          )}

          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {PLATFORM_OPTIONS.map((option) => {
              const capability = platformCapabilities?.[option.value];
              return (
                <span key={option.value} className="mono" style={{
                  fontSize: '0.68rem',
                  padding: '2px 7px',
                  borderRadius: '999px',
                  border: `1px solid ${capability?.configured ? 'rgba(63,185,80,0.28)' : 'rgba(248,81,73,0.28)'}`,
                  color: capability?.configured ? '#3fb950' : '#f85149',
                  background: capability?.configured ? 'rgba(63,185,80,0.08)' : 'rgba(248,81,73,0.08)',
                }}>
                  {option.label} {capability?.configured ? 'ready' : 'not configured'}
                </span>
              );
            })}
          </div>

          {platformCapabilities?.[platformTypeDraft]?.reason && !platformCapabilities?.[platformTypeDraft]?.configured && (
            <div className="mono" style={{ fontSize: '0.7rem', color: '#f85149' }}>
              {platformCapabilities[platformTypeDraft].reason}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
