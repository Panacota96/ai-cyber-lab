import { z } from 'zod';
import { isValidSessionId } from '@/lib/security';

const SESSION_DIFFICULTIES = ['easy', 'medium', 'hard', 'insane'] as const;
const WRITEUP_PROVIDERS = ['claude', 'openai', 'gemini', 'offline'] as const;
const WRITEUP_ENHANCE_MODES = ['stream', 'section-patch'] as const;
const WRITEUP_SECTION_ACTIONS = ['refine', 'summarize', 'explain-evidence', 'generate-intro', 'generate-conclusion'] as const;
const REPORT_AI_PROVIDERS = ['claude', 'anthropic', 'openai', 'gemini'] as const;
const REPORT_FORMATS = [
  'lab-report',
  'executive-summary',
  'technical-walkthrough',
  'ctf-solution',
  'bug-bounty',
  'pentest',
] as const;
const REPORT_AUDIENCE_PACKS = ['executive', 'technical', 'certification'] as const;
const REPORT_PRESET_IDS = ['executive-brief', 'technical-deep-dive', 'certification-writeup'] as const;
const FLAG_STATUSES = ['captured', 'submitted', 'accepted', 'rejected'] as const;
const SHELL_TRANSCRIPT_DIRECTIONS = ['input', 'output', 'status', 'all'] as const;
const SEARCH_SOURCE_TYPES = ['session', 'timeline', 'finding', 'credential', 'flag', 'artifact', 'writeup'] as const;
const SCHEDULE_STATUSES = ['pending', 'dispatching', 'dispatched', 'failed', 'cancelled'] as const;

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
const sessionTagsSchema = z.array(requiredTrimmedString(64)).max(24).optional();
const sessionCustomFieldsSchema = z.record(requiredTrimmedString(64), z.preprocess(
  (value) => (value === undefined || value === null ? '' : String(value)),
  z.string().max(255)
)).optional();

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
  tags: sessionTagsSchema,
  customFields: sessionCustomFieldsSchema,
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
  tags: sessionTagsSchema,
  customFields: sessionCustomFieldsSchema,
  metadata: metadataSchema.optional(),
});

const searchTypesSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return [];
  const list = Array.isArray(value) ? value : [value];
  return list
    .flatMap((entry) => String(entry).split(','))
    .map((entry) => entry.trim())
    .filter(Boolean);
}, z.array(z.enum(SEARCH_SOURCE_TYPES)).max(SEARCH_SOURCE_TYPES.length)).optional().default([]);

export const SearchQuerySchema = z.object({
  q: requiredTrimmedString(400),
  sessionId: optionalSessionIdSchema,
  types: searchTypesSchema,
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
});

export const SessionCompareQuerySchema = z.object({
  beforeSessionId: sessionIdSchema,
  afterSessionId: sessionIdSchema,
});

const isoDateTimeSchema = requiredTrimmedString(128).refine((value) => !Number.isNaN(new Date(value).getTime()), 'Invalid date');

export const ScheduleListQuerySchema = z.object({
  sessionId: defaultSessionIdSchema,
  status: z.enum(SCHEDULE_STATUSES).optional(),
});

export const ScheduleDeleteQuerySchema = z.object({
  sessionId: defaultSessionIdSchema,
  id: requiredTrimmedString(128),
});

