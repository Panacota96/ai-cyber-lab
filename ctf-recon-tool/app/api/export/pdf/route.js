import { apiError } from '@/lib/api-error';
import { NextResponse } from 'next/server';
import { getSession, getTimeline } from '@/lib/db';
import path from 'path';
import fs from 'fs';
import { isValidSessionId, requireSafeFilename, resolvePathWithin } from '@/lib/security';

// Map report format name to a display title
const FORMAT_TITLES = {
  'lab-report': 'Laboratory Report',
  'executive-summary': 'Executive Summary',
  'technical-walkthrough': 'Technical Walkthrough',
  'ctf-solution': 'CTF Solution',
};

const PDF_STYLES = {
  'terminal-dark': {
    styles: {
      header: { fontSize: 20, bold: true, color: '#58a6ff' },
      sectionTitle: { fontSize: 13, bold: true, color: '#3fb950', margin: [0, 0, 0, 6] },
      meta: { fontSize: 9, color: '#8b949e' },
      body: { fontSize: 10, color: '#c9d1d9', lineHeight: 1.4 },
      commandLabel: { fontSize: 10, bold: true, color: '#e3b341' },
      codeBlock: { fontSize: 8.5, color: '#7ee787', background: '#0d1117', preserveLeadingSpaces: true },
      codeLang: { fontSize: 8, color: '#58a6ff', italics: true },
      tableHeader: { bold: true, fontSize: 10, color: '#c9d1d9', fillColor: '#161b22' },
      caption: { fontSize: 9, italics: true, color: '#8b949e' },
      footer: { fontSize: 8, color: '#484f58', alignment: 'center' },
    },
    defaultStyle: { fontSize: 10, color: '#c9d1d9' },
    background: (currentPage, pageSize) => ({ canvas: [{ type: 'rect', x: 0, y: 0, w: pageSize.width, h: pageSize.height, color: '#0d1117' }] }),
    dividerColor: '#58a6ff',
    footerDividerColor: '#30363d',
  },
  'professional': {
    styles: {
      header: { fontSize: 20, bold: true, color: '#0f3460' },
      sectionTitle: { fontSize: 13, bold: true, color: '#1a1a2e', margin: [0, 0, 0, 6] },
      meta: { fontSize: 9, color: '#555555' },
      body: { fontSize: 10, color: '#1a1a1a', lineHeight: 1.4 },
      commandLabel: { fontSize: 10, bold: true, color: '#0f3460' },
      codeBlock: { fontSize: 8.5, color: '#2d2d2d', background: '#f4f4f4', preserveLeadingSpaces: true },
      codeLang: { fontSize: 8, color: '#0f3460', italics: true },
      tableHeader: { bold: true, fontSize: 10, color: '#ffffff', fillColor: '#0f3460' },
      caption: { fontSize: 9, italics: true, color: '#555555' },
      footer: { fontSize: 8, color: '#888888', alignment: 'center' },
    },
    defaultStyle: { fontSize: 10, color: '#1a1a1a' },
    background: null,
    dividerColor: '#0f3460',
    footerDividerColor: '#cccccc',
  },
  'minimal': {
    styles: {
      header: { fontSize: 20, bold: true, color: '#24292e' },
      sectionTitle: { fontSize: 13, bold: true, color: '#24292e', margin: [0, 0, 0, 6] },
      meta: { fontSize: 9, color: '#6a737d' },
      body: { fontSize: 10, color: '#24292e', lineHeight: 1.4 },
      commandLabel: { fontSize: 10, bold: true, color: '#0366d6' },
      codeBlock: { fontSize: 8.5, color: '#24292e', background: '#eff1f3', preserveLeadingSpaces: true },
      codeLang: { fontSize: 8, color: '#0366d6', italics: true },
      tableHeader: { bold: true, fontSize: 10, color: '#24292e', fillColor: '#e1e4e8' },
      caption: { fontSize: 9, italics: true, color: '#6a737d' },
      footer: { fontSize: 8, color: '#6a737d', alignment: 'center' },
    },
    defaultStyle: { fontSize: 10, color: '#24292e' },
    background: (currentPage, pageSize) => ({ canvas: [{ type: 'rect', x: 0, y: 0, w: pageSize.width, h: pageSize.height, color: '#f6f8fa' }] }),
    dividerColor: '#e1e4e8',
    footerDividerColor: '#e1e4e8',
  },
  'cyber-neon-grid': {
    styles: {
      header: { fontSize: 21, bold: true, color: '#00f5ff' },
      sectionTitle: { fontSize: 13, bold: true, color: '#ff4fd8', margin: [0, 0, 0, 6] },
      meta: { fontSize: 9, color: '#9db2bf' },
      body: { fontSize: 10, color: '#d4e7ee', lineHeight: 1.45 },
      commandLabel: { fontSize: 10, bold: true, color: '#7dfc00' },
      codeBlock: { fontSize: 8.5, color: '#80ffea', background: '#07151f', preserveLeadingSpaces: true },
      codeLang: { fontSize: 8, color: '#ff4fd8', italics: true },
      tableHeader: { bold: true, fontSize: 10, color: '#051018', fillColor: '#00f5ff' },
      caption: { fontSize: 9, italics: true, color: '#9db2bf' },
      footer: { fontSize: 8, color: '#5b7a8a', alignment: 'center' },
    },
    defaultStyle: { fontSize: 10, color: '#d4e7ee' },
    background: (currentPage, pageSize) => ({
      canvas: [
        { type: 'rect', x: 0, y: 0, w: pageSize.width, h: pageSize.height, color: '#050b14' },
        { type: 'line', x1: 0, y1: 80, x2: pageSize.width, y2: 80, lineWidth: 0.5, lineColor: '#14495f' },
        { type: 'line', x1: 0, y1: pageSize.height - 80, x2: pageSize.width, y2: pageSize.height - 80, lineWidth: 0.5, lineColor: '#5b2251' },
      ],
    }),
    dividerColor: '#00f5ff',
    footerDividerColor: '#1f3a4d',
  },
  'cyber-synthwave': {
    styles: {
      header: { fontSize: 21, bold: true, color: '#ff7edb' },
      sectionTitle: { fontSize: 13, bold: true, color: '#7df9ff', margin: [0, 0, 0, 6] },
      meta: { fontSize: 9, color: '#b9b3d9' },
      body: { fontSize: 10, color: '#f2eaff', lineHeight: 1.45 },
      commandLabel: { fontSize: 10, bold: true, color: '#ffd166' },
      codeBlock: { fontSize: 8.5, color: '#8af8ff', background: '#1d1135', preserveLeadingSpaces: true },
      codeLang: { fontSize: 8, color: '#ff7edb', italics: true },
      tableHeader: { bold: true, fontSize: 10, color: '#140b1f', fillColor: '#7df9ff' },
      caption: { fontSize: 9, italics: true, color: '#b9b3d9' },
      footer: { fontSize: 8, color: '#8676ad', alignment: 'center' },
    },
    defaultStyle: { fontSize: 10, color: '#f2eaff' },
    background: (currentPage, pageSize) => ({
      canvas: [
        { type: 'rect', x: 0, y: 0, w: pageSize.width, h: pageSize.height, color: '#130b21' },
      ],
    }),
    dividerColor: '#ff7edb',
    footerDividerColor: '#4e3b73',
  },
  'cyber-matrix-terminal': {
    styles: {
      header: { fontSize: 21, bold: true, color: '#00ff8c' },
      sectionTitle: { fontSize: 13, bold: true, color: '#66ffa8', margin: [0, 0, 0, 6] },
      meta: { fontSize: 9, color: '#79b798' },
      body: { fontSize: 10, color: '#c5ffdf', lineHeight: 1.45 },
      commandLabel: { fontSize: 10, bold: true, color: '#00ff8c' },
      codeBlock: { fontSize: 8.5, color: '#8dffbf', background: '#021108', preserveLeadingSpaces: true },
      codeLang: { fontSize: 8, color: '#66ffa8', italics: true },
      tableHeader: { bold: true, fontSize: 10, color: '#021108', fillColor: '#00ff8c' },
      caption: { fontSize: 9, italics: true, color: '#79b798' },
      footer: { fontSize: 8, color: '#4d8c68', alignment: 'center' },
    },
    defaultStyle: { fontSize: 10, color: '#c5ffdf' },
    background: (currentPage, pageSize) => ({
      canvas: [{ type: 'rect', x: 0, y: 0, w: pageSize.width, h: pageSize.height, color: '#03130a' }],
    }),
    dividerColor: '#00ff8c',
    footerDividerColor: '#1d3d2d',
  },
  'htb-professional': {
    styles: {
      header: { fontSize: 22, bold: true, color: '#9fef00' },
      coverTitle: { fontSize: 30, bold: true, color: '#9fef00', alignment: 'center' },
      coverSubtitle: { fontSize: 15, color: '#a4b1cd', italics: true, alignment: 'center' },
      coverMetaKey: { fontSize: 10, bold: true, color: '#9fef00' },
      coverMeta: { fontSize: 10, color: '#a4b1cd' },
      sectionTitle: { fontSize: 13, bold: true, color: '#9fef00', margin: [0, 0, 0, 6] },
      meta: { fontSize: 9, color: '#a4b1cd' },
      body: { fontSize: 10, color: '#a4b1cd', lineHeight: 1.5 },
      commandLabel: { fontSize: 10, bold: true, color: '#9fef00' },
      codeBlock: { fontSize: 8.5, color: '#c3d0e0', background: '#1a2332', preserveLeadingSpaces: true },
      codeLang: { fontSize: 8, color: '#9fef00', italics: true },
      tableHeader: { bold: true, fontSize: 10, color: '#141d2b', fillColor: '#9fef00' },
      caption: { fontSize: 9, italics: true, color: '#a4b1cd' },
      footer: { fontSize: 8, color: '#4e5d7a', alignment: 'center' },
      tocTitle: { fontSize: 14, bold: true, color: '#9fef00', margin: [0, 0, 0, 10] },
    },
    defaultStyle: { fontSize: 10, color: '#a4b1cd' },
    background: (currentPage, pageSize) => ({
      canvas: [{ type: 'rect', x: 0, y: 0, w: pageSize.width, h: pageSize.height, color: '#141d2b' }],
    }),
    dividerColor: '#9fef00',
    footerDividerColor: '#2a3649',
    hasCoverPage: true,
    hasToc: true,
  },
};

