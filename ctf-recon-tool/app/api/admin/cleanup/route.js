import { NextResponse } from 'next/server';
import { getDbStats, clearLogs, vacuumDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { isAdminApiEnabled, isApiTokenValid } from '@/lib/security';
import { apiError } from '@/lib/api-error';

export async function GET(request) {
  try {
    if (!isApiTokenValid(request)) {
      return apiError('Unauthorized', 401);
    }
    if (!isAdminApiEnabled()) {
      return apiError('Admin API disabled in this environment.', 403);
    }
    return NextResponse.json(getDbStats());
  } catch (error) {
    logger.error('Error fetching DB stats', error);
    return apiError('Failed to fetch stats', 500);
  }
}

export async function POST(request) {
  try {
    if (!isApiTokenValid(request)) {
      return apiError('Unauthorized', 401);
    }
    if (!isAdminApiEnabled()) {
      return apiError('Admin API disabled in this environment.', 403);
    }

    const { action } = await request.json();
    if (!['logs', 'vacuum', 'all'].includes(action)) {
      return apiError('Invalid action. Use: logs, vacuum, or all', 400);
    }
    const result = {};

    if (action === 'logs' || action === 'all') {
      result.logsDeleted = clearLogs();
      logger.info(`DB cleanup: cleared ${result.logsDeleted} log entries`);
    }

    if (action === 'vacuum' || action === 'all') {
      vacuumDb();
      result.vacuumed = true;
      logger.info('DB cleanup: VACUUM complete');
    }

    return NextResponse.json({ success: true, ...result, stats: getDbStats() });
  } catch (error) {
    logger.error('Error in /api/admin/cleanup POST', error);
    return apiError('Cleanup failed', 500);
  }
}
