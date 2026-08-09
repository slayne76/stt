# Missing 4★ Crew Tables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new tables to the Overview page — "Missing 4 Stars (In Portal)" and "Missing 4 Stars (Not in Portal)" — listing 4★ crew archetypes the player doesn't own, sorted by DataScore descending, with `#`/`Image`/`Name`/`DataScore`/`Collections` columns.

**Architecture:** Two tasks. Task 1 is the data layer: widen `CatalogEntry` (server + client) to carry the five new fields these tables need, add `getMissingCrew` and a new `catalog/sorters.ts`, verified with a data-driven script against a real (re-fetched, widened) catalog cache — no UI involved. Task 2 is the UI layer: a small backward-compatible `Thumbnail` widening, a small backward-compatible `collections/getters.ts` type widening (needed because `CatalogEntry` isn't a `CrewMember` and can't be passed where one is structurally required), the new `MissingCrewTable` component, and the Overview page wiring — verified interactively against a real running dev server.

**Tech Stack:** Same as the existing client/server workspaces — React 19, TypeScript (strict), MUI 6, Express, no new dependencies.

## Global Constraints

- **`CatalogEntry` grows from 3 to 8 fields** (both `server/src/catalogClient.ts` and `client/src/types/catalogEntry.ts`, independently, matching this monorepo's existing no-shared-types convention): `archetype_id`, `max_rarity`, `in_portal` (existing) plus `name: string`, `imageUrlPortrait: string`, `data_score: number`, `traits: string[]`, `traits_hidden: string[]` (new).
- **DataScore is `ranks.scores.overall`** from the raw upstream catalog entry (verified: exact match against a known real value, 0-100 scale, populated for all entries, zero nulls — no fallback/tie-break logic needed). Server-side reduction: `data_score: e.ranks?.scores?.overall ?? 0` (defensive fallback only, not expected to trigger on real data).
- **"Missing" is the exact complement of the existing `getOwnedArchetypeIds`** — reused unmodified as the ownership source, so the "missing in-portal + missing not-in-portal = total - owned" arithmetic holds by construction, not by a second independent computation.
- **`crewBelongsToCollection`/`getCrewCollections` (`collections/getters.ts`) need their parameter type widened** from `CrewMember` to a new, minimal, exported `CollectionMatchable` interface (`{ archetype_id: number; traits: string[]; traits_hidden: string[] }`) — `CrewMember` already satisfies this structurally (no existing call site changes needed), and it's what lets a `CatalogEntry` be passed to these functions without an unsafe cast. This is a real, necessary type change, not optional polish — without it, Task 2's `MissingCrewTable` will not compile.
- **`Thumbnail` (`assets/Thumbnail.tsx`) needs a second, optional `url` prop** — `imageUrlPortrait` is already in the exact flat-filename form `getAssetUrl()` normally derives from a nested `DatacoreAsset.file`, so the new table passes a URL directly rather than needing new URL-construction logic. `asset` becomes optional too; every existing call site keeps passing `asset` unchanged.
- **Column order for the new table, exact:** `#`, `Image`, `Name`, `DataScore` (right-aligned, `.toFixed(2)`), `Collections`. No Stars/Level/Items-to-equip columns.
- **No automated test framework** (project-wide, deliberate choice). Task 1 verification is a throwaway data-driven script against a real (re-fetched) catalog cache plus `example-data.json`. Task 2 verification is `playwright` MCP browser checks against a real running dev server.
- **Spec:** `docs/superpowers/specs/2026-08-09-missing-4-stars-tables-design.md`.

---

### Task 1: Data layer — widen CatalogEntry, add getMissingCrew and sorters

**Files:**
- Modify: `server/src/catalogClient.ts`
- Modify: `client/src/types/catalogEntry.ts`
- Modify: `client/src/catalog/getters.ts`
- Create: `client/src/catalog/sorters.ts`

**Interfaces:**
- Consumes: nothing new — `UpstreamError` (existing), `getOwnedArchetypeIds` (existing, `crew/getters.ts`, used only in this task's verification, not modified).
- Produces (consumed by Task 2): widened `CatalogEntry` (both sides) with the 8 fields listed in Global Constraints; `getMissingCrew(catalog: CatalogEntry[], ownedArchetypeIds: Set<number>, maxRarity: number, inPortal: boolean): CatalogEntry[]` (`catalog/getters.ts`); `byDataScoreDesc(a: CatalogEntry, b: CatalogEntry): number` (`catalog/sorters.ts`).

- [ ] **Step 1: Confirm the current state of all four files matches this plan's assumptions**

Run: `cat -n server/src/catalogClient.ts client/src/types/catalogEntry.ts client/src/catalog/getters.ts`

Confirm `server/src/catalogClient.ts`'s `CatalogEntry` has exactly the 3 fields `archetype_id`/`max_rarity`/`in_portal`, `client/src/types/catalogEntry.ts` matches it, and `client/src/catalog/getters.ts` has exactly `getArchetypeMaxRarityMap` and `getCatalogCount` (in that order). Confirm `client/src/catalog/sorters.ts` does not yet exist (`ls client/src/catalog/sorters.ts` should report "No such file or directory"). If any of this differs, stop and re-check the spec before proceeding.

- [ ] **Step 2: Widen `CatalogEntry` in `server/src/catalogClient.ts`**

Replace the whole file with:
```ts
import { UpstreamError } from './errors';

const CATALOG_UPSTREAM_URL = 'https://datacore.app/structured/crew.json';

export interface CatalogEntry {
  archetype_id: number;
  max_rarity: number;
  in_portal: boolean;
  name: string;
  imageUrlPortrait: string;
  data_score: number;
  traits: string[];
  traits_hidden: string[];
}

interface RawCatalogEntry {
  archetype_id: number;
  max_rarity: number;
  in_portal: boolean;
  name: string;
  imageUrlPortrait: string;
  traits?: string[];
  traits_hidden?: string[];
  ranks?: { scores?: { overall?: number } };
  [key: string]: unknown;
}

export async function fetchCrewCatalog(): Promise<CatalogEntry[]> {
  let response: Response;
  try {
    response = await fetch(CATALOG_UPSTREAM_URL, { signal: AbortSignal.timeout(30_000) });
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
    name: e.name,
    imageUrlPortrait: e.imageUrlPortrait,
    data_score: e.ranks?.scores?.overall ?? 0,
    traits: e.traits ?? [],
    traits_hidden: e.traits_hidden ?? [],
  }));
}
```

- [ ] **Step 3: Widen `CatalogEntry` in `client/src/types/catalogEntry.ts`**

Replace the whole file with:
```ts
export interface CatalogEntry {
  archetype_id: number;
  max_rarity: number;
  in_portal: boolean;
  name: string;
  imageUrlPortrait: string;
  data_score: number;
  traits: string[];
  traits_hidden: string[];
}
```

- [ ] **Step 4: Add `getMissingCrew` to `client/src/catalog/getters.ts`**

Append at the end of the file (after `getCatalogCount`):
```ts

export function getMissingCrew(
  catalog: CatalogEntry[],
  ownedArchetypeIds: Set<number>,
  maxRarity: number,
  inPortal: boolean
): CatalogEntry[] {
  if (!Array.isArray(catalog)) return [];
  return catalog.filter(
    (c) => c.max_rarity === maxRarity && c.in_portal === inPortal && !ownedArchetypeIds.has(c.archetype_id)
  );
}
```

- [ ] **Step 5: Create `client/src/catalog/sorters.ts`**

```ts
import type { CatalogEntry } from '../types/catalogEntry';

export function byDataScoreDesc(a: CatalogEntry, b: CatalogEntry): number {
  return b.data_score - a.data_score;
}
```

- [ ] **Step 6: Build and lint check**

Run: `npm run build -w server` and `npm run build -w client`
Expected: exits 0, both.

Run: `npm run lint -w server` and `npm run lint -w client`
Expected: exits 0, both, no new errors.

- [ ] **Step 7: Force a fresh, widened catalog cache on a real running server**

The existing `server/data/crew-catalog-cache.json` (if present in this worktree) was written under the OLD 3-field shape and must be regenerated before verification — otherwise `GET /api/crew-catalog` would serve stale data missing the 5 new fields (it's still within its 24h TTL from whenever it was last written).

Start the server if not already running (`npm run dev -w server` from the worktree root, or `npm run dev` from the repo root). Then:

```bash
rm -f server/data/crew-catalog-cache.json
curl -s -X POST http://127.0.0.1:3001/api/crew-catalog/refresh --max-time 120 -o /dev/null -w 'HTTP %{http_code}\n'
```

Expected: `HTTP 200`. This may take up to a minute or two (a real ~40MB upstream fetch). Confirm the new shape landed:

```bash
node -e "const d = require('./server/data/crew-catalog-cache.json'); const e = d[0]; console.log(Object.keys(e).sort());"
```

Expected output includes all 8 keys: `archetype_id`, `data_score`, `imageUrlPortrait`, `in_portal`, `max_rarity`, `name`, `traits`, `traits_hidden`.

- [ ] **Step 8: Verify against real data**

`example-data.json` (gitignored, real personal game data) is at the repo root. `server/data/crew-catalog-cache.json` now holds a real, widened catalog snapshot (from Step 7) — the verify script reads it directly rather than fetching again.

Create a throwaway script at `client/src/crew/__verify.ts` (deleted in Step 10, never committed):

```ts
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { getCrewList, getFrozenCrewArchetypeIds, getOwnedArchetypeIds } from './getters';
import { getArchetypeMaxRarityMap, getCatalogCount, getMissingCrew } from '../catalog/getters';
import { byDataScoreDesc } from '../catalog/sorters';
import { getCollectionsList, getCrewCollections } from '../collections/getters';
import type { CatalogEntry } from '../types/catalogEntry';

const raw = JSON.parse(readFileSync('example-data.json', 'utf-8')) as Record<string, unknown>;
const crewList = getCrewList(raw);
const frozenArchetypeIds = getFrozenCrewArchetypeIds(raw);
const collectionsList = getCollectionsList(raw);

const catalog = JSON.parse(readFileSync('server/data/crew-catalog-cache.json', 'utf-8')) as CatalogEntry[];
const catalogMaxRarityById = getArchetypeMaxRarityMap(catalog);

// Confirm the widened shape actually landed (Step 7 sanity check, re-asserted here).
assert.ok(catalog.length > 1000, `catalog looks too small: ${catalog.length} entries`);
assert.ok(typeof catalog[0].name === 'string' && catalog[0].name.length > 0, 'catalog entries missing name');
assert.ok(typeof catalog[0].imageUrlPortrait === 'string', 'catalog entries missing imageUrlPortrait');
assert.ok(typeof catalog[0].data_score === 'number', 'catalog entries missing data_score');
assert.ok(Array.isArray(catalog[0].traits), 'catalog entries missing traits');

const owned4 = getOwnedArchetypeIds(crewList, frozenArchetypeIds, catalogMaxRarityById, 4);
const total4 = getCatalogCount(catalog, 4);
const missingInPortal = getMissingCrew(catalog, owned4, 4, true);
const missingNotInPortal = getMissingCrew(catalog, owned4, 4, false);

console.log('4-star: owned', owned4.size, '/ total', total4);
console.log('missing in-portal:', missingInPortal.length, ', missing not-in-portal:', missingNotInPortal.length);

// The core arithmetic invariant: the two missing tables must sum to exactly
// "total - owned", by construction (both derive from the same getOwnedArchetypeIds).
assert.equal(missingInPortal.length + missingNotInPortal.length, total4 - owned4.size);

// The two missing sets must be disjoint (in_portal is a boolean, so filtering by
// true vs. false on the same source array can never double-count or drop an entry).
const inPortalIds = new Set(missingInPortal.map((c) => c.archetype_id));
const overlap = missingNotInPortal.filter((c) => inPortalIds.has(c.archetype_id));
assert.equal(overlap.length, 0, 'missing in-portal and not-in-portal sets must not overlap');

// Every returned entry must genuinely be 4-star, correctly flagged, and not owned.
for (const c of [...missingInPortal, ...missingNotInPortal]) {
  assert.equal(c.max_rarity, 4);
  assert.ok(!owned4.has(c.archetype_id), `${c.name} (${c.archetype_id}) is owned but appeared in a missing list`);
}
for (const c of missingInPortal) assert.equal(c.in_portal, true);
for (const c of missingNotInPortal) assert.equal(c.in_portal, false);

// Sort check: byDataScoreDesc must produce a non-increasing sequence.
const sorted = [...missingNotInPortal].sort(byDataScoreDesc);
for (let i = 1; i < sorted.length; i++) {
  assert.ok(sorted[i - 1].data_score >= sorted[i].data_score, `sort broke between index ${i - 1} and ${i}`);
}

// Collections check: at least one missing crew should belong to at least one real
// collection (a plausible spot check, not a guarantee for every individual crew).
const anyMissingHasCollections =
  missingInPortal.some((c) => getCrewCollections(c, collectionsList).length > 0) ||
  missingNotInPortal.some((c) => getCrewCollections(c, collectionsList).length > 0);
assert.ok(anyMissingHasCollections, 'expected at least one missing crew to belong to at least one collection');

console.log('MATCH: all missing-4-star data-layer assertions passed');
```

Run from the **repo root**: `npx tsx client/src/crew/__verify.ts`

Expected output: `MATCH: all missing-4-star data-layer assertions passed`, exit code 0. If any assertion throws, do not proceed — re-check Steps 2-5 against this plan exactly. Note: `getCrewCollections`'s parameter type is still `CrewMember` at this point in the plan (Task 2 widens it) — this verify script only calls it with entries read from `catalog` (typed `CatalogEntry[]`), so if this line fails to type-check under `npx tsx` (which does not type-check, only transpiles, so it will actually run fine here regardless) that's expected and not a blocker for this task; Task 2 makes the equivalent call type-check cleanly in the real component.

- [ ] **Step 9: Delete the throwaway verification script**

```bash
rm client/src/crew/__verify.ts
```

- [ ] **Step 10: Commit**

```bash
git add server/src/catalogClient.ts client/src/types/catalogEntry.ts client/src/catalog/getters.ts client/src/catalog/sorters.ts
git commit -m "Widen CatalogEntry and add getMissingCrew/byDataScoreDesc for the Missing 4 Stars tables"
```

---

### Task 2: UI layer — MissingCrewTable and Overview page wiring

**Files:**
- Modify: `client/src/assets/Thumbnail.tsx`
- Modify: `client/src/collections/getters.ts`
- Create: `client/src/catalog/MissingCrewTable.tsx`
- Modify: `client/src/pages/OverviewPage.tsx`

**Interfaces:**
- Consumes: widened `CatalogEntry`, `getMissingCrew`, `byDataScoreDesc` (Task 1, already on this branch); `getOwnedArchetypeIds`, `getCrewList`, `getFrozenCrewArchetypeIds` (existing, `crew/getters.ts`); `getArchetypeMaxRarityMap`, `getCatalogCount` (existing, `catalog/getters.ts`); `Collection` (existing, `types/collection.ts`); `ASSET_BASE_URL` (existing, `assets/config.ts`).
- Produces: nothing consumed elsewhere — this is the final UI-facing change. `MissingCrewTable` (default export, props `{ crew: CatalogEntry[]; collections: Collection[] }`); widened `ThumbnailProps` (`asset?`, `url?`); widened `CollectionMatchable`-typed `crewBelongsToCollection`/`getCrewCollections`.

- [ ] **Step 1: Confirm the current state of all four files matches this plan's assumptions, and that the catalog cache is still widened**

Run: `cat -n client/src/assets/Thumbnail.tsx client/src/collections/getters.ts client/src/pages/OverviewPage.tsx`

Confirm `Thumbnail.tsx`'s `ThumbnailProps` has exactly `asset: DatacoreAsset | undefined` (required, not optional). Confirm `collections/getters.ts`'s `crewBelongsToCollection`/`getCrewCollections` both take `crew: CrewMember`. Confirm `OverviewPage.tsx` matches Task 1's unchanged state (the file this plan's Task 1 didn't touch) — specifically that it has no `Divider` import and no references to `MissingCrewTable`/`getMissingCrew`. Confirm `client/src/catalog/MissingCrewTable.tsx` does not yet exist. If any of this differs, stop and re-check the spec before proceeding.

Run: `node -e "const d = require('./server/data/crew-catalog-cache.json'); console.log(Object.keys(d[0]).sort());"` — confirm all 8 `CatalogEntry` keys are still present (Task 1's Step 7 already produced this; it should persist in this same worktree, but re-run Task 1's Step 7 commands again if this check fails for any reason, e.g. the cache expired or was cleared).

- [ ] **Step 2: Widen `client/src/assets/Thumbnail.tsx`**

Replace the whole file with:
```tsx
import { useState } from 'react';
import { Box } from '@mui/material';
import { getAssetUrl } from './getAssetUrl';
import type { DatacoreAsset } from '../types/asset';

export interface ThumbnailProps {
  asset?: DatacoreAsset;
  url?: string;
}

function Thumbnail({ asset, url: urlProp }: ThumbnailProps) {
  const [failed, setFailed] = useState(false);
  const url = urlProp ?? getAssetUrl(asset);

  if (!url || failed) {
    return <Box sx={{ width: 40, height: 40, bgcolor: 'action.hover', borderRadius: 1 }} />;
  }

  return (
    <Box
      component="img"
      src={url}
      alt=""
      onError={() => setFailed(true)}
      loading="lazy"
      decoding="async"
      sx={{ width: 40, height: 40, borderRadius: 1, objectFit: 'cover' }}
    />
  );
}

export default Thumbnail;
```

- [ ] **Step 3: Widen `crewBelongsToCollection`/`getCrewCollections`'s parameter type in `client/src/collections/getters.ts`**

Replace:
```ts
import type { PlayerData } from '../types/player';
import type { Collection } from '../types/collection';
import type { CrewMember } from '../types/crew';
import type { OwnedItem } from '../types/item';
import { getCrewTier } from '../crew/getters';

export function getCollectionsList(data: PlayerData): Collection[] {
  const player = data.player as Record<string, unknown> | undefined;
  const character = player?.character as Record<string, unknown> | undefined;
  const collections = character?.cryo_collections;
  return Array.isArray(collections) ? (collections as Collection[]) : [];
}

export function crewBelongsToCollection(crew: CrewMember, collection: Collection): boolean {
  const crewTraits = new Set([...(crew.traits ?? []), ...(crew.traits_hidden ?? [])]);
  const collectionTraits = collection.traits ?? [];
  const extraCrew = collection.extra_crew ?? [];
  return collectionTraits.some((trait) => crewTraits.has(trait)) || extraCrew.includes(crew.archetype_id);
}

export function getCrewCollections(crew: CrewMember, collections: Collection[]): Collection[] {
  return collections.filter((collection) => crewBelongsToCollection(crew, collection));
}
```
with:
```ts
import type { PlayerData } from '../types/player';
import type { Collection } from '../types/collection';
import type { CrewMember } from '../types/crew';
import type { OwnedItem } from '../types/item';
import { getCrewTier } from '../crew/getters';

export function getCollectionsList(data: PlayerData): Collection[] {
  const player = data.player as Record<string, unknown> | undefined;
  const character = player?.character as Record<string, unknown> | undefined;
  const collections = character?.cryo_collections;
  return Array.isArray(collections) ? (collections as Collection[]) : [];
}

// The minimal shape crewBelongsToCollection/getCrewCollections actually need —
// CrewMember satisfies this structurally (no call site changes needed), and it's
// what lets CatalogEntry (unowned catalog crew, not a CrewMember) be passed in too,
// for the Missing 4 Stars tables (see catalog/MissingCrewTable.tsx).
export interface CollectionMatchable {
  archetype_id: number;
  traits: string[];
  traits_hidden: string[];
}

export function crewBelongsToCollection(crew: CollectionMatchable, collection: Collection): boolean {
  const crewTraits = new Set([...(crew.traits ?? []), ...(crew.traits_hidden ?? [])]);
  const collectionTraits = collection.traits ?? [];
  const extraCrew = collection.extra_crew ?? [];
  return collectionTraits.some((trait) => crewTraits.has(trait)) || extraCrew.includes(crew.archetype_id);
}

export function getCrewCollections(crew: CollectionMatchable, collections: Collection[]): Collection[] {
  return collections.filter((collection) => crewBelongsToCollection(crew, collection));
}
```

(`getCollectionCount`/`getCollectionCrew`, further down the file, are unchanged — they still take `crew: CrewMember` and still compile unchanged, since `CrewMember` is structurally assignable to the new `CollectionMatchable`.)

- [ ] **Step 4: Create `client/src/catalog/MissingCrewTable.tsx`**

```tsx
import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import type { CatalogEntry } from '../types/catalogEntry';
import type { Collection } from '../types/collection';
import { getCrewCollections } from '../collections/getters';
import Thumbnail from '../assets/Thumbnail';
import { ASSET_BASE_URL } from '../assets/config';

export interface MissingCrewTableProps {
  crew: CatalogEntry[];
  collections: Collection[];
}

function MissingCrewTable({ crew, collections }: MissingCrewTableProps) {
  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Image</TableCell>
            <TableCell>Name</TableCell>
            <TableCell align="right">DataScore</TableCell>
            <TableCell>Collections</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {crew.map((c, index) => (
            <TableRow key={c.archetype_id}>
              <TableCell>{index + 1}</TableCell>
              <TableCell>
                <Thumbnail url={`${ASSET_BASE_URL}/${c.imageUrlPortrait}`} />
              </TableCell>
              <TableCell>{c.name}</TableCell>
              <TableCell align="right">{c.data_score.toFixed(2)}</TableCell>
              <TableCell>
                {getCrewCollections(c, collections)
                  .map((col) => col.name)
                  .join(', ')}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default MissingCrewTable;
```

- [ ] **Step 5: Wire the two new sections into `client/src/pages/OverviewPage.tsx`**

Replace the whole file with:
```tsx
import {
  Alert,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from '@mui/material';
import { usePlayerData } from '../hooks/usePlayerData';
import { useCrewCatalog } from '../hooks/useCrewCatalog';
import { extractPlayerIdentity } from '../lib/extractPlayerIdentity';
import { getCrewList, getFrozenCrewArchetypeIds, getOwnedArchetypeIds } from '../crew/getters';
import { getArchetypeMaxRarityMap, getCatalogCount, getMissingCrew } from '../catalog/getters';
import { byDataScoreDesc } from '../catalog/sorters';
import { getCollectionsList } from '../collections/getters';
import MissingCrewTable from '../catalog/MissingCrewTable';
import type { PlayerIdentity } from '../types/player';

const FIELD_LABELS: Record<keyof PlayerIdentity, string> = {
  playerId: 'Player ID',
  dbid: 'DBID',
};

function OverviewPage() {
  const { data, loading, error } = usePlayerData();
  const { data: catalog, loading: catalogLoading, error: catalogError } = useCrewCatalog();
  const identity = data ? extractPlayerIdentity(data) : null;

  const crewList = data ? getCrewList(data) : [];
  const frozenArchetypeIds = data ? getFrozenCrewArchetypeIds(data) : new Set<number>();
  const catalogMaxRarityById = catalog ? getArchetypeMaxRarityMap(catalog) : new Map<number, number>();
  const collectionsList = data ? getCollectionsList(data) : [];

  function uniqueCrewCell(maxRarity: number): string {
    if (!catalog) return '—';
    const owned = getOwnedArchetypeIds(crewList, frozenArchetypeIds, catalogMaxRarityById, maxRarity).size;
    const total = getCatalogCount(catalog, maxRarity);
    const pct = total > 0 ? Math.ceil((owned / total) * 10000 - 1e-9) / 100 : 0;
    return `${owned}/${total} (${pct.toFixed(2)}%)`;
  }

  const owned4 = getOwnedArchetypeIds(crewList, frozenArchetypeIds, catalogMaxRarityById, 4);
  const missingInPortal = catalog ? [...getMissingCrew(catalog, owned4, 4, true)].sort(byDataScoreDesc) : [];
  const missingNotInPortal = catalog ? [...getMissingCrew(catalog, owned4, 4, false)].sort(byDataScoreDesc) : [];

  const showMissingTables = !loading && !error && identity && !catalogLoading && !catalogError && catalog;

  return (
    <Stack spacing={2}>
      <Typography variant="h4">Overview</Typography>

      {loading && <CircularProgress />}
      {error && <Alert severity="error">{error}</Alert>}

      {!loading && !error && identity && (
        <TableContainer component={Paper}>
          <Table>
            <TableBody>
              {(Object.keys(FIELD_LABELS) as (keyof PlayerIdentity)[]).map((field) => (
                <TableRow key={field}>
                  <TableCell component="th" scope="row">
                    {FIELD_LABELS[field]}
                  </TableCell>
                  <TableCell align="right">{identity[field] ?? '—'}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell component="th" scope="row">
                  5 Stars unique crew
                </TableCell>
                <TableCell align="right">
                  {catalogLoading ? (
                    <CircularProgress size={16} />
                  ) : catalogError ? (
                    'Unavailable'
                  ) : (
                    uniqueCrewCell(5)
                  )}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell component="th" scope="row">
                  4 Stars unique crew
                </TableCell>
                <TableCell align="right">
                  {catalogLoading ? (
                    <CircularProgress size={16} />
                  ) : catalogError ? (
                    'Unavailable'
                  ) : (
                    uniqueCrewCell(4)
                  )}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {showMissingTables && (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography variant="h5">Missing 4 Stars (In Portal)</Typography>
          <MissingCrewTable crew={missingInPortal} collections={collectionsList} />
          <Typography variant="h5">Missing 4 Stars (Not in Portal)</Typography>
          <MissingCrewTable crew={missingNotInPortal} collections={collectionsList} />
        </>
      )}
    </Stack>
  );
}

export default OverviewPage;
```

- [ ] **Step 6: Build and lint check**

Run: `npm run build -w client`
Expected: exits 0. (This is the step that confirms the `CollectionMatchable` widening actually resolves the `CatalogEntry`-into-`getCrewCollections` type mismatch — if it doesn't exit 0, re-check Step 3 and Step 4 against this plan exactly before doing anything else.)

Run: `npm run lint -w client`
Expected: exits 0, no new errors.

- [ ] **Step 7: Verify against a real running dev server**

Using the `playwright` MCP browser tools against a real running dev server with live data (check with the controller for the exact dev-server URL to use in this environment; `server/data/player-cache.json` should already be seeded in this worktree from `example-data.json` — see project memory on worktree setup if `/api/player` returns an auth error instead of real data):

1. Navigate to `/`. `browser_snapshot`.
2. Confirm the existing identity table (Player ID, DBID, 5/4 Stars unique crew rows) still renders exactly as before — this is a regression check.
3. Confirm a visible gap (the `Divider`) appears below the identity table, followed by a "Missing 4 Stars (In Portal)" heading and its table, then a "Missing 4 Stars (Not in Portal)" heading and its table.
4. Confirm each table's rows have the columns `#`, `Image`, `Name`, `DataScore`, `Collections` in that order — no Stars/Level/Items columns.
5. Confirm thumbnails render as real images (not empty placeholder boxes) for at least the first few rows in each table — this specifically proves the new `Thumbnail` `url` prop path works, not just the pre-existing `asset` path.
6. Confirm each table's DataScore column is non-increasing from top to bottom (the highest-DataScore missing crew is row 1).
7. Confirm the Collections column shows real, non-empty collection names for at least some rows.
8. Count the total rows across both new tables and confirm it matches "4 Stars unique crew"'s implied missing count (`total - owned`, readable from that row's `N/M` values) — the arithmetic invariant from the design spec, now visually confirmed end-to-end.

- [ ] **Step 8: Commit**

```bash
git add client/src/assets/Thumbnail.tsx client/src/collections/getters.ts client/src/catalog/MissingCrewTable.tsx client/src/pages/OverviewPage.tsx
git commit -m "Add the Missing 4 Stars (In Portal / Not in Portal) tables to the Overview page"
```
