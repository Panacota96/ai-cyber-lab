import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import { resolvePathWithin } from '@/lib/security';

function getWordlistRoot() {
  return path.resolve(process.env.CTF_WORDLIST_DIR || '/usr/share/wordlists');
}

function toRelativeWordlistPath(fullPath) {
  const relative = path.relative(getWordlistRoot(), fullPath);
  if (!relative || relative === '') return '';
  return relative.split(path.sep).join('/');
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedPath = String(searchParams.get('path') || '').trim();
    const wordlistRoot = getWordlistRoot();
    if (!fs.existsSync(wordlistRoot)) {
      return NextResponse.json({
        root: wordlistRoot,
        currentPath: '',
        parentPath: null,
        entries: [],
      });
    }
    const absolutePath = requestedPath ? resolvePathWithin(wordlistRoot, requestedPath) : wordlistRoot;

    if (!fs.existsSync(absolutePath)) {
      return apiError('Path not found', 404);
    }

    const stat = fs.statSync(absolutePath);
    if (!stat.isDirectory()) {
      return apiError('Path is not a directory', 400);
    }

    const entries = fs.readdirSync(absolutePath, { withFileTypes: true })
      .map((entry) => {
        const childPath = path.join(absolutePath, entry.name);
        const childStat = fs.statSync(childPath);
        const isDirectory = childStat.isDirectory();
        return {
          name: entry.name,
          type: isDirectory ? 'directory' : 'file',
          relativePath: toRelativeWordlistPath(childPath),
          size: isDirectory ? null : childStat.size,
        };
      })
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    const parentPath = requestedPath
      ? toRelativeWordlistPath(path.dirname(absolutePath))
      : null;

    return NextResponse.json({
      root: wordlistRoot,
      currentPath: toRelativeWordlistPath(absolutePath),
      parentPath: requestedPath ? (parentPath === '.' ? '' : parentPath) : null,
      entries,
    });
  } catch (error) {
    if (String(error?.message || '').includes('Path traversal rejected')) {
      return apiError('Path traversal rejected', 400);
    }
    return apiError('Failed to read wordlists', 500, { detail: error.message });
  }
}
