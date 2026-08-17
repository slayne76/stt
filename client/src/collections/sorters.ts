import type { Collection } from '../types/collection';
import type { CrewMember } from '../types/crew';
import type { OwnedItem } from '../types/item';
import { getCrewTier, type CrewTier } from '../crew/getters';
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

function isRemainingCoveredByTiers(
  collection: Collection,
  qualifyingCrew: CrewMember[],
  items: OwnedItem[],
  tiers: ReadonlySet<CrewTier>
): boolean {
  const remaining = collection.milestone.goal - collection.progress;
  if (remaining <= 0) return false;
  const eligible = qualifyingCrew.filter((crew) => {
    const tier = getCrewTier(crew, items);
    return tier !== null && tiers.has(tier);
  }).length;
  return eligible >= remaining;
}

export function isCollectionUpgradable(collection: Collection, qualifyingCrew: CrewMember[], items: OwnedItem[]): boolean {
  return isRemainingCoveredByTiers(collection, qualifyingCrew, items, new Set(['ready', 'needsWork']));
}

// A stronger signal than isCollectionUpgradable: true only when crew already
// fully immortalize-ready (no combined-with-4/4-Stars help needed) cover the
// remaining progress on their own. Drives the "Upgradable" chip's color
// (green vs blue) on the Collections page — see PROJECT_STATE.md.
export function isCollectionUpgradableByReadyAlone(collection: Collection, qualifyingCrew: CrewMember[], items: OwnedItem[]): boolean {
  return isRemainingCoveredByTiers(collection, qualifyingCrew, items, new Set(['ready']));
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

export function getReadyAloneCollectionIds(
  collections: Collection[],
  qualifyingCrewByCollection: Map<number, CrewMember[]>,
  items: OwnedItem[]
): Set<number> {
  return new Set(
    collections
      .filter((c) => isCollectionUpgradableByReadyAlone(c, qualifyingCrewByCollection.get(c.id) ?? [], items))
      .map((c) => c.id)
  );
}

export function byUpgradableThenCompletionThenNameAsc(upgradableIds: Set<number>): Comparator<Collection> {
  return combineComparators(
    (a, b) => Number(upgradableIds.has(b.id)) - Number(upgradableIds.has(a.id)),
    byCompletionThenNameAsc
  );
}