export const ScheduleCreateSchema = z.object({
  sessionId: defaultSessionIdSchema,
  targetId: nullableTrimmedString(128),
  command: requiredTrimmedString(4000),
  runAt: isoDateTimeSchema,
  timeout: z.coerce.number().int().min(1_000).max(1_800_000).optional().default(120000),
  notes: optionalTrimmedString(2000),
  tags: z.array(requiredTrimmedString(64)).max(16).optional().default([]),
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
  audiencePack: z.enum(REPORT_AUDIENCE_PACKS).optional(),
  presetId: z.enum(REPORT_PRESET_IDS).optional(),
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

export const ExportBundleRequestSchema = z.object({
  sessionId: sessionIdSchema,
  format: z.enum(REPORT_FORMATS).optional(),
  audiencePack: z.enum(REPORT_AUDIENCE_PACKS).optional(),
  presetId: z.enum(REPORT_PRESET_IDS).optional(),
  analystName: optionalTrimmedString(255),
  inlineImages: booleanLikeSchema.optional(),
  includeAppendix: booleanLikeSchema.optional(),
  reportFilters: reportFiltersSchema.optional().default({}),
});

export const SysreptorHandoffRequestSchema = z.object({
  sessionId: sessionIdSchema,
  format: z.enum(REPORT_FORMATS).optional(),
  audiencePack: z.enum(REPORT_AUDIENCE_PACKS).optional(),
  presetId: z.enum(REPORT_PRESET_IDS).optional(),
  analystName: optionalTrimmedString(255),
  inlineImages: booleanLikeSchema.optional(),
  reportFilters: reportFiltersSchema.optional().default({}),
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
  sectionAction: z.enum(WRITEUP_SECTION_ACTIONS).optional().default('refine'),
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

export const FlagListQuerySchema = z.object({
  sessionId: defaultSessionIdSchema,
});

export const FlagDeleteQuerySchema = z.object({
  sessionId: defaultSessionIdSchema,
  id: z.coerce.number().int().positive(),
});

export const FlagCreateSchema = z.object({
  sessionId: defaultSessionIdSchema,
  value: requiredTrimmedString(255),
  status: z.enum(FLAG_STATUSES).optional().default('captured'),
  notes: z.preprocess((value) => (value === undefined || value === null ? '' : String(value)), z.string()).optional().default(''),
  metadata: metadataSchema.optional(),
  submittedAt: nullableTrimmedString(128),
});

export const FlagPatchSchema = z.object({
  sessionId: defaultSessionIdSchema,
  id: z.coerce.number().int().positive(),
  value: optionalTrimmedString(255),
  status: z.enum(FLAG_STATUSES).optional(),
  notes: z.preprocess((value) => (value === undefined ? undefined : value === null ? '' : String(value)), z.string().optional()),
  metadata: metadataSchema.optional(),
  submittedAt: nullableTrimmedString(128),
});

export const ShellTranscriptListQuerySchema = z.object({
  sessionId: defaultSessionIdSchema,
  cursor: z.coerce.number().int().min(0).optional().default(0),
  limit: z.coerce.number().int().min(1).max(500).optional().default(200),
});

export const ShellTranscriptSearchQuerySchema = z.object({
  sessionId: defaultSessionIdSchema,
  q: requiredTrimmedString(4000),
  direction: z.enum(SHELL_TRANSCRIPT_DIRECTIONS).optional().default('all'),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

export const ShellTranscriptDiffQuerySchema = z.object({
  sessionId: defaultSessionIdSchema,
  leftChunkId: z.coerce.number().int().positive(),
  rightChunkId: z.coerce.number().int().positive(),
});

export const ShellArtifactCreateSchema = z.object({
  sessionId: defaultSessionIdSchema,
  targetId: nullableTrimmedString(128),
  shellSessionId: requiredTrimmedString(128),
  sourceTranscriptChunkId: z.coerce.number().int().positive().optional(),
  filename: optionalTrimmedString(255),
  mimeType: optionalTrimmedString(255),
  content: z.preprocess((value) => (value === undefined || value === null ? undefined : String(value)), z.string().max(400000).optional()),
  contentBase64: z.preprocess((value) => (value === undefined || value === null ? undefined : String(value)), z.string().max(1000000).optional()),
  notes: z.preprocess((value) => (value === undefined || value === null ? '' : String(value)), z.string()).optional().default(''),
  linkedFindingIds: z.array(z.coerce.number().int().positive()).optional().default([]),
  linkedTimelineEventIds: z.array(requiredTrimmedString(255)).optional().default([]),
});
