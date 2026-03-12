import fs from 'fs';
import path from 'path';
import {
  getSession,
  getTimeline,
  getWriteup,
  listCredentials,
  listPocSteps,
  listFindings,
} from '@/lib/db';
import { listArtifacts } from '@/lib/artifact-repository';
import {
  buildAttackCoverage,
  buildRiskMatrix,
  filterFindings,
  normalizeReportFilters,
} from '@/lib/finding-intelligence';
import { listShellSessions, listShellTranscript } from '@/lib/shell-repository';
import {
  labReport,
  executiveSummary,
  technicalWalkthrough,
  ctfSolution,
  bugBountyReport,
  pentestReport,
  buildReportMeta,
} from '@/lib/report-formats';
import { resolveReportView } from '@/lib/report-views';
import { detectImageFormat, imageFormatToMime } from '@/lib/image-sniff';
import { isValidSessionId, requireSafeFilename, resolvePathWithin } from '@/lib/security';
import { normalizeAnalystName } from '@/lib/text-sanitize';

const FORMATS = {
  'lab-report': labReport,
  'executive-summary': executiveSummary,
  'technical-walkthrough': technicalWalkthrough,
  'ctf-solution': ctfSolution,
  'bug-bounty': bugBountyReport,
  pentest: pentestReport,
};

const SESSIONS_DIR = path.join(process.cwd(), 'data', 'sessions');

export function normalizeBoolean(value, fallback = true) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return fallback;
}

export function sanitizeDownloadToken(value, fallback = 'report') {
  const cleaned = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return cleaned || fallback;
}

