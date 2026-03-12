import { z } from 'zod';
import { isValidSessionId } from '@/lib/security';

const SESSION_DIFFICULTIES = ['easy', 'medium', 'hard', 'insane'] as const;
const WRITEUP_PROVIDERS = ['claude', 'openai', 'gemini', 'offline'] as const;
const WRITEUP_ENHANCE_MODES = ['stream', 'section-patch'] as const;
const REPORT_AI_PROVIDERS = ['claude', 'anthropic', 'openai', 'gemini'] as const;
const REPORT_FORMATS = [
  'lab-report',
  'executive-summary',
  'technical-walkthrough',
  'ctf-solution',
  'bug-bounty',
  'pentest',
] as const;

function normalizeTrimmedString(value: unknown) {
  if (value === null || value === undefined) return undefined;
  const normalized = String(value).trim();
  return normalized === '' ? undefined : normalized;
}

function requiredTrimmedString(maxLength: number) {
  return z.preprocess(
    normalizeTrimmedString,
    z.string().min(1).max(maxLength)
  );
}

function optionalTrimmedString(maxLength: number) {
  return z.preprocess(
    normalizeTrimmedString,
    z.string().max(maxLength).optional()
  );
}

function nullableTrimmedString(maxLength: number) {
  return z.preprocess((value) => {
    if (value === null) return null;
    return normalizeTrimmedString(value);
  }, z.union([z.string().max(maxLength), z.null()]).optional());
}

const sessionIdSchema = requiredTrimmedString(128).refine(
  (value) => isValidSessionId(value),
  'Invalid sessionId'
);

const optionalSessionIdSchema = optionalTrimmedString(128).refine(
  (value) => value === undefined || isValidSessionId(value),
  'Invalid sessionId'
);

const defaultSessionIdSchema = z.preprocess((value) => {
  if (value === null || value === undefined) return 'default';
  const normalized = String(value).trim();
  return normalized === '' ? 'default' : normalized;
}, z.string().refine(isValidSessionId, 'Invalid sessionId'));

const metadataSchema = z.record(z.string(), z.unknown()).default({});
const looseBlockSchema = z.object({}).passthrough();

const booleanFromQuerySchema = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return undefined;
}, z.boolean().optional());

const booleanLikeSchema = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return undefined;
}, z.boolean().optional());

const reportFiltersSchema = z.preprocess((value) => {
  if (value === null || value === undefined) return {};
  return value;
}, z.object({
  minimumSeverity: optionalTrimmedString(32),
  tag: optionalTrimmedString(64),
  techniqueId: optionalTrimmedString(64),
  includeDuplicates: booleanLikeSchema,
})).default({});

export const SessionCreateSchema = z.object({
  id: optionalSessionIdSchema,
  name: requiredTrimmedString(255),
  target: nullableTrimmedString(2048),
  difficulty: z.enum(SESSION_DIFFICULTIES).optional(),
  objective: nullableTrimmedString(4000),
  targets: z.array(z.object({
    id: optionalTrimmedString(128),
    label: optionalTrimmedString(255),
    target: requiredTrimmedString(2048),
    kind: optionalTrimmedString(64),
    notes: optionalTrimmedString(4000),
    isPrimary: z.boolean().optional(),
  })).optional(),
  metadata: metadataSchema.optional(),
});

export const SessionPatchSchema = z.object({
  sessionId: sessionIdSchema,
  name: optionalTrimmedString(255),
  target: nullableTrimmedString(2048),
  difficulty: z.enum(SESSION_DIFFICULTIES).optional(),
  objective: nullableTrimmedString(4000),
  metadata: metadataSchema.optional(),
});

export const SessionTargetListQuerySchema = z.object({
  sessionId: defaultSessionIdSchema,
});

export const SessionTargetDeleteQuerySchema = z.object({
  sessionId: defaultSessionIdSchema,
  targetId: requiredTrimmedString(128),
});

export const SessionTargetCreateSchema = z.object({
  sessionId: defaultSessionIdSchema,
  id: optionalTrimmedString(128),
  label: optionalTrimmedString(255),
  target: requiredTrimmedString(2048),
  kind: optionalTrimmedString(64),
  notes: optionalTrimmedString(4000),
  isPrimary: z.boolean().optional(),
});

export const SessionTargetPatchSchema = z.object({
  sessionId: defaultSessionIdSchema,
  targetId: requiredTrimmedString(128),
  label: optionalTrimmedString(255),
  target: optionalTrimmedString(2048),
  kind: optionalTrimmedString(64),
  notes: optionalTrimmedString(4000),
  isPrimary: z.boolean().optional(),
});

export const ReportQuerySchema = z.object({
  sessionId: sessionIdSchema,
  format: z.enum(REPORT_FORMATS).optional(),
  analystName: optionalTrimmedString(255),
  minimumSeverity: optionalTrimmedString(32),
  tag: optionalTrimmedString(64),
  techniqueId: optionalTrimmedString(64),
  includeDuplicates: booleanFromQuerySchema,
});

export const ReportCompareQuerySchema = z.object({
  beforeSessionId: sessionIdSchema,
  afterSessionId: sessionIdSchema,
  analystName: optionalTrimmedString(255),
  minimumSeverity: optionalTrimmedString(32),
  tag: optionalTrimmedString(64),
  techniqueId: optionalTrimmedString(64),
  includeDuplicates: booleanFromQuerySchema,
});

