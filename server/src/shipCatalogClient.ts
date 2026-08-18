import { UpstreamError } from './errors';

const SHIP_CATALOG_UPSTREAM_URL = 'https://datacore.app/structured/ship_schematics.json';

export interface ShipCatalogEntry {
  archetype_id: number;
  name: string;
  icon: { file: string };
  rarity: number;
}

interface RawShipSchematicEntry {
  id: number;
  ship?: {
    archetype_id: number;
    name: string;
    icon?: { file: string };
    rarity: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export async function fetchShipCatalog(): Promise<ShipCatalogEntry[]> {
  let response: Response;
  try {
    response = await fetch(SHIP_CATALOG_UPSTREAM_URL, { signal: AbortSignal.timeout(30_000) });
  } catch (cause) {
    throw new UpstreamError(`Network error fetching ship catalog: ${(cause as Error).message}`);
  }

  if (!response.ok) {
    throw new UpstreamError(`Ship catalog host returned HTTP ${response.status}`);
  }

  const raw = (await response.json()) as RawShipSchematicEntry[];
  return raw
    .filter((e): e is RawShipSchematicEntry & {
      ship: NonNullable<RawShipSchematicEntry['ship']> & { icon: { file: string } };
    } =>
      e.ship !== undefined && e.ship.icon !== undefined
    )
    .map((e) => ({
      archetype_id: e.ship.archetype_id,
      name: e.ship.name,
      icon: { file: e.ship.icon.file },
      rarity: e.ship.rarity,
    }));
}
