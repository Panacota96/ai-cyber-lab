import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

const MAX_IMAGE_WIDTH = 520;
const MAX_IMAGE_HEIGHT = 300;
const CODE_BORDER_COLOR = 'C7CDD4';

function safeText(value) {
  return String(value ?? '').trim();
}

function paragraphWithInline(text, options = {}) {
  const content = safeText(text);
  if (!content) return null;
  return new Paragraph({
    ...options,
    children: parseInlineRuns(content),
  });
}

function parseInlineRuns(text) {
  const content = String(text || '');
  const runs = [];
  const regex = /\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      runs.push(new TextRun({ text: content.slice(lastIndex, match.index) }));
    }
    if (typeof match[1] === 'string') {
      runs.push(new TextRun({ text: match[1], bold: true }));
    } else if (typeof match[2] === 'string') {
      runs.push(new TextRun({
        text: match[2],
        font: 'Consolas',
        color: '1F4E79',
      }));
    } else if (typeof match[3] === 'string') {
      runs.push(new TextRun({ text: match[3], italics: true }));
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    runs.push(new TextRun({ text: content.slice(lastIndex) }));
  }
  if (runs.length === 0) {
    runs.push(new TextRun({ text: content }));
  }

  return runs;
}

function buildCodeParagraph(codeLines = []) {
  const lines = Array.isArray(codeLines) && codeLines.length > 0 ? codeLines : [''];
  const runs = [];
  lines.forEach((line, idx) => {
    runs.push(new TextRun({
      text: String(line ?? ''),
      font: 'Consolas',
      size: 20,
      ...(idx > 0 ? { break: 1 } : {}),
    }));
  });

  return new Paragraph({
    children: runs,
    spacing: { before: 80, after: 180 },
    indent: { left: 240, right: 120 },
    border: {
      top: { style: BorderStyle.SINGLE, color: CODE_BORDER_COLOR, size: 2 },
      bottom: { style: BorderStyle.SINGLE, color: CODE_BORDER_COLOR, size: 2 },
      left: { style: BorderStyle.SINGLE, color: CODE_BORDER_COLOR, size: 2 },
      right: { style: BorderStyle.SINGLE, color: CODE_BORDER_COLOR, size: 2 },
    },
  });
}

function decodeDataUri(dataUri) {
  const raw = String(dataUri || '').trim();
  const match = raw.match(/^data:([^;]+);base64,(.+)$/i);
  if (!match) return null;
  try {
    return {
      mime: match[1].toLowerCase(),
      buffer: Buffer.from(match[2], 'base64'),
    };
  } catch {
    return null;
  }
}

function imageBlocksFromSource(src, altText = 'Screenshot') {
  const decoded = decodeDataUri(src);
  if (!decoded) {
    return [
      new Paragraph({
        children: [new TextRun({ text: `[Image unavailable: ${safeText(altText) || 'Screenshot'}]`, italics: true, color: '9A3412' })],
        spacing: { before: 100, after: 120 },
      }),
      src
        ? new Paragraph({
            children: [new TextRun({ text: `Source: ${src}`, color: '6B7280', size: 18 })],
            spacing: { before: 0, after: 120 },
          })
        : null,
    ].filter(Boolean);
  }

  try {
    return [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            data: decoded.buffer,
            transformation: {
              width: MAX_IMAGE_WIDTH,
              height: MAX_IMAGE_HEIGHT,
            },
          }),
        ],
        spacing: { before: 120, after: 60 },
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: safeText(altText) || 'Screenshot', italics: true, color: '4B5563', size: 18 })],
        spacing: { before: 0, after: 180 },
      }),
    ];
  } catch {
    return [
      new Paragraph({
        children: [new TextRun({ text: `[Image unsupported in DOCX: ${safeText(altText) || 'Screenshot'}]`, italics: true, color: '9A3412' })],
        spacing: { before: 100, after: 120 },
      }),
    ];
  }
}

