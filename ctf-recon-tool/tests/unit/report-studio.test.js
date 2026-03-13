import {
  newImageBlock,
  parseWriteupBlocks,
} from '@/domains/reporting/lib/report-blocks';
import {
  buildImageBlockFromArtifact,
  buildSectionActionEvidenceContext,
  duplicateStudioBlock,
  reorderStudioBlocks,
  sectionActionPromptSuffix,
} from '@/domains/reporting/lib/report-studio';

describe('report studio helpers', () => {
  it('preserves additive image metadata in report blocks', () => {
    const block = newImageBlock('Evidence', '/api/artifacts/default/a1', 'Proof', 'Caption', 'Analyst note', {
      artifactId: 'artifact-1',
      linkedSectionId: 'sec-1',
      layout: 'split-right',
    });

    const parsed = parseWriteupBlocks([block]);

    expect(parsed[0].artifactId).toBe('artifact-1');
    expect(parsed[0].linkedSectionId).toBe('sec-1');
    expect(parsed[0].layout).toBe('split-right');
  });

  it('reorders and duplicates studio blocks deterministically', () => {
    const blocks = [
      { id: 'sec-1', blockType: 'section', title: 'One', content: 'A' },
      { id: 'sec-2', blockType: 'section', title: 'Two', content: 'B' },
      { id: 'sec-3', blockType: 'section', title: 'Three', content: 'C' },
    ];

    const reordered = reorderStudioBlocks(blocks, 0, 2);
    expect(reordered.map((block) => block.id)).toEqual(['sec-2', 'sec-3', 'sec-1']);

    const duplicated = duplicateStudioBlock(blocks, 'sec-2');
    expect(duplicated).toHaveLength(4);
    expect(duplicated[2].title).toBe('Two Copy');
    expect(duplicated[2].id).not.toBe('sec-2');
  });

  it('builds artifact-backed image blocks and section evidence context', () => {
    const artifact = {
      id: 'artifact-99',
      filename: 'proof.png',
      downloadPath: '/api/artifacts/default/artifact-99',
      notes: 'Portal admin proof',
      previewText: '',
      mimeType: 'image/png',
      shellSessionId: null,
    };
    const imageBlock = buildImageBlockFromArtifact(artifact, { linkedSectionId: 'sec-main', layout: 'full' });
    expect(imageBlock.artifactId).toBe('artifact-99');
    expect(imageBlock.linkedSectionId).toBe('sec-main');

    const evidenceContext = buildSectionActionEvidenceContext({
      sectionAction: 'explain-evidence',
      block: imageBlock,
      blocks: [
        { id: 'sec-main', blockType: 'section', title: 'Foothold', content: 'Exploit details.' },
        imageBlock,
      ],
      artifacts: [artifact],
      findings: [{ title: 'Admin exposure', severity: 'high', description: 'Admin panel exposed.' }],
      credentials: [{ label: 'admin', username: 'admin', service: 'http', host: '10.10.10.10', verified: false }],
    });

    expect(evidenceContext).toContain('artifact-99');
    expect(evidenceContext).toContain('Foothold');
    expect(evidenceContext).toContain('Admin exposure');
  });

  it('exposes section-action prompt suffixes for studio AI actions', () => {
    expect(sectionActionPromptSuffix('summarize').toLowerCase()).toContain('summarize');
    expect(sectionActionPromptSuffix('explain-evidence').toLowerCase()).toContain('evidence');
    expect(sectionActionPromptSuffix('generate-conclusion').toLowerCase()).toContain('conclusion');
  });
});
