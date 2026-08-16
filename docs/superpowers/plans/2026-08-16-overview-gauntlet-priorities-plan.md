# Overview "Priorities (Gauntlet)" Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new "Priorities (Gauntlet)" table to the Overview page, listing the top 5 owned 5★-max crew (not fully leveled or missing equipment) ranked by their datacore.app Gauntlet rank, best first.

**Architecture:** Two tasks. Task 1 is the data layer — a new `CatalogEntry.gauntlet_rank` field plumbed from the upstream catalog feed, plus the getter/filter/sorter functions that join it against owned crew. Task 2 is the UI — a new optional "Rank" column on the shared `CrewTable` component, and the new Overview page section that wires Task 1's functions together.

**Tech Stack:** React 19, TypeScript strict mode (client), Express + TypeScript (server), MUI, `tsx` (root devDependency, used for throwaway verification scripts — this project has no automated test framework by deliberate choice).

## Global Constraints

- New `CatalogEntry` field: `gauntlet_rank: number`, extracted server-side from the raw upstream field `ranks.gauntletRank` (confirmed present and unique 1–1966 across the entire catalog — no fallback needed in practice, but use `?? 0` defensively to match the existing `data_score` field's style).
- Declared independently in both `server/src/catalogClient.ts` and `client/src/types/catalogEntry.ts` — same shape by convention, matching every other `CatalogEntry` field.
- `server/src/catalogCache.ts`'s `readCatalogCache()` old-shape guard must also check for `gauntlet_rank` (as a `number`), so a pre-existing cache file from before this feature is correctly treated as stale and refetched live, exactly like the guard already does for `data_score`/`uniquely_retrievable`.
- Candidate filter: owned crew where `max_rarity === 5`, `!in_buy_back_state`, and (`level < 100` OR `getEquipmentSlotsRemaining(c) < 0`) — current rarity is not used as a filter condition.
- Sort ascending by `gauntlet_rank` (lowest/best number first); gauntlet ranks are confirmed never duplicated, so no tiebreaker is needed.
- Hard limit: top 5 results only, via `.slice(0, GAUNTLET_PRIORITY_LIMIT)` with `GAUNTLET_PRIORITY_LIMIT = 5`.
- `CrewTable` gains one new optional prop, `gauntletRankByArchetypeId?: Map<number, number>` (undefined = column hidden, matching the existing `uniquelyRetrievableArchetypeIds` pattern). The new "Rank" column is inserted **between Name and Level** — not appended at the end like the Uniquely Retrievable column.
- The Overview page's existing `showMissingTables` constant is renamed to `showCatalogData` and reused to gate both the new "Priorities (Gauntlet)" section and the existing "Missing 4 Stars"/Base Skill Bonus/Proficiency Bonus block — same boolean condition as before (`!loading && !error && identity && !catalogLoading && !catalogError && catalog`), just named for reuse instead of duplicated.
- New section placement: immediately after the "Player Info" table, before "Missing Crew recap".
- Title: exactly "Priorities (Gauntlet)" — no count suffix, no search bar (fixed 5-row cap makes both low-value).
- Build (`npm run build -w server`, `npm run build -w client`) and lint (`npm run lint -w server`, `npm run lint -w client`) must all stay clean: 0 errors, same pre-existing warning count as before this feature.
- Full spec: `docs/superpowers/specs/2026-08-16-overview-gauntlet-priorities-design.md`.
- **Real expected output, computed from `server/data/player-cache.json` joined against the live catalog feed as of 2026-08-16 — exactly 5 rows, in final sorted order:**

  ```
  1. Eli Hollander      #5
  2. Kurn                #8
  3. Korath              #13
  4. Primarch Ruhn       #15
  5. Marooned Gorn       #17
  ```

  If the live catalog or player data has changed since this plan was written, re-derive independently (see each task's verification step) rather than expecting a byte-match.

---

### Task 1: `gauntlet_rank` field, cache guard, and the join helpers

**Files:**
- Modify: `server/src/catalogClient.ts`
- Modify: `server/src/catalogCache.ts`
- Modify: `client/src/types/catalogEntry.ts`
- Modify: `client/src/catalog/getters.ts`
- Modify: `client/src/crew/filters.ts`
- Modify: `client/src/crew/sorters.ts`

**Interfaces:**
- Consumes: existing `getEquipmentSlotsRemaining(crew: CrewMember): number` from `client/src/crew/getters.ts`; existing `Comparator<T>` type from `client/src/lib/comparator.ts`.
- Produces (for Task 2 to consume):
  - `CatalogEntry.gauntlet_rank: number` (both `server/src/catalogClient.ts` and `client/src/types/catalogEntry.ts`)
  - `getGauntletRankMap(catalog: CatalogEntry[]): Map<number, number>` in `client/src/catalog/getters.ts`
  - `filterGauntletPriority(crew: CrewMember[], gauntletRankMap: Map<number, number>): CrewMember[]` in `client/src/crew/filters.ts`
  - `byGauntletRankAsc(gauntletRankMap: Map<number, number>): Comparator<CrewMember>` in `client/src/crew/sorters.ts`

- [ ] **Step 1: Add `gauntlet_rank` to `CatalogEntry` and its extraction in `server/src/catalogClient.ts`**

Replace:

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
  uniquely_retrievable: boolean;
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
  unique_polestar_combos?: string[][];
  [key: string]: unknown;
}
```

with:

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
  uniquely_retrievable: boolean;
  gauntlet_rank: number;
}

interface RawCatalogEntry {
  archetype_id: number;
  max_rarity: number;
  in_portal: boolean;
  name: string;
  imageUrlPortrait: string;
  traits?: string[];
  traits_hidden?: string[];
  ranks?: { scores?: { overall?: number }; gauntletRank?: number };
  unique_polestar_combos?: string[][];
  [key: string]: unknown;
}
```

Then replace:

```ts
    data_score: e.ranks?.scores?.overall ?? 0,
    traits: e.traits ?? [],
    traits_hidden: e.traits_hidden ?? [],
    uniquely_retrievable: Boolean(e.in_portal) && (e.unique_polestar_combos?.length ?? 0) > 0,
  }));
```

with:

```ts
    data_score: e.ranks?.scores?.overall ?? 0,
    traits: e.traits ?? [],
    traits_hidden: e.traits_hidden ?? [],
    uniquely_retrievable: Boolean(e.in_portal) && (e.unique_polestar_combos?.length ?? 0) > 0,
    gauntlet_rank: e.ranks?.gauntletRank ?? 0,
  }));
```

- [ ] **Step 2: Extend the cache freshness guard in `server/src/catalogCache.ts`**

Replace:

```ts
    if (
      parsed.length === 0 ||
      typeof parsed[0].data_score !== 'number' ||
      typeof parsed[0].uniquely_retrievable !== 'boolean'
    ) {
      // Empty, or old-shape cache (pre-widening of CatalogEntry) — treat as absent so callers refetch live.
      return null;
    }
```

with:

```ts
    if (
      parsed.length === 0 ||
      typeof parsed[0].data_score !== 'number' ||
      typeof parsed[0].uniquely_retrievable !== 'boolean' ||
      typeof parsed[0].gauntlet_rank !== 'number'
    ) {
      // Empty, or old-shape cache (pre-widening of CatalogEntry) — treat as absent so callers refetch live.
      return null;
    }
```

- [ ] **Step 3: Add `gauntlet_rank` to `client/src/types/catalogEntry.ts`**

Replace the entire file contents:

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
  uniquely_retrievable: boolean;
}
```

with:

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
  uniquely_retrievable: boolean;
  gauntlet_rank: number;
}
```

