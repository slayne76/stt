import type { CatalogEntry } from '../types/catalogEntry';

export function getArchetypeMaxRarityMap(catalog: CatalogEntry[]): Map<number, number> {
  if (!Array.isArray(catalog)) return new Map();
  return new Map(catalog.map((c) => [c.archetype_id, c.max_rarity]));
}

export function getCatalogCount(catalog: CatalogEntry[], maxRarity: number, inPortal?: boolean): number {
  if (!Array.isArray(catalog)) return 0;
  return catalog.filter((c) => c.max_rarity === maxRarity && (inPortal === undefined || c.in_portal === inPortal)).length;
}
