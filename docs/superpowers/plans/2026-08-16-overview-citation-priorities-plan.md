# Overview page: Citation Priorities (Original Algorithm + Beta Tachyon) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port datacore.app's two Citation Optimized engines ("Original Algorithm" and "Beta Tachyon Pulse") to run server-side against cached data, and surface their top results as two new Overview tables, using the exact stopping-rule cutoff from the design spec.

**Architecture:** New server-side cache layer for citation-specific crew/items/collections data (kept separate from the existing lean `CatalogEntry` cache), faithful ports of `optimizer.js` (Original Algorithm) and `betatachyon.ts` (Beta Tachyon Pulse) plus their minimal utility dependencies, a new orchestrator + `/api/citation-priorities` endpoint returning ranked owned-crew instance `id`s per engine, and client-side wiring (a cutoff function + a new context/hook + two new Overview sections).

**Tech Stack:** unchanged — Node/Express/TypeScript server, Vite/React 19/TypeScript client.

**Design spec:** `docs/superpowers/specs/2026-08-16-overview-citation-priorities-design.md`

**A note on porting method:** Tasks 3 and 4 port two large, external algorithm bodies (~900 and ~600 lines respectively) from a real upstream repository. Rather than transcribing that much third-party code into this plan document by hand (real transcription-error risk, and this file would balloon past usefulness), those tasks point the implementer at an exact pinned commit and instruct them to read the real source directly and port it faithfully — the same "clone into a scratchpad and read the ground truth" technique this project has already used repeatedly for smaller upstream lookups (`gauntlet_rank`, `uniquely_retrievable`). Every smaller, fully-scoped piece of code below (caches, utilities, orchestrator, client wiring) **is** given verbatim, because it was fully traced during design/planning and there's no ground-truth-fidelity reason to defer it.

## Global Constraints

- **Reference commit for all porting:** `stt-datacore/website` @ `b310dd5bf018df5bfb7e322d7833f449a0311620` (MIT licensed — `LICENSE` at that commit confirms it). Every task that ports upstream code must clone/fetch this exact commit into a scratchpad (`git clone https://github.com/stt-datacore/website.git`, then `git checkout b310dd5bf018df5bfb7e322d7833f449a0311620`) and read the real source directly — never guess at a formula or a field name.
- Buyback-state crew (`in_buy_back_state`) are excluded from both engines' candidate rosters, server-side, before either algorithm runs — this is the orchestrator's job (Task 5), not the algorithm ports' job.
- Beta Tachyon Pulse always runs with datacore's own default settings (`DefaultBetaTachyonSettings` — read from the pinned commit's `src/components/optimizer/btsettings.tsx`) baked in as constants in this codebase. No settings UI.
- ~~The final ranked lists are recomputed on **every** `/api/citation-priorities` request... never memoized across requests.~~ **Superseded mid-plan, after Task 4 measured real runtime (~15-20s combined for both engines) — see Task 5's Step 1 amendment below.** The final ranked lists are now recomputed only when `player-cache.json`'s mtime changes since the last computation (a small response cache keyed on that mtime), otherwise the cached response is served. This still preserves design spec §3's actual goal — a result is never served after the underlying player data has changed — just without recomputing on every single request when nothing changed.
- The response payload carries owned-crew instance `id`s only (numbers), never full crew objects — the client already has the full player roster loaded via `usePlayerData()`.
- The three new supporting-dataset caches (`citationCrewCache.ts`, `itemsCache.ts`, `collectionsCache.ts`) are new, separate files — do **not** widen the existing `CatalogEntry`/`catalogCache.ts`, which 8 other pages/sections depend on and have no use for this feature's extra fields.
- 24h TTL for the three new caches, matching `catalogCache.ts`'s existing `CACHE_TTL_MS` constant and its exact "cache missing/old-shape → refetch live, write cache" control flow — copy that file's structure precisely, don't reinvent it.
- No settings UI, no configurable cutoff limit (fixed at `5` via `applyPriorityCutoff`'s default parameter, per the user's exact request).
- **(Added mid-plan, after Task 3.)** Both algorithms' candidate roster is `player.character.crew` (active, buyback-excluded) **plus** `player.character.stored_immortals` (frozen/vaulted crew, synthesized as level-100/max-rarity/fully-equipped instances, frozen-first) — Task 5's orchestrator owns this assembly for both engines; neither algorithm port does its own frozen-crew handling. Omitting frozen crew is not a minor gap: measured directly on the real 722-frozen/599-active roster, it silently produces a plausible-looking but 17-of-25-wrong ranking. See Task 3's report and the amendments in Tasks 4-5 below for the full finding.

---

### Task 1: Citation crew/items/collections caches + merge helper

**Files:**
- Create: `server/src/citationCrewClient.ts`
- Create: `server/src/citationCrewCache.ts`
- Create: `server/src/itemsClient.ts`
- Create: `server/src/itemsCache.ts`
- Create: `server/src/collectionsClient.ts`
- Create: `server/src/collectionsCache.ts`
- Create: `server/src/citation/types.ts`

**Interfaces:**
- Produces: `CitationCrewEntry`, `fetchCitationCrewData()`, `readCitationCrewCache()`/`writeCitationCrewCache()`/`isCitationCrewCacheFresh()`
- Produces: `ItemEntry`, `fetchItems()`, `readItemsCache()`/`writeItemsCache()`/`isItemsCacheFresh()`
- Produces: `CollectionDefinition`, `fetchCollections()`, `readCollectionsCache()`/`writeCollectionsCache()`/`isCollectionsCacheFresh()`
- Produces: `RawPlayerCrewInstance`, `CitationCrew`, `mergeCrewWithCatalog()`
- Consumed by: Task 5's orchestrator (all of the above); Tasks 3 and 4's algorithm ports (`CitationCrew`, the merged type, as their input element type).

The field lists below were confirmed directly against live data during planning: fetched `https://datacore.app/structured/crew.json` and inspected a real entry (Kurn) — confirmed `skill_order`, `ranks` (including `ranks.scores.{am_seating,quipment,skill_rarity,voyage}` and `ranks.gauntletRank`), `collections`, `collection_ids`, `skill_data`, `unique_polestar_combos`, `in_portal` are **catalog-only** fields, absent from owned player-crew instances. Separately inspected a real owned-crew entry in `server/data/player-cache.json` and confirmed the reverse: player crew instances have `id`, `symbol`, `short_name`, `archetype_id`, `favorite`, `level`, `in_buy_back_state`, `rarity`, `max_rarity`, `equipment_slots`, `equipment`, `traits`, `traits_hidden`, `base_skills`, but **not** `skill_order`/`ranks`/`collections`/`skill_data`/`unique_polestar_combos`/`in_portal`. This confirms the real datacore engines internally join a player's owned crew against the fuller crew catalog by `symbol` — `mergeCrewWithCatalog()` below reproduces exactly that join.

- [ ] **Step 1: `citation/types.ts` — shared types and the merge helper**

