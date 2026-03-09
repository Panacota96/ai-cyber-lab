import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { logger } from '@/lib/logger';
import { isAdminApiEnabled, isApiTokenValid } from '@/lib/security';
import { apiError } from '@/lib/api-error';

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
      return apiError('Unauthorized', 401);
    }
    if (!isAdminApiEnabled()) {
      return apiError('Admin API disabled in this environment.', 403);
    }

    const { searchParams } = new URL(request.url);
    const format = (searchParams.get('format') || 'db').toLowerCase();

    if (!['db', 'sql'].includes(format)) {
      return apiError('Invalid format. Use: db or sql', 400);
    }

    if (!fs.existsSync(DB_PATH)) {
      return apiError('Database file not found.', 404);
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
        return apiError('SQL export unavailable: sqlite3 CLI is not installed in runtime environment.', 501);
      }
      logger.error('DB SQL export failed', {
        format: 'sql',
        detail: dump.error.message,
        elapsedMs: Date.now() - startedAt,
      });
      return apiError('SQL export failed', 500, { detail: dump.error.message });
    }

    if (dump.status !== 0) {
      const stderr = (dump.stderr || '').trim() || 'sqlite3 returned a non-zero exit code.';
      logger.error('DB SQL export failed', {
        format: 'sql',
        status: dump.status,
        detail: stderr,
        elapsedMs: Date.now() - startedAt,
      });
      return apiError('SQL export failed', 500, { detail: stderr });
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
    return apiError('Backup export failed', 500);
  }
}

