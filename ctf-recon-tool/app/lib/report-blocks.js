function makeBlockId(prefix = 'blk') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function newSectionBlock(title = 'Section', content = '') {
  return { id: makeBlockId('sec'), blockType: 'section', title, content };
}

export function newCodeBlock(title = 'Code Snippet', content = '', language = 'bash') {
  return { id: makeBlockId('code'), blockType: 'code', title, content, language };
}

export function newImageBlock(title = 'Screenshot Evidence', imageUrl = '', alt = 'Screenshot', caption = '', content = '') {
  return { id: makeBlockId('img'), blockType: 'image', title, imageUrl, alt, caption, content };
}

export function reportBlocksToMarkdown(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) return '';

  return blocks.map((block) => {
    if (block.blockType === 'code') {
      const title = String(block.title || 'Code Snippet').trim();
      const lang = String(block.language || 'bash').trim();
      const body = String(block.content || '').trim();
      return `### ${title}\n\`\`\`${lang}\n${body}\n\`\`\``;
    }

    if (block.blockType === 'image') {
      const title = String(block.title || 'Screenshot Evidence').trim();
      const alt = String(block.alt || 'Screenshot').trim();
      const imageUrl = String(block.imageUrl || '').trim();
      const caption = String(block.caption || '').trim();
      const notes = String(block.content || '').trim();
      const parts = [
        `### ${title}`,
        imageUrl ? `![${alt}](${imageUrl})` : '_No image selected_',
      ];
      if (caption) parts.push(`*${caption}*`);
      if (notes) parts.push(notes);
      return parts.join('\n\n');
    }

    const title = String(block.title || 'Section').trim();
    const body = String(block.content || '').trim();
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
        const captionMatch = lines[lookahead].trim().match(/^\*(.+)\*$/);
        if (captionMatch) {
          caption = captionMatch[1].trim();
          index = lookahead;
        }
      }
      blocks.push(newImageBlock(
        pendingTitle || 'Screenshot Evidence',
        imageMatch[2].trim(),
        (imageMatch[1] || 'Screenshot').trim(),
        caption,
        ''
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

export function normalizeReportBlocks(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return [newSectionBlock('Walkthrough', '')];
  }
  return blocks.map((block) => {
    const blockType = String(block?.blockType || 'section').trim().toLowerCase();
    if (blockType === 'code') {
      return {
        id: String(block?.id || makeBlockId('code')),
        blockType: 'code',
        title: String(block?.title || 'Code Snippet'),
        content: String(block?.content || ''),
        language: String(block?.language || 'bash'),
      };
    }
    if (blockType === 'image') {
      return {
        id: String(block?.id || makeBlockId('img')),
        blockType: 'image',
        title: String(block?.title || 'Screenshot Evidence'),
        imageUrl: String(block?.imageUrl || ''),
        alt: String(block?.alt || 'Screenshot'),
        caption: String(block?.caption || ''),
        content: String(block?.content || ''),
      };
    }
    return {
      id: String(block?.id || makeBlockId('sec')),
      blockType: 'section',
      title: String(block?.title || 'Section'),
      content: String(block?.content || ''),
    };
  });
}

export function parseWriteupBlocks(writeup) {
  if (!writeup) {
    return [newSectionBlock('Walkthrough', '')];
  }
  if (writeup.content_json) {
    try {
      const parsed = JSON.parse(writeup.content_json);
      return normalizeReportBlocks(parsed);
    } catch {
      // fall back to markdown parsing below
    }
  }
  return markdownToReportBlocks(writeup.content || '');
}

export function mergeReportPatches(blocks, patches, { allowMissingAppend = true } = {}) {
  const currentBlocks = normalizeReportBlocks(blocks);
  const nextBlocks = currentBlocks.map((block) => ({ ...block }));
  const patchList = Array.isArray(patches) ? patches : [];

  for (const patch of patchList) {
    if (!patch || typeof patch !== 'object') continue;
    const sectionId = String(patch.sectionId || '').trim();
    if (!sectionId) continue;
    const index = nextBlocks.findIndex((block) => String(block.id || '') === sectionId);
    if (index >= 0) {
      nextBlocks[index] = {
        ...nextBlocks[index],
        ...(typeof patch.title === 'string' ? { title: patch.title } : {}),
        ...(typeof patch.content === 'string' ? { content: patch.content } : {}),
        ...(typeof patch.caption === 'string' ? { caption: patch.caption } : {}),
        ...(typeof patch.alt === 'string' ? { alt: patch.alt } : {}),
      };
      continue;
    }
    if (!allowMissingAppend) continue;
    nextBlocks.push(newSectionBlock(
      typeof patch.title === 'string' && patch.title.trim() ? patch.title : 'Latest Evidence Updates',
      typeof patch.content === 'string' ? patch.content : ''
    ));
  }

  return nextBlocks;
}