```ts
// server/src/citation/types.ts

export interface CitationSkillData {
  rarity: number;
  base_skills: Record<string, { core: number; range_min: number; range_max: number; skill: string }>;
}

export interface CitationRanks {
  gauntletRank: number;
  voyRank: number;
  scores: {
    am_seating: number;
    quipment: number;
    skill_rarity: number;
    voyage: number;
  };
}

export interface CitationCrewEntry {
  symbol: string;
  archetype_id: number;
  name: string;
  short_name: string;
  max_rarity: number;
  in_portal: boolean;
  skill_order: string[];
  skill_data: CitationSkillData[];
  collections: string[];
  collection_ids: string[];
  unique_polestar_combos: string[][];
  ranks: CitationRanks;
}

// The fields STT Tracker's own player-cache.json is confirmed to carry on
// every owned-crew instance (verified 2026-08-16 against real data) — a
// deliberately narrow slice, only what the ported algorithms actually read.
export interface RawPlayerCrewInstance {
  id: number;
  symbol: string;
  name: string;
  short_name: string;
  archetype_id: number;
  favorite: boolean;
  level: number;
  in_buy_back_state: boolean;
  rarity: number;
  max_rarity: number;
  // Verified against a real entry in server/data/player-cache.json
  // (2026-08-16): equipment_slots has no `symbol` field, and equipment is
  // [slotIndex, archetypeId] pairs, not a flat array — do not guess these
  // shapes from the datacore model types, which differ slightly.
  equipment_slots: { level: number; archetype: number }[];
  equipment: [number, number][];
  traits: string[];
  traits_hidden: string[];
  base_skills: Record<string, { core: number; range_min: number; range_max: number; skill?: string }>;
}

// The working type both algorithm ports (Tasks 3-4) operate on: an owned
// crew instance enriched with the catalog-only fields it needs but doesn't
// carry itself.
export interface CitationCrew extends RawPlayerCrewInstance {
  in_portal: boolean;
  skill_order: string[];
  skill_data: CitationSkillData[];
  collections: string[];
  collection_ids: string[];
  unique_polestar_combos: string[][];
  ranks: CitationRanks;
}

export function mergeCrewWithCatalog(
  playerCrew: RawPlayerCrewInstance[],
  catalog: CitationCrewEntry[]
): CitationCrew[] {
  const catalogBySymbol = new Map(catalog.map((c) => [c.symbol, c]));
  const merged: CitationCrew[] = [];
  for (const c of playerCrew) {
    const entry = catalogBySymbol.get(c.symbol);
    // No catalog match should not happen in practice (every owned crew's
    // archetype exists in the full catalog) — defensively skip rather than
    // crash, same convention as filterGauntletPriority's gauntletRankMap.has guard.
    if (!entry) continue;
    merged.push({
      ...c,
      in_portal: entry.in_portal,
      skill_order: entry.skill_order,
      skill_data: entry.skill_data,
      collections: entry.collections,
      collection_ids: entry.collection_ids,
      unique_polestar_combos: entry.unique_polestar_combos,
      ranks: entry.ranks,
    });
  }
  return merged;
}
```

- [ ] **Step 2: `citationCrewClient.ts` — fetch + shape `crew.json` for citation use**

Mirror `server/src/catalogClient.ts`'s structure exactly (same `UpstreamError` import, same `fetch` + `AbortSignal.timeout(30_000)` pattern, same raw→shaped `.map()`). The upstream URL is the same `https://datacore.app/structured/crew.json` the existing `catalogClient.ts` already fetches — this is a second, independent fetch of the same public file, shaped differently for this feature's needs (confirmed acceptable duplication in the design spec §3, since sharing a fetch would mean widening `CatalogEntry`).

```ts
// server/src/citationCrewClient.ts
import { UpstreamError } from './errors';
import type { CitationCrewEntry } from './citation/types';

const CREW_UPSTREAM_URL = 'https://datacore.app/structured/crew.json';

interface RawCitationCrewEntry {
  symbol: string;
  archetype_id: number;
  name: string;
  short_name: string;
  max_rarity: number;
  in_portal: boolean;
  skill_order?: string[];
  skill_data?: CitationCrewEntry['skill_data'];
  collections?: string[];
  collection_ids?: string[];
  unique_polestar_combos?: string[][];
  ranks?: {
    gauntletRank?: number;
    voyRank?: number;
    scores?: {
      am_seating?: number;
      quipment?: number;
      skill_rarity?: number;
      voyage?: number;
    };
  };
  [key: string]: unknown;
}

export async function fetchCitationCrewData(): Promise<CitationCrewEntry[]> {
  let response: Response;
  try {
    response = await fetch(CREW_UPSTREAM_URL, { signal: AbortSignal.timeout(30_000) });
  } catch (cause) {
    throw new UpstreamError(`Network error fetching citation crew data: ${(cause as Error).message}`);
  }

  if (!response.ok) {
    throw new UpstreamError(`Citation crew data host returned HTTP ${response.status}`);
  }

  const raw = (await response.json()) as RawCitationCrewEntry[];
  return raw.map((e) => ({
    symbol: e.symbol,
    archetype_id: e.archetype_id,
    name: e.name,
    short_name: e.short_name,
    max_rarity: e.max_rarity,
    in_portal: Boolean(e.in_portal),
    skill_order: e.skill_order ?? [],
    skill_data: e.skill_data ?? [],
    collections: e.collections ?? [],
    collection_ids: e.collection_ids ?? [],
    unique_polestar_combos: e.unique_polestar_combos ?? [],
    ranks: {
      // These four values feed into a SUM of "more/less gives weight"
      // contributions inside Beta Tachyon Pulse's scoring formula (Task 4),
      // which sorts DESCENDING (higher total score = higher priority) — a
      // `?? 0` fallback is safe here (a missing sub-score just contributes
      // nothing), unlike gauntlet_rank's ascending sort where `?? 0` would
      // look like the best possible rank. See feedback memory on
      // sort-direction-dependent fallbacks — checked deliberately, not copied.
      gauntletRank: e.ranks?.gauntletRank ?? Number.MAX_SAFE_INTEGER,
      voyRank: e.ranks?.voyRank ?? Number.MAX_SAFE_INTEGER,
      scores: {
        am_seating: e.ranks?.scores?.am_seating ?? 0,
        quipment: e.ranks?.scores?.quipment ?? 0,
        skill_rarity: e.ranks?.scores?.skill_rarity ?? 0,
        voyage: e.ranks?.scores?.voyage ?? 0,
      },
    },
  }));
}
```

- [ ] **Step 3: `citationCrewCache.ts` — file cache, mirroring `catalogCache.ts` exactly**

```ts
// server/src/citationCrewCache.ts
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import type { CitationCrewEntry } from './citation/types';

const CACHE_PATH = 'data/citation-crew-cache.json';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — matches catalogCache.ts

export function isCitationCrewCacheFresh(): boolean {
  if (!existsSync(CACHE_PATH)) return false;
  try {
    return Date.now() - statSync(CACHE_PATH).mtimeMs < CACHE_TTL_MS;
  } catch {
    return false;
  }
}

export function readCitationCrewCache(): CitationCrewEntry[] | null {
  if (!existsSync(CACHE_PATH)) return null;
  try {
    const raw = readFileSync(CACHE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as CitationCrewEntry[];
    if (parsed.length === 0 || typeof parsed[0].symbol !== 'string' || !Array.isArray(parsed[0].skill_order)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeCitationCrewCache(data: CitationCrewEntry[]): void {
  mkdirSync(dirname(CACHE_PATH), { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), 'utf-8');
}
```

- [ ] **Step 4: `itemsClient.ts` + `itemsCache.ts`**

Same two-file pattern, fetching `https://datacore.app/structured/items.json`. Confirmed live (2026-08-16, HTTP 200, 23407 entries) and confirmed real field names by sampling entries with `recipe`/`bonuses`/`kwipment` populated.

```ts
// server/src/itemsClient.ts
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
```

