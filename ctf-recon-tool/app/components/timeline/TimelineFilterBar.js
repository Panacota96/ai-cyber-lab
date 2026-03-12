'use client';

import {
  getActiveTimelineFilterCount,
  hasActiveTimelineFilters,
  TIMELINE_FILTER_STATUS_OPTIONS,
  TIMELINE_FILTER_TYPES,
} from '@/lib/timeline-filters';

const buttonStyle = {
  fontSize: '0.78rem',
  padding: '3px 8px',
  borderRadius: '4px',
  whiteSpace: 'nowrap',
};

const secondarySelectStyle = {
  fontSize: '0.78rem',
  padding: '3px 6px',
  background: 'rgba(1,4,9,0.6)',
  border: '1px solid var(--border-color)',
  color: 'var(--text-muted)',
  borderRadius: '4px',
};

function TypeButtons({ filters, onChangeFilters }) {
  return (
    <>
      {TIMELINE_FILTER_TYPES.map((item) => (
        <button
          key={item.value}
          onClick={() => onChangeFilters?.({ type: item.value })}
          className="mono"
          style={{
            ...buttonStyle,
            border: '1px solid var(--border-color)',
            background: filters.type === item.value ? 'var(--accent-primary)' : 'transparent',
            color: filters.type === item.value ? '#000' : 'var(--text-muted)',
            cursor: 'pointer',
            letterSpacing: '0.5px',
          }}
        >
          {item.label}
        </button>
      ))}
    </>
  );
}

