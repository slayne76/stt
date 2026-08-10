import type { CrewMember } from '../types/crew';
import type { Collection } from '../types/collection';
import type { OwnedItem } from '../types/item';
import type { Comparator } from '../lib/comparator';
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
