import {
  duplicateReportBlock,
  newCodeBlock,
  newImageBlock,
  newSectionBlock,
  parseWriteupBlocks,
  reorderReportBlocks,
} from '@/domains/reporting/lib/report-blocks';

function normalizeBlockTitle(block = {}) {
  return String(block?.title || '').trim().toLowerCase();
}

export function createReportBlockByType(type = 'section') {
  if (type === 'code') return newCodeBlock('Code Snippet', '', 'bash');
  if (type === 'image') return newImageBlock('Screenshot Evidence', '', 'Screenshot', '', '', { layout: 'full' });
  return newSectionBlock('Section', '');
}

export function reorderStudioBlocks(blocks = [], fromIndex, toIndex) {
  return reorderReportBlocks(blocks, fromIndex, toIndex);
}

export function duplicateStudioBlock(blocks = [], blockId) {
  return duplicateReportBlock(blocks, blockId);
}

export function deleteStudioBlock(blocks = [], blockId) {
  return parseWriteupBlocks(blocks).filter((block) => String(block?.id || '') !== String(blockId || ''));
}

export function collectImageArtifacts(artifacts = []) {
  return (Array.isArray(artifacts) ? artifacts : []).filter((artifact) => String(artifact?.mimeType || '').toLowerCase().startsWith('image/'));
}

export function buildImageBlockFromArtifact(artifact, options = {}) {
  if (!artifact) return null;
  return newImageBlock(
    artifact.filename || 'Screenshot Evidence',
    artifact.downloadPath || '',
    artifact.filename || 'Screenshot',
    artifact.notes || '',
    '',
    {
      artifactId: artifact.id,
      linkedSectionId: options?.linkedSectionId || null,
      layout: options?.layout || 'full',
    },
  );
}

export function buildSectionActionEvidenceContext({
  sectionAction = 'refine',
  block = null,
  blocks = [],
  artifacts = [],
  findings = [],
  credentials = [],
} = {}) {
  const current = block || null;
  const allBlocks = parseWriteupBlocks(blocks);
  const index = current ? allBlocks.findIndex((entry) => String(entry?.id || '') === String(current.id || '')) : -1;
  const nearbyBlocks = index === -1
    ? []
    : allBlocks.slice(Math.max(0, index - 1), Math.min(allBlocks.length, index + 2));
  const linkedArtifact = current?.artifactId
    ? (Array.isArray(artifacts) ? artifacts.find((artifact) => String(artifact?.id || '') === String(current.artifactId)) : null)
    : null;
  const linkedSection = current?.linkedSectionId
    ? allBlocks.find((entry) => String(entry?.id || '') === String(current.linkedSectionId))
    : null;

  const relevantFindings = (Array.isArray(findings) ? findings : []).slice(0, 8).map((finding) => ({
    title: finding.title,
    severity: finding.severity,
    tags: finding.tags,
    summary: finding.description || finding.summary || '',
  }));
  const relevantCredentials = (Array.isArray(credentials) ? credentials : []).slice(0, 6).map((credential) => ({
    label: credential.label,
    username: credential.username,
    service: credential.service,
    host: credential.host,
    verified: credential.verified,
  }));

  return JSON.stringify({
    sectionAction,
    currentBlock: current ? {
      id: current.id,
      blockType: current.blockType,
      title: current.title || '',
      content: current.content || '',
      caption: current.caption || '',
      alt: current.alt || '',
      imageUrl: current.imageUrl || '',
      layout: current.layout || 'full',
    } : null,
    linkedSection: linkedSection ? {
      id: linkedSection.id,
      title: linkedSection.title || '',
      content: linkedSection.content || '',
    } : null,
    linkedArtifact: linkedArtifact ? {
      id: linkedArtifact.id,
      filename: linkedArtifact.filename,
      notes: linkedArtifact.notes,
      previewText: linkedArtifact.previewText,
      mimeType: linkedArtifact.mimeType,
      shellSessionId: linkedArtifact.shellSessionId,
    } : null,
    nearbyBlocks: nearbyBlocks.map((entry) => ({
      id: entry.id,
      blockType: entry.blockType,
      title: entry.title || '',
      content: entry.content || '',
      caption: entry.caption || '',
    })),
    relevantFindings,
    relevantCredentials,
  }, null, 2);
}

export function sectionActionPromptSuffix(sectionAction = 'refine') {
  const normalized = String(sectionAction || 'refine').trim().toLowerCase();
  if (normalized === 'summarize') {
    return 'Summarize the selected section cleanly while preserving technical accuracy and the key outcome.';
  }
  if (normalized === 'explain-evidence') {
    return 'Explain the attached evidence, screenshot, or artifact clearly and tie it to the operator decision or finding.';
  }
  if (normalized === 'generate-intro') {
    return 'Generate or improve an introductory summary for the selected section using concise, evidence-backed language.';
  }
  if (normalized === 'generate-conclusion') {
    return 'Generate or improve a closing conclusion for the selected section, focused on outcome, impact, and next steps.';
  }
  return 'Refine the selected section for clarity, reproducibility, and strong technical reporting.';
}

export function getDefaultStudioTargetSection(blocks = []) {
  const parsed = parseWriteupBlocks(blocks);
  const preferred = parsed.find((block) => block.blockType === 'section' && /executive summary|summary|walkthrough/i.test(block.title || ''));
  return preferred?.id || parsed.find((block) => block.blockType === 'section')?.id || null;
}

export function buildStudioOutline(blocks = []) {
  return parseWriteupBlocks(blocks).map((block, index) => ({
    id: block.id,
    blockType: block.blockType,
    title: block.title || `${String(block.blockType || 'section').toUpperCase()} ${index + 1}`,
    linkedSectionId: block.linkedSectionId || null,
    isSection: block.blockType === 'section',
    titleKey: normalizeBlockTitle(block),
  }));
}

