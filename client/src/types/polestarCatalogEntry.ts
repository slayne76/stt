export interface PolestarCatalogEntry {
  id: number;
  name: string;
  short_name: string;
  icon: { file: string };
  rarity: number;
  filter:
    | { type: 'rarity'; rarity: number }
    | { type: 'trait'; trait: string }
    | { type: 'skill'; skill: string };
}
