import { afterEach, describe, expect, it } from 'vitest';

import { GET as healthGet } from '@/api/health/route';

async function readJson(response) {
  return response.json().catch(() => ({}));
}

describe('/api/health route', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalExec = process.env.ENABLE_COMMAND_EXECUTION;
  const originalAdmin = process.env.ENABLE_ADMIN_API;
  const originalToken = process.env.APP_API_TOKEN;
  const originalToken2 = process.env.APP_API_TOKEN_2;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.ENABLE_COMMAND_EXECUTION = originalExec;
    process.env.ENABLE_ADMIN_API = originalAdmin;
    process.env.APP_API_TOKEN = originalToken;
    process.env.APP_API_TOKEN_2 = originalToken2;
  });

  it('reports runtime capability flags alongside general health', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ENABLE_COMMAND_EXECUTION;
    delete process.env.ENABLE_ADMIN_API;
    process.env.APP_API_TOKEN = 'token-a';
    delete process.env.APP_API_TOKEN_2;

    const response = await healthGet();
    expect(response.status).toBe(200);

    const payload = await readJson(response);
    expect(payload.status).toBeTypeOf('string');
    expect(payload.features).toEqual({
      commandExecutionEnabled: false,
      shellHubEnabled: false,
      adminApiEnabled: false,
      experimentalAiEnabled: false,
      offlineAiEnabled: false,
      autoWriteupSuggestionsEnabled: false,
      adversarialChallengeModeEnabled: false,
      apiTokenRequired: true,
    });
  });
});
