import type { CatalogEntry } from '../types/catalogEntry';

export function getArchetypeMaxRarityMap(catalog: CatalogEntry[]): Map<number, number> {
  if (!Array.isArray(catalog)) return new Map();
  return new Map(catalog.map((c) => [c.archetype_id, c.max_rarity]));
}

export function getCatalogCount(catalog: CatalogEntry[], maxRarity: number, inPortal?: boolean): number {
  if (!Array.isArray(catalog)) return 0;
  return catalog.filter((c) => c.max_rarity === maxRarity && (inPortal === undefined || c.in_portal === inPortal)).length;
}

export function getMissingCrew(
  catalog: CatalogEntry[],
  ownedArchetypeIds: Set<number>,
  maxRarity: number,
  inPortal: boolean
): CatalogEntry[] {
  if (!Array.isArray(catalog)) return [];
  return catalog.filter(
    (c) => c.max_rarity === maxRarity && c.in_portal === inPortal && !ownedArchetypeIds.has(c.archetype_id)
  );
}

export function getFrozenCrew(
  catalog: CatalogEntry[],
  frozenArchetypeIds: Set<number>,
  maxRarities: number[]
): CatalogEntry[] {
  if (!Array.isArray(catalog)) return [];
  return catalog.filter((c) => maxRarities.includes(c.max_rarity) && frozenArchetypeIds.has(c.archetype_id));
}

export function getUniquelyRetrievableArchetypeIds(catalog: CatalogEntry[]): Set<number> {
  if (!Array.isArray(catalog)) return new Set();
  return new Set(catalog.filter((c) => c.uniquely_retrievable).map((c) => c.archetype_id));
}
