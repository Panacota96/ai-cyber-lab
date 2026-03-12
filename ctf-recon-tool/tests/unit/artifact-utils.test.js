import {
  buildArtifactPreviewText,
  buildStoredArtifactName,
  computeSha256,
  inferArtifactPreviewKind,
} from '@/lib/artifact-utils';

describe('artifact utils', () => {
  it('classifies image, text, and download artifacts deterministically', () => {
    expect(inferArtifactPreviewKind('loot.png', 'image/png')).toBe('image');
    expect(inferArtifactPreviewKind('notes.txt', 'text/plain')).toBe('text');
    expect(inferArtifactPreviewKind('archive.bin', 'application/octet-stream')).toBe('download');
  });

  it('builds text previews and strips ansi escapes', () => {
    const preview = buildArtifactPreviewText(Buffer.from('\u001b[32mhello\u001b[0m\nworld', 'utf8'), {
      filename: 'shell.txt',
      mimeType: 'text/plain',
    });
    expect(preview).toBe('hello\nworld');
  });

  it('hashes content and creates safe stored names', () => {
    expect(computeSha256(Buffer.from('abc', 'utf8'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(buildStoredArtifactName('weird name?.txt')).toMatch(/\.txt$/);
    expect(buildStoredArtifactName('weird name?.txt')).not.toContain(' ');
  });
});
