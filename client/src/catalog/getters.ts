import type { CatalogEntry } from '../types/catalogEntry';

export function getArchetypeMaxRarityMap(catalog: CatalogEntry[]): Map<number, number> {
  return new Map(catalog.map((c) => [c.archetype_id, c.max_rarity]));
}

export function getCatalogCount(catalog: CatalogEntry[], maxRarity: number, inPortal?: boolean): number {
  return catalog.filter((c) => c.max_rarity === maxRarity && (inPortal === undefined || c.in_portal === inPortal)).length;
}
