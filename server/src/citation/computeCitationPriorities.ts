// server/src/citation/computeCitationPriorities.ts
//
// Orchestrator that ties together Tasks 1-4: reads player data, assembles the
// candidate roster (including synthesizing frozen/vaulted crew from
// stored_immortals), runs both ported citation-priority algorithms, and
// returns the ranked id lists that GET /api/citation-priorities serves.
//
// See task-5-brief.md's two plan amendments for why frozen crew must be
// folded into the roster here (not inside either algorithm port) and why a
// response-level cache keyed on player-cache.json's mtime is required (both
// algorithms together take ~15-20s on the real roster).

import { existsSync, statSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { readPlayerCache } from '../cache';
import { fetchCitationCrewData } from '../citationCrewClient';
import { readCitationCrewCache, writeCitationCrewCache, isCitationCrewCacheFresh } from '../citationCrewCache';
import { fetchItems } from '../itemsClient';
import { readItemsCache, writeItemsCache, isItemsCacheFresh } from '../itemsCache';
import { fetchCollections } from '../collectionsClient';
import { readCollectionsCache, writeCollectionsCache, isCollectionsCacheFresh } from '../collectionsCache';
import { mergeCrewWithCatalog, type RawPlayerCrewInstance, type CitationCrewEntry, type PlayerCryoCollection } from './types';
import { calculateBuffConfig } from './buffConfig';
import { citeOriginalAlgorithm } from './originalAlgorithm';
import { citeBetaTachyon } from './betaTachyonPulse';

export interface CitationPrioritiesResponse {
  originalAlgorithm: number[];
  betaTachyon: number[];
}

const RESPONSE_CAP = 100;
const PLAYER_CACHE_PATH = 'data/player-cache.json'; // matches server/src/cache.ts's own CACHE_PATH
const RESPONSE_CACHE_PATH = 'data/citation-priorities-response-cache.json';

interface StoredImmortal {
  id: number; // this IS the archetype_id, not a player-crew instance id — confirmed against real player-cache.json
  quantity: number;
  qbits: number;
}

// Synthesizes one RawPlayerCrewInstance per archetype in stored_immortals, at
// level 100 / max rarity / 4 filled equipment slots — the exact state
// upstream's dedicated frozen-crew branch assumes. Exactly one entry per
// archetype regardless of `quantity`, matching upstream exactly (Task 4
// caught an earlier draft of this function that wrongly looped per-copy —
// inert today since every real stored_immortals entry has quantity === 1,
// but a real faithfulness bug had that stayed true by accident). Uses
// negative, archetype-derived synthetic ids that can never collide with a
// real active crew's `id` — safe because frozen crew are always
// `rarity === max_rarity`, so both algorithms' own `rarity !== max_rarity`
// output filters guarantee these synthetic ids never reach
// `CitationPrioritiesResponse`.
function synthesizeFrozenCrew(stored: StoredImmortal[], catalog: CitationCrewEntry[]): RawPlayerCrewInstance[] {
  const catalogByArchetype = new Map(catalog.map((c) => [c.archetype_id, c]));
  const synthesized: RawPlayerCrewInstance[] = [];
  for (const frozen of stored) {
    const entry = catalogByArchetype.get(frozen.id);
    if (!entry) continue; // no catalog match — defensively skip, same convention as mergeCrewWithCatalog
    synthesized.push({
      id: -1 * frozen.id,
      symbol: entry.symbol,
      name: entry.name,
      short_name: entry.short_name,
      archetype_id: entry.archetype_id,
      favorite: false,
      level: 100,
      in_buy_back_state: false,
      rarity: entry.max_rarity,
      max_rarity: entry.max_rarity,
      equipment_slots: [0, 1, 2, 3].map((level) => ({ level, archetype: 0 })),
      equipment: [0, 1, 2, 3].map((i): [number, number] => [i, 0]),
      // Overwritten with catalog traits by mergeCrewWithCatalog regardless
      // (Task 4's fix — see types.ts) — this placeholder is never actually read.
      traits: [],
      traits_hidden: [],
      base_skills: entry.base_skills,
      // No `skills` — frozen crew have no player instance, so citeBetaTachyon
      // falls back to recomputing buffs for these, matching upstream (see
      // RawPlayerCrewInstance.skills's doc comment in types.ts).
    });
  }
  return synthesized;
}

async function getFreshCitationCrewData() {
  const cached = readCitationCrewCache();
  if (cached !== null && isCitationCrewCacheFresh()) return cached;
  const data = await fetchCitationCrewData();
  writeCitationCrewCache(data);
  return data;
}

async function getFreshItems() {
  const cached = readItemsCache();
  if (cached !== null && isItemsCacheFresh()) return cached;
  const data = await fetchItems();
  writeItemsCache(data);
  return data;
}

async function getFreshCollections() {
  const cached = readCollectionsCache();
  if (cached !== null && isCollectionsCacheFresh()) return cached;
  const data = await fetchCollections();
  writeCollectionsCache(data);
  return data;
}

interface ResponseCacheFile {
  playerCacheMtimeMs: number;
  response: CitationPrioritiesResponse;
}

// Both algorithms together take upwards of ~15-20s on the real roster
// (Beta Tachyon Pulse ~6.5s, Original Algorithm up to ~12s, both measured
// during Tasks 3-4 against the real 1312-crew frozen-inclusive roster) — far
// too slow to recompute on every request, which the design originally called
// for before that cost was measured. This cache is keyed on player-cache.json's
// own mtime: a cached response is only ever served if it was computed from
// the exact player data currently on disk, so freshness is preserved exactly
// (never serves a result computed from stale player data) while repeated
// requests against unchanged data are instant.
function readResponseCacheIfCurrent(playerCacheMtimeMs: number): CitationPrioritiesResponse | null {
  if (!existsSync(RESPONSE_CACHE_PATH)) return null;
  try {
    const parsed = JSON.parse(readFileSync(RESPONSE_CACHE_PATH, 'utf-8')) as ResponseCacheFile;
    if (parsed.playerCacheMtimeMs !== playerCacheMtimeMs) return null;
    return parsed.response;
  } catch {
    return null;
  }
}

function writeResponseCache(playerCacheMtimeMs: number, response: CitationPrioritiesResponse): void {
  mkdirSync(dirname(RESPONSE_CACHE_PATH), { recursive: true });
  writeFileSync(RESPONSE_CACHE_PATH, JSON.stringify({ playerCacheMtimeMs, response } satisfies ResponseCacheFile, null, 2), 'utf-8');
}

export async function computeCitationPriorities(): Promise<CitationPrioritiesResponse> {
  const playerData = readPlayerCache() as {
    player: {
      character: {
        crew: RawPlayerCrewInstance[];
        stored_immortals: StoredImmortal[];
        cryo_collections: PlayerCryoCollection[];
        // Read by calculateBuffConfig() (buffConfig.ts's PlayerBuffSource,
        // not exported from that module) — kept in sync with its shape here.
        crew_collection_buffs: { stat: string; operator: string; value: number }[];
        starbase_buffs: { stat: string; operator: string; value: number }[];
        captains_bridge_buffs: { stat: string; value: number }[];
      };
    };
  } | null;
  if (!playerData) {
    return { originalAlgorithm: [], betaTachyon: [] };
  }

  const playerCacheMtimeMs = existsSync(PLAYER_CACHE_PATH) ? statSync(PLAYER_CACHE_PATH).mtimeMs : 0;
  const cachedResponse = readResponseCacheIfCurrent(playerCacheMtimeMs);
  if (cachedResponse !== null) {
    return cachedResponse;
  }

  const [catalog, items, collections] = await Promise.all([
    getFreshCitationCrewData(),
    getFreshItems(),
    getFreshCollections(),
  ]);

  const activeOwnedCrew = playerData.player.character.crew.filter((c) => !c.in_buy_back_state);
  const frozenCrew = synthesizeFrozenCrew(playerData.player.character.stored_immortals, catalog);
  // Frozen crew first — mirrors upstream's frozen-branch precedence, per
  // Task 3's investigation (assessCrewRoster keeps the first instance it
  // sees per archetype).
  const ownedCrew = [...frozenCrew, ...activeOwnedCrew];
  const merged = mergeCrewWithCatalog(ownedCrew, catalog);
  const buffs = calculateBuffConfig(playerData.player);

  const originalAlgorithm = citeOriginalAlgorithm(merged, catalog);
  const betaTachyon = citeBetaTachyon(merged, catalog, items, collections, buffs, playerData.player.character.cryo_collections);

  const response: CitationPrioritiesResponse = {
    originalAlgorithm: originalAlgorithm.slice(0, RESPONSE_CAP).map((c) => c.id),
    betaTachyon: betaTachyon.slice(0, RESPONSE_CAP).map((c) => c.id),
  };
  writeResponseCache(playerCacheMtimeMs, response);
  return response;
}
