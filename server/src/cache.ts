import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

// Exported so consumers that need to stat/invalidate against the player cache
// (server/src/citation/computeCitationPriorities.ts) reference the one
// definition rather than re-typing the path string.
export const PLAYER_CACHE_PATH = 'data/player-cache.json';

export function readPlayerCache(): unknown | null {
  if (!existsSync(PLAYER_CACHE_PATH)) {
    return null;
  }
  try {
    const raw = readFileSync(PLAYER_CACHE_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writePlayerCache(data: unknown): void {
  mkdirSync(dirname(PLAYER_CACHE_PATH), { recursive: true });
  writeFileSync(PLAYER_CACHE_PATH, JSON.stringify(data, null, 2), 'utf-8');
}
