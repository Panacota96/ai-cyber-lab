import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { logger } from '@/lib/logger';
import { isAdminApiEnabled, isApiTokenValid } from '@/lib/security';

const DB_PATH = path.join(process.cwd(), 'data', 'ctf_assistant.db');

function makeTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function buildAttachmentHeaders(filename, contentType) {
  return {
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
  };
}

export async function GET(request) {
  const startedAt = Date.now();

  try {
    if (!isApiTokenValid(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isAdminApiEnabled()) {
      return NextResponse.json({ error: 'Admin API disabled in this environment.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const format = (searchParams.get('format') || 'db').toLowerCase();

    if (!['db', 'sql'].includes(format)) {
      return NextResponse.json({ error: 'Invalid format. Use: db or sql' }, { status: 400 });
    }

    if (!fs.existsSync(DB_PATH)) {
      return NextResponse.json({ error: 'Database file not found.' }, { status: 404 });
    }

    const baseName = `ctf_assistant-backup-${makeTimestamp()}`;

    if (format === 'db') {
      const fileBuffer = fs.readFileSync(DB_PATH);
      logger.info('DB backup exported', {
        format: 'db',
        bytes: fileBuffer.length,
        elapsedMs: Date.now() - startedAt,
      });
      return new NextResponse(fileBuffer, {
        status: 200,
        headers: buildAttachmentHeaders(`${baseName}.db`, 'application/x-sqlite3'),
      });
    }

    const dump = spawnSync('sqlite3', [DB_PATH, '.dump'], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 128, // 128MB dump cap
    });

    if (dump.error) {
      if (dump.error.code === 'ENOENT') {
        logger.error('DB SQL export failed: sqlite3 binary not available', {
          format: 'sql',
          elapsedMs: Date.now() - startedAt,
        });
        return NextResponse.json(
          { error: 'SQL export unavailable: sqlite3 CLI is not installed in runtime environment.' },
          { status: 501 }
        );
      }
      logger.error('DB SQL export failed', {
        format: 'sql',
        detail: dump.error.message,
        elapsedMs: Date.now() - startedAt,
      });
      return NextResponse.json(
        { error: 'SQL export failed', detail: dump.error.message },
        { status: 500 }
      );
    }

    if (dump.status !== 0) {
      const stderr = (dump.stderr || '').trim() || 'sqlite3 returned a non-zero exit code.';
      logger.error('DB SQL export failed', {
        format: 'sql',
        status: dump.status,
        detail: stderr,
        elapsedMs: Date.now() - startedAt,
      });
      return NextResponse.json(
        { error: 'SQL export failed', detail: stderr },
        { status: 500 }
      );
    }

    const sqlDump = dump.stdout || '';
    logger.info('DB backup exported', {
      format: 'sql',
      bytes: Buffer.byteLength(sqlDump, 'utf8'),
      elapsedMs: Date.now() - startedAt,
    });
    return new NextResponse(sqlDump, {
      status: 200,
      headers: buildAttachmentHeaders(`${baseName}.sql`, 'text/plain; charset=utf-8'),
    });
  } catch (error) {
    logger.error('Error exporting DB backup', error);
    return NextResponse.json({ error: 'Backup export failed' }, { status: 500 });
  }
}

