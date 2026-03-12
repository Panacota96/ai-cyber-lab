import { formatSseEvent, subscribeToShellStream } from '@/lib/shell-stream';
import { getRouteMeta, withErrorHandler, withValidSessionId } from '@/lib/api-route';
import { isShellHubEnabled } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const encoder = new TextEncoder();

export const GET = withErrorHandler(
  withValidSessionId(async (request) => {
    const { sessionId, searchParams } = getRouteMeta(request);
    const shellSessionIdFilter = searchParams?.get('shellSessionId') || null;
    let cleanup = () => {};

    if (!isShellHubEnabled()) {
      return new Response('Shell hub disabled', { status: 503 });
    }

    const stream = new ReadableStream({
      start(controller) {
        let closed = false;

        const send = (eventName, payload) => {
          if (closed) return;
          controller.enqueue(encoder.encode(formatSseEvent(eventName, payload, payload?.id)));
        };

        const unsubscribe = subscribeToShellStream(sessionId, (payload) => {
          if (shellSessionIdFilter && payload?.shellSessionId && payload.shellSessionId !== shellSessionIdFilter) {
            return;
          }
          send('shell', payload);
        });

        send('ready', {
          id: `shell-ready-${Date.now()}`,
          sessionId,
          shellSessionId: shellSessionIdFilter,
          transport: 'sse',
        });

        const heartbeat = setInterval(() => {
          send('ping', {
            id: `shell-ping-${Date.now()}`,
            sessionId,
            shellSessionId: shellSessionIdFilter,
          });
        }, 15000);

        cleanup = () => {
          if (closed) return;
          closed = true;
          clearInterval(heartbeat);
          unsubscribe();
          try {
            controller.close();
          } catch {
            // ignore close races
          }
        };

        request.signal?.addEventListener?.('abort', cleanup, { once: true });
      },
      cancel() {
        cleanup();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'Content-Type': 'text/event-stream; charset=utf-8',
      },
    });
  }, { source: 'query' }),
  { route: '/api/shell/stream GET' }
);
