import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import type { CitationCrewEntry } from './citation/types';

// Exported so computeCitationPriorities.ts can fold this file's mtime into its
// own response-cache key — its rankings depend on this dataset, which refreshes
// independently on the 24h TTL below.
export const CITATION_CREW_CACHE_PATH = 'data/citation-crew-cache.json';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — matches catalogCache.ts

export function isCitationCrewCacheFresh(): boolean {
  if (!existsSync(CITATION_CREW_CACHE_PATH)) return false;
  try {
    return Date.now() - statSync(CITATION_CREW_CACHE_PATH).mtimeMs < CACHE_TTL_MS;
  } catch {
    return false;
  }
}

export function readCitationCrewCache(): CitationCrewEntry[] | null {
  if (!existsSync(CITATION_CREW_CACHE_PATH)) return null;
  try {
    const raw = readFileSync(CITATION_CREW_CACHE_PATH, 'utf-8');
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
    // Likewise for traits / obtained / the V_* + voyTriplet voyage ranks,
    // added to the projection for the Beta Tachyon Pulse port. A cache written
    // before that change would silently zero out that engine's `retrieval`,
    // `never`, `improved` and `groupSparsity` terms.
    if (!Array.isArray(parsed[0].traits) || typeof parsed[0].obtained !== 'string') {
      return null;
    }
    if (parsed[0].ranks?.voyTriplet === undefined) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeCitationCrewCache(data: CitationCrewEntry[]): void {
  mkdirSync(dirname(CITATION_CREW_CACHE_PATH), { recursive: true });
  writeFileSync(CITATION_CREW_CACHE_PATH, JSON.stringify(data, null, 2), 'utf-8');
}
