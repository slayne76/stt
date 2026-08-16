// server/src/citation/computeCitationPriorities.ts
//
// Orchestrator that ties together Tasks 1-4: reads player data, assembles the
// candidate roster (including synthesizing frozen/vaulted crew from
// stored_immortals), runs both ported citation-priority algorithms, and
// returns the ranked id lists that GET /api/citation-priorities serves.
//
// See task-5-brief.md's two plan amendments for why frozen crew must be
// folded into the roster here (not inside either algorithm port) and why a
// response-level cache keyed on its on-disk inputs' mtimes is required (both
// algorithms together take ~12-13s on the real roster).
//
// Because that computation is synchronous and CPU-bound, it blocks Node's
// event loop for its full duration. Two mitigations live here and in
// routes/player.ts: the result is precomputed in the background immediately
// after a player-data sync (when the user is already waiting on a spinner)
// rather than being deferred to the first Overview page load, and a
// single-flight guard makes concurrent callers share one run.

import { existsSync, statSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { readPlayerCache, PLAYER_CACHE_PATH } from '../cache';
import { fetchCitationCrewData } from '../citationCrewClient';
import {
  readCitationCrewCache,
  writeCitationCrewCache,
  isCitationCrewCacheFresh,
  CITATION_CREW_CACHE_PATH,
} from '../citationCrewCache';
import { fetchCollections } from '../collectionsClient';
import {
  readCollectionsCache,
  writeCollectionsCache,
  isCollectionsCacheFresh,
  COLLECTIONS_CACHE_PATH,
} from '../collectionsCache';
import { mergeCrewWithCatalog, type RawPlayerCrewInstance, type CitationCrewEntry, type PlayerCryoCollection } from './types';
import { calculateBuffConfig } from './buffConfig';
import { citeOriginalAlgorithm } from './originalAlgorithm';
import { citeBetaTachyon } from './betaTachyonPulse';

export interface CitationPrioritiesResponse {
  originalAlgorithm: number[];
  betaTachyon: number[];
}

const RESPONSE_CAP = 100;
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
      // Placeholders, never read on the citation path: nothing downstream
      // inspects a slot's `level`/`archetype` (a real slot's `level` is the
      // unlock level, not an index — these values are meaningless as data).
      // Only the ARRAY LENGTH matters: Beta Tachyon's `isImmortal` tests
      // `equipment?.length === 4`, which is what marks frozen crew fully equipped.
      equipment_slots: [0, 1, 2, 3].map(() => ({ level: 100, archetype: 0 })),
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

async function getFreshCollections() {
  const cached = readCollectionsCache();
  if (cached !== null && isCollectionsCacheFresh()) return cached;
  const data = await fetchCollections();
  writeCollectionsCache(data);
  return data;
}

// The full set of on-disk inputs a computed response depends on. All three
// refresh independently — player-cache.json on every sync, the other two on
// their own 24h TTLs — so all three mtimes have to be part of the cache key,
// or a catalog/collections refresh would keep serving rankings computed from
// the superseded dataset until the next player sync happened to bump
// player-cache.json.
interface InputMtimes {
  playerCacheMtimeMs: number;
  citationCrewCacheMtimeMs: number;
  collectionsCacheMtimeMs: number;
}

interface ResponseCacheFile extends InputMtimes {
  response: CitationPrioritiesResponse;
}

function mtimeMsOrZero(path: string): number {
  if (!existsSync(path)) return 0;
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

function readInputMtimes(): InputMtimes {
  return {
    playerCacheMtimeMs: mtimeMsOrZero(PLAYER_CACHE_PATH),
    citationCrewCacheMtimeMs: mtimeMsOrZero(CITATION_CREW_CACHE_PATH),
    collectionsCacheMtimeMs: mtimeMsOrZero(COLLECTIONS_CACHE_PATH),
  };
}

// Both algorithms together take ~12-13s on the real roster (~6-7s each,
// re-measured 2026-08-16 against the real 1312-crew frozen-inclusive roster:
// Original Algorithm 6.3-7.1s, Beta Tachyon Pulse 6.9-7.7s) — far too slow to
// recompute on every request, which the design originally called for before
// that cost was measured. This cache is keyed on player-cache.json's
// own mtime plus those of the two catalog datasets it reads: a cached response
// is only ever served if it was computed from the exact inputs currently on
// disk, so freshness is preserved exactly (never serves a result computed from
// stale data) while repeated requests against unchanged data are instant.
function readResponseCacheIfCurrent(mtimes: InputMtimes): CitationPrioritiesResponse | null {
  if (!existsSync(RESPONSE_CACHE_PATH)) return null;
  try {
    const parsed = JSON.parse(readFileSync(RESPONSE_CACHE_PATH, 'utf-8')) as ResponseCacheFile;
    if (parsed.playerCacheMtimeMs !== mtimes.playerCacheMtimeMs) return null;
    if (parsed.citationCrewCacheMtimeMs !== mtimes.citationCrewCacheMtimeMs) return null;
    if (parsed.collectionsCacheMtimeMs !== mtimes.collectionsCacheMtimeMs) return null;
    return parsed.response;
  } catch {
    return null;
  }
}

function writeResponseCache(mtimes: InputMtimes, response: CitationPrioritiesResponse): void {
  mkdirSync(dirname(RESPONSE_CACHE_PATH), { recursive: true });
  writeFileSync(RESPONSE_CACHE_PATH, JSON.stringify({ ...mtimes, response } satisfies ResponseCacheFile, null, 2), 'utf-8');
}

// Single-flight guard. The ~12-13s computation is now kicked off in the
// background right after a player-data sync (routes/player.ts), which can
// easily overlap a user-triggered GET /api/citation-priorities. Without this,
// both callers would run the full computation concurrently and starve the
// event loop for twice as long; with it, the second caller simply awaits the
// first one's promise. Cleared once the run settles (success or failure) so a
// failed run never poisons subsequent requests.
let inFlight: Promise<CitationPrioritiesResponse> | null = null;

export function computeCitationPriorities(): Promise<CitationPrioritiesResponse> {
  if (inFlight !== null) return inFlight;
  const run = computeUncached();
  inFlight = run;
  const clear = () => {
    if (inFlight === run) inFlight = null;
  };
  void run.then(clear, clear);
  return run;
}

async function computeUncached(): Promise<CitationPrioritiesResponse> {
  // Cheap stat()s and the small response-cache read come FIRST: readPlayerCache()
  // is a ~12MB read + JSON.parse, which on a warm cache would otherwise be pure
  // waste on every single request.
  const mtimes = readInputMtimes();
  const cachedResponse = readResponseCacheIfCurrent(mtimes);
  if (cachedResponse !== null) {
    return cachedResponse;
  }

  const playerData = readPlayerCache() as {
    player: {
      character: {
        crew: RawPlayerCrewInstance[];
        stored_immortals: StoredImmortal[];
        // Upstream's optimizer.js optional-chains this alongside
        // `stored_immortals` when assembling its roster. Absent from this
        // project's real player-cache.json today (so it is currently always
        // empty), but handled for parity with upstream's own roster assembly.
        c_stored_immortals?: StoredImmortal[];
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

  const [catalog, collections] = await Promise.all([getFreshCitationCrewData(), getFreshCollections()]);

  const activeOwnedCrew = playerData.player.character.crew.filter((c) => !c.in_buy_back_state);
  const allStoredImmortals = [
    ...playerData.player.character.stored_immortals,
    ...(playerData.player.character.c_stored_immortals ?? []),
  ];
  const frozenCrew = synthesizeFrozenCrew(allStoredImmortals, catalog);
  // Frozen crew first — mirrors upstream's frozen-branch precedence, per
  // Task 3's investigation (assessCrewRoster keeps the first instance it
  // sees per archetype).
  const ownedCrew = [...frozenCrew, ...activeOwnedCrew];
  const merged = mergeCrewWithCatalog(ownedCrew, catalog);
  const buffs = calculateBuffConfig(playerData.player);

  const originalAlgorithm = citeOriginalAlgorithm(merged, catalog);
  const betaTachyon = citeBetaTachyon(merged, catalog, collections, buffs, playerData.player.character.cryo_collections);

  const response: CitationPrioritiesResponse = {
    originalAlgorithm: originalAlgorithm.slice(0, RESPONSE_CAP).map((c) => c.id),
    betaTachyon: betaTachyon.slice(0, RESPONSE_CAP).map((c) => c.id),
  };
  // Re-stat rather than reusing the mtimes read at entry: getFreshCitationCrewData()
  // / getFreshCollections() above may have just rewritten those cache files on
  // their TTL, and keying the response on the pre-refresh mtimes would make
  // every subsequent request miss and recompute.
  writeResponseCache(readInputMtimes(), response);
  return response;
}
