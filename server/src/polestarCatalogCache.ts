import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import type { PolestarCatalogEntry } from './polestarCatalogClient';

const CACHE_PATH = 'data/polestar-catalog-cache.json';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — matches the crew/ship catalog cache TTL

export function isPolestarCatalogCacheFresh(): boolean {
  if (!existsSync(CACHE_PATH)) return false;
  try {
    return Date.now() - statSync(CACHE_PATH).mtimeMs < CACHE_TTL_MS;
  } catch {
    return false;
  }
}

export function readPolestarCatalogCache(): PolestarCatalogEntry[] | null {
  if (!existsSync(CACHE_PATH)) {
    return null;
  }
  try {
    const raw = readFileSync(CACHE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as PolestarCatalogEntry[];
    if (
      parsed.length === 0 ||
      typeof parsed[0].id !== 'number' ||
      typeof parsed[0].name !== 'string' ||
      typeof parsed[0].icon?.file !== 'string'
    ) {
      // Empty, or unexpected shape — treat as absent so callers refetch live.
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writePolestarCatalogCache(data: PolestarCatalogEntry[]): void {
  mkdirSync(dirname(CACHE_PATH), { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), 'utf-8');
}
