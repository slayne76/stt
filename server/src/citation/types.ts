// server/src/citation/types.ts

export interface CitationSkillData {
  rarity: number;
  base_skills: Record<string, { core: number; range_min: number; range_max: number; skill: string }>;
}

export interface CitationRanks {
  gauntletRank: number;
  voyRank: number;
  scores: {
    am_seating: number;
    quipment: number;
    skill_rarity: number;
    voyage: number;
  };
}

export interface CitationCrewEntry {
  symbol: string;
  archetype_id: number;
  name: string;
  short_name: string;
  max_rarity: number;
  in_portal: boolean;
  skill_order: string[];
  skill_data: CitationSkillData[];
  // The fully-fused, level-100 stat block. NOT redundant with skill_data:
  // verified across all 1966 catalog entries (2026-08-16) that skill_data only
  // ever covers rarities 1..max_rarity-1, so this is the sole source of
  // max-rarity stats. The Original Algorithm's entire "what is this crew worth
  // once fully cited" half reads it (upstream optimizer.js:181/209), so it
  // cannot be dropped from the catalog projection.
  base_skills: Record<string, { core: number; range_min: number; range_max: number; skill: string }>;
  collections: string[];
  collection_ids: string[];
  unique_polestar_combos: string[][];
  ranks: CitationRanks;
}

// The fields STT Tracker's own player-cache.json is confirmed to carry on
// every owned-crew instance (verified 2026-08-16 against real data) — a
// deliberately narrow slice, only what the ported algorithms actually read.
export interface RawPlayerCrewInstance {
  id: number;
  symbol: string;
  name: string;
  short_name: string;
  archetype_id: number;
  favorite: boolean;
  level: number;
  in_buy_back_state: boolean;
  rarity: number;
  max_rarity: number;
  // Verified against a real entry in server/data/player-cache.json
  // (2026-08-16): equipment_slots has no `symbol` field, and equipment is
  // [slotIndex, archetypeId] pairs, not a flat array — do not guess these
  // shapes from the datacore model types, which differ slightly.
  equipment_slots: { level: number; archetype: number }[];
  equipment: [number, number][];
  traits: string[];
  traits_hidden: string[];
  base_skills: Record<string, { core: number; range_min: number; range_max: number; skill?: string }>;
}

// The working type both algorithm ports (Tasks 3-4) operate on: an owned
// crew instance enriched with the catalog-only fields it needs but doesn't
// carry itself.
export interface CitationCrew extends RawPlayerCrewInstance {
  in_portal: boolean;
  skill_order: string[];
  skill_data: CitationSkillData[];
  collections: string[];
  collection_ids: string[];
  unique_polestar_combos: string[][];
  ranks: CitationRanks;
}

export function mergeCrewWithCatalog(
  playerCrew: RawPlayerCrewInstance[],
  catalog: CitationCrewEntry[]
): CitationCrew[] {
  const catalogBySymbol = new Map(catalog.map((c) => [c.symbol, c]));
  const merged: CitationCrew[] = [];
  for (const c of playerCrew) {
    const entry = catalogBySymbol.get(c.symbol);
    // No catalog match should not happen in practice (every owned crew's
    // archetype exists in the full catalog) — defensively skip rather than
    // crash, same convention as filterGauntletPriority's gauntletRankMap.has guard.
    if (!entry) continue;
    merged.push({
      ...c,
      in_portal: entry.in_portal,
      skill_order: entry.skill_order,
      skill_data: entry.skill_data,
      collections: entry.collections,
      collection_ids: entry.collection_ids,
      unique_polestar_combos: entry.unique_polestar_combos,
      ranks: entry.ranks,
    });
  }
  return merged;
}