```ts
// server/src/itemsCache.ts
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ItemEntry } from './itemsClient';

const CACHE_PATH = 'data/items-cache.json';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function isItemsCacheFresh(): boolean {
  if (!existsSync(CACHE_PATH)) return false;
  try {
    return Date.now() - statSync(CACHE_PATH).mtimeMs < CACHE_TTL_MS;
  } catch {
    return false;
  }
}

export function readItemsCache(): ItemEntry[] | null {
  if (!existsSync(CACHE_PATH)) return null;
  try {
    const raw = readFileSync(CACHE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as ItemEntry[];
    if (parsed.length === 0 || typeof parsed[0].symbol !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeItemsCache(data: ItemEntry[]): void {
  mkdirSync(dirname(CACHE_PATH), { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), 'utf-8');
}
```

- [ ] **Step 5: `collectionsClient.ts` + `collectionsCache.ts`**

Same pattern, fetching `https://datacore.app/structured/collections.json` (confirmed live, 2026-08-16, HTTP 200). Kept intentionally narrow — only `id`/`name`/`crew` are read anywhere in the traced call graph (Task 4's brief will confirm/widen this against the pinned commit if the full `scanCrew` trace turns up more usage; cheap to extend later, not a reason to over-fetch now).

```ts
// server/src/collectionsClient.ts
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
```

```ts
// server/src/collectionsCache.ts
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import type { CollectionDefinition } from './collectionsClient';

const CACHE_PATH = 'data/collections-cache.json';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function isCollectionsCacheFresh(): boolean {
  if (!existsSync(CACHE_PATH)) return false;
  try {
    return Date.now() - statSync(CACHE_PATH).mtimeMs < CACHE_TTL_MS;
  } catch {
    return false;
  }
}

export function readCollectionsCache(): CollectionDefinition[] | null {
  if (!existsSync(CACHE_PATH)) return null;
  try {
    const raw = readFileSync(CACHE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as CollectionDefinition[];
    if (parsed.length === 0 || typeof parsed[0].name !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCollectionsCache(data: CollectionDefinition[]): void {
  mkdirSync(dirname(CACHE_PATH), { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), 'utf-8');
}
```

- [ ] **Step 6: Verify against real data**

Throwaway `tsx` script (not committed): call `fetchCitationCrewData()`, `fetchItems()`, `fetchCollections()` live; confirm each returns a non-empty array with the expected shape; join the result against `server/data/player-cache.json`'s real 599 owned crew via `mergeCrewWithCatalog()` and confirm **zero** unmatched symbols (every owned crew's archetype exists in the fetched catalog). Report the exact count in the implementer's report.

- [ ] **Step 7: Commit**

```bash
git add server/src/citationCrewClient.ts server/src/citationCrewCache.ts \
  server/src/itemsClient.ts server/src/itemsCache.ts \
  server/src/collectionsClient.ts server/src/collectionsCache.ts \
  server/src/citation/types.ts
git commit -m "Add citation crew/items/collections caches and merge helper"
```

---

### Task 2: `buffConfig` + Beta Tachyon Pulse minimal utility port

**Files:**
- Create: `server/src/citation/buffConfig.ts`
- Create: `server/src/citation/btpUtils.ts`

**Interfaces:**
- Consumes: `RawPlayerCrewInstance`, `CitationCrew` (Task 1)
- Produces: `calculateBuffConfig()`, `skillSum()`, `shortToSkill()`, `crewCopy()`, `getSkillOrderStats()`, `getSkillOrderScore()`, `findPolestars()`, `lookupAMSeatsByTrait()`, `calcItemDemands()`, `haveCount()`, `getItemWithBonus()`, `getItemBonuses()`, `AntimatterSeatMap`, `SKILLS` (the 6-skill constant list)
- Consumed by: Task 4 (Beta Tachyon Pulse main port)

Every function below was read in full from the pinned commit during planning and is reproduced faithfully, adapted only to this project's types (`CitationCrew` instead of datacore's `CrewMember`/`PlayerCrew`) and TS conventions (no `${skill}` template-key indexing quirks beyond what the source already does).

- [ ] **Step 1: `buffConfig.ts`** — ported from `src/utils/voyageutils.ts:98-131` at the pinned commit

```ts
// server/src/citation/buffConfig.ts

export interface BuffStat {
  multiplier: number;
  percent_increase: number;
}

export type BuffStatTable = Record<string, BuffStat>;

interface PlayerBuffSource {
  character: {
    crew_collection_buffs: { stat: string; operator: string; value: number }[];
    starbase_buffs: { stat: string; operator: string; value: number }[];
    captains_bridge_buffs: { stat: string; value: number }[];
  };
}

const SKILLS = ['command_skill', 'science_skill', 'security_skill', 'engineering_skill', 'diplomacy_skill', 'medicine_skill'];
const BUFF_KINDS = ['core', 'range_min', 'range_max'];

// Faithful port of calculateBuffConfig from stt-datacore/website
// src/utils/voyageutils.ts (commit b310dd5bf018df5bfb7e322d7833f449a0311620),
// MIT licensed. Reads only fields present verbatim on STT Tracker's own
// player-cache.json.
export function calculateBuffConfig(player: PlayerBuffSource): BuffStatTable {
  const buffConfig: BuffStatTable = {};

  for (const skill of SKILLS) {
    for (const kind of BUFF_KINDS) {
      buffConfig[`${skill}_${kind}`] = { multiplier: 1, percent_increase: 0 };
    }
  }

  for (const buff of player.character.crew_collection_buffs.concat(player.character.starbase_buffs)) {
    if (buffConfig[buff.stat]) {
      if (buff.operator === 'percent_increase') {
        buffConfig[buff.stat].percent_increase += buff.value;
      } else if (buff.operator === 'multiplier') {
        buffConfig[buff.stat].multiplier = buff.value;
      }
    }
  }

  player.character.captains_bridge_buffs.forEach((buff) => {
    buffConfig[buff.stat] = { multiplier: 1, percent_increase: buff.value };
  });

  return buffConfig;
}
```

Before committing, verify `crew_collection_buffs`, `starbase_buffs`, and `captains_bridge_buffs` exist with these exact field names on `server/data/player-cache.json`'s `player.character` object — if any is absent or shaped differently in the real cache, adjust `PlayerBuffSource` to match reality and note the discrepancy in the task report.

- [ ] **Step 2: `btpUtils.ts` — small, fully self-contained helpers**

Ported from `src/utils/crewutils.ts` (lines 1821, 881, 768, 1868-1918, 1919-1929 at the pinned commit):

