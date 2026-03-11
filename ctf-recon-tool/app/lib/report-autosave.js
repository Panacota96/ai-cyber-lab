export function buildReportAutosaveKey(sessionId, format) {
  return `report.autosave.${String(sessionId || 'default')}.${String(format || 'technical-walkthrough')}`;
}

export function parseAutosavePayload(rawValue) {
  try {
    const parsed = JSON.parse(String(rawValue || ''));
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.blocks)) return null;
    const savedAt = parsed.savedAt ? new Date(parsed.savedAt).getTime() : null;
    return {
      savedAt: Number.isFinite(savedAt) ? savedAt : null,
      blocks: parsed.blocks,
    };
  } catch {
    return null;
  }
}

function parseTimestamp(value) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.getTime() : null;
}

export function chooseReportDraftSource({ localDraft, serverUpdatedAt, hasServerContent }) {
  const localSavedAt = Number(localDraft?.savedAt || 0);
  const serverSavedAt = parseTimestamp(serverUpdatedAt) || 0;

  if (localDraft?.blocks?.length && (!hasServerContent || localSavedAt >= serverSavedAt)) {
    return {
      source: 'local',
      notice: 'Recovered newer local draft.',
      blocks: localDraft.blocks,
    };
  }

  return {
    source: hasServerContent ? 'server' : 'generated',
    notice: hasServerContent ? 'Loaded saved writeup.' : '',
    blocks: null,
  };
}
