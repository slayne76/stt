import type { Collection } from '../types/collection';
import type { CrewMember } from '../types/crew';
import type { OwnedItem } from '../types/item';
import { getCrewTier } from '../crew/getters';
import { byEquipmentSlotsRemainingDesc, byLevelDesc, byMaxRarityDesc, byNameAsc, byTierAsc, sortCrew } from '../crew/sorters';
import { combineComparators, type Comparator } from '../lib/comparator';
import { getCollectionCrew } from './getters';

export function isMaxedOut(collection: Collection): boolean {
  return collection.milestone.goal === 0;
}

const MAXED_OUT_RATIO = -1; // sorts maxed-out collections to the bottom, deliberately — see PROJECT_STATE.md

export function getCollectionCompletionRatio(collection: Collection): number {
  return isMaxedOut(collection) ? MAXED_OUT_RATIO : collection.progress / collection.milestone.goal;
}

export function byCompletionThenNameAsc(a: Collection, b: Collection): number {
  const ratioDiff = getCollectionCompletionRatio(b) - getCollectionCompletionRatio(a);
  if (ratioDiff !== 0) return ratioDiff;
  return a.name.localeCompare(b.name);
}

export function isCollectionUpgradable(collection: Collection, qualifyingCrew: CrewMember[], items: OwnedItem[]): boolean {
  const remaining = collection.milestone.goal - collection.progress;
  if (remaining <= 0) return false;
  const eligible = qualifyingCrew.filter((crew) => {
    const tier = getCrewTier(crew, items);
    return tier === 'ready' || tier === 'needsWork';
  }).length;
  return eligible >= remaining;
}

export function getQualifyingCrewByCollection(
  collections: Collection[],
  crewList: CrewMember[],
  items: OwnedItem[],
  frozenArchetypeIds: Set<number>
): Map<number, CrewMember[]> {
  const result = new Map<number, CrewMember[]>();
  for (const collection of collections) {
    result.set(
      collection.id,
      sortCrew(
        getCollectionCrew(collection, crewList, items, frozenArchetypeIds),
        combineComparators(byTierAsc(items), byMaxRarityDesc, byLevelDesc, byEquipmentSlotsRemainingDesc, byNameAsc)
      )
    );
  }
  return result;
}

export function getUpgradableCollectionIds(
  collections: Collection[],
  qualifyingCrewByCollection: Map<number, CrewMember[]>,
  items: OwnedItem[]
): Set<number> {
  return new Set(
    collections
      .filter((c) => isCollectionUpgradable(c, qualifyingCrewByCollection.get(c.id) ?? [], items))
      .map((c) => c.id)
  );
}

export function byUpgradableThenCompletionThenNameAsc(upgradableIds: Set<number>): Comparator<Collection> {
  return combineComparators(
    (a, b) => Number(upgradableIds.has(b.id)) - Number(upgradableIds.has(a.id)),
    byCompletionThenNameAsc
  );
}
