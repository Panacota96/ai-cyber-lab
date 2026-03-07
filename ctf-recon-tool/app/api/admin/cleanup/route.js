import { NextResponse } from 'next/server';
import { getDbStats, clearLogs, vacuumDb } from '@/lib/db';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    return NextResponse.json(getDbStats());
  } catch (error) {
    logger.error('Error fetching DB stats', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { action } = await request.json();
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

    if (!result.logsDeleted && !result.vacuumed) {
      return NextResponse.json({ error: 'Invalid action. Use: logs, vacuum, or all' }, { status: 400 });
    }

    return NextResponse.json({ success: true, ...result, stats: getDbStats() });
  } catch (error) {
    logger.error('Error in /api/admin/cleanup POST', error);
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
  }
}
