import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError } from '@/lib/api-error';
import {
  getRouteMeta,
  readJsonBody,
  withAuth,
  withErrorHandler,
  withValidSessionId,
} from '@/lib/api-route';
import { getSession } from '@/lib/db';
import { createShellSession, listShellSessions } from '@/lib/shell-repository';
import { ensureShellRuntimesForSession, startShellSessionRuntime } from '@/lib/shell-runtime';
import { isShellHubEnabled } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CreateShellSchema = z.object({
  sessionId: z.string().optional().default('default'),
  targetId: z.string().optional().nullable(),
  type: z.enum(['reverse', 'webshell']).default('reverse'),
  label: z.string().trim().min(1).max(255).optional(),
  bindHost: z.string().trim().min(1).max(255).optional(),
  bindPort: z.coerce.number().int().min(0).max(65535).optional(),
  webshellUrl: z.string().trim().max(2048).optional(),
  webshellMethod: z.enum(['GET', 'POST', 'PUT']).optional(),
  webshellHeaders: z.record(z.string(), z.string()).optional(),
  webshellBodyTemplate: z.string().max(20000).optional(),
  webshellCommandField: z.string().trim().max(64).optional(),
  notes: z.string().max(4000).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

function ensureShellHubAvailable() {
  return isShellHubEnabled() ? null : apiError('Shell hub is disabled in this runtime.', 503);
}

function ensureSessionExists(sessionId) {
  return getSession(sessionId) ? null : apiError('Session not found', 404);
}

export const GET = withErrorHandler(
  withValidSessionId(async (request) => {
    const disabled = ensureShellHubAvailable();
    if (disabled) return disabled;

    const { sessionId } = getRouteMeta(request);
    const missing = ensureSessionExists(sessionId);
    if (missing) return missing;

    const shellSessions = await ensureShellRuntimesForSession(sessionId);
    return NextResponse.json({ shellSessions });
  }, { source: 'query' }),
  { route: '/api/shell/sessions GET' }
);

export const POST = withErrorHandler(
  withAuth(
    withValidSessionId(async (request) => {
      const disabled = ensureShellHubAvailable();
      if (disabled) return disabled;

      const { sessionId } = getRouteMeta(request);
      const missing = ensureSessionExists(sessionId);
      if (missing) return missing;

      const parsed = CreateShellSchema.safeParse(await readJsonBody(request, {}));
      if (!parsed.success) {
        return apiError('Validation failed', 400, { details: parsed.error.errors });
      }
      if (parsed.data.type === 'webshell' && !parsed.data.webshellUrl) {
        return apiError('webshellUrl is required for webshell sessions.', 400);
      }

      const shellSession = createShellSession(sessionId, parsed.data);
      const started = await startShellSessionRuntime(shellSession);
      return NextResponse.json({ shellSession: started }, { status: 201 });
    }, { source: 'body' })
  ),
  { route: '/api/shell/sessions POST' }
);
