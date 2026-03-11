import crypto from 'node:crypto';

const PROGRESS_PERCENT_RE = /\b(\d{1,3})\s*%/g;
const PROGRESS_FRACTION_RE = /\b(\d{1,6})\s*\/\s*(\d{1,6})\b/g;
const PROGRESS_HINT_RE = /\b(progress|complete|completed|done|processed|processing|scanned|scanning|tested|testing|checked|checking|attempt|attempts|eta|percent|pct)\b/i;

function clampProgress(value) {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function buildCommandHash(command) {
  const normalized = String(command || '').trim();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function looksLikeProgressFraction(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return false;
  if (PROGRESS_HINT_RE.test(trimmed)) return true;
  return /^\[?\s*\d{1,6}\s*\/\s*\d{1,6}\s*\]?(\s|$|[:\-])/i.test(trimmed);
}

export function extractProgressPct(chunk, previousPct = 0) {
  const lines = String(chunk || '').split(/\r?\n/);
  let best = null;

  for (const line of lines) {
    if (!line) continue;

    let percentMatch;
    while ((percentMatch = PROGRESS_PERCENT_RE.exec(line)) !== null) {
      const pct = clampProgress(Number(percentMatch[1]));
      if (pct !== null && pct > previousPct) {
        best = best === null ? pct : Math.max(best, pct);
      }
    }
    PROGRESS_PERCENT_RE.lastIndex = 0;

    if (!looksLikeProgressFraction(line)) continue;

    let fractionMatch;
    while ((fractionMatch = PROGRESS_FRACTION_RE.exec(line)) !== null) {
      const current = Number(fractionMatch[1]);
      const total = Number(fractionMatch[2]);
      if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0 || current < 0 || current > total) {
        continue;
      }
      const pct = clampProgress((current / total) * 100);
      if (pct !== null && pct > previousPct) {
        best = best === null ? pct : Math.max(best, pct);
      }
    }
    PROGRESS_FRACTION_RE.lastIndex = 0;
  }

  return best;
}
