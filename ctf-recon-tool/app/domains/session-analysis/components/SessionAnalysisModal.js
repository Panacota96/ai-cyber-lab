"use client";

import { useEffect, useMemo, useState } from 'react';

const TABS = [
  { id: 'search', label: 'Search' },
  { id: 'compare', label: 'Compare' },
  { id: 'session', label: 'Session' },
  { id: 'schedules', label: 'Schedules' },
];

function toDatetimeLocalValue(value) {
  const date = value ? new Date(value) : new Date(Date.now() + 10 * 60 * 1000);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function normalizeCustomFieldRows(customFields = {}) {
  const rows = Object.entries(customFields || {}).map(([key, value]) => ({
    key: String(key || ''),
    value: String(value || ''),
  }));
  return rows.length > 0 ? rows : [{ key: '', value: '' }];
}

function rowsToCustomFields(rows = []) {
  return rows.reduce((acc, row) => {
    const key = String(row?.key || '').trim();
    const value = String(row?.value || '').trim();
    if (!key || !value) return acc;
    acc[key] = value;
    return acc;
  }, {});
}

function ScheduleList({ schedules = [], onCancel, loading = false }) {
  if (loading) {
    return <div className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading schedules…</div>;
  }
  if (!Array.isArray(schedules) || schedules.length === 0) {
    return <div className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No scheduled commands.</div>;
  }
  return (
    <div style={{ display: 'grid', gap: '0.45rem' }}>
      {schedules.map((schedule) => (
        <div key={schedule.id} className="glass-panel" style={{ padding: '0.7rem', display: 'grid', gap: '0.35rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="mono" style={{ fontSize: '0.76rem', color: 'var(--accent-secondary)' }}>
              {schedule.status.toUpperCase()} · {new Date(schedule.runAt).toLocaleString()}
            </span>
            {(schedule.status === 'pending' || schedule.status === 'failed') && (
              <button type="button" className="btn-secondary mono" style={{ fontSize: '0.72rem', padding: '2px 8px', color: 'var(--accent-danger)', borderColor: 'var(--accent-danger)' }} onClick={() => onCancel(schedule.id)}>
                Cancel
              </button>
            )}
          </div>
          <code style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.8rem' }}>{schedule.command}</code>
          <div className="mono" style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
            <span>Timeout: {Math.round(Number(schedule.timeout || 0) / 1000)}s</span>
            {schedule.targetId && <span>Target: {schedule.targetId}</span>}
            {schedule.eventId && <span>Event: {schedule.eventId}</span>}
          </div>
          {schedule.tags?.length > 0 && (
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              {schedule.tags.map((tag) => (
                <span key={tag} className="mono" style={{ fontSize: '0.7rem', padding: '2px 7px', borderRadius: '999px', background: 'rgba(88,166,255,0.12)', color: 'var(--accent-primary)', border: '1px solid rgba(88,166,255,0.3)' }}>
                  #{tag}
                </span>
              ))}
            </div>
          )}
          {schedule.notes && (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-main)' }}>{schedule.notes}</div>
          )}
          {schedule.lastError && (
            <div className="mono" style={{ fontSize: '0.74rem', color: 'var(--accent-danger)' }}>{schedule.lastError}</div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function SessionAnalysisModal({
  open,
  initialTab = 'search',
  onClose,
  currentSession,
  currentSessionId,
  sessions = [],
  currentSessionTargets = [],
  activeTargetId = '',
  scheduleCommandPrefill = '',
  onOpenSession,
  onSearch,
  onCompare,
  onSaveSessionMetadata,
  onListSchedules,
  onCreateSchedule,
  onCancelSchedule,
}) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState('all');
  const [searchResults, setSearchResults] = useState([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [compareAgainstSessionId, setCompareAgainstSessionId] = useState('');
  const [compareBusy, setCompareBusy] = useState(false);
  const [compareResult, setCompareResult] = useState(null);
  const [sessionTags, setSessionTags] = useState('');
  const [customFieldRows, setCustomFieldRows] = useState([{ key: '', value: '' }]);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [scheduleCommand, setScheduleCommand] = useState(scheduleCommandPrefill || '');
  const [scheduleTargetId, setScheduleTargetId] = useState(activeTargetId || '');
  const [scheduleRunAt, setScheduleRunAt] = useState(toDatetimeLocalValue());
  const [scheduleTimeout, setScheduleTimeout] = useState('120000');
  const [scheduleTags, setScheduleTags] = useState('');
  const [scheduleNotes, setScheduleNotes] = useState('');
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [schedules, setSchedules] = useState([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [error, setError] = useState('');

  const comparisonCandidates = useMemo(
    () => sessions.filter((session) => session.id !== currentSessionId),
    [currentSessionId, sessions]
  );

  useEffect(() => {
    if (!open) return;
    setActiveTab(initialTab || 'search');
  }, [initialTab, open]);

  useEffect(() => {
    if (!open) return;
    const metadata = currentSession?.metadata || {};
    setSessionTags(Array.isArray(metadata.tags) ? metadata.tags.join(', ') : '');
    setCustomFieldRows(normalizeCustomFieldRows(metadata.customFields));
  }, [currentSession, open]);

  useEffect(() => {
    if (!open) return;
    setScheduleCommand(scheduleCommandPrefill || '');
    setScheduleTargetId(activeTargetId || currentSession?.primaryTargetId || '');
    setScheduleRunAt(toDatetimeLocalValue());
  }, [activeTargetId, currentSession?.primaryTargetId, open, scheduleCommandPrefill]);

  useEffect(() => {
    if (!open || activeTab !== 'schedules') return;
    let cancelled = false;
    setSchedulesLoading(true);
    setError('');
    Promise.resolve(onListSchedules())
      .then((data) => {
        if (!cancelled) {
          setSchedules(Array.isArray(data) ? data : []);
        }
      })
      .catch((nextError) => {
        if (!cancelled) {
          setError(nextError?.message || 'Failed to load schedules.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSchedulesLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, onListSchedules, open]);

  if (!open) return null;

  const handleSearch = async () => {
    const query = searchQuery.trim();
    if (!query) return;
    setSearchBusy(true);
    setError('');
    try {
      const results = await onSearch({
        query,
        sessionId: searchScope === 'current' ? currentSessionId : null,
      });
      setSearchResults(Array.isArray(results) ? results : []);
    } catch (nextError) {
      setError(nextError?.message || 'Search failed.');
    } finally {
      setSearchBusy(false);
    }
  };

  const handleCompare = async () => {
    if (!compareAgainstSessionId) return;
    setCompareBusy(true);
    setError('');
    try {
      const result = await onCompare({
        beforeSessionId: compareAgainstSessionId,
        afterSessionId: currentSessionId,
      });
      setCompareResult(result || null);
    } catch (nextError) {
      setError(nextError?.message || 'Comparison failed.');
    } finally {
      setCompareBusy(false);
    }
  };

  const handleSaveSession = async () => {
    setSessionBusy(true);
    setError('');
    try {
      await onSaveSessionMetadata({
        tags: sessionTags
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean),
        customFields: rowsToCustomFields(customFieldRows),
      });
    } catch (nextError) {
      setError(nextError?.message || 'Session update failed.');
    } finally {
      setSessionBusy(false);
    }
  };

  const handleCreateSchedule = async () => {
    const command = scheduleCommand.trim();
    if (!command || !scheduleRunAt) return;
    setScheduleBusy(true);
    setError('');
    try {
      const nextSchedules = await onCreateSchedule({
        command,
        targetId: scheduleTargetId || null,
        runAt: new Date(scheduleRunAt).toISOString(),
        timeout: Number(scheduleTimeout || 120000),
        notes: scheduleNotes,
        tags: scheduleTags.split(',').map((entry) => entry.trim()).filter(Boolean),
      });
      setSchedules(Array.isArray(nextSchedules) ? nextSchedules : []);
      setScheduleNotes('');
      setScheduleTags('');
      setScheduleRunAt(toDatetimeLocalValue());
    } catch (nextError) {
      setError(nextError?.message || 'Failed to create schedule.');
    } finally {
      setScheduleBusy(false);
    }
  };

  const handleCancelSchedule = async (scheduleId) => {
    setScheduleBusy(true);
    setError('');
    try {
      const nextSchedules = await onCancelSchedule(scheduleId);
      setSchedules(Array.isArray(nextSchedules) ? nextSchedules : []);
    } catch (nextError) {
      setError(nextError?.message || 'Failed to cancel schedule.');
    } finally {
      setScheduleBusy(false);
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal glass-panel" style={{ width: 'min(1100px, 96vw)', maxHeight: '90vh', overflow: 'auto' }} onClick={(event) => event.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', marginBottom: '0.85rem' }}>
          <div>
            <h3 style={{ marginBottom: '0.2rem' }}>Wave 23 Session Analysis</h3>
            <div className="mono" style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
              {currentSession?.name || currentSessionId}
            </div>
          </div>
          <button className="btn-secondary" onClick={onClose}>Close</button>
        </div>

        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={activeTab === tab.id ? 'btn-primary mono' : 'btn-secondary mono'}
              style={{ fontSize: '0.76rem', padding: '4px 10px' }}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mono" style={{ marginBottom: '0.75rem', fontSize: '0.76rem', color: 'var(--accent-danger)' }}>
            {error}
          </div>
        )}

        {activeTab === 'search' && (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input
                type="text"
                className="mono"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search sessions, timeline, findings, credentials, flags, artifacts, writeups"
                style={{ flex: 1, minWidth: '320px' }}
              />
              <select value={searchScope} onChange={(event) => setSearchScope(event.target.value)} style={{ fontSize: '0.82rem', padding: '4px 8px' }}>
                <option value="all">All sessions</option>
                <option value="current">Current session</option>
              </select>
              <button type="button" className="btn-primary mono" style={{ fontSize: '0.78rem', padding: '4px 12px' }} disabled={searchBusy} onClick={() => void handleSearch()}>
                {searchBusy ? 'Searching…' : 'Search'}
              </button>
            </div>

            <div style={{ display: 'grid', gap: '0.45rem' }}>
              {searchResults.length === 0 ? (
                <div className="mono" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No search results yet.</div>
              ) : searchResults.map((result) => (
                <div key={result.id} className="glass-panel" style={{ padding: '0.7rem', display: 'grid', gap: '0.3rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{result.title || `${result.sourceType} ${result.sourceId}`}</div>
                      <div className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {result.sessionName} · {result.sourceType}
                      </div>
                    </div>
                    {result.sessionId !== currentSessionId && (
                      <button type="button" className="btn-secondary mono" style={{ fontSize: '0.72rem', padding: '3px 9px' }} onClick={() => onOpenSession(result.sessionId)}>
                        Open Session
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: '0.82rem', lineHeight: 1.45 }}>{String(result.snippet || '').replaceAll('[[', '').replaceAll(']]', '')}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'compare' && (
          <div style={{ display: 'grid', gap: '0.8rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={compareAgainstSessionId} onChange={(event) => setCompareAgainstSessionId(event.target.value)} style={{ minWidth: '280px', fontSize: '0.82rem', padding: '4px 8px' }}>
                <option value="">Select baseline session…</option>
                {comparisonCandidates.map((session) => (
                  <option key={session.id} value={session.id}>{session.name}</option>
                ))}
              </select>
              <button type="button" className="btn-primary mono" style={{ fontSize: '0.78rem', padding: '4px 12px' }} disabled={!compareAgainstSessionId || compareBusy} onClick={() => void handleCompare()}>
                {compareBusy ? 'Comparing…' : 'Compare With Current'}
              </button>
            </div>

            {compareResult && (
              <div style={{ display: 'grid', gap: '0.7rem' }}>
                <div className="glass-panel" style={{ padding: '0.7rem' }}>
                  <div className="mono" style={{ fontSize: '0.76rem', color: 'var(--accent-secondary)', marginBottom: '0.45rem' }}>Summary</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.55rem' }}>
                    {Object.entries(compareResult.summary || {}).map(([key, value]) => (
                      <div key={key} className="glass-panel" style={{ padding: '0.55rem' }}>
                        <div className="mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{key}</div>
                        <div style={{ fontSize: '1rem', fontWeight: 700 }}>{String(value)}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.7rem' }}>
                  <div className="glass-panel" style={{ padding: '0.7rem' }}>
                    <div className="mono" style={{ fontSize: '0.76rem', color: 'var(--accent-secondary)', marginBottom: '0.4rem' }}>Targets</div>
                    <div className="mono" style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Added</div>
                    <div style={{ fontSize: '0.82rem', marginBottom: '0.5rem' }}>{(compareResult.targets?.added || []).join(', ') || '—'}</div>
                    <div className="mono" style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Removed</div>
                    <div style={{ fontSize: '0.82rem' }}>{(compareResult.targets?.removed || []).join(', ') || '—'}</div>
                  </div>

                  <div className="glass-panel" style={{ padding: '0.7rem' }}>
                    <div className="mono" style={{ fontSize: '0.76rem', color: 'var(--accent-secondary)', marginBottom: '0.4rem' }}>Findings</div>
                    <div style={{ fontSize: '0.82rem', lineHeight: 1.45 }}>
                      <div>New: {compareResult.findings?.summary?.newCount || 0}</div>
                      <div>Remediated: {compareResult.findings?.summary?.remediatedCount || 0}</div>
                      <div>Changed: {compareResult.findings?.summary?.changedCount || 0}</div>
                      <div>Persisted: {compareResult.findings?.summary?.persistedCount || 0}</div>
                    </div>
                  </div>

                  <div className="glass-panel" style={{ padding: '0.7rem' }}>
                    <div className="mono" style={{ fontSize: '0.76rem', color: 'var(--accent-secondary)', marginBottom: '0.4rem' }}>Commands</div>
                    <div className="mono" style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Added</div>
                    <div style={{ fontSize: '0.82rem', marginBottom: '0.5rem' }}>{(compareResult.timeline?.commandDiff?.added || []).slice(0, 5).join(', ') || '—'}</div>
                    <div className="mono" style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Removed</div>
                    <div style={{ fontSize: '0.82rem' }}>{(compareResult.timeline?.commandDiff?.removed || []).slice(0, 5).join(', ') || '—'}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'session' && (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <div>
              <label className="mono" style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Tags</label>
              <input
                type="text"
                className="mono"
                value={sessionTags}
                onChange={(event) => setSessionTags(event.target.value)}
                placeholder="htb, external, ad, web"
              />
            </div>
            <div style={{ display: 'grid', gap: '0.45rem' }}>
              <div className="mono" style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Custom Fields</div>
              {customFieldRows.map((row, index) => (
                <div key={`field-${index}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 0.9fr) minmax(220px, 1.1fr) auto', gap: '0.45rem' }}>
                  <input
                    type="text"
                    className="mono"
                    value={row.key}
                    onChange={(event) => setCustomFieldRows((prev) => prev.map((entry, entryIndex) => entryIndex === index ? { ...entry, key: event.target.value } : entry))}
                    placeholder="Field name"
                  />
                  <input
                    type="text"
                    className="mono"
                    value={row.value}
                    onChange={(event) => setCustomFieldRows((prev) => prev.map((entry, entryIndex) => entryIndex === index ? { ...entry, value: event.target.value } : entry))}
                    placeholder="Field value"
                  />
                  <button type="button" className="btn-secondary mono" style={{ fontSize: '0.72rem', padding: '3px 9px' }} onClick={() => setCustomFieldRows((prev) => prev.filter((_, entryIndex) => entryIndex !== index).length > 0 ? prev.filter((_, entryIndex) => entryIndex !== index) : [{ key: '', value: '' }])}>
                    Remove
                  </button>
                </div>
              ))}
              <div>
                <button type="button" className="btn-secondary mono" style={{ fontSize: '0.76rem', padding: '4px 10px' }} onClick={() => setCustomFieldRows((prev) => [...prev, { key: '', value: '' }])}>
                  + Field
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn-primary mono" style={{ fontSize: '0.8rem', padding: '4px 12px' }} disabled={sessionBusy} onClick={() => void handleSaveSession()}>
                {sessionBusy ? 'Saving…' : 'Save Session Metadata'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'schedules' && (
          <div style={{ display: 'grid', gap: '0.85rem' }}>
            <div className="glass-panel" style={{ padding: '0.8rem', display: 'grid', gap: '0.55rem' }}>
              <div className="mono" style={{ fontSize: '0.76rem', color: 'var(--accent-secondary)' }}>Schedule Command</div>
              <textarea
                className="mono"
                rows={3}
                value={scheduleCommand}
                onChange={(event) => setScheduleCommand(event.target.value)}
                placeholder="Command to queue later"
                style={{ resize: 'vertical' }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.55rem' }}>
                <div>
                  <label className="mono" style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Run At</label>
                  <input type="datetime-local" value={scheduleRunAt} onChange={(event) => setScheduleRunAt(event.target.value)} />
                </div>
                <div>
                  <label className="mono" style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Target</label>
                  <select value={scheduleTargetId} onChange={(event) => setScheduleTargetId(event.target.value)} style={{ width: '100%', fontSize: '0.82rem', padding: '4px 8px' }}>
                    <option value="">Primary target</option>
                    {currentSessionTargets.map((target) => (
                      <option key={target.id} value={target.id}>{target.label || target.target}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mono" style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Timeout</label>
                  <select value={scheduleTimeout} onChange={(event) => setScheduleTimeout(event.target.value)} style={{ width: '100%', fontSize: '0.82rem', padding: '4px 8px' }}>
                    <option value="30000">30s</option>
                    <option value="60000">1 min</option>
                    <option value="120000">2 min</option>
                    <option value="300000">5 min</option>
                    <option value="600000">10 min</option>
                  </select>
                </div>
              </div>
              <input
                type="text"
                className="mono"
                value={scheduleTags}
                onChange={(event) => setScheduleTags(event.target.value)}
                placeholder="Tags (comma separated)"
              />
              <textarea
                className="mono"
                rows={2}
                value={scheduleNotes}
                onChange={(event) => setScheduleNotes(event.target.value)}
                placeholder="Notes"
                style={{ resize: 'vertical' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" className="btn-primary mono" style={{ fontSize: '0.8rem', padding: '4px 12px' }} disabled={scheduleBusy} onClick={() => void handleCreateSchedule()}>
                  {scheduleBusy ? 'Saving…' : 'Create Schedule'}
                </button>
              </div>
            </div>

            <ScheduleList schedules={schedules} onCancel={handleCancelSchedule} loading={schedulesLoading || scheduleBusy} />
          </div>
        )}
      </div>
    </div>
  );
}
