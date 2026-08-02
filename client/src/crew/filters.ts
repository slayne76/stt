import type { CrewMember } from '../types/crew';

export function filterByRarity(
  crew: CrewMember[],
  { rarity, maxRarity }: { rarity: number; maxRarity: number }
): CrewMember[] {
  return crew.filter((c) => c.rarity === rarity && c.max_rarity === maxRarity);
}
