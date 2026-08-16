import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ItemEntry } from './itemsClient';

const CACHE_PATH = 'data/items-cache.json';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function isItemsCacheFresh(): boolean {
  if (!existsSync(CACHE_PATH)) return false;
  try {
    return Date.now() - statSync(CACHE_PATH).mtimeMs < CACHE_TTL_MS;
  } catch {
    return false;
  }
}

export function readItemsCache(): ItemEntry[] | null {
  if (!existsSync(CACHE_PATH)) return null;
  try {
    const raw = readFileSync(CACHE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as ItemEntry[];
    if (parsed.length === 0 || typeof parsed[0].symbol !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeItemsCache(data: ItemEntry[]): void {
  mkdirSync(dirname(CACHE_PATH), { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), 'utf-8');
}
