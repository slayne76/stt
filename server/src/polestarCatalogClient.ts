import { UpstreamError } from './errors';

const POLESTAR_CATALOG_UPSTREAM_URL = 'https://datacore.app/structured/keystones.json';

export interface PolestarCatalogEntry {
  id: number;
  name: string;
  short_name: string;
  icon: { file: string };
  rarity: number;
  filter:
    | { type: 'rarity'; rarity: number }
    | { type: 'trait'; trait: string }
    | { type: 'skill'; skill: string };
}

interface RawKeystoneEntry {
  id: number;
  type: string;
  name: string;
  short_name: string;
  icon?: { file?: string };
  rarity: number;
  filter?: { type?: string; rarity?: number; trait?: string; skill?: string };
  [key: string]: unknown;
}

// datacore's keystones.json bundles individual Polestars (type: "keystone")
// together with multi-Polestar "constellation crate" bundles (type:
// "crew_keystone_crate" / "keystone_crate") in one flat list — only the
// former are actual Polestars, confirmed by inspecting the live file
// (278 "keystone" of 1913 total entries).
const POLESTAR_TYPE = 'keystone';

// Polestar icon.file values already end in ".png" (unlike ship catalog
// icon.file values, which don't) — the shared client-side getAssetUrl()
// helper always appends ".png" itself, so strip any existing suffix here
// to avoid a double extension downstream.
function stripPngSuffix(file: string): string {
  return file.replace(/\.png$/i, '');
}

function toPolestarFilter(raw: RawKeystoneEntry['filter']): PolestarCatalogEntry['filter'] | null {
  if (!raw) return null;
  if (raw.type === 'rarity' && typeof raw.rarity === 'number') {
    return { type: 'rarity', rarity: raw.rarity };
  }
  if (raw.type === 'trait' && typeof raw.trait === 'string') {
    return { type: 'trait', trait: raw.trait };
  }
  if (raw.type === 'skill' && typeof raw.skill === 'string') {
    return { type: 'skill', skill: raw.skill };
  }
  return null;
}

export async function fetchPolestarCatalog(): Promise<PolestarCatalogEntry[]> {
  let response: Response;
  try {
    response = await fetch(POLESTAR_CATALOG_UPSTREAM_URL, { signal: AbortSignal.timeout(30_000) });
  } catch (cause) {
    throw new UpstreamError(`Network error fetching polestar catalog: ${(cause as Error).message}`);
  }

  if (!response.ok) {
    throw new UpstreamError(`Polestar catalog host returned HTTP ${response.status}`);
  }

  const raw = (await response.json()) as RawKeystoneEntry[];
  const entries: PolestarCatalogEntry[] = [];
  for (const e of raw) {
    if (e.type !== POLESTAR_TYPE) continue;
    const filter = toPolestarFilter(e.filter);
    const iconFile = e.icon?.file;
    if (filter === null || typeof iconFile !== 'string') continue; // malformed upstream entry — skip rather than crash
    entries.push({
      id: e.id,
      name: e.name,
      short_name: e.short_name,
      icon: { file: stripPngSuffix(iconFile) },
      rarity: e.rarity,
      filter,
    });
  }
  return entries;
}
