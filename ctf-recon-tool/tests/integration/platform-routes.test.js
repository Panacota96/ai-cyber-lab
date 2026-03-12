import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as sessionLinkGet, POST as sessionLinkPost } from '@/api/platform/session-link/route';
import { POST as submitFlagPost } from '@/api/platform/submit-flag/route';
import {
  createFlagSubmission,
  getSession,
  updateSession,
} from '@/lib/db';
import {
  cleanupTestSession,
  createTestSession,
  makeJsonRequest,
  readJson,
} from '../helpers/test-helpers';

describe('platform integration routes', () => {
  const sessions = [];
  const originalEnv = {
    HTB_API_TOKEN: process.env.HTB_API_TOKEN,
    HTB_MCP_URL: process.env.HTB_MCP_URL,
    THM_API_TOKEN: process.env.THM_API_TOKEN,
    THM_API_BASE_URL: process.env.THM_API_BASE_URL,
    CTFD_API_TOKEN: process.env.CTFD_API_TOKEN,
    CTFD_BASE_URL: process.env.CTFD_BASE_URL,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.HTB_API_TOKEN;
    delete process.env.HTB_MCP_URL;
    delete process.env.THM_API_TOKEN;
    delete process.env.THM_API_BASE_URL;
    delete process.env.CTFD_API_TOKEN;
    delete process.env.CTFD_BASE_URL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
    while (sessions.length > 0) {
      cleanupTestSession(sessions.pop());
    }
  });

  it('syncs a CTFd challenge into session metadata and imported targets', async () => {
    process.env.CTFD_API_TOKEN = 'ctfd-token';
    process.env.CTFD_BASE_URL = 'https://ctfd.example';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: {
        id: 42,
        name: 'Vault',
        description: 'Investigate http://vault.local and 10.10.10.42:8080.',
        connection_info: 'http://vault.local 10.10.10.42:8080',
        category: 'web',
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const session = createTestSession();
    sessions.push(session.id);

    const req = makeJsonRequest('/api/platform/session-link', 'POST', {
      sessionId: session.id,
      platformType: 'ctfd',
      remoteId: '42',
    }, { auth: true });
    const res = await sessionLinkPost(req);

    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.link.type).toBe('ctfd');
    expect(body.link.remoteId).toBe('42');
    expect(body.session.metadata.platform.type).toBe('ctfd');
    expect(body.session.targets.some((target) => target.target === 'http://vault.local')).toBe(true);
    expect(body.session.targets.some((target) => target.target === '10.10.10.42:8080')).toBe(true);

    const stored = getSession(session.id);
    expect(stored.metadata.platform.label).toBe('Vault');
  });

  it('returns current link metadata and capability status', async () => {
    process.env.THM_API_TOKEN = 'thm-token';
    process.env.THM_API_BASE_URL = 'https://tryhackme.example';

    const session = createTestSession();
    sessions.push(session.id);
    updateSession(session.id, {
      metadata: {
        platform: {
          type: 'thm',
          remoteId: 'room-9',
          label: 'Room 9',
          remoteContext: { roomCode: 'room-9' },
          capabilities: { metadata: true, flagSubmit: true, flagMode: 'validation' },
        },
      },
    });

    const res = await sessionLinkGet(makeJsonRequest(`/api/platform/session-link?sessionId=${session.id}`, 'GET', null, { auth: true }));
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.link.type).toBe('thm');
    expect(body.capabilities.thm.configured).toBe(true);
    expect(body.capabilities.thm.flagMode).toBe('validation');
  });

  it('submits a linked CTFd flag and records the result locally', async () => {
    process.env.CTFD_API_TOKEN = 'ctfd-token';
    process.env.CTFD_BASE_URL = 'https://ctfd.example';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: {
        status: 'correct',
        message: 'Correct flag',
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const session = createTestSession();
    sessions.push(session.id);
    updateSession(session.id, {
      metadata: {
        platform: {
          type: 'ctfd',
          remoteId: '42',
          label: 'Vault',
          remoteContext: { challengeId: '42' },
          capabilities: { metadata: true, flagSubmit: true, flagMode: 'submit' },
        },
      },
    });
    const flag = createFlagSubmission(session.id, {
      value: 'flag{correct}',
      status: 'captured',
      notes: 'ready to send',
    });

    const req = makeJsonRequest('/api/platform/submit-flag', 'POST', {
      sessionId: session.id,
      flagId: flag.id,
    }, { auth: true });
    const res = await submitFlagPost(req);
    expect(res.status).toBe(200);

    const body = await readJson(res);
    expect(body.flag.status).toBe('accepted');
    expect(body.flag.metadata.platform.summary).toContain('Correct flag');
    expect(body.result.status).toBe('accepted');
    expect(body.link.lastFlagSubmission.status).toBe('accepted');
  });

  it('rejects invalid platform-link and flag-submission payloads with validation details', async () => {
    const linkRes = await sessionLinkGet(makeJsonRequest('/api/platform/session-link?sessionId=../bad', 'GET', null, { auth: true }));
    const linkBody = await readJson(linkRes);

    expect(linkRes.status).toBe(400);
    expect(linkBody.error).toContain('Validation failed');
    expect(Array.isArray(linkBody.details)).toBe(true);

    const submitRes = await submitFlagPost(makeJsonRequest('/api/platform/submit-flag', 'POST', {
      sessionId: 'default',
      flagId: '',
    }, { auth: true }));
    const submitBody = await readJson(submitRes);

    expect(submitRes.status).toBe(400);
    expect(submitBody.error).toContain('Validation failed');
    expect(Array.isArray(submitBody.details)).toBe(true);
  });
});
