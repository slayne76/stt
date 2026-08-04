import type { PlayerData } from '../types/player';
import type { Ship } from '../types/ship';
import type { OwnedItem } from '../types/item';

export function getShipList(data: PlayerData): Ship[] {
  const player = data.player as Record<string, unknown> | undefined;
  const character = player?.character as Record<string, unknown> | undefined;
  const ships = character?.ships;
  return Array.isArray(ships) ? (ships as Ship[]) : [];
}

export function isShipMaxed(ship: Ship): boolean {
  return ship.level === ship.max_level;
}

export function getShipSchematicsOwned(ship: Ship, items: OwnedItem[]): number {
  return items.find((item) => item.archetype_id === ship.schematic_id)?.quantity ?? 0;
}

export function getShipDisplayLevel(ship: Ship): string {
  return `${ship.level + 1}/${ship.max_level + 1}`;
}

export function getShipSchematicsDisplay(ship: Ship, items: OwnedItem[]): string {
  return `${getShipSchematicsOwned(ship, items)}/${ship.schematic_gain_cost_next_level}`;
}

export function getShipSchematicsProgress(ship: Ship, items: OwnedItem[]): number {
  const needed = ship.schematic_gain_cost_next_level;
  if (needed <= 0) return 100;
  return Math.min(100, (getShipSchematicsOwned(ship, items) / needed) * 100);
}
