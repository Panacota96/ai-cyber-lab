function makeReportBlockId(prefix = 'blk') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function cloneBlock(block = {}) {
  return {
    ...block,
    evidenceRefs: Array.isArray(block?.evidenceRefs) ? [...block.evidenceRefs] : block?.evidenceRefs,
  };
}

function parseContentJson(value) {
  if (!value) return null;
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function newSectionBlock(title = 'Section', content = '') {
  return { id: makeReportBlockId('sec'), blockType: 'section', title, content };
}

export function newCodeBlock(title = 'Code Snippet', content = '', language = 'bash') {
  return { id: makeReportBlockId('code'), blockType: 'code', title, content, language };
}

export function newImageBlock(
  title = 'Screenshot Evidence',
  imageUrl = '',
  alt = 'Screenshot',
  caption = '',
  content = '',
  options = {},
) {
  return {
    id: makeReportBlockId('img'),
    blockType: 'image',
    title,
    imageUrl,
    alt,
    caption,
    content,
    artifactId: options?.artifactId ? String(options.artifactId) : null,
    linkedSectionId: options?.linkedSectionId ? String(options.linkedSectionId) : null,
    layout: ['split-left', 'split-right'].includes(String(options?.layout || ''))
      ? String(options.layout)
      : 'full',
  };
}

export function reorderReportBlocks(blocks = [], fromIndex, toIndex) {
  const source = parseWriteupBlocks(blocks);
  const safeFrom = Number(fromIndex);
  const safeTo = Number(toIndex);
  if (
    !Number.isInteger(safeFrom)
    || !Number.isInteger(safeTo)
    || safeFrom < 0
    || safeTo < 0
    || safeFrom >= source.length
    || safeTo >= source.length
    || safeFrom === safeTo
  ) {
    return source;
  }

  const nextBlocks = [...source];
  const [moved] = nextBlocks.splice(safeFrom, 1);
  nextBlocks.splice(safeTo, 0, moved);
  return nextBlocks;
}

export function duplicateReportBlock(blocks = [], blockId) {
  const source = parseWriteupBlocks(blocks);
  const index = source.findIndex((block) => String(block?.id || '') === String(blockId || ''));
  if (index === -1) return source;
  const block = cloneBlock(source[index]);
  const duplicate = {
    ...block,
    id: makeReportBlockId(block.blockType === 'code' ? 'code' : block.blockType === 'image' ? 'img' : 'sec'),
    title: block.title ? `${block.title} Copy` : 'Copy',
  };
  const nextBlocks = [...source];
  nextBlocks.splice(index + 1, 0, duplicate);
  return nextBlocks;
}

export function reportBlocksToMarkdown(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) return '';

  return blocks.map((block) => {
    if (block.blockType === 'code') {
      const title = (block.title || 'Code Snippet').trim();
      const lang = (block.language || 'bash').trim();
      const body = (block.content || '').trim();
      return `### ${title}\n\`\`\`${lang}\n${body}\n\`\`\``;
    }

    if (block.blockType === 'image') {
      const title = (block.title || 'Screenshot Evidence').trim();
      const alt = (block.alt || 'Screenshot').trim();
      const imageUrl = (block.imageUrl || '').trim();
      const caption = (block.caption || '').trim();
      const notes = (block.content || '').trim();
      const parts = [
        `### ${title}`,
        imageUrl ? `![${alt}](${imageUrl})` : '_No image selected_',
      ];
      if (caption) parts.push(`*${caption}*`);
      if (notes) parts.push(notes);
      return parts.join('\n\n');
    }

    const title = (block.title || 'Section').trim();
    const body = (block.content || '').trim();
    return `## ${title}\n${body}`;
  }).join('\n\n').trim();
}

