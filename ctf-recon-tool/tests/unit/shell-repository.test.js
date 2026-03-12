import {
  appendShellTranscriptChunk,
  createShellSession,
  getShellTranscriptSummary,
  listShellTranscript,
} from '@/lib/shell-repository';
import { cleanupTestSession, createTestSession } from '../helpers/test-helpers';

describe('shell repository', () => {
  const sessions = [];

  afterEach(() => {
    while (sessions.length > 0) {
      cleanupTestSession(sessions.pop());
    }
  });

  it('persists transcript chunks in order and strips ansi/control characters', () => {
    const session = createTestSession();
    sessions.push(session.id);
    const shellSession = createShellSession(session.id, {
      type: 'reverse',
      label: 'Unit Reverse',
      bindHost: '127.0.0.1',
      bindPort: 0,
    });

    const first = appendShellTranscriptChunk(session.id, shellSession.id, {
      direction: 'output',
      content: '\u001b[32mhello\u001b[0m',
    });
    const second = appendShellTranscriptChunk(session.id, shellSession.id, {
      direction: 'input',
      content: 'whoami\r\n',
    });

    expect(first.content).toBe('hello');
    expect(second.seq).toBe(first.seq + 1);
    expect(listShellTranscript(session.id, shellSession.id)).toHaveLength(2);
    expect(getShellTranscriptSummary(session.id, shellSession.id)).toEqual({
      count: 2,
      cursor: 2,
    });
  });
});
