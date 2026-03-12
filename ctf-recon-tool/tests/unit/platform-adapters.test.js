import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getPlatformCapabilities,
  submitPlatformFlag,
  syncPlatformLink,
} from '@/lib/platform-adapters';

describe('platform adapters', () => {
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
  });

  it('reports capability status from server-side env vars', () => {
    process.env.THM_API_TOKEN = 'thm-token';
    process.env.CTFD_API_TOKEN = 'ctfd-token';
    process.env.CTFD_BASE_URL = 'https://ctfd.example';

    const capabilities = getPlatformCapabilities();
    expect(capabilities.htb.configured).toBe(false);
    expect(capabilities.thm.configured).toBe(true);
    expect(capabilities.thm.flagMode).toBe('validation');
    expect(capabilities.ctfd.configured).toBe(true);
    expect(capabilities.ctfd.flagSubmit).toBe(true);
  });

  it('normalizes THM room metadata into a platform link', async () => {
    process.env.THM_API_TOKEN = 'thm-token';
    process.env.THM_API_BASE_URL = 'https://tryhackme.example';

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 'success',
      data: [{
        code: 'room-42',
        title: 'Room 42',
        description: 'Reach http://room42.tryhackme.local for the challenge.',
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const result = await syncPlatformLink({
      platformType: 'thm',
      remoteId: 'room-42',
    });

    expect(result.ok).toBe(true);
    expect(result.platform.type).toBe('thm');
    expect(result.platform.label).toBe('Room 42');
    expect(result.platform.capabilities.flagMode).toBe('validation');
    expect(result.platform.importedTargets.some((target) => target.target === 'http://room42.tryhackme.local')).toBe(true);
  });

  it('returns an explicit HTB capability error when challenge id is missing for flag submit', async () => {
    process.env.HTB_API_TOKEN = 'htb-token';
    process.env.HTB_MCP_URL = 'https://mcp.hackthebox.ai/v1/ctf/mcp/';

    const result = await submitPlatformFlag({
      platformLink: {
        type: 'htb',
        remoteId: 'event-7',
        remoteContext: {},
      },
      flagValue: 'HTB{demo}',
    });

    expect(result.ok).toBe(false);
    expect(result.capability.flagSubmit).toBe(false);
    expect(result.capability.reason).toContain('challenge ID');
  });
});
