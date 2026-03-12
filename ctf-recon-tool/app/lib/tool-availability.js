import { spawnSync } from 'node:child_process';

const cache = globalThis.__helmsToolAvailabilityCache || (globalThis.__helmsToolAvailabilityCache = new Map());

export function isToolAvailable(binary) {
  const normalized = String(binary || '').trim();
  if (!normalized) return false;
  if (cache.has(normalized)) {
    return cache.get(normalized);
  }

  try {
    const result = process.platform === 'win32'
      ? spawnSync('where.exe', [normalized], { stdio: 'ignore', timeout: 1500 })
      : spawnSync('/bin/sh', ['-lc', `command -v ${normalized}`], { stdio: 'ignore', timeout: 1500 });
    const available = result?.status === 0;
    cache.set(normalized, available);
    return available;
  } catch {
    cache.set(normalized, false);
    return false;
  }
}

export function clearToolAvailabilityCache() {
  cache.clear();
}
