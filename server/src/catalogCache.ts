import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import type { CatalogEntry } from './catalogClient';

const CACHE_PATH = 'data/crew-catalog-cache.json';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — matches datacore's own regeneration cadence

export function isCatalogCacheFresh(): boolean {
  if (!existsSync(CACHE_PATH)) return false;
  try {
    return Date.now() - statSync(CACHE_PATH).mtimeMs < CACHE_TTL_MS;
  } catch {
    return false;
  }
}

export function readCatalogCache(): CatalogEntry[] | null {
  if (!existsSync(CACHE_PATH)) {
    return null;
  }
  try {
    const raw = readFileSync(CACHE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as CatalogEntry[];
    if (parsed.length === 0 || typeof parsed[0].data_score !== 'number') {
      // Empty, or old-shape cache (pre-widening of CatalogEntry) — treat as absent so callers refetch live.
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeCatalogCache(data: CatalogEntry[]): void {
  mkdirSync(dirname(CACHE_PATH), { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), 'utf-8');
}