function markdownToDocxBlocks(markdown = '') {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let paragraphLines = [];
  let inCode = false;
  let codeLang = '';
  let codeLines = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    const text = paragraphLines.join(' ').trim();
    if (text) {
      const p = paragraphWithInline(text, { spacing: { before: 40, after: 120 } });
      if (p) blocks.push(p);
    }
    paragraphLines = [];
  };

  const flushCode = () => {
    if (!inCode) return;
    if (codeLang) {
      blocks.push(new Paragraph({
        children: [new TextRun({ text: `Language: ${codeLang}`, italics: true, color: '4B5563', size: 18 })],
        spacing: { before: 40, after: 30 },
      }));
    }
    blocks.push(buildCodeParagraph(codeLines));
    inCode = false;
    codeLang = '';
    codeLines = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    const fenceMatch = trimmed.match(/^```([\w+-]+)?$/);
    if (fenceMatch) {
      flushParagraph();
      if (inCode) {
        flushCode();
      } else {
        inCode = true;
        codeLang = (fenceMatch[1] || '').toLowerCase();
        codeLines = [];
      }
      continue;
    }

    if (inCode) {
      codeLines.push(rawLine);
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      continue;
    }

    const h1 = trimmed.match(/^#\s+(.+)$/);
    if (h1) {
      flushParagraph();
      blocks.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: parseInlineRuns(h1[1]),
        spacing: { before: 220, after: 120 },
      }));
      continue;
    }
    const h2 = trimmed.match(/^##\s+(.+)$/);
    if (h2) {
      flushParagraph();
      blocks.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: parseInlineRuns(h2[1]),
        spacing: { before: 180, after: 100 },
      }));
      continue;
    }
    const h3 = trimmed.match(/^###\s+(.+)$/);
    if (h3) {
      flushParagraph();
      blocks.push(new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: parseInlineRuns(h3[1]),
        spacing: { before: 150, after: 90 },
      }));
      continue;
    }

    if (/^[-*_]{3,}$/.test(trimmed)) {
      flushParagraph();
      blocks.push(new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, color: 'D1D5DB', size: 2 } },
        spacing: { before: 90, after: 90 },
      }));
      continue;
    }

    const imageMatch = trimmed.match(/^!\[(.*?)\]\((.*?)\)$/);
    if (imageMatch) {
      flushParagraph();
      const imageBlocks = imageBlocksFromSource(imageMatch[2], imageMatch[1] || 'Screenshot');
      blocks.push(...imageBlocks);
      continue;
    }

    const ulMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (ulMatch) {
      flushParagraph();
      blocks.push(new Paragraph({
        children: [new TextRun({ text: '• ', bold: true }), ...parseInlineRuns(ulMatch[1])],
        indent: { left: 360, hanging: 180 },
        spacing: { before: 20, after: 40 },
      }));
      continue;
    }

    const olMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (olMatch) {
      flushParagraph();
      blocks.push(new Paragraph({
        children: [new TextRun({ text: `${olMatch[1]}. `, bold: true }), ...parseInlineRuns(olMatch[2])],
        indent: { left: 360, hanging: 180 },
        spacing: { before: 20, after: 40 },
      }));
      continue;
    }

    if (trimmed.startsWith('>')) {
      flushParagraph();
      const quoteText = trimmed.replace(/^>\s?/, '');
      blocks.push(new Paragraph({
        children: parseInlineRuns(quoteText),
        indent: { left: 420 },
        border: { left: { style: BorderStyle.SINGLE, color: '6B7280', size: 6 } },
        spacing: { before: 40, after: 100 },
      }));
      continue;
    }

    paragraphLines.push(trimmed);
  }

  flushParagraph();
  flushCode();
  return blocks;
}

function metadataTable({ session, format, analystName, generatedAt }) {
  const rows = [
    ['Session', safeText(session?.name || '')],
    ['Target', safeText(session?.target || 'Not specified')],
    ['Difficulty', safeText(session?.difficulty || 'N/A').toUpperCase()],
    ['Objective', safeText(session?.objective || 'Not specified')],
    ['Format', safeText(format || 'technical-walkthrough')],
    ['Analyst', safeText(analystName || 'Unknown')],
    ['Generated', safeText(generatedAt || new Date().toISOString())],
  ];

  const buildCell = (text, isLabel = false) => new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            bold: isLabel,
            color: isLabel ? '1F2937' : '111827',
            size: 20,
          }),
        ],
      }),
    ],
    width: {
      size: isLabel ? 30 : 70,
      type: WidthType.PERCENTAGE,
    },
    margins: {
      top: 70,
      bottom: 70,
      left: 90,
      right: 90,
    },
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(([label, value]) => new TableRow({
      children: [buildCell(label, true), buildCell(value, false)],
    })),
  });
}

function shortEventSummary(event) {
  const ts = safeText(event?.timestamp || '');
  if (event?.type === 'command') {
    const cmd = safeText(event?.command || '').slice(0, 180);
    const status = safeText(event?.status || 'unknown');
    return `${ts} | COMMAND | ${status}${cmd ? ` | ${cmd}` : ''}`;
  }
  if (event?.type === 'note') {
    const content = safeText(event?.content || '').slice(0, 200);
    const tag = safeText(event?.tag || '');
    return `${ts} | NOTE${tag ? ` #${tag}` : ''}${content ? ` | ${content}` : ''}`;
  }
  const name = safeText(event?.name || event?.filename || 'screenshot');
  const tag = safeText(event?.tag || '');
  return `${ts} | SCREENSHOT${tag ? ` #${tag}` : ''} | ${name}`;
}

function appendEvidenceAppendix(children, timeline, pocSteps, inlineImages) {
  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text: 'Evidence Appendix' })],
    spacing: { before: 260, after: 120 },
  }));

  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text: 'Timeline Summary' })],
    spacing: { before: 120, after: 100 },
  }));

  if (!Array.isArray(timeline) || timeline.length === 0) {
    children.push(new Paragraph({
      children: [new TextRun({ text: 'No timeline events available.' })],
      spacing: { before: 30, after: 90 },
    }));
  } else {
    for (const event of timeline) {
      children.push(new Paragraph({
        children: [new TextRun({ text: shortEventSummary(event) })],
        spacing: { before: 15, after: 50 },
      }));
      if (inlineImages && event?.type === 'screenshot' && event?.imageDataUri) {
        children.push(...imageBlocksFromSource(event.imageDataUri, event.name || event.filename || 'Screenshot'));
      }
    }
  }

  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text: 'PoC Steps Evidence' })],
    spacing: { before: 160, after: 100 },
  }));

  if (!Array.isArray(pocSteps) || pocSteps.length === 0) {
    children.push(new Paragraph({
      children: [new TextRun({ text: 'No PoC steps recorded.' })],
      spacing: { before: 30, after: 90 },
    }));
    return;
  }

  for (const step of pocSteps) {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_3,
      children: [new TextRun({ text: `Step ${step.stepOrder || step.id}: ${safeText(step.title || 'Untitled step')}` })],
      spacing: { before: 100, after: 50 },
    }));

    if (safeText(step.goal)) {
      children.push(paragraphWithInline(`Goal: ${safeText(step.goal)}`, { spacing: { before: 10, after: 40 } }));
    }
    if (safeText(step.observation)) {
      children.push(paragraphWithInline(`Observation: ${safeText(step.observation)}`, { spacing: { before: 10, after: 40 } }));
    }

    const refs = [
      step.executionEventId ? `execution=${step.executionEventId}` : '',
      step.noteEventId ? `note=${step.noteEventId}` : '',
      step.screenshotEventId ? `screenshot=${step.screenshotEventId}` : '',
    ].filter(Boolean);
    if (refs.length > 0) {
      children.push(new Paragraph({
        children: [new TextRun({ text: `Evidence refs: ${refs.join(' | ')}`, color: '4B5563', size: 18 })],
        spacing: { before: 10, after: 40 },
      }));
    }

    const screenshotSrc = step?.screenshotDataUri || step?.screenshotEvent?.imageDataUri;
    if (inlineImages && screenshotSrc) {
      children.push(...imageBlocksFromSource(screenshotSrc, step?.screenshotEvent?.name || 'PoC Screenshot'));
    }
  }
}

export async function buildDocxReportBuffer({
  session,
  format,
  analystName,
  reportMeta,
  markdown,
  timeline = [],
  pocSteps = [],
  includeAppendix = true,
  inlineImages = true,
}) {
  const children = [];

  children.push(new Paragraph({
    heading: HeadingLevel.TITLE,
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: `Helm's Watch Report`, bold: true, color: '1D4ED8', size: 44 })],
    spacing: { before: 120, after: 160 },
  }));

  children.push(metadataTable({ session, format, analystName, generatedAt: reportMeta?.generatedAtIso }));
  children.push(new Paragraph({ spacing: { before: 120, after: 120 } }));
  children.push(...markdownToDocxBlocks(markdown));

  if (includeAppendix) {
    appendEvidenceAppendix(children, timeline, pocSteps, inlineImages);
  }

  const doc = new Document({
    creator: "Helm's Watch",
    title: `${safeText(session?.name || 'Session')} - ${safeText(format || 'report')}`,
    description: 'Generated CTF walkthrough report export',
    styles: {
      default: {
        document: {
          run: {
            font: 'Calibri',
            size: 22,
          },
          paragraph: {
            spacing: {
              line: 276,
              after: 120,
            },
          },
        },
      },
    },
    sections: [{ children }],
  });

  return Packer.toBuffer(doc);
}
