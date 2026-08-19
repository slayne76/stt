import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { RetrievableCrewEntry } from './retrievableCrewTypes';

const STORE_PATH = 'data/retrievable-crew.json';

// Not a remote-fetch cache (no TTL, no upstream) — this is hand-authored
// local state. Missing file just means "nothing tracked yet", not an error.
export function readRetrievableCrew(): RetrievableCrewEntry[] {
  if (!existsSync(STORE_PATH)) {
    return [];
  }
  try {
    const raw = readFileSync(STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as RetrievableCrewEntry[]) : [];
  } catch {
    return [];
  }
}

// Unused this phase — see routes/retrievableCrew.ts. Kept now so the next
// (editable) phase only needs to add a route, not storage logic.
export function writeRetrievableCrew(entries: RetrievableCrewEntry[]): void {
  mkdirSync(dirname(STORE_PATH), { recursive: true });
  writeFileSync(STORE_PATH, JSON.stringify(entries, null, 2), 'utf-8');
}
