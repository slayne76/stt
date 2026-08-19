import type { PolestarCatalogEntry } from '../types/polestarCatalogEntry';

async function parsePolestarCatalogResponse(response: Response): Promise<PolestarCatalogEntry[]> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error((body as { error?: string }).error ?? `Failed to load polestar catalog: HTTP ${response.status}`);
  }
  return response.json() as Promise<PolestarCatalogEntry[]>;
}

export async function fetchPolestarCatalog(): Promise<PolestarCatalogEntry[]> {
  const response = await fetch('/api/polestar-catalog');
  return parsePolestarCatalogResponse(response);
}

export async function refreshPolestarCatalog(): Promise<PolestarCatalogEntry[]> {
  const response = await fetch('/api/polestar-catalog/refresh', { method: 'POST' });
  return parsePolestarCatalogResponse(response);
}
