import type { CatalogEntry } from '../types/catalogEntry';

export function byDataScoreDesc(a: CatalogEntry, b: CatalogEntry): number {
  return b.data_score - a.data_score;
}

export function byMaxRarityDesc(a: CatalogEntry, b: CatalogEntry): number {
  return b.max_rarity - a.max_rarity;
}

export function byNameAsc(a: CatalogEntry, b: CatalogEntry): number {
  return a.name.localeCompare(b.name);
}
