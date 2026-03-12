import { normalizeReportFilters } from '@/lib/finding-intelligence';

export const AUDIENCE_PACKS = [
  {
    id: 'executive',
    label: 'Executive',
    description: 'Business-risk summary with top findings and remediation priorities.',
    format: 'executive-summary',
  },
  {
    id: 'technical',
    label: 'Technical',
    description: 'Operator and engineer oriented walkthrough with evidence depth.',
    format: 'technical-walkthrough',
  },
  {
    id: 'certification',
    label: 'Certification',
    description: 'Challenge and certification style output focused on solution flow and proof.',
    format: 'ctf-solution',
  },
];

export const REPORT_PRESETS = [
  {
    id: 'executive-brief',
    label: 'Executive Brief',
    description: 'High-signal management view with duplicate suppression.',
    audiencePack: 'executive',
    format: 'executive-summary',
    reportFilters: {
      minimumSeverity: 'high',
      includeDuplicates: false,
    },
  },
  {
    id: 'technical-deep-dive',
    label: 'Technical Deep Dive',
    description: 'Full operator-facing narrative with all findings in scope.',
    audiencePack: 'technical',
    format: 'technical-walkthrough',
    reportFilters: {
      minimumSeverity: 'all',
      includeDuplicates: true,
    },
  },
  {
    id: 'certification-writeup',
    label: 'Certification Writeup',
    description: 'Challenge/reporting view optimized for reproducibility and proof.',
    audiencePack: 'certification',
    format: 'ctf-solution',
    reportFilters: {
      minimumSeverity: 'all',
      includeDuplicates: false,
    },
  },
];

const audiencePackMap = new Map(AUDIENCE_PACKS.map((pack) => [pack.id, pack]));
const presetMap = new Map(REPORT_PRESETS.map((preset) => [preset.id, preset]));

export function getAudiencePackDefinition(id) {
  return audiencePackMap.get(String(id || '').trim().toLowerCase()) || null;
}

export function getReportPresetDefinition(id) {
  return presetMap.get(String(id || '').trim().toLowerCase()) || null;
}

export function inferAudiencePackFromFormat(format) {
  const normalized = String(format || '').trim().toLowerCase();
  if (normalized === 'executive-summary') return 'executive';
  if (normalized === 'ctf-solution') return 'certification';
  return 'technical';
}

export function normalizeAudiencePack(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return getAudiencePackDefinition(normalized)?.id || '';
}

export function normalizeReportPreset(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return getReportPresetDefinition(normalized)?.id || '';
}

export function resolveReportView({
  format = '',
  audiencePack = '',
  presetId = '',
  reportFilters = {},
} = {}) {
  const preset = getReportPresetDefinition(presetId);
  const explicitFormat = String(format || '').trim().toLowerCase();
  const normalizedPack = normalizeAudiencePack(preset?.audiencePack || audiencePack)
    || inferAudiencePackFromFormat(preset?.format || explicitFormat);
  const audienceDefinition = getAudiencePackDefinition(normalizedPack) || getAudiencePackDefinition('technical');
  const resolvedFormat = String(
    preset?.format
    || explicitFormat
    || audienceDefinition?.format
    || 'technical-walkthrough'
  ).trim().toLowerCase();
  const resolvedFilters = normalizeReportFilters({
    ...(preset?.reportFilters || {}),
    ...(reportFilters || {}),
  });

  return {
    format: resolvedFormat,
    audiencePack: audienceDefinition?.id || 'technical',
    audienceDefinition,
    presetId: preset?.id || '',
    presetDefinition: preset || null,
    reportFilters: resolvedFilters,
  };
}

export function applyReportPreset(presetId, current = {}) {
  const resolved = resolveReportView({
    format: current.format,
    audiencePack: current.audiencePack,
    presetId,
    reportFilters: current.reportFilters,
  });
  return {
    format: resolved.format,
    audiencePack: resolved.audiencePack,
    presetId: resolved.presetId,
    reportFilters: resolved.reportFilters,
  };
}