// Parse inline markdown (**bold**, `code`) into pdfmake text nodes
function parseInline(text) {
  const parts = [];
  const regex = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0, match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index) });
    if (match[1] !== undefined) parts.push({ text: match[1], bold: true });
    else parts.push({ text: match[2], font: 'Roboto', fontSize: 8.5 });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts.length === 1 && !parts[0].bold ? parts[0].text : parts;
}

function fileNameToMime(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  return null;
}

function parseMediaUrl(imageUrl, fallbackSessionId) {
  const raw = String(imageUrl || '').trim();
  if (!raw) return null;

  let pathname = raw;
  try {
    if (/^https?:\/\//i.test(raw)) {
      const u = new URL(raw);
      pathname = u.pathname || raw;
    }
  } catch {
    pathname = raw;
  }

  const match = pathname.match(/^\/?api\/media\/([^/]+)\/([^?#]+)/i);
  if (!match) return null;

  let sessionId;
  let filename;
  try {
    sessionId = decodeURIComponent(match[1]);
    filename = decodeURIComponent(match[2]);
  } catch {
    return null;
  }

  if (!sessionId && fallbackSessionId) {
    sessionId = fallbackSessionId;
  }
  if (!isValidSessionId(sessionId)) return null;
  try {
    requireSafeFilename(filename);
  } catch {
    return null;
  }
  return { sessionId, filename };
}

function readMarkdownImageAsDataUri(imageUrl, fallbackSessionId) {
  const parsed = parseMediaUrl(imageUrl, fallbackSessionId);
  if (!parsed) return null;
  const mimeType = fileNameToMime(parsed.filename);
  if (!mimeType) return null;

  const sessionsDir = path.join(process.cwd(), 'data', 'sessions');
  const imagePath = resolvePathWithin(sessionsDir, parsed.sessionId, 'screenshots', parsed.filename);
  if (!fs.existsSync(imagePath)) return null;

  const b64 = fs.readFileSync(imagePath).toString('base64');
  return `data:${mimeType};base64,${b64}`;
}

// Convert a markdown string into a pdfmake content array
function markdownToPdfmakeContent(markdown, theme, sessionId) {
  const lines = markdown.split('\n');
  const content = [];
  let i = 0;
  let pendingBullets = [];

  const flushBullets = () => {
    if (pendingBullets.length > 0) {
      content.push({ ul: pendingBullets, style: 'body', margin: [0, 0, 0, 8] });
      pendingBullets = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    const codeFenceMatch = line.trim().match(/^```([\w+-]+)?/);
    if (codeFenceMatch) {
      flushBullets();
      const codeLang = (codeFenceMatch[1] || 'text').toLowerCase();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (codeLines.length > 0) {
        if (codeLang && codeLang !== 'text') {
          content.push({ text: `Language: ${codeLang}`, style: 'codeLang', margin: [0, 2, 0, 2] });
        }
        content.push({ text: codeLines.join('\n'), style: 'codeBlock', margin: [0, 2, 0, 8] });
      }
      i++;
      continue;
    }

    // Headings
    if (line.startsWith('# ')) {
      flushBullets();
      content.push({ text: parseInline(line.slice(2).trim()), style: 'header', margin: [0, 8, 0, 4] });
      i++; continue;
    }

    // Images
    const imageMatch = line.trim().match(/^!\[(.*?)\]\((.*?)\)$/);
    if (imageMatch) {
      flushBullets();
      const altText = imageMatch[1] || 'Screenshot';
      const imageUrl = imageMatch[2];
      const dataUri = readMarkdownImageAsDataUri(imageUrl, sessionId);
      if (dataUri) {
        content.push({ image: dataUri, width: 470, margin: [0, 4, 0, 2] });
        content.push({ text: altText, style: 'caption', margin: [0, 0, 0, 8] });
      } else {
        content.push({ text: `[Image unavailable: ${altText}]`, style: 'meta', margin: [0, 0, 0, 8] });
      }
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      flushBullets();
      content.push({ text: parseInline(line.slice(3).trim()), style: 'sectionTitle', margin: [0, 10, 0, 4] });
      i++; continue;
    }
    if (line.startsWith('### ')) {
      flushBullets();
      content.push({ text: parseInline(line.slice(4).trim()), bold: true, margin: [0, 6, 0, 3] });
      i++; continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(line.trim())) {
      flushBullets();
      content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: theme.dividerColor }], margin: [0, 6, 0, 6] });
      i++; continue;
    }

    // Bullet list
    if (/^[-*] /.test(line)) {
      pendingBullets.push(parseInline(line.slice(2).trim()));
      i++; continue;
    }

    // Numbered list
    if (/^\d+\. /.test(line)) {
      flushBullets();
      const text = parseInline(line.replace(/^\d+\. /, '').trim());
      content.push({ text, style: 'body', margin: [8, 0, 0, 3] });
      i++; continue;
    }

    // Blank line
    if (line.trim() === '') {
      flushBullets();
      content.push({ text: ' ', margin: [0, 2, 0, 2] });
      i++; continue;
    }

    // Regular paragraph
    flushBullets();
    content.push({ text: parseInline(line), style: 'body' });
    i++;
  }
  flushBullets();
  return content;
}

export async function POST(request) {
  try {
    const { content: markdownContent, pdfStyle = 'terminal-dark', sessionId, analystName = 'Unknown' } = await request.json();
    if (!markdownContent) {
      return apiError('content is required', 400);
    }
    const safeAnalystName = String(analystName || 'Unknown').slice(0, 120);

    const theme = PDF_STYLES[pdfStyle] || PDF_STYLES['terminal-dark'];
    if (sessionId && !isValidSessionId(sessionId)) {
      return apiError('Invalid sessionId', 400);
    }

    const session = sessionId ? getSession(sessionId) : null;
    const sessionName = session?.name || 'CTF-Report';

    const { default: PdfPrinter } = await import('pdfmake/js/Printer.js');
    const vfs = (await import('pdfmake/js/virtual-fs.js')).default;
    const vfsFonts = (await import('pdfmake/build/vfs_fonts.js')).default;
    for (const filename in vfsFonts) vfs.writeFileSync(filename, vfsFonts[filename], 'base64');
    const printer = new PdfPrinter({
      Roboto: { normal: 'Roboto-Regular.ttf', bold: 'Roboto-Medium.ttf', italics: 'Roboto-Italic.ttf', bolditalics: 'Roboto-MediumItalic.ttf' }
    }, vfs);

    const parsedContent = markdownToPdfmakeContent(markdownContent, theme, sessionId);
    parsedContent.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: theme.footerDividerColor }], margin: [0, 12, 0, 4] });
    parsedContent.push({ text: `Generated by Helm's Watch — ${safeAnalystName}`, style: 'footer' });

    const docDef = {
      content: parsedContent,
      styles: theme.styles,
      defaultStyle: { font: 'Roboto', ...theme.defaultStyle },
      pageMargins: [40, 40, 40, 40],
      ...(theme.background ? { background: theme.background } : {}),
    };

    const pdfDoc = await printer.createPdfKitDocument(docDef);
    const chunks = [];
    await new Promise((resolve, reject) => {
      pdfDoc.on('data', chunk => chunks.push(chunk));
      pdfDoc.on('end', resolve);
      pdfDoc.on('error', reject);
      pdfDoc.end();
    });

    const pdfBuffer = Buffer.concat(chunks);
    const filename = `${sessionName.replace(/\s+/g, '-')}-writeup.pdf`;
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('[PDF Export Error]', error);
    return apiError('PDF generation failed', 500, { detail: error.message });
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');
  const format = searchParams.get('format') || 'lab-report';
  const pdfStyle = searchParams.get('pdfStyle') || 'terminal-dark';
  const safeAnalystName = String(searchParams.get('analystName') || 'Unknown').slice(0, 120);

  if (!sessionId || !isValidSessionId(sessionId)) {
    return apiError('sessionId required', 400);
  }

  const session = getSession(sessionId);
  if (!session) {
    return apiError('Session not found', 404);
  }

  try {

  const events = getTimeline(sessionId);

  // Build pdfmake document definition
  const { default: PdfPrinter } = await import('pdfmake/js/Printer.js');
  const vfs = (await import('pdfmake/js/virtual-fs.js')).default;
  const vfsFonts = (await import('pdfmake/build/vfs_fonts.js')).default;
  for (const filename in vfsFonts) vfs.writeFileSync(filename, vfsFonts[filename], 'base64');
  const printer = new PdfPrinter({
    Roboto: { normal: 'Roboto-Regular.ttf', bold: 'Roboto-Medium.ttf', italics: 'Roboto-Italic.ttf', bolditalics: 'Roboto-MediumItalic.ttf' }
  }, vfs);

  const commands = events.filter(e => e.type === 'command');
  const notes = events.filter(e => e.type === 'note');
  const screenshots = events.filter(e => e.type === 'screenshot');

  const theme = PDF_STYLES[pdfStyle] || PDF_STYLES['terminal-dark'];
  const content = [];

  // --- Cover Page (htb-professional and other themes with hasCoverPage) ---
  if (theme.hasCoverPage) {
    content.push({ text: '\n\n\n\n\n', fontSize: 12 });
    content.push({ text: 'PENETRATION TEST REPORT', style: 'coverTitle', margin: [0, 0, 0, 12] });
    content.push({ text: String(session.name || ''), style: 'coverSubtitle', margin: [0, 0, 0, 40] });
    content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1.5, lineColor: theme.dividerColor }], margin: [0, 0, 0, 24] });
    const coverRows = [
      ['Prepared by', safeAnalystName],
      ['Date', new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })],
      ['Target', String(session.target || 'Not specified')],
      ['Difficulty', session.difficulty ? String(session.difficulty).toUpperCase() : 'N/A'],
      ['Classification', 'CONFIDENTIAL'],
    ];
    coverRows.forEach(([key, val]) => {
      content.push({
        columns: [
          { text: key, style: 'coverMetaKey', width: 130 },
          { text: val, style: 'coverMeta', width: '*' },
        ],
        margin: [0, 0, 0, 6],
      });
    });
    content.push({ text: '', pageBreak: 'after' });
  }

  // --- Table of Contents ---
  if (theme.hasToc) {
    content.push({ text: 'Table of Contents', style: 'tocTitle' });
    content.push({ toc: { numberStyle: { bold: false }, textStyle: { color: theme.styles.body.color } } });
    content.push({ text: '', pageBreak: 'after' });
  }

  // --- Report Header ---
  const reportTitle = `${FORMAT_TITLES[format] || 'Report'}: ${String(session.name || '')}`;
  content.push({
    text: reportTitle,
    style: 'header',
    tocItem: !!theme.hasToc,
    margin: [0, 0, 0, 4],
  });
  content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: theme.dividerColor }], margin: [0, 0, 0, 8] });

  // Metadata row
  const metaItems = [`Date: ${new Date().toLocaleString()}`];
  if (session.target) metaItems.push(`Target: ${session.target}`);
  if (session.difficulty) metaItems.push(`Difficulty: ${session.difficulty.toUpperCase()}`);
  content.push({ text: metaItems.join('   |   '), style: 'meta', margin: [0, 0, 0, 12] });

  if (session.objective) {
    content.push({ text: 'Objective', style: 'sectionTitle', tocItem: !!theme.hasToc });
    content.push({ text: String(session.objective || ''), style: 'body', margin: [0, 0, 0, 12] });
  }

  // Activity summary table
  content.push({ text: 'Activity Summary', style: 'sectionTitle', tocItem: !!theme.hasToc });
  content.push({
    table: {
      widths: ['*', 80],
      body: [
        [{ text: 'Metric', style: 'tableHeader' }, { text: 'Count', style: 'tableHeader' }],
        ['Commands Executed', commands.length.toString()],
        ['Successful', commands.filter(c => c.status === 'success' || c.status === 'completed').length.toString()],
        ['Failed', commands.filter(c => c.status === 'failed' || c.status === 'error').length.toString()],
        ['Notes Recorded', notes.length.toString()],
        ['Screenshots Captured', screenshots.length.toString()],
      ],
    },
    layout: 'lightHorizontalLines',
    margin: [0, 0, 0, 16],
  });

  // Notes / Observations
  if (notes.length > 0) {
    content.push({ text: 'Observations', style: 'sectionTitle', tocItem: !!theme.hasToc });
    notes.forEach(n => {
      content.push({
        text: `• ${String(n.content || '')}`,
        style: 'body',
        margin: [8, 0, 0, 4],
      });
    });
    content.push({ text: '', margin: [0, 0, 0, 8] });
  }

  // Commands
  if (commands.length > 0) {
    content.push({ text: 'Command Timeline', style: 'sectionTitle', tocItem: !!theme.hasToc });
    commands.forEach((cmd, i) => {
      content.push({
        text: `${i + 1}. ${String(cmd.command || '')}`,
        style: 'commandLabel',
        margin: [0, 6, 0, 2],
      });
      if (cmd.output) {
        const rawOutput = String(cmd.output || '');
        const truncated = rawOutput.length > 600 ? rawOutput.substring(0, 600) + '\n...[truncated]' : rawOutput;
        content.push({
          text: truncated,
          style: 'codeBlock',
          margin: [0, 0, 0, 4],
        });
      }
    });
    content.push({ text: '', margin: [0, 0, 0, 8] });
  }

  // Screenshots
  if (screenshots.length > 0) {
    content.push({ text: 'Screenshots', style: 'sectionTitle', tocItem: !!theme.hasToc });
    for (const ss of screenshots) {
      try {
        const imgPath = path.join(process.cwd(), 'data', 'sessions', sessionId, 'screenshots', ss.filename);
        if (fs.existsSync(imgPath)) {
          const imgData = fs.readFileSync(imgPath).toString('base64');
          const ext = path.extname(ss.filename).replace('.', '').toLowerCase();
          const mimeType = ext === 'jpg' ? 'jpeg' : ext;
          content.push({
            image: `data:image/${mimeType};base64,${imgData}`,
            width: 480,
            margin: [0, 4, 0, 2],
          });
        }
        content.push({ text: String(ss.name || 'Screenshot') + (ss.tag ? ` — #${String(ss.tag)}` : ''), style: 'caption', margin: [0, 0, 0, 8] });
      } catch (_) {
        content.push({ text: `[Image unavailable: ${String(ss.name || 'screenshot')}]`, style: 'meta', margin: [0, 0, 0, 8] });
      }
    }
  }

  // Footer note
  content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: theme.footerDividerColor }], margin: [0, 12, 0, 4] });
  content.push({ text: `Generated by Helm's Watch — ${safeAnalystName}`, style: 'footer' });

  const docDef = {
    content,
    styles: theme.styles,
    defaultStyle: { font: 'Roboto', ...theme.defaultStyle },
    pageMargins: [40, 60, 40, 60],
    ...(theme.background ? { background: theme.background } : {}),
    ...(theme.hasCoverPage ? {
      footer: (currentPage, pageCount) => currentPage === 1 ? {} : ({
        margin: [40, 8, 40, 0],
        columns: [
          { text: session.name, style: 'footer', alignment: 'left' },
          { text: `Page ${currentPage - (theme.hasToc ? 2 : 1)} of ${pageCount - (theme.hasToc ? 2 : 1)}`, style: 'footer', alignment: 'right' },
        ],
      }),
    } : {}),
  };

  const pdfDoc = await printer.createPdfKitDocument(docDef);
  const chunks = [];
  await new Promise((resolve, reject) => {
    pdfDoc.on('data', chunk => chunks.push(chunk));
    pdfDoc.on('end', resolve);
    pdfDoc.on('error', reject);
    pdfDoc.end();
  });

  const pdfBuffer = Buffer.concat(chunks);
  const filename = `${session.name.replace(/\s+/g, '-')}-${format}.pdf`;

  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });

  } catch (error) {
    console.error('[PDF Export Error]', error);
    return NextResponse.json(
      { error: 'PDF generation failed', detail: error.message },
      { status: 500 }
    );
  }
}
