import type { Ship } from '../types/ship';
import { isShipMaxed } from './getters';

export function filterIncompleteShipsByRarity(ships: Ship[], rarity: number): Ship[] {
  return ships.filter((s) => s.rarity === rarity && !isShipMaxed(s));
}
