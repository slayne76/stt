import type { CrewMember } from '../types/crew';
import type { OwnedItem } from '../types/item';
import { getQPLevel, isImmortalized, isReadyToImmortalize, QP_MAX_LEVEL } from './getters';

export function filterByRarity(
  crew: CrewMember[],
  { rarity, maxRarity }: { rarity: number; maxRarity: number }
): CrewMember[] {
  return crew.filter((c) => c.rarity === rarity && c.max_rarity === maxRarity);
}

export function filterReadyToImmortalize(crew: CrewMember[], items: OwnedItem[]): CrewMember[] {
  return crew.filter((c) => isReadyToImmortalize(c, items));
}

export function filterNeedsWork(crew: CrewMember[], items: OwnedItem[]): CrewMember[] {
  return crew.filter((c) => !isImmortalized(c) && !isReadyToImmortalize(c, items));
}

// Excludes buyback-state (already trashed in-game) crew here only —
// every other consumer (Collections, QP, Overview, tier pages) counts them normally.
export function filterFrozenDuplicates(crew: CrewMember[], frozenArchetypeIds: Set<number>, maxRarity: number): CrewMember[] {
  return crew.filter((c) => frozenArchetypeIds.has(c.archetype_id) && c.max_rarity === maxRarity && !c.in_buy_back_state);
}

export function filterQPEligible(crew: CrewMember[]): CrewMember[] {
  return crew.filter((c) => isImmortalized(c) && getQPLevel(c) < QP_MAX_LEVEL);
}

export function filterUnmaxed(crew: CrewMember[], maxRarity: number): CrewMember[] {
  return crew.filter((c) => c.max_rarity === maxRarity && !isImmortalized(c));
}
