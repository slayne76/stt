import { UpstreamError } from './errors';

const ITEMS_UPSTREAM_URL = 'https://datacore.app/structured/items.json';

export interface ItemEntry {
  id: number;
  symbol: string;
  name: string;
  rarity: number;
  type: number;
  short_name?: string;
  recipe?: { incomplete: boolean; craftCost: number; list: { symbol: string; count: number; factionOnly: boolean }[] };
  bonuses?: Record<string, number>;
  kwipment?: boolean | number;
  max_rarity_requirement?: number;
  traits_requirement?: string[];
  traits_requirement_operator?: 'and' | 'or';
}

export async function fetchItems(): Promise<ItemEntry[]> {
  let response: Response;
  try {
    response = await fetch(ITEMS_UPSTREAM_URL, { signal: AbortSignal.timeout(30_000) });
  } catch (cause) {
    throw new UpstreamError(`Network error fetching items: ${(cause as Error).message}`);
  }
  if (!response.ok) {
    throw new UpstreamError(`Items host returned HTTP ${response.status}`);
  }
  return (await response.json()) as ItemEntry[];
}
