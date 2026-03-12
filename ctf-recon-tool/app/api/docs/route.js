import { NextResponse } from 'next/server';
import pkg from '../../../package.json';

const SPEC = {
  openapi: '3.1.0',
  info: {
    title: "Helm's Watch API",
    version: pkg.version,
    description: "Helm's Watch API for session management, command execution, AI workflows, and reporting.",
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
          ok: { type: 'boolean', enum: [false] },
          error: { type: 'string' },
          status: { type: 'integer' },
          details: {
            type: 'array',
            items: { type: 'object', additionalProperties: true },
          },
        },
        required: ['ok', 'error', 'status'],
      },
      Session: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          target: { type: 'string' },
          difficulty: { type: 'string', enum: ['easy', 'medium', 'hard', 'insane'] },
          objective: { type: 'string' },
          metadata: { type: 'object', additionalProperties: true },
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
          tags: { type: 'string', description: 'JSON-encoded tag array as stored in SQLite' },
          caption: { type: 'string', nullable: true },
          context: { type: 'string', nullable: true },
          progress_pct: { type: 'integer', nullable: true, minimum: 0, maximum: 100 },
          command_hash: { type: 'string', nullable: true },
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
      Finding: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          sessionId: { type: 'string' },
          title: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          description: { type: 'string' },
          impact: { type: 'string' },
          remediation: { type: 'string' },
          source: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          evidenceEventIds: { type: 'array', items: { type: 'string' } },
          evidenceEvents: { type: 'array', items: { $ref: '#/components/schemas/TimelineEvent' } },
          createdAt: { type: 'string', format: 'date-time', nullable: true },
          updatedAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      FlagSubmission: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          sessionId: { type: 'string' },
          value: { type: 'string' },
          status: { type: 'string', enum: ['captured', 'submitted', 'accepted', 'rejected'] },
          notes: { type: 'string' },
          metadata: { type: 'object', additionalProperties: true },
          submittedAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time', nullable: true },
          updatedAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      WordlistEntry: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string', enum: ['directory', 'file'] },
          relativePath: { type: 'string' },
          size: { type: 'integer', nullable: true },
        },
      },
      WriteupSuggestion: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          sessionId: { type: 'string' },
          status: { type: 'string', enum: ['pending', 'ready', 'applied', 'dismissed', 'failed'] },
          triggerEventId: { type: 'string', nullable: true },
          provider: { type: 'string', enum: ['claude', 'openai', 'gemini', 'offline'] },
          skill: { type: 'string' },
          targetSectionIds: { type: 'array', items: { type: 'string' } },
          patches: { type: 'array', items: { type: 'object', additionalProperties: true } },
          summary: { type: 'string', nullable: true },
          evidenceRefs: { type: 'array', items: { type: 'object', additionalProperties: true } },
          metadata: { type: 'object', additionalProperties: true },
          createdAt: { type: 'string', format: 'date-time', nullable: true },
          updatedAt: { type: 'string', format: 'date-time', nullable: true },
          appliedAt: { type: 'string', format: 'date-time', nullable: true },
          dismissedAt: { type: 'string', format: 'date-time', nullable: true },
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
          content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, target: { type: 'string' }, difficulty: { type: 'string' }, objective: { type: 'string' }, id: { type: 'string' }, metadata: { type: 'object', additionalProperties: true } } } } },
        },
        responses: {
          '200': { description: 'Created session', content: { 'application/json': { schema: { $ref: '#/components/schemas/Session' } } } },
          '400': { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '401': { description: 'Unauthorized' },
          '409': { description: 'Duplicate session id' },
        },
      },
      patch: {
        summary: 'Update session metadata and operator settings',
        operationId: 'updateSession',
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
                  name: { type: 'string' },
                  target: { type: 'string' },
                  difficulty: { type: 'string', enum: ['easy', 'medium', 'hard', 'insane'] },
                  objective: { type: 'string' },
                  metadata: { type: 'object', additionalProperties: true },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Updated session', content: { 'application/json': { schema: { $ref: '#/components/schemas/Session' } } } },
          '401': { description: 'Unauthorized' },
          '404': { description: 'Session not found' },
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
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['type', 'sessionId'],
                properties: {
                  type: { type: 'string', enum: ['note', 'screenshot'] },
                  sessionId: { type: 'string' },
                  content: { type: 'string' },
                  tags: {
                    oneOf: [
                      { type: 'array', items: { type: 'string' } },
                      { type: 'string' },
                    ],
                  },
                  name: { type: 'string' },
                  tag: { type: 'string' },
                  caption: { type: 'string' },
                  context: { type: 'string' },
                },
              },
            },
          },
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
        summary: 'Update timeline event metadata (name, tag, caption, context)',
        operationId: 'updateTimelineEvent',
        security: [{ ApiToken: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['id', 'sessionId'],
                properties: {
                  id: { type: 'string' },
                  sessionId: { type: 'string' },
                  name: { type: 'string' },
                  tag: { type: 'string' },
                  caption: { type: 'string' },
                  context: { type: 'string' },
                },
              },
            },
          },
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
    '/findings': {
      get: {
        summary: 'List persisted findings for a session',
        operationId: 'listFindings',
        parameters: [{ name: 'sessionId', in: 'query', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'Array of findings',
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Finding' } } } },
          },
        },
      },
      post: {
        summary: 'Create a finding',
        operationId: 'createFinding',
        security: [{ ApiToken: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['sessionId', 'title'],
                properties: {
                  sessionId: { type: 'string' },
                  title: { type: 'string' },
                  severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'], default: 'medium' },
                  description: { type: 'string' },
                  impact: { type: 'string' },
                  remediation: { type: 'string' },
                  source: { type: 'string', default: 'manual' },
                  tags: { type: 'array', items: { type: 'string' } },
                  evidenceEventIds: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Created finding' },
          '401': { description: 'Unauthorized' },
        },
      },
      patch: {
        summary: 'Update a finding',
        operationId: 'updateFinding',
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
                  severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
                  description: { type: 'string' },
                  impact: { type: 'string' },
                  remediation: { type: 'string' },
                  source: { type: 'string' },
                  tags: { type: 'array', items: { type: 'string' } },
                  evidenceEventIds: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Updated finding' },
          '401': { description: 'Unauthorized' },
          '404': { description: 'Finding not found' },
        },
      },
      delete: {
        summary: 'Delete a finding',
        operationId: 'deleteFinding',
        security: [{ ApiToken: [] }],
        parameters: [
          { name: 'sessionId', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'id', in: 'query', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          '200': { description: 'Deleted' },
          '401': { description: 'Unauthorized' },
          '404': { description: 'Finding not found' },
        },
      },
    },
    '/findings/extract': {
      post: {
        summary: 'Extract finding proposals with AI from timeline evidence',
        operationId: 'extractFindings',
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
                  provider: { type: 'string', enum: ['claude', 'gemini', 'openai'], default: 'claude' },
                  apiKey: { type: 'string' },
                  maxEvents: { type: 'integer', default: 80, minimum: 10, maximum: 300 },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Proposal list (not persisted)' },
          '401': { description: 'Unauthorized' },
          '502': { description: 'Model returned malformed JSON' },
        },
      },
    },
    '/findings/auto-tag': {
      post: {
        summary: 'Deterministically auto-tag findings in a session',
        operationId: 'autoTagFindings',
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
                  findingId: { type: 'integer', nullable: true },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Updated findings with persisted tags',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    findings: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Finding' },
                    },
                  },
                },
              },
            },
          },
          '401': { description: 'Unauthorized' },
          '404': { description: 'Session or finding not found' },
        },
      },
    },
    '/execute': {
      post: {
        summary: 'Execute a shell command (returns running or queued event)',
        operationId: 'executeCommand',
        security: [{ ApiToken: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['command'],
                properties: {
                  command: { type: 'string', maxLength: 4000 },
                  sessionId: { type: 'string' },
                  timeout: { type: 'integer', description: 'Timeout in milliseconds (1000–1800000)' },
                  tags: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Timeline event with status running or queued (poll /timeline for final result)' },
          '400': { description: 'Invalid request' },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Blocked command or execution disabled' },
          '429': { description: 'Rate limit exceeded', headers: { 'Retry-After': { schema: { type: 'integer' } } } },
        },
      },
    },
    '/execute/cancel': {
      post: {
        summary: 'Cancel a running or queued command',
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
    '/execute/history': {
      get: {
        summary: 'Get grouped command history for a session',
        operationId: 'getCommandHistory',
        parameters: [
          { name: 'sessionId', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 } },
        ],
        responses: {
          '200': {
            description: 'Grouped command history',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      command: { type: 'string' },
                      commandHash: { type: 'string' },
                      runCount: { type: 'integer' },
                      successCount: { type: 'integer' },
                      failureCount: { type: 'integer' },
                      successRate: { type: 'integer' },
                      lastStatus: { type: 'string', nullable: true },
                      lastTimestamp: { type: 'string', format: 'date-time', nullable: true },
                      latestEventId: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/execute/retry/{eventId}': {
      post: {
        summary: 'Retry a previous command event',
        operationId: 'retryCommand',
        security: [{ ApiToken: [] }],
        parameters: [
          { name: 'eventId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  command: { type: 'string', maxLength: 4000 },
                  timeout: { type: 'integer', description: 'Optional timeout override in milliseconds' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'New running command event' },
          '400': { description: 'Invalid request or non-command source event' },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Blocked command or execution disabled' },
          '404': { description: 'Source command event not found' },
          '429': { description: 'Rate limit exceeded' },
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
          content: { 'application/json': { schema: { type: 'object', required: ['sessionId'], properties: { sessionId: { type: 'string' }, provider: { type: 'string', enum: ['claude', 'openai', 'gemini', 'offline'], default: 'claude' }, skill: { type: 'string', enum: ['enum-target', 'web-solve', 'privesc', 'crypto-solve', 'pwn-solve', 'reversing-solve', 'stego', 'analyze-file', 'adversarial-challenge'], default: 'enum-target' }, coachLevel: { type: 'string', enum: ['beginner', 'intermediate', 'expert'], default: 'intermediate' }, contextMode: { type: 'string', enum: ['compact', 'balanced', 'full'], default: 'balanced' }, compare: { type: 'boolean', default: false, description: 'Offline provider and adversarial challenge mode are excluded from compare mode even when selected.' }, bypassCache: { type: 'boolean', default: false }, apiKey: { type: 'string' } } } } },
        },
        responses: {
          '200': { description: 'Streaming text response (text/plain)' },
          '400': { description: 'Unsupported compare/mode combination' },
          '403': { description: 'Offline provider or adversarial challenge mode is disabled by feature flags' },
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
          { name: 'format', in: 'query', schema: { type: 'string', enum: ['lab-report', 'executive-summary', 'technical-walkthrough', 'ctf-solution', 'bug-bounty', 'pentest'] } },
          { name: 'audiencePack', in: 'query', schema: { type: 'string', enum: ['executive', 'technical', 'certification'] } },
          { name: 'presetId', in: 'query', schema: { type: 'string', enum: ['executive-brief', 'technical-deep-dive', 'certification-writeup'] } },
          { name: 'analystName', in: 'query', schema: { type: 'string' } },
          { name: 'minimumSeverity', in: 'query', schema: { type: 'string' } },
          { name: 'tag', in: 'query', schema: { type: 'string' } },
          { name: 'techniqueId', in: 'query', schema: { type: 'string' } },
          { name: 'includeDuplicates', in: 'query', schema: { type: 'boolean' } },
        ],
        responses: {
          '200': {
            description: 'Markdown report',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    report: { type: 'string' },
                    reportFilters: { type: 'object', additionalProperties: true },
                    view: {
                      type: 'object',
                      properties: {
                        format: { type: 'string' },
                        audiencePack: { type: 'string' },
                        audienceLabel: { type: 'string' },
                        presetId: { type: 'string', nullable: true },
                        presetLabel: { type: 'string', nullable: true },
                      },
                    },
                  },
                },
              },
            },
          },
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
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['sessionId', 'reportContent'],
                properties: {
                  sessionId: { type: 'string' },
                  reportContent: { type: 'string' },
                  provider: { type: 'string', enum: ['claude', 'openai', 'gemini', 'offline'], default: 'claude' },
                  apiKey: { type: 'string' },
                  skill: { type: 'string', enum: ['enhance', 'writeup-refiner', 'report'], default: 'enhance' },
                  mode: { type: 'string', enum: ['stream', 'section-patch'], default: 'stream' },
                  reportBlocks: { type: 'array', items: { type: 'object', additionalProperties: true } },
                  selectedSectionIds: { type: 'array', items: { type: 'string' } },
                  evidenceContext: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Streaming enhanced text or JSON section patches depending on mode' },
          '403': { description: 'Offline provider is disabled by feature flags' },
          '503': { description: 'Provider is not configured' },
        },
      },
    },
    '/writeup/suggestions': {
      get: {
        summary: 'List persisted auto-writeup suggestions for a session',
        operationId: 'listWriteupSuggestions',
        parameters: [{ name: 'sessionId', in: 'query', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'Suggestion list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    suggestions: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/WriteupSuggestion' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/writeup/suggestions/apply': {
      post: {
        summary: 'Apply a ready auto-writeup suggestion to the saved draft',
        operationId: 'applyWriteupSuggestion',
        security: [{ ApiToken: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['sessionId', 'suggestionId'],
                properties: {
                  sessionId: { type: 'string' },
                  suggestionId: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Updated writeup plus applied suggestion metadata' },
          '403': { description: 'Auto-writeup suggestions are disabled' },
          '404': { description: 'Suggestion not found or not ready' },
        },
      },
    },
    '/writeup/suggestions/dismiss': {
      post: {
        summary: 'Dismiss a persisted auto-writeup suggestion without changing the saved draft',
        operationId: 'dismissWriteupSuggestion',
        security: [{ ApiToken: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['sessionId', 'suggestionId'],
                properties: {
                  sessionId: { type: 'string' },
                  suggestionId: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Dismissed suggestion metadata' },
          '403': { description: 'Auto-writeup suggestions are disabled' },
          '404': { description: 'Suggestion not found' },
        },
      },
    },
    '/upload': {
      post: {
        summary: 'Upload a screenshot',
        operationId: 'uploadScreenshot',
        security: [{ ApiToken: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file', 'sessionId'],
                properties: {
                  file: { type: 'string', format: 'binary' },
                  sessionId: { type: 'string' },
                  name: { type: 'string' },
                  tag: { type: 'string' },
                  caption: { type: 'string' },
                  context: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Screenshot timeline event' },
          '413': { description: 'File too large (>10MB)' },
          '415': { description: 'Unsupported image format' },
        },
      },
    },
    '/wordlists': {
      get: {
        summary: 'Browse the configured wordlist directory tree',
        operationId: 'listWordlists',
        parameters: [
          { name: 'path', in: 'query', required: false, schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'Directory listing rooted at CTF_WORDLIST_DIR',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    root: { type: 'string' },
                    currentPath: { type: 'string' },
                    parentPath: { type: 'string', nullable: true },
                    entries: { type: 'array', items: { $ref: '#/components/schemas/WordlistEntry' } },
                  },
                },
              },
            },
          },
          '400': { description: 'Traversal rejected or path is not a directory' },
          '404': { description: 'Path not found' },
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
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['sessionId'],
                properties: {
                  sessionId: { type: 'string' },
                  format: { type: 'string' },
                  audiencePack: { type: 'string', enum: ['executive', 'technical', 'certification'] },
                  presetId: { type: 'string', enum: ['executive-brief', 'technical-deep-dive', 'certification-writeup'] },
                  analystName: { type: 'string' },
                  inlineImages: { type: 'boolean', default: true },
                  reportFilters: { type: 'object', additionalProperties: true },
                },
              },
            },
          },
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
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['sessionId'],
                properties: {
                  sessionId: { type: 'string' },
                  format: { type: 'string' },
                  audiencePack: { type: 'string', enum: ['executive', 'technical', 'certification'] },
                  presetId: { type: 'string', enum: ['executive-brief', 'technical-deep-dive', 'certification-writeup'] },
                  analystName: { type: 'string' },
                  inlineImages: { type: 'boolean', default: true },
                  reportFilters: { type: 'object', additionalProperties: true },
                },
              },
            },
          },
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
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['sessionId'],
                properties: {
                  sessionId: { type: 'string' },
                  format: { type: 'string' },
                  audiencePack: { type: 'string', enum: ['executive', 'technical', 'certification'] },
                  presetId: { type: 'string', enum: ['executive-brief', 'technical-deep-dive', 'certification-writeup'] },
                  analystName: { type: 'string' },
                  inlineImages: { type: 'boolean', default: false },
                  reportFilters: { type: 'object', additionalProperties: true },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'JSON bundle file download', content: { 'application/json': {} } } },
      },
    },
    '/export/docx': {
      post: {
        summary: 'Export session as DOCX',
        operationId: 'exportDocx',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['sessionId'],
                properties: {
                  sessionId: { type: 'string' },
                  format: { type: 'string' },
                  audiencePack: { type: 'string', enum: ['executive', 'technical', 'certification'] },
                  presetId: { type: 'string', enum: ['executive-brief', 'technical-deep-dive', 'certification-writeup'] },
                  analystName: { type: 'string' },
                  inlineImages: { type: 'boolean', default: true },
                  includeAppendix: { type: 'boolean', default: true },
                  reportFilters: { type: 'object', additionalProperties: true },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'DOCX file download',
            content: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {} },
          },
        },
      },
    },
    '/report/handoff/sysreptor': {
      post: {
        summary: 'Generate a one-way SysReptor handoff package descriptor',
        operationId: 'generateSysreptorHandoff',
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
                  format: { type: 'string' },
                  audiencePack: { type: 'string', enum: ['executive', 'technical', 'certification'] },
                  presetId: { type: 'string', enum: ['executive-brief', 'technical-deep-dive', 'certification-writeup'] },
                  analystName: { type: 'string' },
                  inlineImages: { type: 'boolean', default: false },
                  reportFilters: { type: 'object', additionalProperties: true },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'SysReptor handoff descriptor and file payloads' },
          '400': { description: 'Validation failed' },
          '401': { description: 'Unauthorized' },
          '404': { description: 'Session not found' },
        },
      },
    },
    '/health': {
      get: {
        summary: 'Health check',
        operationId: 'healthCheck',
        responses: {
          '200': {
            description: 'Health status',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', enum: ['ok', 'degraded', 'error'] },
                    db: { type: 'object', additionalProperties: true },
                    ai: {
                      type: 'object',
                      properties: {
                        anthropic: { type: 'boolean' },
                        google: { type: 'boolean' },
                        openai: { type: 'boolean' },
                        offline: {
                          type: 'object',
                          properties: {
                            enabled: { type: 'boolean' },
                            configured: { type: 'boolean' },
                            backend: { type: 'string', nullable: true },
                            model: { type: 'string', nullable: true },
                            baseUrl: { type: 'string', nullable: true },
                          },
                        },
                      },
                    },
                    platforms: { type: 'object', additionalProperties: true },
                    disk: { type: 'object', additionalProperties: true },
                    features: {
                      type: 'object',
                      properties: {
                        commandExecutionEnabled: { type: 'boolean' },
                        shellHubEnabled: { type: 'boolean' },
                        adminApiEnabled: { type: 'boolean' },
                        experimentalAiEnabled: { type: 'boolean' },
                        offlineAiEnabled: { type: 'boolean' },
                        autoWriteupSuggestionsEnabled: { type: 'boolean' },
                        adversarialChallengeModeEnabled: { type: 'boolean' },
                        apiTokenRequired: { type: 'boolean' },
                      },
                    },
                  },
                },
              },
            },
          },
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
    '/flags': {
      get: {
        summary: 'List locally tracked flag submissions for a session',
        operationId: 'listFlags',
        parameters: [{ name: 'sessionId', in: 'query', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'Flag submission list',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/FlagSubmission' },
                },
              },
            },
          },
        },
      },
      post: {
        summary: 'Create a local flag tracking record',
        operationId: 'createFlag',
        security: [{ ApiToken: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['sessionId', 'value'],
                properties: {
                  sessionId: { type: 'string' },
                  value: { type: 'string' },
                  status: { type: 'string', enum: ['captured', 'submitted', 'accepted', 'rejected'], default: 'captured' },
                  notes: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Created flag record',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    flag: { $ref: '#/components/schemas/FlagSubmission' },
                  },
                },
              },
            },
          },
          '401': { description: 'Unauthorized' },
        },
      },
      patch: {
        summary: 'Update a local flag tracking record',
        operationId: 'updateFlag',
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
                  value: { type: 'string' },
                  status: { type: 'string', enum: ['captured', 'submitted', 'accepted', 'rejected'] },
                  notes: { type: 'string' },
                  submittedAt: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Updated flag record' },
          '401': { description: 'Unauthorized' },
          '404': { description: 'Flag not found' },
        },
      },
      delete: {
        summary: 'Delete a local flag tracking record',
        operationId: 'deleteFlag',
        security: [{ ApiToken: [] }],
        parameters: [
          { name: 'sessionId', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'id', in: 'query', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          '200': { description: 'Deleted flag record' },
          '401': { description: 'Unauthorized' },
          '404': { description: 'Flag not found' },
        },
      },
    },
    '/platform/session-link': {
      get: {
        summary: 'Get linked platform metadata and capability status for a session',
        operationId: 'getPlatformSessionLink',
        security: [{ ApiToken: [] }],
        parameters: [{ name: 'sessionId', in: 'query', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Current link and capability map' },
          '401': { description: 'Unauthorized' },
        },
      },
      post: {
        summary: 'Link or refresh a session from HTB / THM / CTFd metadata',
        operationId: 'syncPlatformSessionLink',
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
                  platformType: { type: 'string', enum: ['htb', 'thm', 'ctfd'] },
                  remoteId: { type: 'string' },
                  label: { type: 'string' },
                  context: { type: 'object', additionalProperties: true },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Updated session link payload' },
          '400': { description: 'Validation failed or required remote identifiers missing' },
          '401': { description: 'Unauthorized' },
          '409': { description: 'Platform capability unavailable for the requested action' },
          '503': { description: 'Platform credentials are not configured server-side' },
        },
      },
    },
    '/platform/submit-flag': {
      post: {
        summary: 'Submit or validate a captured flag against the linked platform',
        operationId: 'submitPlatformFlag',
        security: [{ ApiToken: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['sessionId', 'flagId'],
                properties: {
                  sessionId: { type: 'string' },
                  flagId: { type: 'integer' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Updated local flag record plus remote submission result' },
          '400': { description: 'Validation failed or missing linked identifiers' },
          '401': { description: 'Unauthorized' },
          '404': { description: 'Session or flag not found' },
          '409': { description: 'No supported linked platform action available' },
          '503': { description: 'Platform credentials are not configured server-side' },
        },
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
  <title>Helm's Watch — API Docs</title>
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
