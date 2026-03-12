import { GET as writeupGet, POST as writeupPost } from '@/api/writeup/route';
import { GET as historyGet } from '@/api/writeup/history/route';
import {
  cleanupTestSession,
  createTestSession,
  makeJsonRequest,
  readJson,
} from '../helpers/test-helpers';

describe('writeup route contracts', () => {
  const sessions = [];

  afterEach(() => {
    while (sessions.length > 0) {
      cleanupTestSession(sessions.pop());
    }
  });

  it('saves writeups and returns version history through validated routes', async () => {
    const session = createTestSession();
    sessions.push(session.id);

    const initialSave = await writeupPost(makeJsonRequest('/api/writeup', 'POST', {
      sessionId: session.id,
      content: '## Findings\nVersion one',
      contentJson: [{ id: 'find-1', blockType: 'section', title: 'Findings', content: 'Version one' }],
    }, { auth: true }));
    expect(initialSave.status).toBe(200);

    const secondSave = await writeupPost(makeJsonRequest('/api/writeup', 'POST', {
      sessionId: session.id,
      content: '## Findings\nVersion two',
      contentJson: [{ id: 'find-1', blockType: 'section', title: 'Findings', content: 'Version two' }],
      visibility: 'shared',
    }, { auth: true }));
    expect(secondSave.status).toBe(200);

    const getRes = await writeupGet(new Request(`http://localhost/api/writeup?sessionId=${session.id}`));
    expect(getRes.status).toBe(200);
    const getBody = await readJson(getRes);
    expect(getBody.content).toContain('Version two');
    expect(Array.isArray(getBody.contentJson)).toBe(true);

    const historyListRes = await historyGet(new Request(`http://localhost/api/writeup/history?sessionId=${session.id}`));
    expect(historyListRes.status).toBe(200);
    const historyList = await readJson(historyListRes);
    expect(Array.isArray(historyList)).toBe(true);
    expect(historyList).toHaveLength(1);

    const versionRes = await historyGet(new Request(`http://localhost/api/writeup/history?sessionId=${session.id}&versionId=${historyList[0].id}`));
    expect(versionRes.status).toBe(200);
    const versionBody = await readJson(versionRes);
    expect(versionBody.content).toContain('Version one');
    expect(Array.isArray(versionBody.contentJson)).toBe(true);
  });

  it('rejects invalid writeup and history requests with validation details', async () => {
    const invalidWriteupRes = await writeupPost(makeJsonRequest('/api/writeup', 'POST', {
      sessionId: '../bad',
      content: 'nope',
    }, { auth: true }));
    const invalidWriteupBody = await readJson(invalidWriteupRes);

    expect(invalidWriteupRes.status).toBe(400);
    expect(invalidWriteupBody.error).toContain('Validation failed');
    expect(Array.isArray(invalidWriteupBody.details)).toBe(true);

    const invalidHistoryRes = await historyGet(new Request('http://localhost/api/writeup/history?sessionId=../bad'));
    const invalidHistoryBody = await readJson(invalidHistoryRes);

    expect(invalidHistoryRes.status).toBe(400);
    expect(invalidHistoryBody.error).toContain('Validation failed');
    expect(Array.isArray(invalidHistoryBody.details)).toBe(true);
  });
});
