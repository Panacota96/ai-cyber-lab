import fs from 'fs';
import path from 'path';
import {
  getSession,
  getTimeline,
  getWriteup,
  listPocSteps,
  listFindings,
} from '@/lib/db';
import {
  labReport,
  executiveSummary,
  technicalWalkthrough,
  ctfSolution,
  bugBountyReport,
  pentestReport,
} from '@/lib/report-formats';
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
  format = 'technical-walkthrough',
  analystName = 'Unknown',
  inlineImages = false,
}) {
  const safeAnalystName = normalizeAnalystName(analystName);
  const session = getSession(sessionId);
  if (!session) {
    return null;
  }

  const timeline = getTimeline(sessionId);
  const pocSteps = listPocSteps(sessionId);
  const findings = listFindings(sessionId);
  const formatGenerator = FORMATS[format] || technicalWalkthrough;
  const reportMarkdownRaw = formatGenerator(session, timeline, safeAnalystName, { pocSteps, findings });
  const reportMarkdown = inlineImages ? inlineMarkdownImages(reportMarkdownRaw) : reportMarkdownRaw;

  const timelineHydrated = hydrateTimelineInlineImages(timeline, sessionId, inlineImages);
  const pocHydrated = hydratePocInlineImages(pocSteps, sessionId, inlineImages);
  const writeup = parseWriteupSnapshot(getWriteup(sessionId));

  return {
    session,
    format,
    analystName: safeAnalystName,
    reportMarkdown,
    timeline: timelineHydrated,
    pocSteps: pocHydrated,
    findings,
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

function renderInline(text) {
  let value = escapeHtml(text);
  value = value.replace(/`([^`]+)`/g, '<code>$1</code>');
  value = value.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  value = value.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return value;
}

function markdownToHtmlContent(markdown) {
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
}) {
  const contentHtml = markdownToHtmlContent(markdown);
  const generatedAt = new Date().toISOString();
  const pageTitle = title || `${session?.name || 'session'}-${format || 'report'}`;
  const target = session?.target ? `<span class="meta-chip">Target: ${escapeHtml(session.target)}</span>` : '';
  const difficulty = session?.difficulty ? `<span class="meta-chip">Difficulty: ${escapeHtml(String(session.difficulty).toUpperCase())}</span>` : '';

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
      border: 1px solid var(--border);
      border-radius: 8px;
      background: #02060c;
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
      </div>
    </section>
    <article>
${contentHtml}
    </article>
    <footer>Exported by Helm's Watch</footer>
  </div>
</body>
</html>`;
}
