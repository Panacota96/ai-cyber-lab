import { vi } from 'vitest';

const mockAnthropicCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class AnthropicMock {
    constructor() {
      this.messages = {
        create: mockAnthropicCreate,
      };
    }
  },
}));

import { POST as extractFindingsPost } from '@/api/findings/extract/route';
import { addTimelineEvent } from '@/lib/db';
import {
  cleanupTestSession,
  createTestSession,
  getSessionFindingCount,
  getSessionUsageCalls,
  makeJsonRequest,
  readJson,
} from '../helpers/test-helpers';

describe('/api/findings/extract route', () => {
  const sessions = [];

  beforeEach(() => {
    mockAnthropicCreate.mockReset();
  });

  afterEach(() => {
    while (sessions.length > 0) {
      cleanupTestSession(sessions.pop());
    }
  });

  it('requires auth token', async () => {
    const session = createTestSession();
    sessions.push(session.id);

    const req = makeJsonRequest('/api/findings/extract', 'POST', {
      sessionId: session.id,
      provider: 'claude',
    }, { auth: false });

    const res = await extractFindingsPost(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid session format', async () => {
    const req = makeJsonRequest('/api/findings/extract', 'POST', {
      sessionId: '***',
      provider: 'claude',
    }, { auth: true });
    const res = await extractFindingsPost(req);
    expect(res.status).toBe(400);
  });

  it('returns 502 when model output is malformed JSON', async () => {
    const session = createTestSession();
    sessions.push(session.id);
    addTimelineEvent(session.id, {
      type: 'note',
      content: 'Potential misconfiguration observed.',
      status: 'success',
    });

    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'not-a-json-payload' }],
      usage: { input_tokens: 100, output_tokens: 20 },
    });

    const req = makeJsonRequest('/api/findings/extract', 'POST', {
      sessionId: session.id,
      provider: 'claude',
      apiKey: 'test-key',
    }, { auth: true });
    const res = await extractFindingsPost(req);

    expect(res.status).toBe(502);
    const body = await readJson(res);
    expect(body.error).toContain('malformed JSON');
  });

  it('returns proposals only and records AI usage on success', async () => {
    const session = createTestSession();
    sessions.push(session.id);

    const cmdEvent = addTimelineEvent(session.id, {
      type: 'command',
      command: 'nmap -sV 127.0.0.1',
      output: '80/tcp open http',
      status: 'success',
    });

    const usageBefore = getSessionUsageCalls(session.id);

    mockAnthropicCreate.mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          findings: [{
            title: 'Open HTTP service',
            severity: 'medium',
            description: 'HTTP service is exposed without visible authentication.',
            impact: 'Increases attack surface.',
            remediation: 'Restrict access.',
            evidenceEventIds: [cmdEvent.id],
          }],
        }),
      }],
      usage: { input_tokens: 140, output_tokens: 45 },
    });

    const req = makeJsonRequest('/api/findings/extract', 'POST', {
      sessionId: session.id,
      provider: 'claude',
      apiKey: 'test-key',
      maxEvents: 80,
    }, { auth: true });
    const res = await extractFindingsPost(req);
    expect(res.status).toBe(200);

    const body = await readJson(res);
    expect(Array.isArray(body.proposals)).toBe(true);
    expect(body.proposals).toHaveLength(1);
    expect(body.proposals[0].title).toBe('Open HTTP service');
    expect(body.proposals[0].evidenceEventIds).toEqual([cmdEvent.id]);

    expect(getSessionFindingCount(session.id)).toBe(0);
    expect(getSessionUsageCalls(session.id)).toBeGreaterThan(usageBefore);
  });
});
