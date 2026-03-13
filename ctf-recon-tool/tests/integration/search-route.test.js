import { GET as searchGet } from '@/api/search/route';
import { addTimelineEvent, createFinding, saveWriteup } from '@/lib/db';
import {
  cleanupTestSession,
  createTestSession,
  makeJsonRequest,
  readJson,
} from '../helpers/test-helpers';

describe('search route', () => {
  const sessions = [];

  afterEach(() => {
    while (sessions.length > 0) {
      cleanupTestSession(sessions.pop());
    }
  });

  it('returns indexed results across sessions and supports current-session scoping', async () => {
    const first = createTestSession({ name: 'Search Alpha', target: '10.10.10.11' });
    const second = createTestSession({ name: 'Search Beta', target: '10.10.10.12' });
    sessions.push(first.id, second.id);

    createFinding(first.id, {
      title: 'Kerberoast foothold',
      severity: 'high',
      description: 'Captured SPN-able account from LDAP enumeration.',
      tags: ['ad', 'credential'],
    });
    addTimelineEvent(second.id, {
      type: 'note',
      content: 'Kerberoast follow-up on second session',
      tag: 'evidence',
      tags: ['evidence'],
    });
    saveWriteup(second.id, 'Kerberoast remediation notes', 'draft', 'draft', null);

    const globalRes = await searchGet(makeJsonRequest('/api/search?q=Kerberoast', 'GET', null, { auth: true }));
    const globalBody = await readJson(globalRes);

    expect(globalRes.status).toBe(200);
    expect(globalBody.count).toBeGreaterThanOrEqual(2);
    expect(globalBody.results.some((result) => result.sourceType === 'finding')).toBe(true);
    expect(globalBody.results.some((result) => result.sessionId === second.id)).toBe(true);

    const scopedRes = await searchGet(makeJsonRequest(`/api/search?q=Kerberoast&sessionId=${first.id}`, 'GET', null, { auth: true }));
    const scopedBody = await readJson(scopedRes);

    expect(scopedRes.status).toBe(200);
    expect(scopedBody.results.every((result) => result.sessionId === first.id)).toBe(true);
  });

  it('returns validation details for invalid search queries', async () => {
    const res = await searchGet(makeJsonRequest('/api/search?q=', 'GET', null, { auth: true }));
    const body = await readJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toContain('Validation failed');
    expect(Array.isArray(body.details)).toBe(true);
  });
});
