import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

const CACHE_PATH = 'data/player-cache.json';

export function readPlayerCache(): unknown | null {
  if (!existsSync(CACHE_PATH)) {
    return null;
  }
  try {
    const raw = readFileSync(CACHE_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writePlayerCache(data: unknown): void {
  mkdirSync(dirname(CACHE_PATH), { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), 'utf-8');
}
