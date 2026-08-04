import type { Ship } from '../types/ship';
import type { OwnedItem } from '../types/item';
import type { Comparator } from '../crew/sorters';
import { getShipSchematicsOwned } from './getters';

export function byLevelDesc(a: Ship, b: Ship): number {
  return b.level - a.level;
}

export function byLevelProgressDesc(a: Ship, b: Ship): number {
  return b.level / b.max_level - a.level / a.max_level;
}

export function byMissingSchematicsAsc(items: OwnedItem[]): Comparator<Ship> {
  return (a, b) => {
    const remainingA = a.schematic_gain_cost_next_level - getShipSchematicsOwned(a, items);
    const remainingB = b.schematic_gain_cost_next_level - getShipSchematicsOwned(b, items);
    return remainingA - remainingB;
  };
}

export function byNameAsc(a: Ship, b: Ship): number {
  return a.name.localeCompare(b.name);
}

export function sortShips(ships: Ship[], comparator: Comparator<Ship>): Ship[] {
  return [...ships].sort(comparator);
}