function FilterControls({
  filters,
  allTimelineTags,
  filterKeywordRef,
  onChangeFilters,
  onClearFilters,
}) {
  const hasActiveFilters = hasActiveTimelineFilters(filters);

  return (
    <>
      <TypeButtons filters={filters} onChangeFilters={onChangeFilters} />
      <select
        value={filters.status}
        onChange={(event) => onChangeFilters?.({ status: event.target.value })}
        style={secondarySelectStyle}
      >
        {TIMELINE_FILTER_STATUS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <select
        value={filters.tag}
        onChange={(event) => onChangeFilters?.({ tag: event.target.value })}
        style={{ ...secondarySelectStyle, maxWidth: '140px' }}
      >
        <option value="">Any tag</option>
        {allTimelineTags.map((tag) => (
          <option key={tag} value={tag}>
            #{tag}
          </option>
        ))}
      </select>
      <input
        ref={filterKeywordRef}
        type="text"
        value={filters.keyword}
        onChange={(event) => onChangeFilters?.({ keyword: event.target.value })}
        placeholder="Search... (Ctrl+F)"
        className="mono"
        style={{
          fontSize: '0.8rem',
          padding: '3px 8px',
          background: 'rgba(1,4,9,0.6)',
          border: '1px solid var(--border-color)',
          color: 'var(--text-main)',
          borderRadius: '4px',
          flex: '1 1 120px',
          outline: 'none',
          minWidth: '80px',
        }}
      />
      {hasActiveFilters && (
        <button
          onClick={() => onClearFilters?.()}
          className="mono"
          style={{
            ...buttonStyle,
            border: '1px solid rgba(248,81,73,0.4)',
            color: 'rgba(248,81,73,0.8)',
            background: 'transparent',
            cursor: 'pointer',
          }}
        >
          ✕
        </button>
      )}
    </>
  );
}

function ActionButtons({
  compact = false,
  timelineCollapsed = false,
  onCollapseAll,
  onExpandAll,
  onExportTimeline,
  onLoadDbStats,
  compareSelectionCount = 0,
  onOpenDiff,
  onClearDiff,
  selectedScreenshotCount = 0,
  onDeleteSelectedScreenshots,
  onClearSelectedScreenshots,
}) {
  return (
    <>
      <button
        onClick={onCollapseAll}
        className="mono btn-secondary"
        style={buttonStyle}
        title="Collapse timeline events"
        disabled={timelineCollapsed}
      >
        Collapse All
      </button>
      <button
        onClick={onExpandAll}
        className="mono btn-secondary"
        style={buttonStyle}
        title="Expand timeline events"
        disabled={!timelineCollapsed}
      >
        Expand All
      </button>
      <button onClick={onExportTimeline} className="mono btn-secondary" style={buttonStyle} title="Export timeline">
        {compact ? 'Export' : '↓'}
      </button>
      <button onClick={onLoadDbStats} className="mono btn-secondary" style={buttonStyle} title="DB stats">
        {compact ? 'DB' : '⚙'}
      </button>
      {compareSelectionCount === 2 && (
        <>
          <button
            onClick={onOpenDiff}
            className="mono"
            style={{
              ...buttonStyle,
              border: '1px solid rgba(88,166,255,0.5)',
              color: 'var(--accent-secondary)',
              background: 'transparent',
              cursor: 'pointer',
            }}
            title="Compare selected command outputs"
          >
            Diff →
          </button>
          <button onClick={onClearDiff} className="mono btn-secondary" style={buttonStyle} title="Clear diff selection">
            ✕
          </button>
        </>
      )}
      {selectedScreenshotCount > 0 && (
        <>
          <span
            className="mono"
            style={{
              fontSize: '0.76rem',
              padding: '3px 8px',
              whiteSpace: 'nowrap',
              borderRadius: '999px',
              border: '1px solid rgba(63,185,80,0.4)',
              color: '#3fb950',
              background: 'rgba(63,185,80,0.1)',
            }}
          >
            {selectedScreenshotCount} selected
          </span>
          <button
            onClick={onDeleteSelectedScreenshots}
            className="mono"
            style={{
              ...buttonStyle,
              border: '1px solid var(--accent-danger)',
              color: 'var(--accent-danger)',
              background: 'transparent',
              cursor: 'pointer',
            }}
          >
            🗑 {selectedScreenshotCount}
          </button>
          <button onClick={onClearSelectedScreenshots} className="mono btn-secondary" style={buttonStyle}>
            ✕
          </button>
        </>
      )}
    </>
  );
}

export default function TimelineFilterBar({
  compact = false,
  compactOpen = false,
  sidebarCollapsed = false,
  isOverlaySidebar = false,
  filters,
  allTimelineTags = [],
  filterKeywordRef,
  timelineCollapsed = false,
  compareSelectionCount = 0,
  selectedScreenshotCount = 0,
  onToggleCompactOpen,
  onToggleSidebarCollapse,
  onChangeFilters,
  onClearFilters,
  onCollapseAll,
  onExpandAll,
  onExportTimeline,
  onLoadDbStats,
  onOpenDiff,
  onClearDiff,
  onDeleteSelectedScreenshots,
  onClearSelectedScreenshots,
}) {
  const activeFilterCount = getActiveTimelineFilterCount(filters);

  if (compact) {
    return (
      <div className="filter-toolbar">
        <div className="filter-row" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {sidebarCollapsed && !isOverlaySidebar && (
              <button
                className="btn-secondary mono sidebar-toggle-btn"
                onClick={onToggleSidebarCollapse}
                title="Pin sidebar"
                style={{ marginRight: '0.15rem' }}
              >
                »
              </button>
            )}
            <button
              type="button"
              className="mono btn-secondary"
              data-testid="timeline-filter-toggle"
              onClick={onToggleCompactOpen}
              style={{
                ...buttonStyle,
                borderColor: activeFilterCount > 0 ? 'rgba(88,166,255,0.55)' : undefined,
                color: activeFilterCount > 0 ? 'var(--accent-secondary)' : undefined,
              }}
            >
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </button>
          </div>
          <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <ActionButtons
              compact
              timelineCollapsed={timelineCollapsed}
              onCollapseAll={onCollapseAll}
              onExpandAll={onExpandAll}
              onExportTimeline={onExportTimeline}
              onLoadDbStats={onLoadDbStats}
              compareSelectionCount={compareSelectionCount}
              onOpenDiff={onOpenDiff}
              onClearDiff={onClearDiff}
              selectedScreenshotCount={selectedScreenshotCount}
              onDeleteSelectedScreenshots={onDeleteSelectedScreenshots}
              onClearSelectedScreenshots={onClearSelectedScreenshots}
            />
          </div>
        </div>
        {compactOpen && (
          <div
            data-testid="timeline-filter-panel"
            style={{
              marginTop: '0.45rem',
              border: '1px solid rgba(88,166,255,0.18)',
              borderRadius: '8px',
              padding: '0.6rem',
              background: 'rgba(1,4,9,0.46)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.4rem',
            }}
          >
            <FilterControls
              filters={filters}
              allTimelineTags={allTimelineTags}
              filterKeywordRef={filterKeywordRef}
              onChangeFilters={onChangeFilters}
              onClearFilters={onClearFilters}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="filter-toolbar">
      <div className="filter-row">
        {sidebarCollapsed && !isOverlaySidebar && (
          <button className="btn-secondary mono sidebar-toggle-btn" onClick={onToggleSidebarCollapse} title="Pin sidebar" style={{ marginRight: '0.25rem' }}>
            »
          </button>
        )}
        <FilterControls
          filters={filters}
          allTimelineTags={allTimelineTags}
          filterKeywordRef={filterKeywordRef}
          onChangeFilters={onChangeFilters}
          onClearFilters={onClearFilters}
        />
        <ActionButtons
          timelineCollapsed={timelineCollapsed}
          onCollapseAll={onCollapseAll}
          onExpandAll={onExpandAll}
          onExportTimeline={onExportTimeline}
          onLoadDbStats={onLoadDbStats}
          compareSelectionCount={compareSelectionCount}
          onOpenDiff={onOpenDiff}
          onClearDiff={onClearDiff}
          selectedScreenshotCount={selectedScreenshotCount}
          onDeleteSelectedScreenshots={onDeleteSelectedScreenshots}
          onClearSelectedScreenshots={onClearSelectedScreenshots}
        />
      </div>
    </div>
  );
}