- [ ] **Step 4: Add `getGauntletRankMap` to `client/src/catalog/getters.ts`**

Append at the end of the file:

```ts

export function getGauntletRankMap(catalog: CatalogEntry[]): Map<number, number> {
  if (!Array.isArray(catalog)) return new Map();
  return new Map(catalog.map((c) => [c.archetype_id, c.gauntlet_rank]));
}
```

- [ ] **Step 5: Add `filterGauntletPriority` to `client/src/crew/filters.ts`**

Replace:

```ts
import type { CrewMember } from '../types/crew';
import type { OwnedItem } from '../types/item';
import { getQPLevel, isImmortalized, isReadyToImmortalize, QP_MAX_LEVEL } from './getters';
```

with:

```ts
import type { CrewMember } from '../types/crew';
import type { OwnedItem } from '../types/item';
import { getEquipmentSlotsRemaining, getQPLevel, isImmortalized, isReadyToImmortalize, QP_MAX_LEVEL } from './getters';
```

Then append at the end of the file:

```ts

export function filterGauntletPriority(
  crew: CrewMember[],
  gauntletRankMap: Map<number, number>
): CrewMember[] {
  return crew.filter(
    (c) =>
      c.max_rarity === 5 &&
      !c.in_buy_back_state &&
      (c.level < 100 || getEquipmentSlotsRemaining(c) < 0) &&
      gauntletRankMap.has(c.archetype_id)
  );
}
```

