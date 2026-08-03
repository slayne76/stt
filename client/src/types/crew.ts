export interface CrewMember {
  id: number;
  symbol: string;
  name: string;
  short_name: string;
  rarity: number;
  max_rarity: number;
  level: number;
  equipment: [number, number][];
  equipment_slots: { level: number; archetype: number }[];
}
