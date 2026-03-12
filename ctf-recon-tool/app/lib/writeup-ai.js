import { buildEstimatedUsage } from '@/lib/ai-cost';
import { completeProviderText } from '@/lib/ai-provider-runtime';
import { recordAiUsage } from '@/lib/db';

export const WRITEUP_SKILL_PROMPTS = {
  enhance: `You are an expert CTF (Capture The Flag) security analyst and technical writer.
Given a raw reconnaissance report in Markdown format, enhance it by adding:
1. An Executive Summary section at the top (2-4 sentences describing what was found)
2. A Key Findings section listing the most important discoveries as bullet points
3. A Risk Assessment section identifying potential vulnerabilities based on command outputs
4. A Recommended Next Steps section with specific actionable follow-up commands or techniques
Keep the original report content intact below your additions, separated by a horizontal rule.
Be concise and technical. Focus on security-relevant findings.`,

  'writeup-refiner': `You are an expert CTF technical writer applying the Granular Guided Standard.
Given a CTF writeup or reconnaissance report, restructure and enhance it so that:
1. Every major action is a numbered step with four mandatory sub-sections:
   - Goal: What are we trying to achieve?
   - Reasoning: Why this approach / why this tool?
   - Execution: The exact commands or code snippets
   - Observation: The specific output, signal, or resulting state
2. The writeup contains these sections (create any that are missing):
   - ## TL;DR (1-2 sentence solution summary)
   - ## Summary of Major Findings (critical discoveries, credentials, flags)
   - ## Information Gathering (initial triage steps)
   - ## Exploitation (granular numbered steps with Goal/Reasoning/Execution/Observation)
   - ## Flag / Password (final secret in a code block)
   - ## Reusable Improvements (patterns or scripts worth keeping)
Preserve all original technical content. Add structure and context where missing. Be precise and reproducible.`,

  report: `You are an expert pentest report writer producing a professional, certification-compliant report.
Given reconnaissance notes and findings, format them as a structured pentest report containing:
1. Executive Summary - 2-4 sentences of business-impact narrative (non-technical audience)
2. Scope & Methodology - target, testing dates, approach used
3. Findings - for each finding: Title, Severity (Critical/High/Medium/Low/Info), Description, Evidence (command output or screenshot reference), Impact, Remediation
4. Attack Path - numbered chain of events from initial access to objective
5. Remediation Summary - prioritized table of all findings with fix guidance
6. Conclusion - overall risk posture statement
Use clear, evidence-backed technical language. Include risk ratings and actionable remediation for each finding.`,
};

export const REPORT_SKILLS = new Set(['enhance', 'writeup-refiner', 'report']);

function resolveTrackingProvider(provider, result = null) {
  if (result?.trackingProvider) return result.trackingProvider;
  const normalized = String(provider || 'claude').trim().toLowerCase();
  if (normalized === 'openai') return 'openai';
  if (normalized === 'gemini') return 'gemini';
  if (normalized === 'offline') return 'offline';
  return 'anthropic';
}

function resolveTrackingModel(provider, result = null) {
  if (result?.model) return result.model;
  const normalized = String(provider || 'claude').trim().toLowerCase();
  if (normalized === 'openai') return 'gpt-4o';
  if (normalized === 'gemini') return 'gemini-2.5-flash';
  return 'claude-sonnet-4-6';
}

