export default function SessionTargetsModal({
  open,
  onClose,
  currentSessionTargets,
  activeSessionTarget,
  targetsBusy,
  targetDraftLabel,
  targetDraftValue,
  targetDraftKind,
  targetDraftNotes,
  onTargetDraftLabelChange,
  onTargetDraftValueChange,
  onTargetDraftKindChange,
  onTargetDraftNotesChange,
  onUseTarget,
  onSetPrimary,
  onDeleteTarget,
  onCreateTarget,
}) {
  if (!open) return null;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal glass-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '760px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
          <h3>Session Targets</h3>
          <button className="btn-secondary" onClick={onClose}>Close</button>
        </div>
        <div className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
          Active target drives <code>{'{TARGET}'}</code> substitution and becomes the default link for new commands, notes, credentials, shells, and artifacts.
        </div>
        <div style={{ display: 'grid', gap: '0.6rem', marginBottom: '1rem' }}>
          {currentSessionTargets.length === 0 && (
            <div className="mono" style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
              No explicit targets saved for this session yet.
            </div>
          )}
          {currentSessionTargets.map((target) => (
            <div key={target.id || target.target} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '0.65rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <div className="mono" style={{ fontSize: '0.78rem', color: 'var(--text-main)' }}>
                    {target.label || target.target}
                  </div>
                  <div className="mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                    {target.target} · {(target.kind || 'host').toUpperCase()}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  <button className="btn-secondary" onClick={() => onUseTarget(target.id || '')} style={{ fontSize: '0.72rem', padding: '4px 9px' }}>
                    {activeSessionTarget?.id === target.id ? 'Active' : 'Use'}
                  </button>
                  <button className="btn-secondary" onClick={() => void onSetPrimary(target.id)} style={{ fontSize: '0.72rem', padding: '4px 9px' }} disabled={targetsBusy || target.isPrimary}>
                    {target.isPrimary ? 'Primary' : 'Set Primary'}
                  </button>
                  <button className="btn-secondary" onClick={() => void onDeleteTarget(target.id)} style={{ fontSize: '0.72rem', padding: '4px 9px', color: 'var(--accent-danger)', borderColor: 'rgba(248,81,73,0.35)' }} disabled={targetsBusy}>
                    Delete
                  </button>
                </div>
              </div>
              {target.notes && (
                <div className="mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.4rem', whiteSpace: 'pre-wrap' }}>
                  {target.notes}
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.9rem' }}>
          <h4 style={{ marginBottom: '0.55rem' }}>Add Target</h4>
          <div style={{ display: 'grid', gap: '0.55rem' }}>
            <input type="text" value={targetDraftLabel} onChange={(e) => onTargetDraftLabelChange(e.target.value)} placeholder="Label (e.g. Internal CIDR)" />
            <input type="text" value={targetDraftValue} onChange={(e) => onTargetDraftValueChange(e.target.value)} placeholder="Target value (host, URL, CIDR)" />
            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '0.55rem' }}>
              <select value={targetDraftKind} onChange={(e) => onTargetDraftKindChange(e.target.value)}>
                <option value="host">Host</option>
                <option value="url">URL</option>
                <option value="cidr">CIDR</option>
                <option value="host-port">Host:Port</option>
              </select>
              <input type="text" value={targetDraftNotes} onChange={(e) => onTargetDraftNotesChange(e.target.value)} placeholder="Notes (optional)" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn-primary" onClick={() => void onCreateTarget()} disabled={targetsBusy || !targetDraftValue.trim()}>
                {targetsBusy ? 'Saving…' : 'Add Target'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