export const ExecutiveSummaryRequestSchema = z.object({
  sessionId: sessionIdSchema,
  provider: z.enum(REPORT_AI_PROVIDERS).optional().default('claude'),
  apiKey: z.preprocess((value) => (value === undefined || value === null ? '' : String(value)), z.string()).optional().default(''),
  reportFilters: reportFiltersSchema.optional().default({}),
});

export const RemediationRequestSchema = z.object({
  sessionId: sessionIdSchema,
  provider: z.enum(REPORT_AI_PROVIDERS).optional().default('claude'),
  apiKey: z.preprocess((value) => (value === undefined || value === null ? '' : String(value)), z.string()).optional().default(''),
  findingIds: z.array(z.coerce.number().int().positive()).optional().default([]),
});

export const ReportTemplateListQuerySchema = z.object({
  sessionId: optionalSessionIdSchema,
  format: optionalTrimmedString(64),
});

export const ReportTemplateDeleteQuerySchema = z.object({
  id: requiredTrimmedString(128),
});

export const ReportTemplateCreateSchema = z.object({
  id: optionalTrimmedString(128),
  sessionId: optionalSessionIdSchema,
  name: requiredTrimmedString(255),
  description: nullableTrimmedString(2000),
  format: z.enum(REPORT_FORMATS).optional(),
  content: z.preprocess((value) => (value === undefined || value === null ? '' : String(value)), z.string()),
  contentJson: z.array(looseBlockSchema).optional(),
});

export const ReportTemplatePatchSchema = z.object({
  id: requiredTrimmedString(128),
  name: optionalTrimmedString(255),
  description: nullableTrimmedString(2000),
  format: z.enum(REPORT_FORMATS).optional(),
  content: z.preprocess((value) => (value === undefined ? undefined : value === null ? '' : String(value)), z.string().optional()),
  contentJson: z.union([z.array(looseBlockSchema), z.null()]).optional(),
});

export const WriteupShareListQuerySchema = z.object({
  sessionId: sessionIdSchema,
});

export const WriteupShareCreateSchema = z.object({
  sessionId: sessionIdSchema,
  title: optionalTrimmedString(255),
  format: z.enum(REPORT_FORMATS).optional(),
  analystName: optionalTrimmedString(255),
  reportMarkdown: z.preprocess((value) => (value === undefined || value === null ? '' : String(value)), z.string()).optional().default(''),
  reportContentJson: z.array(looseBlockSchema).optional(),
  reportFilters: reportFiltersSchema.optional().default({}),
  expiresAt: nullableTrimmedString(128),
  meta: metadataSchema.optional(),
});

export const WriteupSharePatchSchema = z.object({
  sessionId: sessionIdSchema,
  id: requiredTrimmedString(128),
});

export const WriteupEnhanceSchema = z.object({
  sessionId: sessionIdSchema,
  reportContent: requiredTrimmedString(200000),
  provider: z.enum(WRITEUP_PROVIDERS).optional().default('claude'),
  apiKey: z.preprocess((value) => (value === undefined || value === null ? '' : String(value)), z.string()).optional().default(''),
  skill: optionalTrimmedString(64).default('enhance'),
  mode: z.enum(WRITEUP_ENHANCE_MODES).optional().default('stream'),
  reportBlocks: z.array(looseBlockSchema).optional().default([]),
  selectedSectionIds: z.array(requiredTrimmedString(128)).optional().default([]),
  evidenceContext: z.preprocess((value) => (value === undefined || value === null ? '' : String(value)), z.string()).optional().default(''),
});

export const WriteupQuerySchema = z.object({
  sessionId: defaultSessionIdSchema,
});

export const WriteupSaveSchema = z.object({
  sessionId: defaultSessionIdSchema,
  content: z.preprocess((value) => (value === undefined || value === null ? '' : String(value)), z.string()).optional().default(''),
  contentJson: z.union([z.array(looseBlockSchema), z.null()]).optional().default(null),
  status: z.preprocess((value) => {
    const normalized = normalizeTrimmedString(value);
    return normalized || 'draft';
  }, z.string().max(32)),
  visibility: z.preprocess((value) => {
    const normalized = normalizeTrimmedString(value);
    return normalized || 'draft';
  }, z.string().max(32)),
});

export const WriteupHistoryQuerySchema = z.object({
  sessionId: defaultSessionIdSchema,
  versionId: optionalTrimmedString(128),
});

export const WriteupSuggestionListQuerySchema = z.object({
  sessionId: defaultSessionIdSchema,
});

export const WriteupSuggestionMutationSchema = z.object({
  sessionId: defaultSessionIdSchema,
  suggestionId: requiredTrimmedString(128),
});

export const PlatformSessionLinkQuerySchema = z.object({
  sessionId: defaultSessionIdSchema,
});

export const PlatformSessionLinkSchema = z.object({
  sessionId: defaultSessionIdSchema,
  platformType: z.enum(['htb', 'thm', 'ctfd']).optional(),
  remoteId: optionalTrimmedString(128),
  label: optionalTrimmedString(255),
  context: z.record(z.string(), z.unknown()).optional(),
});

export const PlatformSubmitFlagSchema = z.object({
  sessionId: defaultSessionIdSchema,
  flagId: z.coerce.number().int().positive(),
});
