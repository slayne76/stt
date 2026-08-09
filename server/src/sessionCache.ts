import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

const CACHE_PATH = 'data/session-cache.json';

interface SessionCache {
  sessionCookie: string;
  obtainedAt: string;
}

export function readSessionCookie(): string | null {
  if (!existsSync(CACHE_PATH)) {
    return null;
  }
  try {
    const raw = readFileSync(CACHE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as SessionCache;
    return typeof parsed.sessionCookie === 'string' ? parsed.sessionCookie : null;
  } catch {
    return null;
  }
}

export function writeSessionCookie(cookie: string): void {
  mkdirSync(dirname(CACHE_PATH), { recursive: true });
  const data: SessionCache = { sessionCookie: cookie, obtainedAt: new Date().toISOString() };
  writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), 'utf-8');
}
