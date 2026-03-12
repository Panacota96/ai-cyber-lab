import { GET as suggestionsGet } from '@/api/suggestions/services/route';
import { saveGraphState } from '@/lib/db';
import * as toolAvailability from '@/lib/tool-availability';
import {
  cleanupTestSession,
  createTestSession,
  readJson,
} from '../helpers/test-helpers';

describe('/api/suggestions/services route', () => {
  const sessions = [];

  afterEach(() => {
    while (sessions.length > 0) {
      cleanupTestSession(sessions.pop());
    }
  });

  it('returns advisory suggestions from the persisted graph state', async () => {
    vi.spyOn(toolAvailability, 'isToolAvailable').mockImplementation((binary) => (
      ['whatweb', 'gobuster', 'nmap'].includes(binary)
    ));

    const session = createTestSession();
    sessions.push(session.id);

    saveGraphState(session.id, [
      {
        id: 'host::10-10-10-10',
        type: 'discovery',
        position: { x: 40, y: 40 },
        data: { nodeType: 'host', label: '10.10.10.10', origin: 'auto', targetIds: ['target-http'] },
      },
      {
        id: 'service::http-80',
        type: 'discovery',
        position: { x: 240, y: 40 },
        data: {
          nodeType: 'service',
          label: 'http:80/tcp',
          origin: 'auto',
          targetIds: ['target-http'],
          details: { service: 'http', port: 80 },
        },
      },
    ], [
      {
        id: 'edge::host-http',
        source: 'host::10-10-10-10',
        target: 'service::http-80',
        label: 'found',
      },
    ]);

    const response = await suggestionsGet(new Request(`http://localhost/api/suggestions/services?sessionId=${session.id}`));

    expect(response.status).toBe(200);
    const payload = await readJson(response);
    expect(payload.suggestions.length).toBeGreaterThan(0);
    expect(payload.suggestions[0]).toMatchObject({
      host: '10.10.10.10',
      service: 'http',
    });
    expect(payload.suggestions.some((item) => item.command.includes('whatweb'))).toBe(true);
    expect(payload.suggestions.some((item) => Array.isArray(item.targetIds) && item.targetIds.includes('target-http'))).toBe(true);
  });
});
