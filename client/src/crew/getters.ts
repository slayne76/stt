import type { PlayerData } from '../types/player';
import type { CrewMember } from '../types/crew';
import type { OwnedItem } from '../types/item';

export function getCrewList(data: PlayerData): CrewMember[] {
  const player = data.player as Record<string, unknown> | undefined;
  const character = player?.character as Record<string, unknown> | undefined;
  const crew = character?.crew;
  return Array.isArray(crew) ? (crew as CrewMember[]) : [];
}

export function getEquipmentSlotsRemaining(crew: CrewMember): number {
  return (crew.equipment?.length ?? 0) - 4;
}

export function getOwnedItems(data: PlayerData): OwnedItem[] {
  const player = data.player as Record<string, unknown> | undefined;
  const character = player?.character as Record<string, unknown> | undefined;
  const items = character?.items;
  return Array.isArray(items) ? (items as OwnedItem[]) : [];
}

export function getMissingEquipmentArchetypeIds(crew: CrewMember): number[] {
  const filledSlots = new Set(crew.equipment.map(([slot]) => slot));
  const missingIndices = [0, 1, 2, 3].filter((i) => !filledSlots.has(i));
  const slots = crew.equipment_slots ?? [];
  return missingIndices.map((i) => slots[i]?.archetype ?? -1);
}

export function areAllMissingItemsOwned(crew: CrewMember, items: OwnedItem[]): boolean {
  const missingArchetypeIds = getMissingEquipmentArchetypeIds(crew);
  return missingArchetypeIds.every((archetypeId) => items.some((item) => item.archetype_id === archetypeId));
}

export function isImmortalized(crew: CrewMember): boolean {
  return crew.rarity === crew.max_rarity && crew.level === 100 && crew.equipment.length === 4;
}

export function isReadyToImmortalize(crew: CrewMember, items: OwnedItem[]): boolean {
  return (
    crew.rarity === crew.max_rarity &&
    crew.level === 100 &&
    getEquipmentSlotsRemaining(crew) < 0 &&
    areAllMissingItemsOwned(crew, items)
  );
}

export type CrewTier = 'ready' | 'needsWork' | 'leveling';

export function getCrewTier(crew: CrewMember, items: OwnedItem[]): CrewTier | null {
  if (isImmortalized(crew)) return null;
  if (crew.rarity < crew.max_rarity - 1) return null;
  if (crew.rarity === crew.max_rarity - 1) return 'leveling';
  return isReadyToImmortalize(crew, items) ? 'ready' : 'needsWork';
}
