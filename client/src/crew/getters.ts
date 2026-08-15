import type { PlayerData } from '../types/player';
import type { CrewMember } from '../types/crew';
import type { OwnedItem } from '../types/item';
import type { StoredImmortal } from '../types/storedImmortal';
import { SKILL_ABBREVIATIONS } from './skillLabels';

export function getCrewList(data: PlayerData): CrewMember[] {
  const player = data.player as Record<string, unknown> | undefined;
  const character = player?.character as Record<string, unknown> | undefined;
  const crew = character?.crew;
  return Array.isArray(crew) ? (crew as CrewMember[]) : [];
}

const ALL_SLOT_INDICES = [0, 1, 2, 3];

export function getFilledSlotIndices(crew: CrewMember): Set<number> {
  return new Set(crew.equipment.map(([slot]) => slot));
}

export function getMissingSlotIndices(crew: CrewMember): number[] {
  const filledSlots = getFilledSlotIndices(crew);
  return ALL_SLOT_INDICES.filter((i) => !filledSlots.has(i));
}

export function getEquipmentSlotsRemaining(crew: CrewMember): number {
  return -getMissingSlotIndices(crew).length;
}

export function getOwnedItems(data: PlayerData): OwnedItem[] {
  const player = data.player as Record<string, unknown> | undefined;
  const character = player?.character as Record<string, unknown> | undefined;
  const items = character?.items;
  return Array.isArray(items) ? (items as OwnedItem[]) : [];
}

export function getMissingEquipmentArchetypeIds(crew: CrewMember): number[] {
  const missingIndices = getMissingSlotIndices(crew);
  const slots = crew.equipment_slots ?? [];
  return missingIndices.map((i) => slots[i]?.archetype ?? -1);
}

export function areAllMissingItemsOwned(crew: CrewMember, items: OwnedItem[]): boolean {
  const missingArchetypeIds = getMissingEquipmentArchetypeIds(crew);
  return missingArchetypeIds.every((archetypeId) => items.some((item) => item.archetype_id === archetypeId));
}

export function isImmortalized(crew: CrewMember): boolean {
  return crew.rarity === crew.max_rarity && crew.level === 100 && getMissingSlotIndices(crew).length === 0;
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

export function getFrozenCrewArchetypeIds(data: PlayerData): Set<number> {
  const player = data.player as Record<string, unknown> | undefined;
  const character = player?.character as Record<string, unknown> | undefined;
  const storedImmortals = character?.stored_immortals;
  const list = Array.isArray(storedImmortals) ? (storedImmortals as StoredImmortal[]) : [];
  return new Set(list.map((s) => s.id));
}

// Cumulative q_bits to REACH QL1/2/3/4. Confirmed rarity-independent
// directly by the player (2026-08-07) — the same thresholds apply
// whether the crew's max_rarity is 4 or 5, even though every
// immortalized crew in this app's verification data happened to be 5★.
const QP_LEVEL_THRESHOLDS = [100, 200, 500, 1300];

export const QP_MAX_LEVEL = QP_LEVEL_THRESHOLDS.length;

export function getQPLevel(crew: CrewMember): number {
  for (let i = 0; i < QP_LEVEL_THRESHOLDS.length; i++) {
    if (crew.q_bits < QP_LEVEL_THRESHOLDS[i]) return i;
  }
  return QP_LEVEL_THRESHOLDS.length;
}

function getQPLevelThreshold(crew: CrewMember): number {
  const level = getQPLevel(crew);
  return QP_LEVEL_THRESHOLDS[level] ?? QP_LEVEL_THRESHOLDS[QP_LEVEL_THRESHOLDS.length - 1];
}

export function getQPProgressDisplay(crew: CrewMember): string {
  return `${crew.q_bits}/${getQPLevelThreshold(crew)}`;
}

export function getQPPointsNeeded(crew: CrewMember): number {
  if (getQPLevel(crew) >= QP_LEVEL_THRESHOLDS.length) return 0;
  return getQPLevelThreshold(crew) - crew.q_bits;
}

export function getQPRoundsLeft(crew: CrewMember): number {
  return Math.ceil(getQPPointsNeeded(crew) / 25);
}

// "Ever obtained at all": counts an archetype as owned if an active-roster
// copy exists at ANY completion state, or a frozen copy exists. This is
// deliberately looser than the isImmortalized-gated set getCollectionCrew
// uses for collection-progress calculations — do not substitute one for the other.
export function getOwnedArchetypeIds(
  crewList: CrewMember[],
  frozenArchetypeIds: Set<number>,
  catalogMaxRarityById: Map<number, number>,
  maxRarity: number
): Set<number> {
  const owned = new Set<number>();
  for (const c of crewList) {
    if (c.max_rarity === maxRarity) owned.add(c.archetype_id);
  }
  for (const archetypeId of frozenArchetypeIds) {
    if (catalogMaxRarityById.get(archetypeId) === maxRarity) owned.add(archetypeId);
  }
  return owned;
}

export function getTopSkillAbbreviations(crew: CrewMember): string {
  const entries = Object.entries(crew.skills)
    .map(([key, value]) => ({
      skillKey: key.replace(/_skill$/, ''),
      core: value.core,
    }))
    .filter((entry) => entry.skillKey in SKILL_ABBREVIATIONS);

  entries.sort(
    (a, b) =>
      b.core - a.core ||
      SKILL_ABBREVIATIONS[a.skillKey].localeCompare(SKILL_ABBREVIATIONS[b.skillKey])
  );

  return entries
    .slice(0, 2)
    .map((entry) => SKILL_ABBREVIATIONS[entry.skillKey])
    .join('/');
}