const TIMELINE_CHART_COLORS = {
  command: '#00f5ff',
  note: '#ff8ee4',
  screenshot: '#7dfc00',
  flag: '#ffb347',
  credential: '#9ee8ff',
  default: '#89a8b8',
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function parseTimelineTimestamp(value) {
  const timestamp = Date.parse(String(value || ''));
  if (!Number.isFinite(timestamp)) return null;
  return timestamp;
}

function truncateTimelineLabel(value, maxLength = 72) {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  if (!normalized) return 'Timeline event';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function summarizeTimelineEvent(event = {}) {
  const type = String(event.type || '').trim().toLowerCase();
  if (type === 'command') return truncateTimelineLabel(event.command || 'Command');
  if (type === 'note') return truncateTimelineLabel(event.content || event.tag || 'Analyst note');
  if (type === 'screenshot') return truncateTimelineLabel(event.name || event.filename || 'Screenshot captured');
  if (type === 'flag') return truncateTimelineLabel(event.content || event.name || 'Flag captured');
  if (type === 'credential') return truncateTimelineLabel(event.content || event.name || 'Credential recorded');
  return truncateTimelineLabel(event.content || event.command || event.name || type || 'Timeline event');
}

function describeTimelineEventType(type) {
  const normalized = String(type || '').trim().toLowerCase();
  if (!normalized) return 'Event';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function getTimelineChartColor(type) {
  const normalized = String(type || '').trim().toLowerCase();
  return TIMELINE_CHART_COLORS[normalized] || TIMELINE_CHART_COLORS.default;
}

function getTimelineChartDurationMs(event, nextTimestampMs) {
  const type = String(event?.type || '').trim().toLowerCase();
  const baseDurationMs = type === 'command' ? 120000 : 60000;
  const minDurationMs = type === 'command' ? 30000 : 20000;
  const maxDurationMs = type === 'command' ? 300000 : 120000;
  if (!Number.isFinite(nextTimestampMs)) {
    return baseDurationMs;
  }
  return clamp(nextTimestampMs - parseTimelineTimestamp(event?.timestamp), minDurationMs, maxDurationMs);
}

export function buildTimelineChartData(events = []) {
  const source = Array.isArray(events) ? events : [];
  const normalized = source
    .map((event) => {
      const timestampMs = parseTimelineTimestamp(event?.timestamp);
      if (!Number.isFinite(timestampMs)) return null;
      return { event, timestampMs };
    })
    .filter(Boolean)
    .sort((left, right) => left.timestampMs - right.timestampMs);

  if (normalized.length === 0) return null;

  const entries = normalized.map(({ event, timestampMs }, index) => {
    const nextTimestampMs = normalized[index + 1]?.timestampMs;
    const durationMs = getTimelineChartDurationMs(event, nextTimestampMs);
    const endTimestampMs = timestampMs + durationMs;
    const startedAt = new Date(timestampMs);
    const endedAt = new Date(endTimestampMs);
    const summary = summarizeTimelineEvent(event);
    const typeLabel = describeTimelineEventType(event?.type);
    const statusLabel = String(event?.status || 'recorded').trim() || 'recorded';
    const timeLabel = startedAt.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    return {
      id: String(event?.id || `timeline-${index}`),
      label: `${timeLabel} · ${summary}`,
      summary,
      type: String(event?.type || '').trim().toLowerCase() || 'event',
      typeLabel,
      statusLabel,
      start: startedAt.toISOString(),
      end: endedAt.toISOString(),
      startDisplay: startedAt.toLocaleString(),
      endDisplay: endedAt.toLocaleString(),
      durationMs,
      color: getTimelineChartColor(event?.type),
    };
  });

  return {
    entries,
    caption: 'Timeline events are stored with a single timestamp; single-point events are rendered as short windows for chart visibility.',
  };
}

function parseMediaPath(rawUrl) {
  const raw = String(rawUrl || '').trim();
  if (!raw) return null;

  let pathname = raw;
  try {
    if (/^https?:\/\//i.test(raw)) {
      pathname = new URL(raw).pathname || raw;
    }
  } catch {
    pathname = raw;
  }

  const match = pathname.match(/^\/api\/media\/([^/]+)\/([^?#)]+)$/i);
  if (!match) return null;

  let sessionId;
  let filename;
  try {
    sessionId = decodeURIComponent(match[1]);
    filename = decodeURIComponent(match[2]);
  } catch {
    return null;
  }

  if (!isValidSessionId(sessionId)) return null;
  try {
    requireSafeFilename(filename);
  } catch {
    return null;
  }

  return { sessionId, filename };
}

function readImageAsDataUri(sessionId, filename) {
  try {
    if (!isValidSessionId(sessionId)) return null;
    requireSafeFilename(filename);
    const filePath = resolvePathWithin(SESSIONS_DIR, sessionId, 'screenshots', filename);
    if (!fs.existsSync(filePath)) return null;
    const buffer = fs.readFileSync(filePath);
    const format = detectImageFormat(buffer);
    const mime = imageFormatToMime(format);
    if (!mime) return null;
    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

export function inlineMarkdownImages(markdown) {
  const imageRegex = /!\[(.*?)\]\((.*?)\)/g;
  return String(markdown || '').replace(imageRegex, (full, altText, url) => {
    const parsed = parseMediaPath(url);
    if (!parsed) return full;
    const dataUri = readImageAsDataUri(parsed.sessionId, parsed.filename);
    if (!dataUri) return full;
    return `![${altText}](${dataUri})`;
  });
}

function hydrateTimelineInlineImages(events, sessionId, inlineImages) {
  if (!inlineImages) return events;
  return events.map((event) => {
    if (event.type !== 'screenshot' || !event.filename) return event;
    const dataUri = readImageAsDataUri(sessionId, event.filename);
    if (!dataUri) return event;
    return { ...event, imageDataUri: dataUri };
  });
}

function hydratePocInlineImages(pocSteps, sessionId, inlineImages) {
  if (!inlineImages) return pocSteps;
  return pocSteps.map((step) => {
    let screenshotDataUri = null;
    let screenshotEvent = step.screenshotEvent || null;
    if (screenshotEvent?.filename) {
      screenshotDataUri = readImageAsDataUri(sessionId, screenshotEvent.filename);
      if (screenshotDataUri) {
        screenshotEvent = { ...screenshotEvent, imageDataUri: screenshotDataUri };
      }
    }
    return screenshotDataUri
      ? { ...step, screenshotDataUri, screenshotEvent }
      : step;
  });
}

function parseWriteupSnapshot(writeup) {
  if (!writeup) return null;
  let contentJson = null;
  if (writeup.content_json) {
    try {
      contentJson = JSON.parse(writeup.content_json);
    } catch {
      contentJson = null;
    }
  }
  return {
    id: writeup.id,
    sessionId: writeup.session_id,
    content: writeup.content || '',
    contentJson,
    status: writeup.status || null,
    visibility: writeup.visibility || null,
    updatedAt: writeup.updated_at || null,
  };
}

export function buildExportBundle({
  sessionId,
  format = '',
  audiencePack = '',
  presetId = '',
  analystName = 'Unknown',
  inlineImages = false,
  reportFilters = {},
}) {
  const safeAnalystName = normalizeAnalystName(analystName);
  const session = getSession(sessionId);
  if (!session) {
    return null;
  }

  const timeline = getTimeline(sessionId);
  const pocSteps = listPocSteps(sessionId);
  const findings = listFindings(sessionId);
  const view = resolveReportView({
    format,
    audiencePack,
    presetId,
    reportFilters,
  });
  const normalizedReportFilters = view.reportFilters;
  const reportFindings = filterFindings(findings, normalizedReportFilters);
  const findingIntelligence = {
    riskMatrix: buildRiskMatrix(reportFindings),
    attackCoverage: buildAttackCoverage(reportFindings),
  };
  const credentials = listCredentials(sessionId);
  const shellSessions = listShellSessions(sessionId);
  const shellTranscripts = Object.fromEntries(
    shellSessions.map((shellSession) => [
      shellSession.id,
      listShellTranscript(sessionId, shellSession.id, { cursor: 0, limit: 5000 }),
    ])
  );
  const artifacts = listArtifacts(sessionId);
  const generatedAt = new Date();
  const formatGenerator = FORMATS[view.format] || technicalWalkthrough;
  const reportMeta = buildReportMeta(session, view.format, safeAnalystName, generatedAt);
  const reportMarkdownRaw = formatGenerator(session, timeline, safeAnalystName, {
    pocSteps,
    findings: reportFindings,
    allFindings: findings,
    reportFilters: normalizedReportFilters,
    findingIntelligence,
    credentials,
    generatedAt,
  });
  const reportMarkdown = inlineImages ? inlineMarkdownImages(reportMarkdownRaw) : reportMarkdownRaw;

  const timelineHydrated = hydrateTimelineInlineImages(timeline, sessionId, inlineImages);
  const pocHydrated = hydratePocInlineImages(pocSteps, sessionId, inlineImages);
  const writeup = parseWriteupSnapshot(getWriteup(sessionId));

  return {
    session,
    format: view.format,
    audiencePack: view.audiencePack,
    presetId: view.presetId,
    view,
    analystName: safeAnalystName,
    reportMeta,
    reportMarkdown,
    timeline: timelineHydrated,
    pocSteps: pocHydrated,
    findings,
    reportFindings,
    reportFilters: normalizedReportFilters,
    findingIntelligence,
    credentials,
    shellSessions,
    shellTranscripts,
    artifacts,
    writeup,
  };
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/`/g, '&#96;');
}

function serializeJsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function renderInline(text) {
  let value = escapeHtml(text);
  value = value.replace(/`([^`]+)`/g, '<code>$1</code>');
  value = value.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  value = value.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return value;
}

export function markdownToHtmlContent(markdown) {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let paragraphLines = [];
  let listType = null;
  let listItems = [];
  let codeFence = null;
  let codeLines = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    const value = paragraphLines.join(' ').trim();
    if (value) html.push(`<p>${renderInline(value)}</p>`);
    paragraphLines = [];
  };

  const flushList = () => {
    if (!listType || listItems.length === 0) {
      listType = null;
      listItems = [];
      return;
    }
    const tag = listType === 'ol' ? 'ol' : 'ul';
    html.push(`<${tag}>${listItems.map((item) => `<li>${renderInline(item)}</li>`).join('')}</${tag}>`);
    listType = null;
    listItems = [];
  };

  const flushCode = () => {
    if (codeFence === null) return;
    const className = codeFence ? ` class="language-${escapeAttr(codeFence)}"` : '';
    html.push(`<pre><code${className}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
    codeFence = null;
    codeLines = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    const fenceMatch = trimmed.match(/^```([\w+-]+)?$/);
    if (fenceMatch) {
      flushParagraph();
      flushList();
      if (codeFence !== null) {
        flushCode();
      } else {
        codeFence = fenceMatch[1] || '';
      }
      continue;
    }

    if (codeFence !== null) {
      codeLines.push(rawLine);
      continue;
    }

    if (trimmed === '') {
      flushParagraph();
      flushList();
      continue;
    }

    const h3 = trimmed.match(/^###\s+(.+)$/);
    if (h3) {
      flushParagraph();
      flushList();
      html.push(`<h3>${renderInline(h3[1])}</h3>`);
      continue;
    }
    const h2 = trimmed.match(/^##\s+(.+)$/);
    if (h2) {
      flushParagraph();
      flushList();
      html.push(`<h2>${renderInline(h2[1])}</h2>`);
      continue;
    }
    const h1 = trimmed.match(/^#\s+(.+)$/);
    if (h1) {
      flushParagraph();
      flushList();
      html.push(`<h1>${renderInline(h1[1])}</h1>`);
      continue;
    }

    if (/^[-*_]{3,}$/.test(trimmed)) {
      flushParagraph();
      flushList();
      html.push('<hr />');
      continue;
    }

    const imageMatch = trimmed.match(/^!\[(.*?)\]\((.*?)\)$/);
    if (imageMatch) {
      flushParagraph();
      flushList();
      const alt = escapeAttr(imageMatch[1] || 'Screenshot');
      const src = escapeAttr(imageMatch[2] || '');
      html.push(`<figure><img src="${src}" alt="${alt}" loading="lazy" /></figure>`);
      continue;
    }

    const olMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      flushParagraph();
      if (listType !== 'ol') flushList();
      listType = 'ol';
      listItems.push(olMatch[1]);
      continue;
    }

    const ulMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (ulMatch) {
      flushParagraph();
      if (listType !== 'ul') flushList();
      listType = 'ul';
      listItems.push(ulMatch[1]);
      continue;
    }

    if (trimmed.startsWith('>')) {
      flushParagraph();
      flushList();
      const blockText = trimmed.replace(/^>\s?/, '');
      html.push(`<blockquote>${renderInline(blockText)}</blockquote>`);
      continue;
    }

    paragraphLines.push(trimmed);
  }

  flushParagraph();
  flushList();
  flushCode();

  return html.join('\n');
}

export function buildStandaloneHtmlDocument({
  title,
  session,
  format,
  analystName,
  markdown,
  reportMeta,
  timeline = [],
}) {
  const contentHtml = markdownToHtmlContent(markdown);
  const generatedAt = reportMeta?.generatedAtIso || new Date().toISOString();
  const pageTitle = title || `${session?.name || 'session'}-${format || 'report'}`;
  const target = session?.target ? `<span class="meta-chip">Target: ${escapeHtml(session.target)}</span>` : '';
  const difficulty = session?.difficulty ? `<span class="meta-chip">Difficulty: ${escapeHtml(String(session.difficulty).toUpperCase())}</span>` : '';
  const objective = session?.objective ? `<span class="meta-chip">Objective: ${escapeHtml(session.objective)}</span>` : '';
  const timelineChart = buildTimelineChartData(timeline);
  const timelinePanel = timelineChart
    ? `
    <section class="timeline-panel">
      <div class="timeline-head">
        <h2>Attack Timeline</h2>
        <p class="timeline-caption">${escapeHtml(timelineChart.caption)}</p>
      </div>
      <div id="attack-timeline-chart" class="timeline-chart" aria-label="Attack timeline gantt chart"></div>
    </section>`
    : '';
  const timelineScript = timelineChart
    ? `
  <script src="https://cdn.plot.ly/plotly-2.35.2.min.js"></script>
  <script>
    (function () {
      const timelineChart = ${serializeJsonForScript(timelineChart)};
      if (!timelineChart || !Array.isArray(timelineChart.entries) || timelineChart.entries.length === 0 || !window.Plotly) {
        return;
      }
      const entries = timelineChart.entries;
      const trace = {
        type: 'bar',
        orientation: 'h',
        base: entries.map((entry) => entry.start),
        x: entries.map((entry) => entry.durationMs),
        y: entries.map((entry) => entry.label),
        marker: {
          color: entries.map((entry) => entry.color),
          line: {
            color: 'rgba(6, 11, 19, 0.65)',
            width: 1,
          },
        },
        customdata: entries.map((entry) => [
          entry.typeLabel,
          entry.statusLabel,
          entry.startDisplay,
          entry.endDisplay,
          entry.summary,
        ]),
        hovertemplate: '<b>%{y}</b><br>Type: %{customdata[0]}<br>Status: %{customdata[1]}<br>Start: %{customdata[2]}<br>Window end: %{customdata[3]}<br>%{customdata[4]}<extra></extra>',
      };
      const layout = {
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(8, 13, 21, 0.92)',
        margin: { l: 170, r: 24, t: 18, b: 48 },
        height: Math.max(320, entries.length * 36 + 110),
        showlegend: false,
        bargap: 0.28,
        xaxis: {
          type: 'date',
          gridcolor: 'rgba(137, 168, 184, 0.14)',
          tickfont: { color: '#89a8b8', size: 11 },
          title: { text: 'Session time', font: { color: '#89a8b8', size: 12 } },
        },
        yaxis: {
          autorange: 'reversed',
          tickfont: { color: '#d4e7ee', size: 11 },
          automargin: true,
        },
      };
      const config = { responsive: true, displayModeBar: false };
      window.Plotly.newPlot('attack-timeline-chart', [trace], layout, config);
    })();
  </script>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(pageTitle)}</title>
  <style>
    :root {
      --bg: #060b13;
      --panel: #0d1522;
      --text: #d4e7ee;
      --muted: #89a8b8;
      --accent: #00f5ff;
      --accent-2: #7dfc00;
      --border: #214157;
      --code-bg: #08121e;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 1.4rem;
      font-family: "Segoe UI", "Inter", Arial, sans-serif;
      background: radial-gradient(circle at 20% -10%, #12324a 0%, var(--bg) 45%, #04070c 100%);
      color: var(--text);
      line-height: 1.65;
    }
    .wrap { max-width: 1020px; margin: 0 auto; }
    .head {
      border: 1px solid var(--border);
      background: linear-gradient(135deg, rgba(13,21,34,0.95), rgba(8,13,21,0.9));
      border-radius: 12px;
      padding: 1rem 1.1rem;
      margin-bottom: 1rem;
    }
    .title { margin: 0 0 0.35rem 0; font-size: 1.2rem; color: var(--accent); letter-spacing: 0.3px; }
    .meta { display: flex; flex-wrap: wrap; gap: 0.4rem; color: var(--muted); font-size: 0.86rem; }
    .meta-chip { border: 1px solid var(--border); border-radius: 999px; padding: 0.18rem 0.58rem; background: rgba(10, 18, 30, 0.8); }
    article {
      border: 1px solid var(--border);
      background: rgba(8, 13, 21, 0.88);
      border-radius: 12px;
      padding: 1.1rem 1.2rem;
      overflow-wrap: anywhere;
    }
    .timeline-panel {
      border: 1px solid var(--border);
      background: rgba(8, 13, 21, 0.88);
      border-radius: 12px;
      padding: 1rem 1.1rem;
      margin-bottom: 1rem;
    }
    .timeline-head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 0.8rem;
      flex-wrap: wrap;
      margin-bottom: 0.6rem;
    }
    .timeline-head h2 {
      margin: 0;
      color: var(--accent);
      font-size: 1rem;
    }
    .timeline-caption {
      margin: 0;
      color: var(--muted);
      font-size: 0.77rem;
      max-width: 46rem;
    }
    .timeline-chart {
      min-height: 320px;
      width: 100%;
    }
    h1,h2,h3 { margin-top: 1rem; margin-bottom: 0.45rem; line-height: 1.3; }
    h1 { font-size: 1.42rem; color: var(--accent); border-bottom: 1px solid var(--border); padding-bottom: 0.3rem; }
    h2 { font-size: 1.12rem; color: #ff8ee4; }
    h3 { font-size: 1rem; color: #98ffa0; }
    p { margin: 0.45rem 0 0.8rem; }
    ul,ol { margin: 0.25rem 0 0.8rem 1.2rem; }
    blockquote {
      margin: 0.55rem 0 0.8rem;
      border-left: 3px solid var(--accent);
      padding: 0.35rem 0.7rem;
      color: #b8d3df;
      background: rgba(9, 26, 37, 0.7);
      border-radius: 0 6px 6px 0;
    }
    hr { border: none; border-top: 1px solid var(--border); margin: 0.95rem 0; }
    pre {
      margin: 0.5rem 0 0.85rem;
      padding: 0.72rem 0.78rem;
      overflow-x: auto;
      background: var(--code-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
    }
    code {
      font-family: "Consolas", "Courier New", monospace;
      font-size: 0.84rem;
    }
    p code, li code, blockquote code {
      border: 1px solid var(--border);
      border-radius: 5px;
      padding: 0.07rem 0.35rem;
      background: rgba(8, 18, 30, 0.85);
      color: #9ee8ff;
    }
    figure { margin: 0.6rem 0 0.95rem; }
    img {
      max-width: 100%;
      height: auto;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: #02060c;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 0.6rem 0 0.9rem;
      border: 1px solid var(--border);
      font-size: 0.9rem;
      display: block;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
    th, td {
      border: 1px solid var(--border);
      padding: 0.38rem 0.52rem;
      text-align: left;
      vertical-align: top;
      white-space: nowrap;
    }
    th {
      background: rgba(13, 26, 39, 0.86);
      color: #c5ecff;
      font-weight: 600;
    }
    @media (max-width: 1024px) {
      body { padding: 1.1rem; }
      .wrap { max-width: 960px; }
      .head { padding: 0.9rem 1rem; }
      .timeline-panel { padding: 0.9rem 1rem; }
      article { padding: 1rem; }
    }
    @media (max-width: 768px) {
      body { padding: 0.85rem; line-height: 1.58; }
      .wrap { max-width: 100%; }
      .head { border-radius: 10px; padding: 0.82rem 0.86rem; }
      .timeline-panel { border-radius: 10px; padding: 0.82rem 0.86rem; }
      .title { font-size: 1.05rem; margin-bottom: 0.3rem; }
      .meta { display: grid; grid-template-columns: 1fr; gap: 0.34rem; }
      .meta-chip { width: 100%; font-size: 0.82rem; padding: 0.24rem 0.5rem; }
      .timeline-head { align-items: flex-start; }
      .timeline-chart { min-height: 280px; }
      article { border-radius: 10px; padding: 0.86rem 0.82rem; }
      h1 { font-size: 1.2rem; }
      h2 { font-size: 1.02rem; }
      h3 { font-size: 0.94rem; }
      p, li, blockquote { font-size: 0.93rem; }
      ul, ol { margin-left: 1rem; }
      pre { padding: 0.62rem 0.64rem; border-radius: 7px; }
      code { font-size: 0.8rem; }
      footer { text-align: left; font-size: 0.74rem; }
    }
    @media (max-width: 520px) {
      body { padding: 0.62rem; }
      .title { font-size: 0.98rem; }
      .meta-chip { font-size: 0.79rem; }
      .timeline-panel { padding: 0.72rem 0.68rem; }
      article { padding: 0.7rem 0.65rem; }
      h1 { font-size: 1.08rem; }
      p, li, blockquote { font-size: 0.9rem; }
      table { font-size: 0.82rem; }
      th, td { padding: 0.3rem 0.42rem; }
    }
    footer {
      margin-top: 0.9rem;
      color: var(--muted);
      font-size: 0.78rem;
      text-align: right;
    }
    @media print {
      body { padding: 0; background: #fff; color: #111; }
      .head, article { border: 1px solid #ddd; background: #fff; }
      .title { color: #0a5f8a; }
      h1 { color: #0a5f8a; border-color: #ddd; }
      h2 { color: #623c92; }
      h3 { color: #2b7148; }
      blockquote { border-left-color: #0a5f8a; background: #f6fbff; color: #222; }
      pre { background: #f7f8fa; border-color: #ddd; color: #111; }
      p code, li code, blockquote code { background: #f0f1f2; border-color: #ddd; color: #0d3f5a; }
      table { display: table; overflow: visible; border-color: #ddd; }
      th, td { border-color: #ddd; white-space: normal; }
      footer { color: #666; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="head">
      <h1 class="title">${escapeHtml(pageTitle)}</h1>
      <div class="meta">
        <span class="meta-chip">Generated: ${escapeHtml(generatedAt)}</span>
        <span class="meta-chip">Format: ${escapeHtml(format)}</span>
        <span class="meta-chip">Analyst: ${escapeHtml(analystName || 'Unknown')}</span>
        ${target}
        ${difficulty}
        ${objective}
      </div>
    </section>
${timelinePanel}
    <article>
${contentHtml}
    </article>
    <footer>Exported by Helm's Watch</footer>
  </div>
${timelineScript}
</body>
</html>`;
}
