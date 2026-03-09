import { apiError } from '@/lib/api-error';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getSession, getTimeline, listPocSteps } from '@/lib/db';
import {
  labReport,
  executiveSummary,
  technicalWalkthrough,
  ctfSolution,
  bugBountyReport,
  pentestReport,
} from '@/lib/report-formats';
import { detectImageFormat, imageFormatToMime } from '@/lib/image-sniff';
import { isValidSessionId, requireSafeFilename, resolvePathWithin } from '@/lib/security';

const FORMATS = {
  'lab-report': labReport,
  'executive-summary': executiveSummary,
  'technical-walkthrough': technicalWalkthrough,
  'ctf-solution': ctfSolution,
  'bug-bounty': bugBountyReport,
  pentest: pentestReport,
};

function normalizeBoolean(value, fallback = true) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return fallback;
}

function sanitizeDownloadToken(value, fallback = 'report') {
  const cleaned = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return cleaned || fallback;
}

function parseMediaPath(rawUrl) {
  const raw = String(rawUrl || '').trim();
  if (!raw) return null;

  let pathname = raw;
  try {
    if (/^https?:\/\//i.test(raw)) {
      pathname = new URL(raw).pathname || raw;
    }
  } catch {
    pathname = raw;
  }

  const match = pathname.match(/^\/api\/media\/([^/]+)\/([^?#)]+)$/i);
  if (!match) return null;

  let sessionId;
  let filename;
  try {
    sessionId = decodeURIComponent(match[1]);
    filename = decodeURIComponent(match[2]);
  } catch {
    return null;
  }

  if (!isValidSessionId(sessionId)) return null;
  try {
    requireSafeFilename(filename);
  } catch {
    return null;
  }

  return { sessionId, filename };
}

function inlineMarkdownImages(markdown) {
  const sessionsDir = path.join(process.cwd(), 'data', 'sessions');
  const imageRegex = /!\[(.*?)\]\((.*?)\)/g;

  return String(markdown || '').replace(imageRegex, (full, altText, url) => {
    const parsed = parseMediaPath(url);
    if (!parsed) return full;

    let filePath;
    try {
      filePath = resolvePathWithin(sessionsDir, parsed.sessionId, 'screenshots', parsed.filename);
    } catch {
      return full;
    }
    if (!fs.existsSync(filePath)) return full;

    const buffer = fs.readFileSync(filePath);
    const format = detectImageFormat(buffer);
    const mime = imageFormatToMime(format);
    if (!mime) return full;

    const b64 = buffer.toString('base64');
    return `![${altText}](data:${mime};base64,${b64})`;
  });
}

export async function POST(request) {
  try {
    const payload = await request.json();
    const sessionId = payload?.sessionId;
    const format = payload?.format || 'technical-walkthrough';
    const analystName = String(payload?.analystName || 'Unknown');
    const inlineImages = normalizeBoolean(payload?.inlineImages, true);

    if (!sessionId || !isValidSessionId(sessionId)) {
      return apiError('sessionId is required', 400);
    }

    const session = getSession(sessionId);
    if (!session) {
      return apiError('Session not found', 404);
    }

    const events = getTimeline(sessionId);
    const pocSteps = (format === 'technical-walkthrough' || format === 'pentest')
      ? listPocSteps(sessionId)
      : [];
    const generator = FORMATS[format] || technicalWalkthrough;
    const markdown = generator(session, events, analystName, { pocSteps });
    const output = inlineImages ? inlineMarkdownImages(markdown) : markdown;

    const sessionToken = sanitizeDownloadToken(session.name || sessionId, sessionId);
    const formatToken = sanitizeDownloadToken(format, 'technical-walkthrough');
    const filename = `${sessionToken}-${formatToken}.md`;

    return new NextResponse(output, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return apiError('Markdown export failed', 500, { detail: error.message });
  }
}
