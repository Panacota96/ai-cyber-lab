import { formatSseEvent, subscribeToExecutionStream } from '@/lib/execution-stream';
import { getRouteMeta, withErrorHandler, withValidSessionId } from '@/lib/api-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const encoder = new TextEncoder();

export const GET = withErrorHandler(
  withValidSessionId(async (request) => {
    const { sessionId } = getRouteMeta(request);
    let cleanup = () => {};

    const stream = new ReadableStream({
      start(controller) {
        let closed = false;

        const send = (eventName, payload) => {
          if (closed) return;
          controller.enqueue(encoder.encode(formatSseEvent(eventName, payload, payload?.id)));
        };

        const unsubscribe = subscribeToExecutionStream(sessionId, (payload) => {
          send('execution', payload);
        });

        send('ready', {
          id: `ready-${Date.now()}`,
          sessionId,
          transport: 'sse',
        });

        const heartbeat = setInterval(() => {
          send('ping', {
            id: `ping-${Date.now()}`,
            sessionId,
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
            // ignore close races during disconnect
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
  { route: '/api/execute/stream GET' }
);
