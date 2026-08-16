import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import type { CitationCrewEntry } from './citation/types';

const CACHE_PATH = 'data/citation-crew-cache.json';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — matches catalogCache.ts

export function isCitationCrewCacheFresh(): boolean {
  if (!existsSync(CACHE_PATH)) return false;
  try {
    return Date.now() - statSync(CACHE_PATH).mtimeMs < CACHE_TTL_MS;
  } catch {
    return false;
  }
}

export function readCitationCrewCache(): CitationCrewEntry[] | null {
  if (!existsSync(CACHE_PATH)) return null;
  try {
    const raw = readFileSync(CACHE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as CitationCrewEntry[];
    if (parsed.length === 0 || typeof parsed[0].symbol !== 'string' || !Array.isArray(parsed[0].skill_order)) {
      return null;
    }
    // base_skills was added to the projection after the first caches were
    // written; treat a cache without it as stale rather than handing the
    // citation algorithms a catalog with no max-rarity stats.
    if (!parsed[0].base_skills) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeCitationCrewCache(data: CitationCrewEntry[]): void {
  mkdirSync(dirname(CACHE_PATH), { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), 'utf-8');
}
