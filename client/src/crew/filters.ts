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

export function filterQPEligible(crew: CrewMember[]): CrewMember[] {
  return crew.filter((c) => isImmortalized(c) && getQPLevel(c) < QP_MAX_LEVEL);
}

export function filterUnmaxed(crew: CrewMember[], maxRarity: number): CrewMember[] {
  return crew.filter((c) => c.max_rarity === maxRarity && !isImmortalized(c));
}

export function filterMissingFavorite(crew: CrewMember[]): CrewMember[] {
  return crew.filter((c) => !c.favorite && !c.in_buy_back_state);
}
