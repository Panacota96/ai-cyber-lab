import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getRouteMeta,
  readJsonBody,
  readValidatedJsonBody,
  readValidatedSearchParams,
  withAuth,
  withErrorHandler,
  withValidSessionId,
} from '@/lib/api-route';

function makeRequest({
  url = 'http://localhost/api/test',
  headers = {},
  body = undefined,
} = {}) {
  return {
    url,
    headers: new Headers(headers),
    json: body === undefined
      ? async () => { throw new Error('No JSON body'); }
      : async () => body,
  };
}

describe('api route middleware helpers', () => {
  let envSnapshot;

  beforeEach(() => {
    envSnapshot = { ...process.env };
  });

  afterEach(() => {
    process.env = envSnapshot;
  });

  it('withAuth rejects missing token when APP_API_TOKEN is configured', async () => {
    process.env.APP_API_TOKEN = 'secret-token';
    const request = makeRequest();
    const handler = withAuth(async () => NextResponse.json({ ok: true }));

    const response = await handler(request);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'Unauthorized', status: 401 });
  });

  it('withAuth rejects mutating requests without a matching CSRF token', async () => {
    process.env.APP_API_TOKEN = 'secret-token';
    const request = makeRequest({
      headers: {
        'x-api-token': 'secret-token',
      },
    });
    request.method = 'POST';

    const handler = withAuth(async () => NextResponse.json({ ok: true }));
    const response = await handler(request);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'Missing CSRF token', status: 403 });
  });

  it('withAuth accepts mutating requests when CSRF header and cookie match', async () => {
    process.env.APP_API_TOKEN = 'secret-token';
    const request = makeRequest({
      headers: {
        'x-api-token': 'secret-token',
        'x-csrf-token': 'csrf-123',
        cookie: 'helms_watch_csrf=csrf-123',
      },
    });
    request.method = 'POST';

    const handler = withAuth(async () => NextResponse.json({ ok: true }));
    const response = await handler(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('withValidSessionId reads and validates query session ids', async () => {
    const request = makeRequest({ url: 'http://localhost/api/test?sessionId=session_01' });
    const handler = withValidSessionId(async (req) => {
      const { sessionId } = getRouteMeta(req);
      return NextResponse.json({ sessionId });
    }, { source: 'query' });

    const response = await handler(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ sessionId: 'session_01' });
  });

  it('withValidSessionId rejects invalid body session ids', async () => {
    const request = makeRequest({ body: { sessionId: '../bad' } });
    const handler = withValidSessionId(async () => NextResponse.json({ ok: true }), { source: 'body' });

    const response = await handler(request);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'Invalid sessionId', status: 400 });
  });

  it('readJsonBody caches the parsed request payload', async () => {
    const request = makeRequest({ body: { sessionId: 'abc', test: true } });
    const first = await readJsonBody(request, {});
    const second = await readJsonBody(request, {});
    expect(first).toEqual({ sessionId: 'abc', test: true });
    expect(second).toEqual(first);
  });

  it('readValidatedJsonBody returns parsed data for matching schemas', async () => {
    const request = makeRequest({ body: { sessionId: 'abc', name: 'Demo' } });
    const result = await readValidatedJsonBody(request, z.object({
      sessionId: z.string(),
      name: z.string(),
    }));

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ sessionId: 'abc', name: 'Demo' });
  });

  it('readValidatedSearchParams returns validation errors with details', async () => {
    const request = makeRequest({ url: 'http://localhost/api/test?limit=bad' });
    const result = readValidatedSearchParams(request, z.object({
      limit: z.coerce.number().int(),
    }));

    expect(result.success).toBe(false);
    expect(result.response.status).toBe(400);
  });

  it('withErrorHandler wraps thrown errors into 500 responses', async () => {
    const request = makeRequest();
    const handler = withErrorHandler(async () => {
      throw new Error('boom');
    }, { route: 'unit-test-route' });

    const response = await handler(request);
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'Internal server error', status: 500 });
  });
});
