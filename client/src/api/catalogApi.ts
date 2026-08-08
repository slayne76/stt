import type { CatalogEntry } from '../types/catalogEntry';

async function parseCatalogResponse(response: Response): Promise<CatalogEntry[]> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error((body as { error?: string }).error ?? `Failed to load crew catalog: HTTP ${response.status}`);
  }
  return response.json() as Promise<CatalogEntry[]>;
}

export async function fetchCrewCatalog(): Promise<CatalogEntry[]> {
  const response = await fetch('/api/crew-catalog');
  return parseCatalogResponse(response);
}

export async function refreshCrewCatalog(): Promise<CatalogEntry[]> {
  const response = await fetch('/api/crew-catalog/refresh', { method: 'POST' });
  return parseCatalogResponse(response);
}