- [ ] **Step 6: Add `byGauntletRankAsc` to `client/src/crew/sorters.ts`**

Append at the end of the file:

```ts

// Safe to use `!` here because this comparator is only ever called on crew
// already filtered by filterGauntletPriority, which guarantees every crew
// passed in has a gauntletRankMap entry.
export function byGauntletRankAsc(gauntletRankMap: Map<number, number>): Comparator<CrewMember> {
  return (a, b) => gauntletRankMap.get(a.archetype_id)! - gauntletRankMap.get(b.archetype_id)!;
}
```

- [ ] **Step 7: Build and lint**

Run: `npm run build -w server` — expect success, 0 errors.
Run: `npm run build -w client` — expect success, 0 errors.
Run: `npm run lint -w server` — expect 0 errors, same pre-existing warning count as before this feature.
Run: `npm run lint -w client` — expect 0 errors, same pre-existing warning count as before this feature.

- [ ] **Step 8: Data-driven verification against the real, live-refreshed `server/data/player-cache.json` and the live catalog feed**

Write a throwaway script at the repo root, `verify-gauntlet.ts` (not committed — delete it after capturing output), using `tsx` (already a root devDependency):

```ts
import { readFileSync } from 'node:fs';
import { fetchCrewCatalog } from './server/src/catalogClient';
import { getCrewList } from './client/src/crew/getters';
import { getGauntletRankMap } from './client/src/catalog/getters';
import { filterGauntletPriority } from './client/src/crew/filters';
import { byGauntletRankAsc, sortCrew } from './client/src/crew/sorters';

async function main() {
  const catalog = await fetchCrewCatalog();
  console.log('catalog size:', catalog.length);

  const eli = catalog.find((c) => c.name === 'Eli Hollander');
  console.log('Eli Hollander gauntlet_rank:', eli?.gauntlet_rank);

  const playerData = JSON.parse(readFileSync('server/data/player-cache.json', 'utf-8'));
  const crewList = getCrewList(playerData);
  const gauntletRankMap = getGauntletRankMap(catalog);

  const top5 = sortCrew(filterGauntletPriority(crewList, gauntletRankMap), byGauntletRankAsc(gauntletRankMap)).slice(
    0,
    5
  );
  top5.forEach((c, i) => console.log(`${i + 1}. ${c.name} #${gauntletRankMap.get(c.archetype_id)}`));
}

main();
```

Run: `npx tsx verify-gauntlet.ts` (from the repo root). This makes a real network request to `https://datacore.app/structured/crew.json` — if network access is unavailable in your environment, fetch the same URL with `curl` to a temp file first and adapt the script to read that file with `getGauntletRankMap`'s expected shape (`{archetype_id, gauntlet_rank}[]`) instead of calling `fetchCrewCatalog` directly.

**Expected output, computed as of 2026-08-16 — confirm your run matches exactly:**

```
catalog size: 1966
Eli Hollander gauntlet_rank: 5
1. Eli Hollander #5
2. Kurn #8
3. Korath #13
4. Primarch Ruhn #15
5. Marooned Gorn #17
```

