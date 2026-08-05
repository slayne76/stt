import type { DatacoreAsset } from './asset';

export interface Ship {
  id: number;
  symbol: string;
  name: string;
  rarity: number;
  level: number;
  max_level: number;
  schematic_id: number;
  schematic_gain_cost_next_level: number;
  icon?: DatacoreAsset;
}
