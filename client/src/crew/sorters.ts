import type { CrewMember } from '../types/crew';
import type { Collection } from '../types/collection';
import type { OwnedItem } from '../types/item';
import { getEquipmentSlotsRemaining, getCrewTier, type CrewTier } from './getters';
import { getCollectionCount } from '../collections/getters';

export type Comparator<T> = (a: T, b: T) => number;

export function combineComparators<T>(...comparators: Comparator<T>[]): Comparator<T> {
  return (a, b) => {
    for (const compare of comparators) {
      const result = compare(a, b);
      if (result !== 0) return result;
    }
    return 0;
  };
}

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

export function sortCrew(crew: CrewMember[], comparator: Comparator<CrewMember>): CrewMember[] {
  return [...crew].sort(comparator);
}
