import { UpstreamError } from './errors';

const CATALOG_UPSTREAM_URL = 'https://datacore.app/structured/crew.json';

export interface CatalogEntry {
  archetype_id: number;
  max_rarity: number;
  in_portal: boolean;
}

interface RawCatalogEntry {
  archetype_id: number;
  max_rarity: number;
  in_portal: boolean;
  [key: string]: unknown;
}

export async function fetchCrewCatalog(): Promise<CatalogEntry[]> {
  let response: Response;
  try {
    response = await fetch(CATALOG_UPSTREAM_URL);
  } catch (cause) {
    throw new UpstreamError(`Network error fetching crew catalog: ${(cause as Error).message}`);
  }

  if (!response.ok) {
    throw new UpstreamError(`Crew catalog host returned HTTP ${response.status}`);
  }

  const raw = (await response.json()) as RawCatalogEntry[];
  return raw.map((e) => ({
    archetype_id: e.archetype_id,
    max_rarity: e.max_rarity,
    in_portal: e.in_portal,
  }));
}
