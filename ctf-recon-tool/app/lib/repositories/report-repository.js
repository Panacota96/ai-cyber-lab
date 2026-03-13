import {
  createReportTemplate,
  createWriteupShare,
  createWriteupSuggestion,
  deleteReportTemplate,
  getReportTemplate,
  getWriteup,
  getWriteupShareByToken,
  getWriteupSuggestion,
  getWriteupVersion,
  getWriteupVersionForSession,
  listReportTemplates,
  listWriteupShares,
  listWriteupSuggestions,
  revokeWriteupShare,
  saveWriteup,
  updateReportTemplate,
  updateWriteupSuggestion,
  getWriteupVersions,
} from '@/lib/db';
import {
  isBuiltInReportTemplateId,
  listBuiltInReportTemplatePacks,
} from '@/domains/reporting/lib/template-packs';

function normalizeTemplate(template = {}, scope = 'user') {
  return {
    ...template,
    scope,
    packId: scope === 'system' ? (template.packId || String(template.id || '').replace(/^system:/, '')) : null,
  };
}

export function listAvailableReportTemplates({ format = null, sessionId = null } = {}) {
  const systemTemplates = listBuiltInReportTemplatePacks({ format }).map((template) => normalizeTemplate(template, 'system'));
  const userTemplates = listReportTemplates({ format, sessionId }).map((template) => normalizeTemplate(template, 'user'));
  return [...systemTemplates, ...userTemplates];
}

export function isReadOnlyReportTemplate(templateId) {
  return isBuiltInReportTemplateId(templateId);
}

export {
  createReportTemplate,
  createWriteupShare,
  createWriteupSuggestion,
  deleteReportTemplate,
  getReportTemplate,
  getWriteup,
  getWriteupShareByToken,
  getWriteupSuggestion,
  getWriteupVersion,
  getWriteupVersionForSession,
  getWriteupVersions,
  listReportTemplates,
  listWriteupShares,
  listWriteupSuggestions,
  revokeWriteupShare,
  saveWriteup,
  updateReportTemplate,
  updateWriteupSuggestion,
};
