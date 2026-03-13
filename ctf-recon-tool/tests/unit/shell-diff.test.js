import { diffShellTranscriptContents } from '@/lib/shell-diff';

describe('diffShellTranscriptContents', () => {
  it('tracks additions, removals, and unchanged lines', () => {
    const result = diffShellTranscriptContents(
      'uid=0(root)\npwd\n/tmp',
      'uid=0(root)\nwhoami\n/tmp\nls'
    );

    expect(result.summary).toEqual({
      additions: 2,
      removals: 1,
      unchanged: 2,
    });
    expect(result.changes.some((change) => change.type === 'remove' && change.line === 'pwd')).toBe(true);
    expect(result.changes.some((change) => change.type === 'add' && change.line === 'whoami')).toBe(true);
    expect(result.changes.some((change) => change.type === 'add' && change.line === 'ls')).toBe(true);
  });

  it('handles identical content without synthetic changes', () => {
    const result = diffShellTranscriptContents('uname -a', 'uname -a');
    expect(result.summary).toEqual({
      additions: 0,
      removals: 0,
      unchanged: 1,
    });
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({
      type: 'context',
      line: 'uname -a',
    });
  });
});
