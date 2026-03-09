import { NextResponse } from 'next/server';

const SPEC = {
  openapi: '3.1.0',
  info: {
    title: "Helm's Paladin API",
    version: '1.0.0',
    description: 'CTF reconnaissance assistant — session management, command execution, AI coaching, and reporting.',
  },
  servers: [{ url: '/api', description: 'Current server' }],
  components: {
    securitySchemes: {
      ApiToken: { type: 'apiKey', in: 'header', name: 'x-api-token' },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
        },
        required: ['error'],
      },
      Session: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          target: { type: 'string' },
          difficulty: { type: 'string', enum: ['easy', 'medium', 'hard', 'insane'] },
          objective: { type: 'string' },
        },
      },
      TimelineEvent: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          session_id: { type: 'string' },
          type: { type: 'string', enum: ['command', 'note', 'screenshot'] },
          command: { type: 'string' },
          content: { type: 'string' },
          status: { type: 'string', enum: ['running', 'success', 'failed', 'timeout', 'cancelled', 'queued'] },
          output: { type: 'string' },
          filename: { type: 'string' },
          name: { type: 'string' },
          tag: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
      PocStep: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          sessionId: { type: 'string' },
          stepOrder: { type: 'integer' },
          title: { type: 'string' },
          goal: { type: 'string' },
          executionEventId: { type: 'string', nullable: true },
          noteEventId: { type: 'string', nullable: true },
          screenshotEventId: { type: 'string', nullable: true },
          observation: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time', nullable: true },
          updatedAt: { type: 'string', format: 'date-time', nullable: true },
          executionEvent: { $ref: '#/components/schemas/TimelineEvent' },
          noteEvent: { $ref: '#/components/schemas/TimelineEvent' },
          screenshotEvent: { $ref: '#/components/schemas/TimelineEvent' },
        },
      },
    },
  },
  paths: {
    '/sessions': {
      get: {
        summary: 'List all sessions',
        operationId: 'listSessions',
        responses: {
          '200': { description: 'Array of sessions', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Session' } } } } },
        },
      },
      post: {
        summary: 'Create a new session',
        operationId: 'createSession',
        security: [{ ApiToken: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, target: { type: 'string' }, difficulty: { type: 'string' }, objective: { type: 'string' }, id: { type: 'string' } } } } },
        },
        responses: {
          '200': { description: 'Created session', content: { 'application/json': { schema: { $ref: '#/components/schemas/Session' } } } },
          '400': { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '401': { description: 'Unauthorized' },
          '409': { description: 'Duplicate session id' },
        },
      },
      delete: {
        summary: 'Delete a session',
        operationId: 'deleteSession',
        security: [{ ApiToken: [] }],
        parameters: [{ name: 'id', in: 'query', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Success' },
          '400': { description: 'Invalid id' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/timeline': {
      get: {
        summary: 'Get timeline events for a session',
        operationId: 'getTimeline',
        parameters: [{ name: 'sessionId', in: 'query', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Array of events', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/TimelineEvent' } } } } },
        },
      },
      post: {
        summary: 'Add a timeline event (note or screenshot)',
        operationId: 'addTimelineEvent',
        security: [{ ApiToken: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['type', 'sessionId'], properties: { type: { type: 'string', enum: ['note', 'screenshot'] }, sessionId: { type: 'string' }, content: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } } } } },
        },
        responses: {
          '200': { description: 'Created event' },
          '400': { description: 'Validation error' },
          '401': { description: 'Unauthorized' },
        },
      },
      delete: {
        summary: 'Delete a timeline event',
        operationId: 'deleteTimelineEvent',
        security: [{ ApiToken: [] }],
        parameters: [
          { name: 'sessionId', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'id', in: 'query', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Success' },
          '404': { description: 'Event not found' },
        },
      },
      patch: {
        summary: 'Update timeline event metadata (name, tag)',
        operationId: 'updateTimelineEvent',
        security: [{ ApiToken: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['id', 'sessionId'], properties: { id: { type: 'string' }, sessionId: { type: 'string' }, name: { type: 'string' }, tag: { type: 'string' } } } } },
        },
        responses: {
          '200': { description: 'Updated event' },
          '404': { description: 'Event not found' },
        },
      },
    },
    '/poc': {
      get: {
        summary: 'List PoC steps for a session',
        operationId: 'listPocSteps',
        parameters: [{ name: 'sessionId', in: 'query', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'Ordered PoC steps',
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/PocStep' } } } },
          },
        },
      },
      post: {
        summary: 'Create a PoC step (manual or from timeline event)',
        operationId: 'createPocStep',
        security: [{ ApiToken: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['sessionId'],
                properties: {
                  sessionId: { type: 'string' },
                  title: { type: 'string' },
                  goal: { type: 'string' },
                  observation: { type: 'string' },
                  sourceEventId: { type: 'string' },
                  sourceEventType: { type: 'string', enum: ['command', 'note', 'screenshot'] },
                  allowDuplicate: { type: 'boolean', default: false },
                  executionEventId: { type: 'string' },
                  noteEventId: { type: 'string' },
                  screenshotEventId: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Created PoC step or deduplicated existing step' },
          '400': { description: 'Validation error' },
          '401': { description: 'Unauthorized' },
        },
      },
      patch: {
        summary: 'Update or reorder a PoC step',
        operationId: 'updatePocStep',
        security: [{ ApiToken: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['sessionId', 'id'],
                properties: {
                  sessionId: { type: 'string' },
                  id: { type: 'integer' },
                  title: { type: 'string' },
                  goal: { type: 'string' },
                  observation: { type: 'string' },
                  executionEventId: { type: 'string', nullable: true },
                  noteEventId: { type: 'string', nullable: true },
                  screenshotEventId: { type: 'string', nullable: true },
                  stepOrder: { type: 'integer' },
                  direction: { type: 'string', enum: ['up', 'down'] },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Updated PoC step' },
          '401': { description: 'Unauthorized' },
          '404': { description: 'PoC step not found' },
        },
      },
      delete: {
        summary: 'Delete a PoC step',
        operationId: 'deletePocStep',
        security: [{ ApiToken: [] }],
        parameters: [
          { name: 'sessionId', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'id', in: 'query', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          '200': { description: 'Deleted' },
          '401': { description: 'Unauthorized' },
          '404': { description: 'PoC step not found' },
        },
      },
    },
    '/execute': {
      post: {
        summary: 'Execute a shell command (fire-and-forget)',
        operationId: 'executeCommand',
        security: [{ ApiToken: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['command'], properties: { command: { type: 'string', maxLength: 4000 }, sessionId: { type: 'string' }, timeout: { type: 'integer', description: 'Timeout in milliseconds (1000–1800000)' } } } } },
        },
        responses: {
          '200': { description: 'Running timeline event (poll /timeline for result)' },
          '400': { description: 'Invalid request' },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Blocked command or execution disabled' },
          '429': { description: 'Rate limit exceeded', headers: { 'Retry-After': { schema: { type: 'integer' } } } },
        },
      },
    },
    '/execute/cancel': {
      post: {
        summary: 'Cancel a running command',
        operationId: 'cancelCommand',
        security: [{ ApiToken: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['eventId', 'sessionId'], properties: { eventId: { type: 'string' }, sessionId: { type: 'string' } } } } },
        },
        responses: {
          '200': { description: 'Cancelled event' },
          '404': { description: 'Process not found' },
        },
      },
    },
    '/coach': {
      post: {
        summary: 'Get AI coaching suggestion (streaming)',
        operationId: 'coachSuggest',
        security: [{ ApiToken: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['sessionId'], properties: { sessionId: { type: 'string' }, provider: { type: 'string', enum: ['claude', 'openai', 'gemini'], default: 'claude' }, skill: { type: 'string', enum: ['enum-target', 'web-solve', 'privesc', 'crypto-solve', 'pwn-solve', 'reversing-solve', 'stego', 'analyze-file'], default: 'enum-target' }, apiKey: { type: 'string' } } } } },
        },
        responses: {
          '200': { description: 'Streaming text response (text/plain)' },
          '401': { description: 'Unauthorized' },
          '429': { description: 'Rate limit exceeded' },
          '503': { description: 'No AI API key configured' },
        },
      },
    },
    '/coach/feedback': {
      get: {
        summary: 'Get coach feedback ratings for a session',
        operationId: 'getCoachFeedback',
        security: [{ ApiToken: [] }],
        parameters: [{ name: 'sessionId', in: 'query', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Array of {response_hash, rating}' },
        },
      },
      post: {
        summary: 'Submit coach feedback (thumbs up/down)',
        operationId: 'submitCoachFeedback',
        security: [{ ApiToken: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['sessionId', 'hash', 'rating'], properties: { sessionId: { type: 'string' }, hash: { type: 'string' }, rating: { type: 'integer', enum: [1, -1] } } } } },
        },
        responses: {
          '200': { description: 'Success' },
        },
      },
    },
    '/report': {
      get: {
        summary: 'Generate markdown report for a session',
        operationId: 'generateReport',
        parameters: [
          { name: 'sessionId', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'format', in: 'query', schema: { type: 'string', enum: ['lab-report', 'executive-summary', 'technical-walkthrough', 'ctf-solution', 'bug-bounty', 'pentest'], default: 'technical-walkthrough' } },
          { name: 'analystName', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Markdown report', content: { 'application/json': { schema: { type: 'object', properties: { report: { type: 'string' } } } } } },
        },
      },
    },
    '/writeup': {
      get: {
        summary: 'Get saved writeup for a session',
        operationId: 'getWriteup',
        parameters: [{ name: 'sessionId', in: 'query', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Writeup object' } },
      },
      post: {
        summary: 'Save writeup',
        operationId: 'saveWriteup',
        security: [{ ApiToken: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['sessionId', 'content'], properties: { sessionId: { type: 'string' }, content: { type: 'string' }, contentJson: { type: 'array' }, status: { type: 'string' }, visibility: { type: 'string' } } } } },
        },
        responses: { '200': { description: 'Saved writeup' } },
      },
    },
    '/writeup/history': {
      get: {
        summary: 'Get writeup version history',
        operationId: 'getWriteupHistory',
        parameters: [
          { name: 'sessionId', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'versionId', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Versions list or single version' } },
      },
    },
    '/writeup/enhance': {
      post: {
        summary: 'AI-enhance a writeup (streaming)',
        operationId: 'enhanceWriteup',
        security: [{ ApiToken: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['sessionId', 'reportContent'], properties: { sessionId: { type: 'string' }, reportContent: { type: 'string' }, provider: { type: 'string' }, apiKey: { type: 'string' }, skill: { type: 'string' } } } } },
        },
        responses: { '200': { description: 'Streaming enhanced text' } },
      },
    },
    '/upload': {
      post: {
        summary: 'Upload a screenshot',
        operationId: 'uploadScreenshot',
        security: [{ ApiToken: [] }],
        requestBody: {
          required: true,
          content: { 'multipart/form-data': { schema: { type: 'object', required: ['file', 'sessionId'], properties: { file: { type: 'string', format: 'binary' }, sessionId: { type: 'string' }, name: { type: 'string' }, tag: { type: 'string' } } } } },
        },
        responses: {
          '200': { description: 'Screenshot timeline event' },
          '413': { description: 'File too large (>10MB)' },
          '415': { description: 'Unsupported image format' },
        },
      },
    },
    '/export/pdf': {
      get: {
        summary: 'Export session as PDF',
        operationId: 'exportPdf',
        parameters: [
          { name: 'sessionId', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'format', in: 'query', schema: { type: 'string' } },
          { name: 'analystName', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'PDF binary', content: { 'application/pdf': {} } } },
      },
      post: {
        summary: 'Export custom markdown content as PDF',
        operationId: 'exportCustomPdf',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['content'], properties: { content: { type: 'string' }, sessionId: { type: 'string' }, analystName: { type: 'string' } } } } },
        },
        responses: { '200': { description: 'PDF binary' } },
      },
    },
    '/export/markdown': {
      post: {
        summary: 'Export session as markdown',
        operationId: 'exportMarkdown',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['sessionId'], properties: { sessionId: { type: 'string' }, format: { type: 'string' }, analystName: { type: 'string' }, inlineImages: { type: 'boolean', default: true } } } } },
        },
        responses: { '200': { description: 'Markdown file download' } },
      },
    },
    '/export/html': {
      post: {
        summary: 'Export session as standalone HTML',
        operationId: 'exportHtml',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['sessionId'], properties: { sessionId: { type: 'string' }, format: { type: 'string' }, analystName: { type: 'string' }, inlineImages: { type: 'boolean', default: true } } } } },
        },
        responses: { '200': { description: 'HTML file download', content: { 'text/html': {} } } },
      },
    },
    '/export/json': {
      post: {
        summary: 'Export full session bundle as JSON',
        operationId: 'exportJsonBundle',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['sessionId'], properties: { sessionId: { type: 'string' }, format: { type: 'string' }, analystName: { type: 'string' }, inlineImages: { type: 'boolean', default: false } } } } },
        },
        responses: { '200': { description: 'JSON bundle file download', content: { 'application/json': {} } } },
      },
    },
    '/health': {
      get: {
        summary: 'Health check',
        operationId: 'healthCheck',
        responses: {
          '200': { description: 'Health status', content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', enum: ['ok', 'degraded', 'error'] }, db: { type: 'string' }, ai: { type: 'string' } } } } } },
        },
      },
    },
    '/admin/backup': {
      get: {
        summary: 'Download database backup',
        operationId: 'backupDb',
        security: [{ ApiToken: [] }],
        parameters: [{ name: 'format', in: 'query', schema: { type: 'string', enum: ['db', 'sql'], default: 'db' } }],
        responses: {
          '200': { description: 'Database file or SQL dump' },
          '403': { description: 'Admin API disabled' },
        },
      },
    },
    '/admin/cleanup': {
      get: {
        summary: 'Get DB statistics',
        operationId: 'getDbStats',
        security: [{ ApiToken: [] }],
        responses: { '200': { description: 'DB stats object' } },
      },
      post: {
        summary: 'Run DB cleanup (vacuum / clear logs)',
        operationId: 'cleanupDb',
        security: [{ ApiToken: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['action'], properties: { action: { type: 'string', enum: ['logs', 'vacuum', 'all'] } } } } },
        },
        responses: { '200': { description: 'Cleanup result and updated stats' } },
      },
    },
    '/ai/usage': {
      get: {
        summary: 'Get AI usage / cost summary for a session',
        operationId: 'getAiUsage',
        security: [{ ApiToken: [] }],
        parameters: [{ name: 'sessionId', in: 'query', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Usage summary' } },
      },
    },
    '/docs': {
      get: {
        summary: 'OpenAPI spec (JSON) or Swagger UI (add ?ui=1)',
        operationId: 'getDocs',
        parameters: [{ name: 'ui', in: 'query', description: 'Set to 1 to render Swagger UI', schema: { type: 'string' } }],
        responses: {
          '200': { description: 'OpenAPI JSON spec or HTML page' },
        },
      },
    },
  },
};

const SWAGGER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Helm's Paladin — API Docs</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '/api/docs',
      dom_id: '#swagger-ui',
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: 'StandaloneLayout',
    });
  </script>
</body>
</html>`;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get('ui')) {
    return new Response(SWAGGER_HTML, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
  return NextResponse.json(SPEC);
}
