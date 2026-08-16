import type { CrewMember } from '../types/crew';
import type { Collection } from '../types/collection';
import type { OwnedItem } from '../types/item';
import { combineComparators, type Comparator } from '../lib/comparator';
import { getEquipmentSlotsRemaining, getCrewTier, getQPLevel, getQPPointsNeeded, type CrewTier } from './getters';
import { getCollectionCount } from '../collections/getters';

export function byLevelDesc(a: CrewMember, b: CrewMember): number {
  return b.level - a.level;
}

export function byEquipmentSlotsRemainingDesc(a: CrewMember, b: CrewMember): number {
  return getEquipmentSlotsRemaining(b) - getEquipmentSlotsRemaining(a);
}

export function byCollectionCountDesc(collections: Collection[]): Comparator<CrewMember> {
  return (a, b) => getCollectionCount(b, collections) - getCollectionCount(a, collections);
}

const TIER_ORDER: Record<CrewTier, number> = { ready: 0, needsWork: 1, leveling: 2 };

export function byTierAsc(items: OwnedItem[]): Comparator<CrewMember> {
  return (a, b) => TIER_ORDER[getCrewTier(a, items)!] - TIER_ORDER[getCrewTier(b, items)!];
}

export function byMaxRarityDesc(a: CrewMember, b: CrewMember): number {
  return b.max_rarity - a.max_rarity;
}

export function byNameAsc(a: CrewMember, b: CrewMember): number {
  return a.name.localeCompare(b.name);
}

export function byRarityDesc(a: CrewMember, b: CrewMember): number {
  return b.rarity - a.rarity;
}

export function defaultCrewComparator(collections: Collection[]): Comparator<CrewMember> {
  return combineComparators(byLevelDesc, byEquipmentSlotsRemainingDesc, byCollectionCountDesc(collections), byNameAsc);
}

export function sortCrew(crew: CrewMember[], comparator: Comparator<CrewMember>): CrewMember[] {
  return [...crew].sort(comparator);
}

// These three comparators assume they're only ever called on crew already
// filtered by filterQPEligible (QL < QP_MAX_LEVEL) — an unfiltered QL4
// crew's high q_bits would sort byQPBitsDesc to the top, and
// getQPPointsNeeded/getQPRoundsLeft would render 0 in QPsTable. True
// today only because QPsPage always filters first, not enforced here.
export function byQPOnHoldAsc(a: CrewMember, b: CrewMember): number {
  const aOnHold = getQPPointsNeeded(a) <= 25 ? 1 : 0;
  const bOnHold = getQPPointsNeeded(b) <= 25 ? 1 : 0;
  return aOnHold - bOnHold;
}

export function byQPLevelDesc(a: CrewMember, b: CrewMember): number {
  return getQPLevel(b) - getQPLevel(a);
}

export function byQPBitsDesc(a: CrewMember, b: CrewMember): number {
  return b.q_bits - a.q_bits;
}

// Safe to use `!` here because this comparator is only ever called on crew
// already filtered by filterGauntletPriority, which guarantees every crew
// passed in has a gauntletRankMap entry.
export function byGauntletRankAsc(gauntletRankMap: Map<number, number>): Comparator<CrewMember> {
  return (a, b) => gauntletRankMap.get(a.archetype_id)! - gauntletRankMap.get(b.archetype_id)!;
}

// Unlike byGauntletRankAsc (which safely uses `!` because
// filterGauntletPriority guarantees a map hit for every crew passed in),
// this uses `?? 0` defensively — data_score sorts descending, so a
// missing value sinks to the bottom rather than looking best (the
// opposite of the gauntlet_rank lesson, where `?? 0` on an ascending
// sort would have looked best). In practice this fallback is never
// exercised: filterDataScorePriority's dataScoreMap.has() guard already
// filters out any crew without a map entry before this comparator ever
// runs. A trailing byNameAsc tiebreak gives deterministic output when
// two crew share a DataScore, which — unlike gauntlet_rank, confirmed
// unique — is plausible for this field.
export function byDataScoreDesc(dataScoreMap: Map<number, number>): Comparator<CrewMember> {
  return combineComparators(
    (a, b) => (dataScoreMap.get(b.archetype_id) ?? 0) - (dataScoreMap.get(a.archetype_id) ?? 0),
    byNameAsc
  );
}
