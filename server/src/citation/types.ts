// server/src/citation/types.ts

export interface CitationSkillData {
  rarity: number;
  base_skills: Record<string, { core: number; range_min: number; range_max: number; skill: string }>;
}

export interface CitationRanks {
  gauntletRank: number;
  voyRank: number;
  // Beta Tachyon Pulse's getVoyageImprovements (betatachyon.ts:66-100) reads
  // `crew.ranks.voyTriplet` AND enumerates every key on this object matching
  // /^V_/ (`Object.keys(uc.ranks).filter(f => f.startsWith("V_"))`) — the
  // per-skill-pair voyage ranks, e.g. V_CMD_SCI. Both feed `voyagesImproved`,
  // which drives two weighted terms of the final score (`improved` = 1 and
  // `groupSparsity` = 2 out of a ~14-term sum), so they are load-bearing, not
  // decoration.
  //
  // Both parts of this shape VARY per entry — measured 2026-08-16 across all
  // 1966 entries of the real https://datacore.app/structured/crew.json:
  //   - `voyTriplet` is absent on 341 of 1966 entries (present on 1625), hence
  //     optional/nullable here. Read with optional chaining, never assumed.
  //   - the V_* key count is 5, 9 or 12 depending on how many skills the crew
  //     has (distribution: 5 keys x23, 9 keys x318, 12 keys x1625) — never a
  //     fixed count, hence the dynamic `startsWith("V_")` filter rather than a
  //     hardcoded key list.
  voyTriplet?: { name: string; rank: number } | null;
  scores: {
    am_seating: number;
    quipment: number;
    skill_rarity: number;
    voyage: number;
  };
  // The V_* voyage-pair ranks above are carried verbatim as extra members.
  [key: string]: unknown;
}

// A single entry of `player.character.cryo_collections` in STT Tracker's own
// player-cache.json (verified 2026-08-16: 88 entries, both fields present).
// Beta Tachyon Pulse reads exactly these two fields when computing each
// crew's `collectionsIncreased` (betatachyon.ts:475-496).
export interface PlayerCryoCollection {
  type_id: number;
  claimable_milestone_index?: number;
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
  // Catalog-level (archetype) traits. Needed by Beta Tachyon Pulse in TWO
  // distinct places, so this is not redundant with RawPlayerCrewInstance.traits:
  //   1. findPolestars(crew, allCrew) is passed the whole CATALOG as its
  //      roster and reads `rc.traits` on every entry (btpUtils.ts:142) —
  //      unowned crew are never in the player roster, so this is the only
  //      source. It drives the `retrieval` term (weight 3).
  //   2. Upstream's roster entries are built from the catalog template, so
  //      their `traits` are the archetype's, not the instance's.
  // Verified 2026-08-16: all 1966 crew.json entries carry `traits`.
  traits: string[];
  // How the crew can be acquired ("Voyage", "Gauntlet", "Pack/Giveaway", ...).
  // Beta Tachyon Pulse's isNever() (betatachyon.ts:103-106) reads it to decide
  // whether a crew is permanently unobtainable-by-portal, worth the single
  // largest tier weight in the formula (`never` = 3). Upstream defaults a
  // missing value to the literal string "Unknown" (prepareOne, crewutils.ts:474)
  // — reproduced in the projection, including the fact that "Unknown" then
  // fails every lowercase substring test in isNever().
  obtained: string;
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
  // The game's OWN buffed stat block for this instance (present on every entry
  // in a real player file; absent on crew synthesized from stored_immortals,
  // which have no player instance). Not redundant with base_skills: it is the
  // authoritative buffed value, and it is the only place quipment bonuses
  // appear. datacore's prepareOne (crewutils.ts:628-643) prefers it over
  // recomputing buffs, falling back to applyCrewBuffs only when it is missing —
  // which is exactly the frozen-crew case. Recomputing instead is not
  // equivalent: measured on the real player file (2026-08-16), 362 of 1727
  // owned skill entries differ, 356 by a 1-point rounding edge on sub-level-100
  // crew and 6 by hundreds of points on quipped crew.
  skills?: Record<string, { core: number; range_min: number; range_max: number; skill?: string }>;
}

// The working type both algorithm ports (Tasks 3-4) operate on: an owned
// crew instance enriched with the catalog-only fields it needs but doesn't
// carry itself.
export interface CitationCrew extends RawPlayerCrewInstance {
  in_portal: boolean;
  obtained: string;
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
      // Upstream builds each roster entry from the CATALOG template and then
      // overwrites only a fixed list of player-instance fields; `traits` is
      // not on that list (prepareOne, crewutils.ts:457-660), so upstream
      // roster crew carry the archetype's traits. Mirrored here. For active
      // crew this is a no-op (verified 2026-08-16: all 599 owned instances'
      // `traits` are set-equal to their catalog entry's). For crew synthesized
      // from `stored_immortals`, which have no player instance and therefore
      // no traits of their own, it is the only source.
      traits: entry.traits,
      in_portal: entry.in_portal,
      obtained: entry.obtained,
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