```ts
// server/src/citation/btpUtils.ts
import type { CitationCrew } from './types';

export const SKILLS = ['command', 'diplomacy', 'engineering', 'medicine', 'science', 'security'];

interface Skill {
  core: number;
  range_min: number;
  range_max: number;
  skill?: string;
}

// Ported from crewutils.ts:skillSum
export function skillSum(skills: Skill | Skill[], mode?: 'all' | 'core' | 'proficiency', avg = true): number {
  const mul = avg ? 0.5 : 1;
  if (Array.isArray(skills)) {
    return skills.reduce((p, n) => p + skillSum(n, mode), 0);
  }
  return (mode !== 'proficiency' ? skills.core : 0) + (mode !== 'core' ? (skills.range_max + skills.range_min) * mul : 0);
}

// Ported from crewutils.ts:crewCopy
export function crewCopy<T>(crew: T[]): T[] {
  return structuredClone(crew);
}

interface SkillRarityReport {
  skill: string;
  count: number;
  position: number;
  score: number;
  crew?: CitationCrew[];
}

// Ported from crewutils.ts:getSkillOrderStats
export function getSkillOrderStats(config: { roster: CitationCrew[]; max?: number }): SkillRarityReport[] {
  const { roster } = config;
  const results: SkillRarityReport[] = [];

  for (const skill of SKILLS.map((s) => `${s}_skill`)) {
    for (let i = 0; i < 3; i++) {
      const rf = roster.filter((f) => f.skill_order.length > i && f.skill_order[i] === skill);
      results.push({ skill, count: rf.length, position: i, score: 0 });
    }
  }

  const max = config.max || roster.length;

  for (let i = 0; i < 3; i++) {
    const pc = results.filter((f) => f.position === i);
    if (pc.length) {
      pc.sort((a, b) => a.count - b.count);
      pc.forEach((p) => (p.score = p.count / max));
    }
  }

  results.sort((a, b) => {
    let r = a.position - b.position;
    if (!r) r = a.count - b.count;
    if (!r) r = a.skill.localeCompare(b.skill);
    return r;
  });

  return results;
}

// Ported from crewutils.ts:getSkillOrderScore
export function getSkillOrderScore(crew: CitationCrew, reports: SkillRarityReport[]): number {
  let result = 0;
  crew.skill_order.forEach((skill, index) => {
    const data = reports.find((f) => f.skill === skill && f.position === index);
    if (data) {
      result += (1 - data.score) * (index + 1);
    }
  });
  return result;
}
```

Ported from `src/utils/retrieval.ts` (entire file — no external dependencies beyond types):

- [ ] **Step 3: Add `findPolestars` to `btpUtils.ts`**

```ts
export interface PolestarCombo {
  count: number;
  alts: { symbol: string; name: string }[];
  polestars: string[];
}

// Ported verbatim (only variable typing adapted) from retrieval.ts:findPolestars
export function findPolestars(crew: CitationCrew, roster: CitationCrew[]): PolestarCombo[] {
  let polestars = crew.traits.slice();
  polestars.push('crew_max_rarity_' + crew.max_rarity);
  for (const skill in crew.base_skills) {
    if (crew.base_skills[skill]) polestars.push(skill);
  }
  polestars = polestars.sort((a, b) => a.localeCompare(b));

  const crewPolestarCombos: PolestarCombo[] = [];
  const buildCombos = (prepoles: string[], traits: string[]) => {
    for (let t = 0; t < traits.length; t++) {
      const newpoles = prepoles.slice();
      newpoles.push(traits[t]);
      if (newpoles.length <= 4) {
        crewPolestarCombos.push({ count: 0, alts: [], polestars: newpoles });
      }
      buildCombos(newpoles, traits.slice(t + 1));
    }
  };
  buildCombos([], polestars);

  for (const rc of roster) {
    if (!rc.in_portal) continue;
    const polesInCommon: string[] = [];
    for (const t of crew.traits) {
      if (rc.traits.indexOf(t) >= 0) polesInCommon.push(t);
    }
    if (polesInCommon.length > 0) {
      if (rc.max_rarity === crew.max_rarity) polesInCommon.push('crew_max_rarity_' + crew.max_rarity);
      for (const skill in rc.base_skills) {
        if (rc.base_skills[skill] && crew.base_skills[skill]) polesInCommon.push(skill);
      }
      crewPolestarCombos.forEach((combo) => {
        if (polesInCommon.length >= combo.polestars.length) {
          if (combo.polestars.every((p) => polesInCommon.indexOf(p) >= 0)) {
            combo.count++;
            if (rc.archetype_id !== crew.archetype_id) {
              combo.alts.push({ symbol: rc.symbol, name: rc.name });
            }
          }
        }
      });
    }
  }

  crewPolestarCombos.sort((a, b) => (a.count === b.count ? a.polestars.length - b.polestars.length : a.count - b.count));

  const best = crewPolestarCombos[0]?.count ?? 0;
  const optimals: PolestarCombo[] = [];
  for (const testcombo of crewPolestarCombos) {
    if (testcombo.count > best) break;
    let isSuperset = false;
    for (const opt of optimals) {
      if (testcombo.polestars.length <= opt.polestars.length) continue;
      isSuperset = opt.polestars.every((p) => testcombo.polestars.indexOf(p) >= 0);
      if (isSuperset) break;
    }
    if (isSuperset) continue;
    optimals.push(testcombo);
  }
  return optimals;
}
```

- [ ] **Step 4: Add `lookupAMSeatsByTrait` + `AntimatterSeatMap` to `btpUtils.ts`**

`AntimatterSeatMap` is a static 48-entry trait→skills data table (`src/model/voyage.ts:208` at the pinned commit — `{ name: string; skills: string[] }[]`, one entry per antimatter-seating trait). **Copy it verbatim from the pinned commit** (read the file, copy the literal array) rather than retyping it by hand — it's game data, not logic, and a single mistyped trait name would silently mis-score antimatter seating for that trait with no test able to catch it later.

```ts
export const AntimatterSeatMap: { name: string; skills: string[] }[] = [
  // ... paste the full 48-entry array from src/model/voyage.ts:208 at the
  // pinned commit here, verbatim.
];

// Ported from voyageutils.ts:lookupAMSeatsByTrait
export function lookupAMSeatsByTrait(trait: string): string[] {
  for (const entry of AntimatterSeatMap) {
    if (entry.name === trait) return entry.skills;
  }
  return [];
}
```

- [ ] **Step 5: Add item-demand helpers to `btpUtils.ts`**

Ported from `src/utils/equipment.ts:327-350` and `src/utils/itemutils.ts:207-229,444-449` at the pinned commit:

```ts
import type { ItemEntry } from '../itemsCache';

export interface IDemand {
  crewSymbols: string[];
  count: number;
  symbol: string;
  equipment: ItemEntry;
  factionOnly?: boolean;
  have: number;
}

// Ported from equipment.ts:haveCount
export function haveCount(symbol: string, playerItems: { symbol: string; quantity?: number }[]): number {
  return playerItems.find((f) => f.symbol === symbol)?.quantity ?? 0;
}

// Ported from equipment.ts:calcItemDemands
export function calcItemDemands(
  item: ItemEntry,
  coreItems: ItemEntry[],
  playerItems?: { symbol: string; quantity?: number }[]
): IDemand[] {
  const demands: IDemand[] = [];
  if (item.recipe) {
    for (const iter of item.recipe.list) {
      const recipeEquipment = coreItems.find((i) => i.symbol === iter.symbol);
      if (recipeEquipment) {
        demands.push({
          crewSymbols: [],
          count: iter.count,
          symbol: iter.symbol,
          equipment: recipeEquipment,
          factionOnly: iter.factionOnly,
          have: playerItems ? haveCount(iter.symbol, playerItems) : 0,
        });
      }
    }
  }
  return demands;
}

export interface ItemBonusInfo {
  bonusText: string[];
  bonuses: Record<string, Skill & { disabled?: boolean }>;
}

export interface ItemWithBonus {
  item: ItemEntry;
  bonusInfo: ItemBonusInfo;
}

// Ported from itemutils.ts:getItemBonuses — needs CONFIG.STATS_CONFIG, the
// datacore stat-id -> {skill, stat, symbol} lookup table. Read
// src/components/CONFIG.ts's STATS_CONFIG at the pinned commit and port the
// minimal lookup this function needs (an id -> {skill, stat} map) rather
// than the whole CONFIG class.
export function getItemBonuses(item: ItemEntry): ItemBonusInfo {
  const bonusText: string[] = [];
  const bonuses: Record<string, Skill & { disabled?: boolean }> = {};
  if (item.bonuses) {
    for (const [key, value] of Object.entries(item.bonuses)) {
      const bonus = STATS_CONFIG[Number.parseInt(key)];
      if (bonus) {
        bonuses[bonus.skill] ??= { core: 0, range_min: 0, range_max: 0 };
        bonuses[bonus.skill][bonus.stat as 'core' | 'range_min' | 'range_max'] = value;
        bonusText.push(`+${value} ${bonus.symbol}`);
      }
    }
  }
  return { bonusText, bonuses };
}

// Ported from itemutils.ts:getItemWithBonus
export function getItemWithBonus(item: ItemEntry): ItemWithBonus {
  return { item, bonusInfo: getItemBonuses(item) };
}
```

