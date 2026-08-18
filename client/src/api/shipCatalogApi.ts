import type { ShipCatalogEntry } from '../types/shipCatalogEntry';

async function parseShipCatalogResponse(response: Response): Promise<ShipCatalogEntry[]> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error((body as { error?: string }).error ?? `Failed to load ship catalog: HTTP ${response.status}`);
  }
  return response.json() as Promise<ShipCatalogEntry[]>;
}

export async function fetchShipCatalog(): Promise<ShipCatalogEntry[]> {
  const response = await fetch('/api/ship-catalog');
  return parseShipCatalogResponse(response);
}

export async function refreshShipCatalog(): Promise<ShipCatalogEntry[]> {
  const response = await fetch('/api/ship-catalog/refresh', { method: 'POST' });
  return parseShipCatalogResponse(response);
}