export function extractJsonObject(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function safeRecordWriteupAiUsage({
  sessionId,
  provider,
  promptText,
  completionText,
  usage,
  metadata,
  result,
} = {}) {
  try {
    const trackingProvider = resolveTrackingProvider(provider, result);
    const trackingModel = resolveTrackingModel(provider, result);
    const normalized = buildEstimatedUsage({
      provider: trackingProvider,
      model: trackingModel,
      promptText,
      completionText,
      promptTokens: usage?.promptTokens,
      completionTokens: usage?.completionTokens,
      totalTokens: usage?.totalTokens,
    });

    recordAiUsage({
      sessionId,
      endpoint: '/api/writeup/enhance',
      provider: trackingProvider,
      model: trackingModel,
      promptTokens: normalized.promptTokens,
      completionTokens: normalized.completionTokens,
      totalTokens: normalized.totalTokens,
      estimatedCostUsd: normalized.estimatedCostUsd,
      metadata,
    });
  } catch (error) {
    console.error('[Writeup Usage Tracking Error]', error);
  }
}

export function sanitizeWriteupPatches(compactBlocks = [], rawPatches = [], fallbackText = '') {
  const allowedIds = new Set((Array.isArray(compactBlocks) ? compactBlocks : []).map((block) => String(block.id || '')));
  let patches = Array.isArray(rawPatches) ? rawPatches : [];
  patches = patches
    .filter((patch) => patch && typeof patch.sectionId === 'string' && (allowedIds.has(patch.sectionId) || patch.sectionId.startsWith('auto-')))
    .map((patch) => ({
      sectionId: patch.sectionId,
      title: typeof patch.title === 'string' ? patch.title : undefined,
      content: typeof patch.content === 'string' ? patch.content : undefined,
      caption: typeof patch.caption === 'string' ? patch.caption : undefined,
      alt: typeof patch.alt === 'string' ? patch.alt : undefined,
      evidenceRefs: Array.isArray(patch.evidenceRefs) ? patch.evidenceRefs.map((value) => String(value)) : [],
    }));

  if (patches.length === 0 && compactBlocks.length === 1 && String(fallbackText || '').trim()) {
    patches = [{
      sectionId: compactBlocks[0].id,
      content: String(fallbackText || '').trim(),
      evidenceRefs: [],
    }];
  }
  return patches;
}

export async function generateWriteupSectionPatches({
  sessionId,
  provider = 'claude',
  apiKey = '',
  skill = 'writeup-refiner',
  reportBlocks = [],
  selectedSectionIds = [],
  evidenceContext = '',
  endpoint = '/api/writeup/enhance',
  metadata = {},
} = {}) {
  const systemPrompt = WRITEUP_SKILL_PROMPTS[skill] || WRITEUP_SKILL_PROMPTS.enhance;
  const selected = Array.isArray(selectedSectionIds) ? selectedSectionIds : [];
  const blocks = Array.isArray(reportBlocks) ? reportBlocks : [];
  const targetBlocks = blocks.filter((block) => selected.length === 0 || selected.includes(block.id));
  if (targetBlocks.length === 0) {
    return { mode: 'section-patch', patches: [], promptText: '', completionText: '', result: null };
  }

  const compactBlocks = targetBlocks.map((block) => ({
    id: block.id,
    blockType: block.blockType,
    title: block.title || '',
    content: block.content || '',
    caption: block.caption || '',
    alt: block.alt || '',
    imageUrl: block.imageUrl || '',
  }));

  const patchPrompt = `You are editing selected report blocks.
Return ONLY valid JSON with this shape:
{
  "patches": [
    {
      "sectionId": "existing-block-id",
      "title": "optional updated title",
      "content": "updated markdown/text content",
      "caption": "optional image caption",
      "alt": "optional image alt text",
      "evidenceRefs": ["timestamp or screenshot name used as evidence"]
    }
  ]
}

Rules:
- Keep sectionId unchanged and match provided IDs.
- Preserve technical accuracy and reproducibility.
- Include evidenceRefs for each patch.
- Do not include markdown code fences around JSON.

Selected blocks:
${JSON.stringify(compactBlocks, null, 2)}

Evidence context:
${evidenceContext || '(none provided)'}`;

  const promptText = `${systemPrompt}\n\n${patchPrompt}`;
  const result = await completeProviderText({
    provider,
    apiKey,
    systemPrompt,
    userPrompt: patchPrompt,
    maxTokens: 3072,
  });
  const completionText = String(result?.text || '');
  const parsed = extractJsonObject(completionText);
  const patches = sanitizeWriteupPatches(compactBlocks, parsed?.patches, completionText);

  safeRecordWriteupAiUsage({
    sessionId,
    provider,
    promptText,
    completionText,
    usage: result?.usage || null,
    result,
    metadata: {
      ...metadata,
      endpoint,
      mode: 'section-patch',
      skill,
      selectedSections: selected.length,
      patchedSections: patches.length,
      backend: result?.metadata?.backend || null,
    },
  });

  return {
    mode: 'section-patch',
    patches,
    promptText,
    completionText,
    result,
  };
}
