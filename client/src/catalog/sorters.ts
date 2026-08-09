import type { CatalogEntry } from '../types/catalogEntry';

export function byDataScoreDesc(a: CatalogEntry, b: CatalogEntry): number {
  return b.data_score - a.data_score;
}