export function markdownToReportBlocks(markdown) {
  const source = String(markdown || '').replace(/\r\n/g, '\n').trim();
  if (!source) {
    return [newSectionBlock('Walkthrough', '')];
  }

  const lines = source.split('\n');
  const blocks = [];
  let currentSection = null;
  let pendingTitle = '';

  const pushCurrentSection = () => {
    if (!currentSection) return;
    const content = currentSection.content.join('\n').trim();
    if (currentSection.title || content) {
      blocks.push(newSectionBlock(currentSection.title || 'Section', content));
    }
    currentSection = null;
  };

  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (trimmed.startsWith('# ')) {
      if (trimmed.slice(2).trim()) pendingTitle = trimmed.slice(2).trim();
      index += 1;
      continue;
    }

    const heading2 = trimmed.match(/^##\s+(.+)$/);
    if (heading2) {
      pushCurrentSection();
      currentSection = { title: heading2[1].trim(), content: [] };
      index += 1;
      continue;
    }

    const heading3 = trimmed.match(/^###\s+(.+)$/);
    if (heading3) {
      pushCurrentSection();
      pendingTitle = heading3[1].trim();
      index += 1;
      continue;
    }

    const codeFence = trimmed.match(/^```([\w+-]+)?$/);
    if (codeFence) {
      pushCurrentSection();
      const language = (codeFence[1] || 'bash').trim();
      index += 1;
      const codeLines = [];
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(newCodeBlock(pendingTitle || 'Code Snippet', codeLines.join('\n').trim(), language));
      pendingTitle = '';
      continue;
    }

    const imageMatch = trimmed.match(/^!\[(.*?)\]\((.*?)\)$/);
    if (imageMatch) {
      pushCurrentSection();
      let caption = '';
      let lookahead = index + 1;
      while (lookahead < lines.length && lines[lookahead].trim() === '') lookahead += 1;
      if (lookahead < lines.length) {
        const capMatch = lines[lookahead].trim().match(/^\*(.+)\*$/);
        if (capMatch) {
          caption = capMatch[1].trim();
          index = lookahead;
        }
      }
      blocks.push(newImageBlock(
        pendingTitle || 'Screenshot Evidence',
        imageMatch[2].trim(),
        (imageMatch[1] || 'Screenshot').trim(),
        caption,
        '',
        {}
      ));
      pendingTitle = '';
      index += 1;
      continue;
    }

    if (!currentSection) {
      currentSection = { title: pendingTitle || 'Walkthrough', content: [] };
      pendingTitle = '';
    }
    currentSection.content.push(line);
    index += 1;
  }

  pushCurrentSection();
  if (blocks.length === 0) {
    blocks.push(newSectionBlock(pendingTitle || 'Walkthrough', source));
  }
  return blocks;
}

export function parseWriteupBlocks(writeup = null) {
  const contentJson = parseContentJson(writeup?.contentJson ?? writeup?.content_json ?? null);
  if (Array.isArray(contentJson) && contentJson.length > 0) {
    return contentJson.map((block) => cloneBlock(block));
  }

  if (Array.isArray(writeup) && writeup.length > 0) {
    return writeup.map((block) => cloneBlock(block));
  }

  const content = typeof writeup === 'string'
    ? writeup
    : String(writeup?.content || '');
  return markdownToReportBlocks(content);
}

export function mergeReportPatches(blocks = [], patches = [], options = {}) {
  const allowMissingAppend = options?.allowMissingAppend === true;
  const nextBlocks = parseWriteupBlocks(blocks).map((block) => cloneBlock(block));
  const blockIndex = new Map(nextBlocks.map((block, index) => [String(block?.id || ''), index]));

  for (const patch of Array.isArray(patches) ? patches : []) {
    const sectionId = String(patch?.sectionId || '').trim();
    if (!sectionId) continue;

    let targetIndex = blockIndex.get(sectionId);
    if (targetIndex === undefined) {
      if (!allowMissingAppend) continue;
      nextBlocks.push({
        id: sectionId,
        blockType: 'section',
        title: String(patch?.title || 'Latest Evidence Updates').trim() || 'Latest Evidence Updates',
        content: String(patch?.content || '').trim(),
      });
      targetIndex = nextBlocks.length - 1;
      blockIndex.set(sectionId, targetIndex);
    }

    const currentBlock = cloneBlock(nextBlocks[targetIndex]);
    if (patch?.title !== undefined && String(patch.title).trim()) {
      currentBlock.title = String(patch.title).trim();
    }
    if (patch?.content !== undefined) {
      currentBlock.content = String(patch.content || '').trim();
    }
    if (currentBlock.blockType === 'image') {
      if (patch?.caption !== undefined) currentBlock.caption = String(patch.caption || '').trim();
      if (patch?.alt !== undefined) currentBlock.alt = String(patch.alt || '').trim();
      if (patch?.imageUrl !== undefined) currentBlock.imageUrl = String(patch.imageUrl || '').trim();
      if (patch?.artifactId !== undefined) currentBlock.artifactId = patch.artifactId ? String(patch.artifactId) : null;
      if (patch?.linkedSectionId !== undefined) currentBlock.linkedSectionId = patch.linkedSectionId ? String(patch.linkedSectionId) : null;
      if (patch?.layout !== undefined) {
        currentBlock.layout = ['split-left', 'split-right'].includes(String(patch.layout || ''))
          ? String(patch.layout)
          : 'full';
      }
    }
    nextBlocks[targetIndex] = currentBlock;
  }

  return nextBlocks;
}

export function reportFormatLabel(format) {
  const labels = {
    'lab-report': 'Lab Report',
    'executive-summary': 'Executive Summary',
    'technical-walkthrough': 'Technical Walkthrough',
    'ctf-solution': 'CTF Solution',
    'bug-bounty': 'Bug Bounty',
    pentest: 'Pentest Report',
  };
  return labels[String(format || 'technical-walkthrough')] || String(format || 'technical-walkthrough');
}
