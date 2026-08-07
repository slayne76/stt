import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const CACHE_DIR = 'data/assets';

function cachedFilePath(filename: string): string {
  return join(CACHE_DIR, filename);
}

function missingMarkerPath(filename: string): string {
  return join(CACHE_DIR, `${filename}.missing`);
}

export function getCachedAssetPath(filename: string): string | null {
  const path = cachedFilePath(filename);
  return existsSync(path) ? path : null;
}

export function isKnownMissing(filename: string): boolean {
  return existsSync(missingMarkerPath(filename));
}

export function writeAssetCache(filename: string, data: Buffer): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  const finalPath = cachedFilePath(filename);
  const tempPath = `${finalPath}.tmp-${randomUUID()}`;
  writeFileSync(tempPath, data);
  renameSync(tempPath, finalPath);
}

export function markAssetMissing(filename: string): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(missingMarkerPath(filename), '');
}

export function clearAssetCache(): void {
  if (!existsSync(CACHE_DIR)) return;
  for (const entry of readdirSync(CACHE_DIR)) {
    rmSync(join(CACHE_DIR, entry), { force: true });
  }
}