If your run's data has since changed (the catalog refreshes periodically, or the user's roster has changed), the important thing is that your run's output genuinely reflects the candidate filter and sort described in the Global Constraints — not that it byte-matches the list above. State explicitly in your report whether your run matched exactly or differed (and why, if you can tell).

Delete the throwaway script once you've captured its output in your report.

- [ ] **Step 9: Commit**

```bash
git add server/src/catalogClient.ts server/src/catalogCache.ts client/src/types/catalogEntry.ts client/src/catalog/getters.ts client/src/crew/filters.ts client/src/crew/sorters.ts
git commit -m "Add gauntlet_rank to CatalogEntry and the crew-priority join helpers"
```

---

### Task 2: `CrewTable` Rank column and the new Overview section

**Files:**
- Modify: `client/src/crew/CrewTable.tsx`
- Modify: `client/src/pages/OverviewPage.tsx`

**Interfaces:**
- Consumes from Task 1: `CatalogEntry.gauntlet_rank: number`, `getGauntletRankMap(catalog: CatalogEntry[]): Map<number, number>` (`client/src/catalog/getters.ts`), `filterGauntletPriority(crew: CrewMember[], gauntletRankMap: Map<number, number>): CrewMember[]` (`client/src/crew/filters.ts`), `byGauntletRankAsc(gauntletRankMap: Map<number, number>): Comparator<CrewMember>` (`client/src/crew/sorters.ts`).
- Produces: `CrewTable`'s new optional prop `gauntletRankByArchetypeId?: Map<number, number>` (consumed only by `OverviewPage.tsx` in this plan; no other current consumer needs it).

- [ ] **Step 1: Add the optional "Rank" column to `client/src/crew/CrewTable.tsx`**

Replace:

```tsx
export interface CrewTableProps {
  crew: CrewMember[];
  collections: Collection[];
  showCollectionsNames: boolean;
  uniquelyRetrievableArchetypeIds?: Set<number> | null;
}

function uniquelyRetrievableLabel(archetypeId: number, ids: Set<number> | null): string {
  if (ids === null) return 'Unavailable';
  return ids.has(archetypeId) ? 'Yes' : 'No';
}

function CrewTable({
  crew,
  collections,
  showCollectionsNames,
  uniquelyRetrievableArchetypeIds,
}: CrewTableProps) {
```

with:

```tsx
export interface CrewTableProps {
  crew: CrewMember[];
  collections: Collection[];
  showCollectionsNames: boolean;
  uniquelyRetrievableArchetypeIds?: Set<number> | null;
  gauntletRankByArchetypeId?: Map<number, number>;
}

function uniquelyRetrievableLabel(archetypeId: number, ids: Set<number> | null): string {
  if (ids === null) return 'Unavailable';
  return ids.has(archetypeId) ? 'Yes' : 'No';
}

function gauntletRankLabel(archetypeId: number, ranks: Map<number, number>): string {
  const rank = ranks.get(archetypeId);
  return rank !== undefined ? `#${rank}` : '—';
}

