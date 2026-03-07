import { NextResponse } from 'next/server';
import { getDbStats, clearLogs, vacuumDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { isAdminApiEnabled, isApiTokenValid } from '@/lib/security';

export async function GET(request) {
  try {
    if (!isApiTokenValid(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isAdminApiEnabled()) {
      return NextResponse.json({ error: 'Admin API disabled in this environment.' }, { status: 403 });
    }
    return NextResponse.json(getDbStats());
  } catch (error) {
    logger.error('Error fetching DB stats', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    if (!isApiTokenValid(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isAdminApiEnabled()) {
      return NextResponse.json({ error: 'Admin API disabled in this environment.' }, { status: 403 });
    }

    const { action } = await request.json();
    if (!['logs', 'vacuum', 'all'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action. Use: logs, vacuum, or all' }, { status: 400 });
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
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
  }
}
