'use client';

import { useState } from 'react';
import { OUTPUT_PAGE_LINES, OUTPUT_PREVIEW_LINES, paginateOutput } from '@/lib/output-pagination';

function parseStructuredField(rawValue) {
  if (!rawValue) return null;
  if (typeof rawValue === 'object') return rawValue;
  try {
    return JSON.parse(rawValue);
  } catch {
    return null;
  }
}

function formatStructuredLabel(format = '') {
  const normalized = String(format || '').trim().toLowerCase();
  if (normalized === 'nmap-xml') return 'Nmap XML';
  if (normalized === 'json') return 'JSON';
  if (normalized === 'xml') return 'XML';
  return normalized ? normalized.toUpperCase() : '';
}

function StructuredSummary({ event }) {
  const summary = parseStructuredField(event.structured_output_summary);
  const format = String(event.structured_output_format || '').trim().toLowerCase();
  if (!summary) return null;

  if (format === 'nmap-xml') {
    return (
      <div style={{ marginBottom: '0.5rem', border: '1px solid rgba(88,166,255,0.18)', borderRadius: '8px', background: 'rgba(9,20,34,0.3)', padding: '0.55rem' }}>
        <div className="mono" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
          <span style={{ color: 'var(--accent-secondary)', fontSize: '0.76rem' }}>Structured Summary</span>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
            {formatStructuredLabel(format)}
          </span>
        </div>
        <div className="mono" style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          <span>{Number(summary.hostCount || 0)} hosts</span>
          <span>{Number(summary.serviceCount || 0)} services</span>
          <span>{Number(summary.vulnerabilityCount || 0)} CVEs</span>
        </div>
      </div>
    );
  }

  const genericSummary = format === 'json'
    ? `Root ${summary.rootType || 'value'}${Number.isFinite(summary.keyCount) ? `, ${summary.keyCount} keys` : ''}${Number.isFinite(summary.itemCount) ? `, ${summary.itemCount} items` : ''}`
    : `Root ${summary.rootKey || summary.rootType || 'xml'}`;

  return (
    <div className="mono" style={{ marginBottom: '0.5rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
      Structured output detected: {genericSummary}
    </div>
  );
}

export default function CommandEventCard({
  event,
  compareSelected = false,
  compareDisabled = false,
  copied = false,
  isOutputExpanded = false,
  currentPage = 0,
  onToggleCompare,
  onRetry,
  onCopyOutput,
  onSetOutputPage,
  onToggleOutput,
  onCancel,
  elapsedSeconds,
}) {
  const hasStructuredView = Boolean(event?.structured_output_pretty);
  const [outputMode, setOutputMode] = useState(hasStructuredView ? 'formatted' : 'raw');

  const activeOutput = outputMode === 'formatted'
    ? (event?.structured_output_pretty || event?.output || '')
    : (event?.output || '');
  const outputLines = activeOutput.split('\n');
  const isLong = outputLines.length > OUTPUT_PREVIEW_LINES;
  const pagedOutput = paginateOutput(activeOutput, currentPage, OUTPUT_PAGE_LINES);
  const isPagedOutput = pagedOutput.totalLines > OUTPUT_PAGE_LINES;
  const visibleOutput = isOutputExpanded
    ? (isPagedOutput ? pagedOutput.text : activeOutput)
    : outputLines.slice(0, OUTPUT_PREVIEW_LINES).join('\n');

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <input
          type="checkbox"
          title="Select for diff comparison"
          checked={compareSelected}
          onChange={() => onToggleCompare?.(event.id)}
          disabled={compareDisabled}
          style={{ accentColor: 'var(--accent-secondary)', cursor: 'pointer', flexShrink: 0 }}
        />
        <div className="event-command" style={{ flex: 1 }}>
          <span style={{ color: 'var(--accent-primary)' }}>$</span> {event.command}
        </div>
        {(event.status === 'failed' || event.status === 'error') && (
          <button
            onClick={() => onRetry?.(event.command)}
            className="mono"
            style={{ fontSize: '0.8rem', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--accent-warning)', color: 'var(--accent-warning)', background: 'transparent', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            ↩ Retry
          </button>
        )}
      </div>

      {hasStructuredView && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap', marginBottom: event.output ? '0.45rem' : 0 }}>
          <button
            className="btn-secondary mono"
            onClick={() => setOutputMode('formatted')}
            disabled={outputMode === 'formatted'}
            style={{ fontSize: '0.7rem', padding: '2px 7px' }}
          >
            Formatted
          </button>
          <button
            className="btn-secondary mono"
            onClick={() => setOutputMode('raw')}
            disabled={outputMode === 'raw'}
            style={{ fontSize: '0.7rem', padding: '2px 7px' }}
          >
            Raw
          </button>
          <span className="mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
            {formatStructuredLabel(event.structured_output_format)}
          </span>
        </div>
      )}

      {event.output && (
        <>
          <StructuredSummary event={event} />
          <div style={{ position: 'relative' }}>
            <pre className="event-output mono">{visibleOutput || 'No output.'}</pre>
            <button
              onClick={() => onCopyOutput?.(event.id, activeOutput)}
              title="Copy output"
              className="mono"
              style={{ position: 'absolute', top: '6px', right: '6px', fontSize: '0.72rem', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', color: copied ? 'var(--accent-primary)' : 'var(--text-muted)', background: 'rgba(1,4,9,0.85)', cursor: 'pointer', lineHeight: 1.5 }}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          {isOutputExpanded && isPagedOutput && (
            <div className="mono" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.4rem', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
              <button className="btn-secondary mono" style={{ fontSize: '0.72rem', padding: '2px 6px' }} disabled={pagedOutput.currentPage === 0} onClick={() => onSetOutputPage?.(event.id, 0)}>«</button>
              <button className="btn-secondary mono" style={{ fontSize: '0.72rem', padding: '2px 6px' }} disabled={pagedOutput.currentPage === 0} onClick={() => onSetOutputPage?.(event.id, pagedOutput.currentPage - 1)}>‹</button>
              <span>Lines {pagedOutput.startLine}-{pagedOutput.endLine} of {pagedOutput.totalLines}</span>
              <button className="btn-secondary mono" style={{ fontSize: '0.72rem', padding: '2px 6px' }} disabled={pagedOutput.currentPage >= pagedOutput.totalPages - 1} onClick={() => onSetOutputPage?.(event.id, pagedOutput.currentPage + 1)}>›</button>
              <button className="btn-secondary mono" style={{ fontSize: '0.72rem', padding: '2px 6px' }} disabled={pagedOutput.currentPage >= pagedOutput.totalPages - 1} onClick={() => onSetOutputPage?.(event.id, pagedOutput.totalPages - 1)}>»</button>
            </div>
          )}
          {isLong && (
            <button
              onClick={() => onToggleOutput?.(event.id)}
              className="mono"
              style={{ fontSize: '0.8rem', background: 'transparent', border: 'none', color: 'var(--accent-secondary)', cursor: 'pointer', padding: '3px 0', display: 'block' }}
            >
              {isOutputExpanded ? '▲ Collapse' : `▼ Show more (${outputLines.length - OUTPUT_PREVIEW_LINES} more lines)`}
            </button>
          )}
        </>
      )}

      {event.status !== 'running' && event.status !== 'queued' && !event.output && (
        <pre className="event-output mono">No output.</pre>
      )}

      {(event.status === 'running' || event.status === 'queued') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', color: 'var(--accent-warning)', fontSize: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span className="status-dot status-dot--running" />
            <span className="mono">
              {elapsedSeconds === null ? 'Running' : `${elapsedSeconds}s elapsed`}
            </span>
            <button
              onClick={() => onCancel?.(event.id)}
              style={{ background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.3)', borderRadius: '4px', color: '#ff5050', fontSize: '0.75rem', padding: '1px 6px', cursor: 'pointer' }}
            >
              ✕ Cancel
            </button>
          </div>
          {Number.isFinite(Number(event.progress_pct)) && Number(event.progress_pct) > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ flex: 1, minWidth: '180px', height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '999px', overflow: 'hidden', border: '1px solid rgba(88,166,255,0.2)' }}>
                <div style={{ width: `${Math.max(0, Math.min(100, Number(event.progress_pct)))}%`, height: '100%', background: 'linear-gradient(90deg, var(--accent-secondary), var(--accent-primary))' }} />
              </div>
              <span className="mono" style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{Number(event.progress_pct)}%</span>
            </div>
          )}
        </div>
      )}
    </>
  );
}