Fill in `STATS_CONFIG` (a `Record<number, { skill: string; stat: string; symbol: string }>`) by reading `STATS_CONFIG` off `src/components/CONFIG.ts` at the pinned commit — it's a static id→{skill,stat,symbol} table, same "copy the real data, don't retype from memory" rule as `AntimatterSeatMap`.

- [ ] **Step 6: Verify against real data**

Throwaway `tsx` script: run `findPolestars` for a handful of real owned crew (merged via Task 1's `mergeCrewWithCatalog`) against the full citation-crew catalog, confirm it returns non-empty `PolestarCombo[]` for in-portal crew and an empty/low-signal result for crew with few common traits (sanity check, not exhaustive). Confirm `calculateBuffConfig()` produces a `BuffStatTable` with all 18 `<skill>_<core|range_min|range_max>` keys present for the real player.

- [ ] **Step 7: Commit**

```bash
git add server/src/citation/buffConfig.ts server/src/citation/btpUtils.ts
git commit -m "Port Beta Tachyon Pulse supporting utilities and buffConfig"
```

---

### Task 3: Original Algorithm port

**Files:**
- Create: `server/src/citation/originalAlgorithm.ts`

**Interfaces:**
- Consumes: `CitationCrew` (Task 1)
- Produces: `citeOriginalAlgorithm(ownedCrew: CitationCrew[], catalog: CitationCrewEntry[]): CitationCrew[]` — returns the ranked `crewToCite` list (best-first), already sorted, with no cutoff applied
- Consumed by: Task 5's orchestrator

`optimizer.js` (`src/workers/optimizer.js` at the pinned commit, ~914 lines) has **zero external imports** — fully self-contained. Confirmed by grep during planning. This is the entry-point wrapper as actually invoked upstream (`src/workers/unified-worker.js:40-66` at the pinned commit):

```js
const citeOptimizer = (playerData, allCrew) => {
    const isImmortal = (c) => {
        return c.level === 100 && c.equipment?.length === 4 && c.rarity === c.max_rarity;
    }
    return new Promise((resolve, reject) => {
        Optimizer.assessCrewRoster(playerData, allCrew);
        Optimizer.sortVoyageRankings();
        Optimizer.findCurrentBestCrew();
        Optimizer.findBestForRarity();
        Optimizer.findCrewToTrain();
        Optimizer.findEVContributionOfCrewToTrain();
        Optimizer.sortCrewToTrain();
        Optimizer.findBestCitedCrew();
        Optimizer.findCrewToCite();
        Optimizer.findEVContributionOfCrewToCite();
        Optimizer.sortCrewToCite();
        resolve({
            crewToCite: Optimizer.rankedCrewToCite,
            crewToTrain: Optimizer.rankedCrewToTrain
        });
    });
};
```

(The `playerData.citeMode` rarity-prefilter branch in the real wrapper is intentionally dropped — STT Tracker has no such settings, and Task 5's orchestrator does its own `max_rarity` handling per the design spec.)

- [ ] **Step 1: Read and port `optimizer.js` in full**

Clone the pinned commit, read `src/workers/optimizer.js` **in its entirety**, and port it faithfully into `server/src/citation/originalAlgorithm.ts`. Adapt only:
1. **Module shape** — the upstream file is a bare script defining a global `Optimizer` object literal (stateful — it mutates its own properties like `Optimizer.rankedCrewToCite` across the sequence of calls shown in `citeOptimizer` above). Port it as an internal, module-scoped object (or refactor to a single function with local variables — implementer's judgment, but preserve the exact sequence and exact logic of each of the 10 `Optimizer.xxx()` calls above, in that order).
2. **Input shape** — the upstream `assessCrewRoster(playerData, allCrew)` takes datacore's own `PlayerData`/`CrewMember[]` shapes. Adapt call sites to take `ownedCrew: CitationCrew[]` (already merged with catalog fields by Task 1's `mergeCrewWithCatalog`) instead of `playerData.player.character.crew`, and `catalog: CitationCrewEntry[]` instead of `allCrew`. Every property access the original code makes (`crew.base_skills`, `crew.skill_data`, `crew.collections`, `crew.max_rarity`, `crew.name`, `crew.short_name`, `crew.archetype_id`, `crew.level`, `crew.rarity` — confirmed by grep during planning to be the complete set of fields this file reads) is already present on `CitationCrew`/`CitationCrewEntry`.
3. **Output** — export a single function `citeOriginalAlgorithm(ownedCrew, catalog): CitationCrew[]` wrapping the same 10-call sequence, returning `rankedCrewToCite` directly (synchronous — there's no reason to keep the `Promise` wrapper server-side; nothing here is actually async).
4. Preserve all internal logic, scoring, and sort order exactly. Do not "clean up" or "simplify" any formula — a faithful port is the entire point.

If tracing the full file surfaces a dependency or data requirement not covered by `CitationCrew`/`CitationCrewEntry` (Task 1), stop and report it rather than inventing a fallback — same as the Beta Tachyon Pulse scope discussion during planning.

- [ ] **Step 2: Verify against real data**

Throwaway `tsx` script: run `citeOriginalAlgorithm()` against the real, merged `server/data/player-cache.json` roster (excluding buyback-state crew) and the real citation-crew catalog. Confirm it produces a non-empty, sorted `CitationCrew[]`. Then, using a real browser (Playwright), open `https://datacore.app/cite-opt/`, select "Original Algorithm," wait for it to finish, and record its top ~10 results by name. Diff against the ported function's top ~10 (by name) — expect an exact or near-exact match. Report any mismatch in detail (which crew, what position) rather than silently accepting a close-but-not-exact result.

- [ ] **Step 3: Commit**

```bash
git add server/src/citation/originalAlgorithm.ts
git commit -m "Port Original Algorithm citation engine"
```

---

### Task 4: Beta Tachyon Pulse port

**Files:**
- Create: `server/src/citation/betaTachyonPulse.ts`

**Interfaces:**
- Consumes: `CitationCrew`, `CitationCrewEntry` (Task 1); `calculateBuffConfig`, `BuffStatTable`, all of `btpUtils.ts` (Task 2); `ItemEntry` (Task 1); `CollectionDefinition` (Task 1)
- Produces: `citeBetaTachyon(ownedCrew: CitationCrew[], catalog: CitationCrewEntry[], items: ItemEntry[], collections: CollectionDefinition[], buffs: BuffStatTable): CitationCrew[]` — returns the ranked `crewToCite` list (best-first, `rarity !== max_rarity` only), already sorted, with no cutoff applied
- Consumed by: Task 5's orchestrator

This is the highest-risk task in the plan (per the design spec's "Open risk" section and the mid-brainstorm dependency-depth finding) — budget real time for the verification step, and treat any surprising transitive dependency the same way it was handled during planning: stop and report rather than silently approximating.

**Plan amendment (added after Task 3 was implemented and reviewed — read this before Step 1):** Task 3's implementer discovered that `optimizer.js` reads `player.character.stored_immortals` (722 frozen/vaulted immortalized crew in the real data, more than the 599 active crew) as part of the roster — leaving them out silently produced a list that looked plausible but got 17 of the top 25 names wrong. `betatachyon.ts` receives the same full `playerData` object upstream (confirmed during design brainstorming: `BetaTachyonRunnerConfig` includes `playerData`, not just `inputCrew`), so **it may have the same dependency — investigate this explicitly as part of your read-through, don't assume Task 3's finding transfers automatically or that it doesn't.** Task 5's orchestrator (updated after this finding) now assembles `ownedCrew: CitationCrew[]` as frozen-crew-first-then-active, using a `synthesizeFrozenCrew()` helper that sets frozen entries to level 100 / max rarity / 4 filled equipment slots / empty `traits`/`traits_hidden` (Task 1's `CitationCrewEntry` does not carry catalog-level `traits` — only `base_skills` was added back, per Task 3's fix). If your read of `betatachyon.ts` shows it needs frozen crew's `traits` for anything (e.g. `findPolestars`, antimatter-seating lookups), **stop and report it** rather than silently working around a `[]` — that's exactly the class of gap Task 3 caught, and `CitationCrewEntry`/`synthesizeFrozenCrew` may need a follow-up fix in `citation/types.ts` and Task 5's orchestrator, the same way Task 3 fixed `base_skills`.

- [ ] **Step 1: Read and port `BetaTachyon.scanCrew` in full**

Clone the pinned commit, read `src/workers/betatachyon.ts`'s **entire** `BetaTachyon.scanCrew` function (the whole file is ~645 lines; `scanCrew` is effectively the whole exported surface) and port it faithfully into `server/src/citation/betaTachyonPulse.ts`, using Task 2's `btpUtils.ts` for `skillSum`, `shortToSkill` *(not actually needed by `scanCrew` directly per the original import list — check on read; if unused, don't port a dead import)*, `crewCopy`, `getSkillOrderStats`, `getSkillOrderScore`, `calcItemDemands`, `getItemWithBonus`, `findPolestars`, `lookupAMSeatsByTrait`, and Task 2's `calculateBuffConfig`.

The scoring formula (`scoreCrew`, read in full during planning — confirmed real, confirmed to read `ranks.scores.{am_seating,quipment,skill_rarity,voyage}` plus several fields **computed earlier in `scanCrew` itself**: `amTraits`, `collectionsIncreased`, `groupSparsity`, `totalEVContribution`, `voyagesImproved`, `evPerCitation`, `score`, `scoreTrip`, `voyScores`, `totalEVRemaining`) must be ported in full, including every one of those earlier computation steps that populate those fields — they are not separately-fetchable data, they're intermediate state `scanCrew` builds up over its own body before scoring. Do not skip sections of the function on the assumption they're unrelated; read start to finish first, then port start to finish.

Adapt:
1. **Config shape** — the real `BetaTachyonRunnerConfig` includes `settings: BetaTachyonSettings`. Port `DefaultBetaTachyonSettings` (`src/components/optimizer/btsettings.tsx` at the pinned commit) as a fixed, exported constant in this file and always use it — no settings parameter on `citeBetaTachyon`.
2. **Inputs** — `inputCrew`/`playerData` → `ownedCrew: CitationCrew[]`; `collections` → `collections: CollectionDefinition[]`; `coreItems` → `items: ItemEntry[]`; `buffs` → `buffs: BuffStatTable` (Task 2's `calculateBuffConfig()` output); `immortalizedSymbols` — recompute inline from `ownedCrew` (`crew.level === 100 && crew.rarity === crew.max_rarity && crew.equipment_slots.length === crew.equipment.length` or whatever the exact upstream `isImmortal`-equivalent check is — read it from source, don't guess).
3. **Output** — return `resultCrew.filter(f => f.rarity !== f.max_rarity)` sorted exactly as upstream sorts it (the `resultCrew.sort((a,b) => scoreCrew(b) - scoreCrew(a))` call traced during planning) as `CitationCrew[]`. Drop `crewToRetrieve`/`crewToTrain`/`skillOrderRarities` from the return value — not needed by this feature.
4. If `applySkillBuff`/`applyCrewBuffs`-style buff application (seen referenced near the top of `betatachyon.ts` during planning) turns out to be load-bearing for the scoring inputs (not just voyage estimation, which this feature doesn't need), port that too — verify by tracing whether `scoreCrew`'s inputs depend on buffed or unbuffed skill values before deciding it's droppable.

- [ ] **Step 2: Verify against real data**

Same method as Task 3, applied to Beta Tachyon Pulse: throwaway `tsx` script against real merged data; live-browser comparison against `https://datacore.app/cite-opt/` with "Beta Tachyon Pulse (Experimental)" selected and default settings. Given this engine's complexity, treat a mismatch in the top ~10 as a real defect to fix, not noise — trace the specific score components for the mismatched crew and compare against the live site's own displayed reasoning (if shown) or recompute by hand for 1-2 crew to localize which sub-score diverges.

- [ ] **Step 3: Commit**

```bash
git add server/src/citation/betaTachyonPulse.ts
git commit -m "Port Beta Tachyon Pulse citation engine"
```

---

### Task 5: Orchestrator + `/api/citation-priorities` route

**Files:**
- Create: `server/src/citation/computeCitationPriorities.ts`
- Create: `server/src/routes/citationPriorities.ts`
- Modify: `server/src/index.ts`

**Interfaces:**
- Consumes: everything from Tasks 1-4
- Produces: `GET /api/citation-priorities` → `CitationPrioritiesResponse`
- Consumed by: Task 6's client hook

- [ ] **Step 1: `computeCitationPriorities.ts`**

**Plan amendment (added after Task 3 — read before writing this file):** Task 3's implementer discovered that datacore's real algorithms read `player.character.stored_immortals` (frozen/vaulted immortalized crew — **722 entries in the real player-cache.json, more than the 599 active crew**) as part of the roster, not just `player.character.crew`. Leaving them out is not a rounding-level gap: measured directly, an active-only roster diverges from the live site starting at rank 9, getting 17 of the top 25 names wrong, while still *looking* like a plausible, correctly-sorted list — exactly the kind of silent wrongness this plan's verification steps exist to catch. Frozen crew occupy voyage seats and count toward roster-completeness math that affects *other* crew's scores, even though frozen crew themselves are never citeable (`rarity === max_rarity` always, for both algorithms) and so can never appear in the final output list — this is why they're safe to synthesize with fabricated instance `id`s below. This orchestrator is the single place both algorithms' inputs are assembled, so it owns folding frozen crew in — neither algorithm port should do this itself.

**Second plan amendment (added after Task 4 — read before writing this file):** Task 4's implementer found three more things that change this step:
1. **`citeBetaTachyon` takes a 6th parameter, `cryoCollections: PlayerCryoCollection[]`.** Beta Tachyon Pulse's `collectionsIncreased` computation reads `claimable_milestone_index` off the player's own collection-progress data (`player.character.cryo_collections` — 88 real entries, confirmed), which cannot be derived from any catalog data. `PlayerCryoCollection` is already defined and exported from `server/src/citation/types.ts` (Task 4 added it) — import it from there, don't redefine it.
2. **`synthesizeFrozenCrew`'s per-copy loop is wrong — fix it before shipping.** The version below (from before Task 4) emits one synthesized instance per `quantity`. Real upstream emits exactly **one** roster entry per archetype in `stored_immortals`, regardless of `quantity`. Every one of the real 722 entries currently has `quantity === 1`, so this bug is inert today, but it's a real faithfulness gap that would silently diverge the moment that's no longer true — fixed in the version below (no inner loop; drop the `copy` variable from the synthetic `id` formula too, since there's now only one instance per archetype).
3. **Response-level caching is now required, not optional.** Task 4 measured Beta Tachyon Pulse alone at **~6.5 seconds per run** (`findPolestars` dominates) against the real 1312-crew roster, and Task 3 measured Original Algorithm at up to ~12 seconds on the same frozen-inclusive roster. Combined, a naive "recompute on every request" easily exceeds 15-20 seconds — far past the "a few seconds" bound this plan's Global Constraints and final-review-focus-areas originally expected, and well past what a "Loading priorities…" placeholder (Task 6) can reasonably cover on every single Overview page load. **This supersedes the Global Constraint that said "recomputed on every request"** — see the updated Step 1 below, which adds a small response cache keyed on `player-cache.json`'s mtime: if the cached response was computed from the player data currently on disk, serve it; otherwise recompute and overwrite. This preserves the original freshness guarantee (a result is never served after the underlying player data has changed) while making repeated page loads/refreshes against unchanged data instant.

```ts
// server/src/citation/computeCitationPriorities.ts
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
  const buffs = calculateBuffConfig(playerData.player as Parameters<typeof calculateBuffConfig>[0]);

  const originalAlgorithm = citeOriginalAlgorithm(merged, catalog);
  const betaTachyon = citeBetaTachyon(merged, catalog, items, collections, buffs, playerData.player.character.cryo_collections);

  const response: CitationPrioritiesResponse = {
    originalAlgorithm: originalAlgorithm.slice(0, RESPONSE_CAP).map((c) => c.id),
    betaTachyon: betaTachyon.slice(0, RESPONSE_CAP).map((c) => c.id),
  };
  writeResponseCache(playerCacheMtimeMs, response);
  return response;
}
```

(Adjust the `readPlayerCache()` cast and `calculateBuffConfig` call-site to whatever `PlayerBuffSource` shape Task 2 actually settled on after verifying real data — the two must agree. Confirm `citeBetaTachyon`'s exact parameter order against Task 4's actual committed signature in `server/src/citation/betaTachyonPulse.ts` before wiring the call site — don't trust this plan's transcription over the real file.)

Before trusting this Step 1 as written: read Task 4's actual report (`.superpowers/sdd/2026-08-16-overview-citation-priorities-plan/task-4-report.md`) and the real `server/src/citation/types.ts`/`betaTachyonPulse.ts` as committed — this plan section was updated to match Task 4's real output, but the real files are the ground truth if anything here is stale.

- [ ] **Step 2: `routes/citationPriorities.ts`**

Mirror `server/src/routes/catalog.ts`'s error-handling shape (`UpstreamError` → 502, generic → 502), but with no refresh endpoint — `computeCitationPriorities()` already handles its own "stale vs fresh" branch internally via the mtime-keyed response cache (Step 1's amendment), so there's nothing for a route-level refresh to add:

```ts
// server/src/routes/citationPriorities.ts
import { Router, type Response } from 'express';
import { computeCitationPriorities } from '../citation/computeCitationPriorities';
import { UpstreamError } from '../errors';

export function createCitationPrioritiesRouter(): Router {
  const router = Router();

  router.get('/citation-priorities', async (_req, res) => {
    try {
      const data = await computeCitationPriorities();
      res.json(data);
    } catch (err) {
      respondUpstreamError(res, err);
    }
  });

  return router;
}

function respondUpstreamError(res: Response, err: unknown): void {
  if (err instanceof UpstreamError) {
    res.status(502).json({ error: err.message, code: 'UPSTREAM_ERROR' });
    return;
  }
  res.status(502).json({ error: 'Unexpected error computing citation priorities', code: 'UPSTREAM_ERROR' });
}
```

- [ ] **Step 3: Mount the router in `server/src/index.ts`**

Add alongside the existing router mounts:

```ts
import { createCitationPrioritiesRouter } from './routes/citationPriorities';
// ...
app.use('/api', createCitationPrioritiesRouter());
```

- [ ] **Step 4: Verify against real data**

Start the dev server, `curl http://localhost:<port>/api/citation-priorities`, confirm a `200` with `{ originalAlgorithm: number[], betaTachyon: number[] }`, both non-empty, both `id`s present in the real `server/data/player-cache.json` roster, no buyback-state crew `id`s present in either list. Time the request on a cold cache (first call) and a warm one (second call) and report both — this is the number that determines whether Task 6's "Loading priorities…" placeholder is actually necessary in practice.

- [ ] **Step 5: Commit**

```bash
git add server/src/citation/computeCitationPriorities.ts server/src/routes/citationPriorities.ts server/src/index.ts
git commit -m "Add citation-priorities orchestrator and API route"
```

---

### Task 6: Client wiring — cutoff, context, hook, Overview sections

**Files:**
- Create: `client/src/crew/priorityCutoff.ts`
- Create: `client/src/api/citationPrioritiesApi.ts`
- Create: `client/src/context/CitationPrioritiesContext.tsx`
- Create: `client/src/hooks/useCitationPriorities.ts`
- Modify: `client/src/App.tsx`
- Modify: `client/src/pages/OverviewPage.tsx`

**Interfaces:**
- Consumes: `GET /api/citation-priorities` (Task 5); `CrewMember`, `getEquipmentSlotsRemaining` (existing); `crewList` (existing, from `usePlayerData()`)
- Produces: `applyPriorityCutoff()`; `useCitationPriorities()` → `{ data, loading, error }` where `data: { originalAlgorithm: number[]; betaTachyon: number[] } | null`

- [ ] **Step 1: `priorityCutoff.ts`**

Exactly as specified in the design spec §2 (already verified by hand against the user's 14-row worked example):

```ts
// client/src/crew/priorityCutoff.ts
import type { CrewMember } from '../types/crew';
import { getEquipmentSlotsRemaining } from './getters';

const PRIORITY_COUNT_LIMIT = 5;

// A row "counts" toward the limit unless it's already fully leveled and
// equipped — level 100 with 0 equipment slots missing. Matches the user's
// worked example: "lvl 100 -0" rows are kept in the output but don't
// advance the counter that decides where the list stops.
function countsTowardLimit(crew: CrewMember): boolean {
  return crew.level < 100 || getEquipmentSlotsRemaining(crew) < 0;
}

export function applyPriorityCutoff(rankedCrew: CrewMember[], limit: number = PRIORITY_COUNT_LIMIT): CrewMember[] {
  const result: CrewMember[] = [];
  let counted = 0;
  for (const crew of rankedCrew) {
    result.push(crew);
    if (countsTowardLimit(crew)) {
      counted += 1;
      if (counted >= limit) break;
    }
  }
  return result;
}
```

- [ ] **Step 2: Write a failing verification script, then confirm it passes**

Throwaway `tsx` script (not committed): build a synthetic 14-row `CrewMember[]` list matching the user's worked example exactly (rows 1,3,4,7,8,10 at level 100 with 0 missing equipment slots; rows 2,5,6,9,11 below level 100; rows 12-14 anything, below level 100) and assert `applyPriorityCutoff(list)` returns exactly rows 1-11 in order. Run it, confirm it passes, and report the result — this is the one piece of new client logic in this whole feature with a precise, user-specified worked example to check against, so check it precisely.

- [ ] **Step 3: `citationPrioritiesApi.ts`**

Mirrors `client/src/api/catalogApi.ts`'s structure:

```ts
// client/src/api/citationPrioritiesApi.ts
export interface CitationPrioritiesResponse {
  originalAlgorithm: number[];
  betaTachyon: number[];
}

export async function fetchCitationPriorities(): Promise<CitationPrioritiesResponse> {
  const response = await fetch('/api/citation-priorities');
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error((body as { error?: string }).error ?? `Failed to load citation priorities: HTTP ${response.status}`);
  }
  return response.json() as Promise<CitationPrioritiesResponse>;
}
```

- [ ] **Step 4: `CitationPrioritiesContext.tsx`**

Mirrors `client/src/context/CrewCatalogContext.tsx`'s structure, minus the `refresh()` capability (this feature has no refresh button per the design — remove `refresh`/`refreshCrewCatalog`-equivalent from this context entirely, don't leave a dead no-op):

```tsx
// client/src/context/CitationPrioritiesContext.tsx
import { createContext, useEffect, useState, type ReactNode } from 'react';
import { fetchCitationPriorities, type CitationPrioritiesResponse } from '../api/citationPrioritiesApi';

export interface CitationPrioritiesContextValue {
  data: CitationPrioritiesResponse | null;
  loading: boolean;
  error: string | null;
}

export const CitationPrioritiesContext = createContext<CitationPrioritiesContextValue | undefined>(undefined);

export function CitationPrioritiesProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<CitationPrioritiesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchCitationPriorities()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load citation priorities');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <CitationPrioritiesContext.Provider value={{ data, loading, error }}>{children}</CitationPrioritiesContext.Provider>
  );
}
```

- [ ] **Step 5: `useCitationPriorities.ts`**

```ts
// client/src/hooks/useCitationPriorities.ts
import { useContext } from 'react';
import { CitationPrioritiesContext } from '../context/CitationPrioritiesContext';

export function useCitationPriorities() {
  const context = useContext(CitationPrioritiesContext);
  if (context === undefined) {
    throw new Error('useCitationPriorities must be used within a CitationPrioritiesProvider');
  }
  return context;
}
```

- [ ] **Step 6: Mount the provider in `App.tsx`**

Nest it alongside the existing providers (order doesn't matter between `CrewCatalogProvider` and `CitationPrioritiesProvider` — they're independent):

```tsx
<PlayerDataProvider>
  <CrewCatalogProvider>
    <CitationPrioritiesProvider>
      <BrowserRouter>
        {/* ...unchanged... */}
      </BrowserRouter>
    </CitationPrioritiesProvider>
  </CrewCatalogProvider>
</PlayerDataProvider>
```

- [ ] **Step 7: Wire `OverviewPage.tsx`**

Add imports — `useCitationPriorities` (from `../hooks/useCitationPriorities`), `applyPriorityCutoff` (from `../crew/priorityCutoff`), and `type { CrewMember }` from `../types/crew` (not currently imported in this file — needed for the `resolveCitationCrew` type guard below) — and after the existing `gauntletPriorityCrew` computation, add:

```ts
const { data: citationPriorities, loading: citationLoading, error: citationError } = useCitationPriorities();

const crewById = new Map(crewList.map((c) => [c.id, c]));

function resolveCitationCrew(ids: number[]): CrewMember[] {
  return ids.map((id) => crewById.get(id)).filter((c): c is CrewMember => c !== undefined);
}

const originalAlgorithmCrew = citationPriorities ? applyPriorityCutoff(resolveCitationCrew(citationPriorities.originalAlgorithm)) : [];
const betaTachyonCrew = citationPriorities ? applyPriorityCutoff(resolveCitationCrew(citationPriorities.betaTachyon)) : [];
```

Insert two new sections between the existing "Priorities (Gauntlet)" block and the "Missing Crew recap" `TableContainer`, each gated independently on `citationPriorities`/`citationLoading`/`citationError` (not on `showCatalogData` — this data source is independent, per the design spec §4):

```tsx
<Divider sx={{ my: 2 }} />
<Typography variant="h5">Priorities (Original Algorithm)</Typography>
{citationLoading && <Typography>Loading priorities…</Typography>}
{citationError && <Alert severity="error">{citationError}</Alert>}
{citationPriorities && (
  <CrewTable crew={originalAlgorithmCrew} collections={collectionsList} showCollectionsNames={true} />
)}

<Divider sx={{ my: 2 }} />
<Typography variant="h5">Priorities (Beta Tachyon)</Typography>
{citationLoading && <Typography>Loading priorities…</Typography>}
{citationError && <Alert severity="error">{citationError}</Alert>}
{citationPriorities && (
  <CrewTable crew={betaTachyonCrew} collections={collectionsList} showCollectionsNames={true} />
)}
```

(`Alert` is already imported in `OverviewPage.tsx` for the existing `error`/`catalogError` handling — reuse it, don't re-import.)

- [ ] **Step 8: Real-browser verification**

Using Playwright (per `CLAUDE.md`'s house convention — fresh `mcp__playwright__*`/`mcp__chrome-devtools__*` session first, fall back to the pinned `playwright` npm library): start the dev server, navigate to `/`, and confirm:
1. The page's existing content (Player Info, Gauntlet table) renders immediately without waiting on citation priorities.
2. Both new sections appear in the correct order (Gauntlet → Original Algorithm → Beta Tachyon → Missing Crew recap), each with the exact title text.
3. Each table's row count and crew order match what `applyPriorityCutoff` produces from the live `/api/citation-priorities` response for that engine (spot-check a few names/positions, not necessarily every row).
4. Reload the page and confirm the "Loading priorities…" text is visible only briefly (or not at all, if the cache is warm) rather than a permanent stuck state.

- [ ] **Step 9: Commit**

```bash
git add client/src/crew/priorityCutoff.ts client/src/api/citationPrioritiesApi.ts \
  client/src/context/CitationPrioritiesContext.tsx client/src/hooks/useCitationPriorities.ts \
  client/src/App.tsx client/src/pages/OverviewPage.tsx
git commit -m "Add Priorities (Original Algorithm) and Priorities (Beta Tachyon) Overview tables"
```

---

## Final whole-branch review focus areas

Beyond the standard review checklist, the final reviewer should specifically:
- Independently re-derive the Original Algorithm's top ~10 against real data (Task 3's own verification is not a substitute for a second, independent check, same standard as every prior feature this session).
- Read Task 4's ported `betaTachyonPulse.ts` side-by-side with the pinned commit's `betatachyon.ts`, function by function, given this is the plan's single highest-risk piece — confirm no section was silently dropped or approximated.
- Confirm none of the three new caches (`citationCrewCache.ts`, `itemsCache.ts`, `collectionsCache.ts`) leaked into or widened the existing `catalogCache.ts`/`CatalogEntry`.
- Confirm buyback-state exclusion happens exactly once, server-side, before either algorithm runs (Task 5), and that neither algorithm port independently re-filters or fails to filter it.
- Time a request to `/api/citation-priorities` on the merged branch **twice in a row**: the first (cold response-cache) is expected to take up to ~15-20s per Tasks 3-4's own measurements — confirm it's in that ballpark, not wildly worse. The second (warm response-cache, same underlying `player-cache.json`) should be near-instant — confirm the mtime-keyed cache from Task 5's amendment is actually working, not silently falling through to a full recompute every time.
