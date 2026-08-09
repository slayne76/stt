import type { PlayerData } from '../types/player';
import type { Collection } from '../types/collection';
import type { CrewMember } from '../types/crew';
import type { OwnedItem } from '../types/item';
import { getCrewTier } from '../crew/getters';

export function getCollectionsList(data: PlayerData): Collection[] {
  const player = data.player as Record<string, unknown> | undefined;
  const character = player?.character as Record<string, unknown> | undefined;
  const collections = character?.cryo_collections;
  return Array.isArray(collections) ? (collections as Collection[]) : [];
}

// The minimal shape crewBelongsToCollection/getCrewCollections actually need —
// CrewMember satisfies this structurally (no call site changes needed), and it's
// what lets CatalogEntry (unowned catalog crew, not a CrewMember) be passed in too,
// for the Missing 4 Stars tables (see catalog/MissingCrewTable.tsx).
export interface CollectionMatchable {
  archetype_id: number;
  traits: string[];
  traits_hidden: string[];
}

export function crewBelongsToCollection(crew: CollectionMatchable, collection: Collection): boolean {
  const crewTraits = new Set([...(crew.traits ?? []), ...(crew.traits_hidden ?? [])]);
  const collectionTraits = collection.traits ?? [];
  const extraCrew = collection.extra_crew ?? [];
  return collectionTraits.some((trait) => crewTraits.has(trait)) || extraCrew.includes(crew.archetype_id);
}

export function getCrewCollections(crew: CollectionMatchable, collections: Collection[]): Collection[] {
  return collections.filter((collection) => crewBelongsToCollection(crew, collection));
}

export function getCollectionCount(crew: CrewMember, collections: Collection[]): number {
  return getCrewCollections(crew, collections).length;
}

export function getCollectionCrew(
  collection: Collection,
  crewList: CrewMember[],
  items: OwnedItem[],
  frozenArchetypeIds: Set<number>
): CrewMember[] {
  return crewList.filter(
    (crew) =>
      crewBelongsToCollection(crew, collection) &&
      getCrewTier(crew, items) !== null &&
      !frozenArchetypeIds.has(crew.archetype_id)
  );
}
