import { UpstreamError } from './errors';
import type { CitationCrewEntry } from './citation/types';

const CREW_UPSTREAM_URL = 'https://datacore.app/structured/crew.json';

interface RawCitationCrewEntry {
  symbol: string;
  archetype_id: number;
  name: string;
  short_name: string;
  max_rarity: number;
  in_portal: boolean;
  skill_order?: string[];
  skill_data?: CitationCrewEntry['skill_data'];
  collections?: string[];
  collection_ids?: string[];
  unique_polestar_combos?: string[][];
  ranks?: {
    gauntletRank?: number;
    voyRank?: number;
    scores?: {
      am_seating?: number;
      quipment?: number;
      skill_rarity?: number;
      voyage?: number;
    };
  };
  [key: string]: unknown;
}

export async function fetchCitationCrewData(): Promise<CitationCrewEntry[]> {
  let response: Response;
  try {
    response = await fetch(CREW_UPSTREAM_URL, { signal: AbortSignal.timeout(30_000) });
  } catch (cause) {
    throw new UpstreamError(`Network error fetching citation crew data: ${(cause as Error).message}`);
  }

  if (!response.ok) {
    throw new UpstreamError(`Citation crew data host returned HTTP ${response.status}`);
  }

  const raw = (await response.json()) as RawCitationCrewEntry[];
  return raw.map((e) => ({
    symbol: e.symbol,
    archetype_id: e.archetype_id,
    name: e.name,
    short_name: e.short_name,
    max_rarity: e.max_rarity,
    in_portal: Boolean(e.in_portal),
    skill_order: e.skill_order ?? [],
    skill_data: e.skill_data ?? [],
    collections: e.collections ?? [],
    collection_ids: e.collection_ids ?? [],
    unique_polestar_combos: e.unique_polestar_combos ?? [],
    ranks: {
      // These four values feed into a SUM of "more/less gives weight"
      // contributions inside Beta Tachyon Pulse's scoring formula (Task 4),
      // which sorts DESCENDING (higher total score = higher priority) — a
      // `?? 0` fallback is safe here (a missing sub-score just contributes
      // nothing), unlike gauntlet_rank's ascending sort where `?? 0` would
      // look like the best possible rank. See feedback memory on
      // sort-direction-dependent fallbacks — checked deliberately, not copied.
      gauntletRank: e.ranks?.gauntletRank ?? Number.MAX_SAFE_INTEGER,
      voyRank: e.ranks?.voyRank ?? Number.MAX_SAFE_INTEGER,
      scores: {
        am_seating: e.ranks?.scores?.am_seating ?? 0,
        quipment: e.ranks?.scores?.quipment ?? 0,
        skill_rarity: e.ranks?.scores?.skill_rarity ?? 0,
        voyage: e.ranks?.scores?.voyage ?? 0,
      },
    },
  }));
}
