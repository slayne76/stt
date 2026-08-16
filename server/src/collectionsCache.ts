import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import type { CollectionDefinition } from './collectionsClient';

const CACHE_PATH = 'data/collections-cache.json';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function isCollectionsCacheFresh(): boolean {
  if (!existsSync(CACHE_PATH)) return false;
  try {
    return Date.now() - statSync(CACHE_PATH).mtimeMs < CACHE_TTL_MS;
  } catch {
    return false;
  }
}

export function readCollectionsCache(): CollectionDefinition[] | null {
  if (!existsSync(CACHE_PATH)) return null;
  try {
    const raw = readFileSync(CACHE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as CollectionDefinition[];
    if (parsed.length === 0 || typeof parsed[0].name !== 'string') return null;
    // `milestones` was added to the projection for the Beta Tachyon Pulse
    // port; a cache written before that would silently zero the engine's
    // `collections` term for every crew.
    if (!Array.isArray(parsed[0].milestones)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCollectionsCache(data: CollectionDefinition[]): void {
  mkdirSync(dirname(CACHE_PATH), { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), 'utf-8');
}
