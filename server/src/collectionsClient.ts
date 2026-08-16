import { UpstreamError } from './errors';

const COLLECTIONS_UPSTREAM_URL = 'https://datacore.app/structured/collections.json';

export interface CollectionDefinition {
  id: number;
  name: string;
  crew?: string[];
}

export async function fetchCollections(): Promise<CollectionDefinition[]> {
  let response: Response;
  try {
    response = await fetch(COLLECTIONS_UPSTREAM_URL, { signal: AbortSignal.timeout(30_000) });
  } catch (cause) {
    throw new UpstreamError(`Network error fetching collections: ${(cause as Error).message}`);
  }
  if (!response.ok) {
    throw new UpstreamError(`Collections host returned HTTP ${response.status}`);
  }
  const raw = (await response.json()) as { id: number; name: string; crew?: string[] }[];
  return raw.map((c) => ({ id: c.id, name: c.name, crew: c.crew ?? [] }));
}
