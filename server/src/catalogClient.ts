import { UpstreamError } from './errors';

const CATALOG_UPSTREAM_URL = 'https://datacore.app/structured/crew.json';

export interface CatalogEntry {
  archetype_id: number;
  max_rarity: number;
  in_portal: boolean;
  name: string;
  imageUrlPortrait: string;
  data_score: number;
  traits: string[];
  traits_hidden: string[];
  uniquely_retrievable: boolean;
  gauntlet_rank: number;
}

interface RawCatalogEntry {
  archetype_id: number;
  max_rarity: number;
  in_portal: boolean;
  name: string;
  imageUrlPortrait: string;
  traits?: string[];
  traits_hidden?: string[];
  ranks?: { scores?: { overall?: number }; gauntletRank?: number };
  unique_polestar_combos?: string[][];
  [key: string]: unknown;
}

export async function fetchCrewCatalog(): Promise<CatalogEntry[]> {
  let response: Response;
  try {
    response = await fetch(CATALOG_UPSTREAM_URL, { signal: AbortSignal.timeout(30_000) });
  } catch (cause) {
    throw new UpstreamError(`Network error fetching crew catalog: ${(cause as Error).message}`);
  }

  if (!response.ok) {
    throw new UpstreamError(`Crew catalog host returned HTTP ${response.status}`);
  }

  const raw = (await response.json()) as RawCatalogEntry[];
  return raw.map((e) => ({
    archetype_id: e.archetype_id,
    max_rarity: e.max_rarity,
    in_portal: e.in_portal,
    name: e.name,
    imageUrlPortrait: e.imageUrlPortrait,
    data_score: e.ranks?.scores?.overall ?? 0,
    traits: e.traits ?? [],
    traits_hidden: e.traits_hidden ?? [],
    uniquely_retrievable: Boolean(e.in_portal) && (e.unique_polestar_combos?.length ?? 0) > 0,
    // Unlike data_score (sorted descending, so 0 safely sinks a missing
    // value to the bottom), gauntlet_rank is sorted ASCENDING (lowest =
    // best) — a 0 fallback would make a missing/malformed rank look better
    // than #1. Fail safe: sink it to the bottom instead.
    gauntlet_rank: e.ranks?.gauntletRank ?? Number.MAX_SAFE_INTEGER,
  }));
}
