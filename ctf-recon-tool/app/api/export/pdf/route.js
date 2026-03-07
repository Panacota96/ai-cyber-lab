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
      tableHeader: { bold: true, fontSize: 10, color: '#24292e', fillColor: '#e1e4e8' },
      caption: { fontSize: 9, italics: true, color: '#6a737d' },
      footer: { fontSize: 8, color: '#6a737d', alignment: 'center' },
    },
    defaultStyle: { fontSize: 10, color: '#24292e' },
    background: (currentPage, pageSize) => ({ canvas: [{ type: 'rect', x: 0, y: 0, w: pageSize.width, h: pageSize.height, color: '#f6f8fa' }] }),
    dividerColor: '#e1e4e8',
    footerDividerColor: '#e1e4e8',
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
  const match = raw.match(/^\/?api\/media\/([^/]+)\/([^?#]+)/i);
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
    if (line.trim().startsWith('```')) {
      flushBullets();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (codeLines.length > 0) {
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
        content.push({ image: dataUri, width: 480, margin: [0, 4, 0, 2] });
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
    const { content: markdownContent, pdfStyle = 'terminal-dark', sessionId } = await request.json();
    if (!markdownContent) {
      return NextResponse.json({ error: 'content is required' }, { status: 400 });
    }

    const theme = PDF_STYLES[pdfStyle] || PDF_STYLES['terminal-dark'];
    if (sessionId && !isValidSessionId(sessionId)) {
      return NextResponse.json({ error: 'Invalid sessionId' }, { status: 400 });
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
    parsedContent.push({ text: "Generated by Helm's Watch CTF Assistant", style: 'footer' });

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
    return NextResponse.json({ error: 'PDF generation failed', detail: error.message }, { status: 500 });
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');
  const format = searchParams.get('format') || 'lab-report';
  const pdfStyle = searchParams.get('pdfStyle') || 'terminal-dark';

  if (!sessionId || !isValidSessionId(sessionId)) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  }

  const session = getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
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

  const content = [];

  // Header
  content.push({
    text: `${FORMAT_TITLES[format] || 'Report'}: ${session.name}`,
    style: 'header',
    margin: [0, 0, 0, 4],
  });
  content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: '#58a6ff' }], margin: [0, 0, 0, 8] });

  // Metadata row
  const metaItems = [`Date: ${new Date().toLocaleString()}`];
  if (session.target) metaItems.push(`Target: ${session.target}`);
  if (session.difficulty) metaItems.push(`Difficulty: ${session.difficulty.toUpperCase()}`);
  content.push({ text: metaItems.join('   |   '), style: 'meta', margin: [0, 0, 0, 12] });

  if (session.objective) {
    content.push({ text: 'Objective', style: 'sectionTitle' });
    content.push({ text: session.objective, style: 'body', margin: [0, 0, 0, 12] });
  }

  // Activity summary table
  content.push({ text: 'Activity Summary', style: 'sectionTitle' });
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
    content.push({ text: 'Observations', style: 'sectionTitle' });
    notes.forEach(n => {
      content.push({
        text: `• ${n.content}`,
        style: 'body',
        margin: [8, 0, 0, 4],
      });
    });
    content.push({ text: '', margin: [0, 0, 0, 8] });
  }

  // Commands
  if (commands.length > 0) {
    content.push({ text: 'Command Timeline', style: 'sectionTitle' });
    commands.forEach((cmd, i) => {
      content.push({
        text: `${i + 1}. ${cmd.command}`,
        style: 'commandLabel',
        margin: [0, 6, 0, 2],
      });
      if (cmd.output) {
        const truncated = cmd.output.length > 600 ? cmd.output.substring(0, 600) + '\n...[truncated]' : cmd.output;
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
    content.push({ text: 'Screenshots', style: 'sectionTitle' });
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
        content.push({ text: ss.name + (ss.tag ? ` — #${ss.tag}` : ''), style: 'caption', margin: [0, 0, 0, 8] });
      } catch (_) {
        content.push({ text: `[Image unavailable: ${ss.name}]`, style: 'meta', margin: [0, 0, 0, 8] });
      }
    }
  }

  const theme = PDF_STYLES[pdfStyle] || PDF_STYLES['terminal-dark'];

  // Footer note
  content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: theme.footerDividerColor }], margin: [0, 12, 0, 4] });
  content.push({ text: 'Generated by Helm\'s Watch CTF Assistant', style: 'footer' });

  // Replace header divider with theme color
  content[1] = { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: theme.dividerColor }], margin: [0, 0, 0, 8] };

  const docDef = {
    content,
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
