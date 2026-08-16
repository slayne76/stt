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
  base_skills?: CitationCrewEntry['base_skills'];
  traits?: string[];
  obtained?: string;
  collections?: string[];
  collection_ids?: string[];
  unique_polestar_combos?: string[][];
  ranks?: {
    gauntletRank?: number;
    voyRank?: number;
    voyTriplet?: { name: string; rank: number } | null;
    scores?: {
      am_seating?: number;
      quipment?: number;
      skill_rarity?: number;
      voyage?: number;
    };
    // V_<A>_<B> voyage-pair ranks live alongside the named members.
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// Beta Tachyon Pulse enumerates `Object.keys(crew.ranks).filter(k => k.startsWith('V_'))`
// to work out which voyage skill-pairs a crew would improve, so the projection
// has to carry those keys through rather than pick a fixed list. Only numeric
// V_* members are copied (defensive: the upstream ranks object mixes types).
function pickVoyagePairRanks(ranks: Record<string, unknown> | undefined): Record<string, number> {
  const picked: Record<string, number> = {};
  if (!ranks) return picked;
  for (const [key, value] of Object.entries(ranks)) {
    if (key.startsWith('V_') && typeof value === 'number') picked[key] = value;
  }
  return picked;
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
    base_skills: e.base_skills ?? {},
    traits: e.traits ?? [],
    // Upstream's own default for a missing value (prepareOne, crewutils.ts:474).
    obtained: e.obtained ?? 'Unknown',
    collections: e.collections ?? [],
    collection_ids: e.collection_ids ?? [],
    unique_polestar_combos: e.unique_polestar_combos ?? [],
    ranks: {
      ...pickVoyagePairRanks(e.ranks),
      // Nullable rather than defaulted: getVoyageImprovements guards it with
      // `uc.ranks.voyTriplet?.name` / `trip?.length === 3`, so absence is a
      // meaningful state upstream handles, not something to paper over.
      voyTriplet: e.ranks?.voyTriplet ?? null,
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
