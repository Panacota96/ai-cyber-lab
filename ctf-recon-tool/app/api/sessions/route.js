import { NextResponse } from 'next/server';
import { listSessions, createSession, deleteSession } from '@/lib/db';
import { isApiTokenValid, isValidSessionId } from '@/lib/security';
import { logger } from '@/lib/logger';
import { apiError } from '@/lib/api-error';

export async function GET() {
  const sessions = listSessions();
  return NextResponse.json(sessions);
}

export async function POST(request) {
  try {
    if (!isApiTokenValid(request)) {
      return apiError('Unauthorized', 401);
    }
    const body = await request.json();
    const { name, target, difficulty, objective } = body;
    const id = body.id || crypto.randomUUID();
    if (!isValidSessionId(id)) {
      return apiError('Invalid session id', 400);
    }
    if (!name || !String(name).trim()) {
      return apiError('Session name is required', 400);
    }
    const session = createSession(id, name, { target, difficulty, objective });
    if (!session) {
      return apiError('Session could not be created (possibly duplicate id)', 409);
    }
    logger.info('AUDIT:SESSION_CREATED', { sessionId: id, name });
    return NextResponse.json(session);
  } catch (error) {
    return apiError('Failed to create session', 500);
  }
}

export async function DELETE(request) {
  try {
    if (!isApiTokenValid(request)) {
      return apiError('Unauthorized', 401);
    }
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id || id === 'default' || !isValidSessionId(id)) {
      return apiError('Cannot delete this session', 400);
    }
    const ok = deleteSession(id);
    if (!ok) return apiError('Failed to delete session', 500);
    logger.info('AUDIT:SESSION_DELETED', { sessionId: id });
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError('Failed to delete session', 500);
  }
}
