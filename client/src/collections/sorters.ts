import type { Collection } from '../types/collection';

export function getCollectionCompletionRatio(collection: Collection): number {
  return collection.milestone.goal === 0 ? -1 : collection.progress / collection.milestone.goal;
}

export function byCompletionThenNameAsc(a: Collection, b: Collection): number {
  const ratioDiff = getCollectionCompletionRatio(b) - getCollectionCompletionRatio(a);
  if (ratioDiff !== 0) return ratioDiff;
  return a.name.localeCompare(b.name);
}