function CrewTable({
  crew,
  collections,
  showCollectionsNames,
  uniquelyRetrievableArchetypeIds,
  gauntletRankByArchetypeId,
}: CrewTableProps) {
```

Then replace:

```tsx
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Image</TableCell>
            <TableCell>Stars</TableCell>
            <TableCell>Name</TableCell>
            <TableCell align="right">Level</TableCell>
            <TableCell align="right">Items to equip</TableCell>
            <TableCell align="right">{showCollectionsNames ? 'Total collections' : 'Collections'}</TableCell>
            {showCollectionsNames && <TableCell>Collections names</TableCell>}
            {uniquelyRetrievableArchetypeIds !== undefined && <TableCell>Uniquely Retrievable</TableCell>}
          </TableRow>
        </TableHead>
```

with:

```tsx
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Image</TableCell>
            <TableCell>Stars</TableCell>
            <TableCell>Name</TableCell>
            {gauntletRankByArchetypeId !== undefined && <TableCell>Rank</TableCell>}
            <TableCell align="right">Level</TableCell>
            <TableCell align="right">Items to equip</TableCell>
            <TableCell align="right">{showCollectionsNames ? 'Total collections' : 'Collections'}</TableCell>
            {showCollectionsNames && <TableCell>Collections names</TableCell>}
            {uniquelyRetrievableArchetypeIds !== undefined && <TableCell>Uniquely Retrievable</TableCell>}
          </TableRow>
        </TableHead>
```

Then replace:

```tsx
              <TableRow key={c.id}>
                <TableCell>{page * pageSize + index + 1}</TableCell>
                <TableCell>
                  <Thumbnail asset={c.portrait} />
                </TableCell>
                <TableCell>
                  <StarRating rarity={c.rarity} maxRarity={c.max_rarity} />
                </TableCell>
                <TableCell>{c.name}</TableCell>
                <TableCell align="right">{c.level}</TableCell>
                <TableCell align="right">{getEquipmentSlotsRemaining(c)}</TableCell>
                <TableCell align="right">{crewCollections.length}</TableCell>
                {showCollectionsNames && (
                  <TableCell>{crewCollections.map((col) => col.name).join(', ')}</TableCell>
                )}
                {uniquelyRetrievableArchetypeIds !== undefined && (
                  <TableCell>{uniquelyRetrievableLabel(c.archetype_id, uniquelyRetrievableArchetypeIds)}</TableCell>
                )}
              </TableRow>
```

with:

```tsx
              <TableRow key={c.id}>
                <TableCell>{page * pageSize + index + 1}</TableCell>
                <TableCell>
                  <Thumbnail asset={c.portrait} />
                </TableCell>
                <TableCell>
                  <StarRating rarity={c.rarity} maxRarity={c.max_rarity} />
                </TableCell>
                <TableCell>{c.name}</TableCell>
                {gauntletRankByArchetypeId !== undefined && (
                  <TableCell>{gauntletRankLabel(c.archetype_id, gauntletRankByArchetypeId)}</TableCell>
                )}
                <TableCell align="right">{c.level}</TableCell>
                <TableCell align="right">{getEquipmentSlotsRemaining(c)}</TableCell>
                <TableCell align="right">{crewCollections.length}</TableCell>
                {showCollectionsNames && (
                  <TableCell>{crewCollections.map((col) => col.name).join(', ')}</TableCell>
                )}
                {uniquelyRetrievableArchetypeIds !== undefined && (
                  <TableCell>{uniquelyRetrievableLabel(c.archetype_id, uniquelyRetrievableArchetypeIds)}</TableCell>
                )}
              </TableRow>
```

Then replace:

```tsx
          colSpan={(showCollectionsNames ? 8 : 7) + (uniquelyRetrievableArchetypeIds !== undefined ? 1 : 0)}
```

with:

```tsx
          colSpan={
            (showCollectionsNames ? 8 : 7) +
            (uniquelyRetrievableArchetypeIds !== undefined ? 1 : 0) +
            (gauntletRankByArchetypeId !== undefined ? 1 : 0)
          }
```

- [ ] **Step 2: Extend `client/src/pages/OverviewPage.tsx`'s imports**

Replace:

```tsx
import { usePlayerData } from '../hooks/usePlayerData';
import { useCrewCatalog } from '../hooks/useCrewCatalog';
import { extractPlayerIdentity } from '../lib/extractPlayerIdentity';
import { getBaseSkillBonuses, getProficiencyBonuses } from '../lib/skillBuffs';
import { getCrewList, getFrozenCrewArchetypeIds, getOwnedArchetypeIds } from '../crew/getters';
import { filterMissingFavorite } from '../crew/filters';
import { defaultCrewComparator, sortCrew } from '../crew/sorters';
import { getArchetypeMaxRarityMap, getCatalogCount, getMissingCrew } from '../catalog/getters';
import { byDataScoreDesc } from '../catalog/sorters';
import { getCollectionsList } from '../collections/getters';
import { useSearch } from '../lib/useSearch';
import CrewTable from '../crew/CrewTable';
import MissingCrewTable from '../catalog/MissingCrewTable';
import TableSearchBar from '../components/TableSearchBar';
import type { PlayerIdentity } from '../types/player';
import type { CatalogEntry } from '../types/catalogEntry';

const getCatalogEntryName = (c: CatalogEntry) => [c.name];

const FIELD_LABELS: Record<keyof PlayerIdentity, string> = {
  playerId: 'Player ID',
  dbid: 'DBID',
};
```

with:

```tsx
import { usePlayerData } from '../hooks/usePlayerData';
import { useCrewCatalog } from '../hooks/useCrewCatalog';
import { extractPlayerIdentity } from '../lib/extractPlayerIdentity';
import { getBaseSkillBonuses, getProficiencyBonuses } from '../lib/skillBuffs';
import { getCrewList, getFrozenCrewArchetypeIds, getOwnedArchetypeIds } from '../crew/getters';
import { filterGauntletPriority, filterMissingFavorite } from '../crew/filters';
import { byGauntletRankAsc, defaultCrewComparator, sortCrew } from '../crew/sorters';
import { getArchetypeMaxRarityMap, getCatalogCount, getGauntletRankMap, getMissingCrew } from '../catalog/getters';
import { byDataScoreDesc } from '../catalog/sorters';
import { getCollectionsList } from '../collections/getters';
import { useSearch } from '../lib/useSearch';
import CrewTable from '../crew/CrewTable';
import MissingCrewTable from '../catalog/MissingCrewTable';
import TableSearchBar from '../components/TableSearchBar';
import type { PlayerIdentity } from '../types/player';
import type { CatalogEntry } from '../types/catalogEntry';

const getCatalogEntryName = (c: CatalogEntry) => [c.name];

const GAUNTLET_PRIORITY_LIMIT = 5;

const FIELD_LABELS: Record<keyof PlayerIdentity, string> = {
  playerId: 'Player ID',
  dbid: 'DBID',
};
```

- [ ] **Step 3: Compute the gauntlet priority list**

Replace:

```tsx
  const crewList = data ? getCrewList(data) : [];
  const frozenArchetypeIds = data ? getFrozenCrewArchetypeIds(data) : new Set<number>();
  const catalogMaxRarityById = catalog ? getArchetypeMaxRarityMap(catalog) : new Map<number, number>();
  const collectionsList = data ? getCollectionsList(data) : [];
```

with:

```tsx
  const crewList = data ? getCrewList(data) : [];
  const frozenArchetypeIds = data ? getFrozenCrewArchetypeIds(data) : new Set<number>();
  const catalogMaxRarityById = catalog ? getArchetypeMaxRarityMap(catalog) : new Map<number, number>();
  const gauntletRankMap = catalog ? getGauntletRankMap(catalog) : new Map<number, number>();
  const gauntletPriorityCrew = catalog
    ? sortCrew(filterGauntletPriority(crewList, gauntletRankMap), byGauntletRankAsc(gauntletRankMap)).slice(
        0,
        GAUNTLET_PRIORITY_LIMIT
      )
    : [];
  const collectionsList = data ? getCollectionsList(data) : [];
```

- [ ] **Step 4: Rename `showMissingTables` to `showCatalogData`**

Replace:

```tsx
  const showMissingTables = Boolean(
    !loading && !error && identity && !catalogLoading && !catalogError && catalog
  );
```

with:

```tsx
  const showCatalogData = Boolean(
    !loading && !error && identity && !catalogLoading && !catalogError && catalog
  );
```

- [ ] **Step 5: Insert the new "Priorities (Gauntlet)" section between "Player Info" and "Missing Crew recap"**

Replace:

```tsx
          </Table>
        </TableContainer>
      )}

      {!loading && !error && identity && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell colSpan={2}>
                  <Typography variant="h5" component="span">
                    Missing Crew recap
                  </Typography>
                </TableCell>
              </TableRow>
            </TableHead>
```

with:

```tsx
          </Table>
        </TableContainer>
      )}

      {showCatalogData && (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography variant="h5">Priorities (Gauntlet)</Typography>
          <CrewTable
            crew={gauntletPriorityCrew}
            collections={collectionsList}
            showCollectionsNames={true}
            gauntletRankByArchetypeId={gauntletRankMap}
          />
        </>
      )}

      {!loading && !error && identity && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell colSpan={2}>
                  <Typography variant="h5" component="span">
                    Missing Crew recap
                  </Typography>
                </TableCell>
              </TableRow>
            </TableHead>
```

(This is a pure insertion — everything after the "Player Info" `</TableContainer>{')}'}` and before "Missing Crew recap"'s own opening is otherwise untouched; the "Replace with" text ends with the identical lines the "Replace" text started with, just with the new section inserted before them.)

- [ ] **Step 6: Rename the remaining `showMissingTables` usage**

Replace:

```tsx
      {showMissingTables && (
        <>
          <Divider sx={{ my: 2 }} />
          <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
            <Typography variant="h5">
              Missing 4 Stars (In Portal) ({inPortalSearch.filteredItems.length} of {missingInPortal.length})
            </Typography>
```

with:

```tsx
      {showCatalogData && (
        <>
          <Divider sx={{ my: 2 }} />
          <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
            <Typography variant="h5">
              Missing 4 Stars (In Portal) ({inPortalSearch.filteredItems.length} of {missingInPortal.length})
            </Typography>
```

- [ ] **Step 7: Build and lint**

Run: `npm run build -w client` — expect success, 0 errors.
Run: `npm run lint -w client` — expect 0 errors, same pre-existing warning count as before this feature.

- [ ] **Step 8: Data-driven verification**

Reuse (or re-run) Task 1's `verify-gauntlet.ts` script — it already exercises `getGauntletRankMap` + `filterGauntletPriority` + `byGauntletRankAsc` exactly as `OverviewPage.tsx` now calls them. Confirm the output still matches (or re-derive if live data has changed, per Task 1 Step 8's note). No new script is needed for this task's data logic since it's identical to Task 1's.

- [ ] **Step 9: Real-browser verification**

The real, live-refreshed `server/data/player-cache.json` should already be seeded in this worktree (per this project's established worktree-setup convention). If it's missing, copy it from the main checkout before proceeding. `server/data/crew-catalog-cache.json` does not need seeding — if absent, the server fetches the catalog live on first request (confirmed working via direct `curl` during this feature's investigation).

Start the dev server: `npm run dev` (root). Using the `playwright` library directly (or the `mcp__playwright__*`/`mcp__chrome-devtools__*` MCP tools if available — see `CLAUDE.md`), navigate to `/` (Overview) and:

1. Confirm a new "Priorities (Gauntlet)" section renders directly between "Player Info" and "Missing Crew recap" — with a heading and a table, no search box.
2. Confirm the section does not render (or the page shows its normal loading state) until the crew catalog has finished loading — i.e., it's gated the same way "Missing 4 Stars" is, not the way "Missing Favorite Flag" is.
3. Read the actual rendered rows (per-cell reads — do not use a whole-row/concatenated text extraction) and confirm exactly 5 rows, in order, matching Step 8's script output (or, if live data has changed, whichever rows actually appear — cross-check against a fresh run of the script in that case).
4. Confirm the table's columns are: `#`, Image, Stars, Name, **Rank**, Level, Items to equip, Total collections, Collections names — i.e., the standard `CrewTable` set with the new Rank column inserted right after Name, showing values like `#5`, `#8`, `#13`, `#15`, `#17` for the five real crew in that order.
5. Confirm the rest of the page (Player Info, Missing Crew recap, Missing Favorite Flag, Missing 4 Stars tables, Base Skill Bonus, Proficiency Bonus) still renders correctly — no regression from the `showMissingTables` → `showCatalogData` rename.

Stop the dev server afterward (kill only the process this step started — confirm ownership via the working-directory/port before killing anything if a port conflict comes up; if the port is already occupied by the user's own separately-running dev server, do not kill it — run on an alternate port instead, same as established practice on this project).

- [ ] **Step 10: Commit**

```bash
git add client/src/crew/CrewTable.tsx client/src/pages/OverviewPage.tsx
git commit -m "Add Priorities (Gauntlet) table to Overview page"
```
