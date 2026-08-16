import { UpstreamError } from './errors';

const COLLECTIONS_UPSTREAM_URL = 'https://datacore.app/structured/collections.json';

// A collection milestone, projected down to the only thing any consumer here
// reads. Beta Tachyon Pulse counts a collection as "increased" by citing a
// crew only when some milestone at or after the player's claimable index
// grants stat buffs (`col?.milestones?.slice(i).some(m => !!m.buffs?.length)`,
// betatachyon.ts:487) — i.e. only `buffs.length` is consulted, never the buff
// contents. They are kept as {stat, operator, value} triples rather than a
// bare count so the shape stays recognisably upstream's.
export interface CollectionMilestone {
  buffs: { stat: string; operator: string; value: number }[];
}

export interface CollectionDefinition {
  id: number;
  name: string;
  crew?: string[];
  milestones?: CollectionMilestone[];
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
  const raw = (await response.json()) as {
    id: number;
    name: string;
    crew?: string[];
    milestones?: { buffs?: { stat: string; operator: string; value: number }[] }[];
  }[];
  return raw.map((c) => ({
    id: c.id,
    name: c.name,
    crew: c.crew ?? [],
    milestones: (c.milestones ?? []).map((m) => ({
      buffs: (m.buffs ?? []).map((b) => ({ stat: b.stat, operator: b.operator, value: b.value })),
    })),
  }));
}
