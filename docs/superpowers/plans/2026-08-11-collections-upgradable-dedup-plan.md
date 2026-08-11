# Collections Upgradable-Status Dedup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compute each collection's sorted qualifying-crew list exactly once, at the page level, so the sort order (upgradable-first) and the table's row rendering (crew count, crew sub-list, "Upgradable" chip) both read from that single precomputed source instead of independently re-deriving it.

**Architecture:** Two new exports and one changed signature in `client/src/collections/sorters.ts`, consumed by `client/src/pages/CollectionsPage.tsx` (which now precomputes the shared data and passes it down) and `client/src/collections/CollectionsTable.tsx` (which now looks up precomputed data instead of calling `getCollectionCrew`/`isCollectionUpgradable`/`sortCrew` itself). All three files change together — this is one indivisible unit of work, not independently shippable pieces.

**Tech Stack:** React 19, TypeScript strict mode, no automated test framework (verification is data-driven scripts + real-browser checks, per this project's established pattern).

## Global Constraints

- No visible behavior change: sort order, "Upgradable" chip presence, "Crew" count column, and the crew sub-list's contents/order must be identical to today for every one of the 88 real collections in `example-data.json`.
- `getCollectionCrew` (`client/src/collections/getters.ts`) and `isCollectionUpgradable` (`client/src/collections/sorters.ts`) keep their current signatures and logic unchanged — only what calls them, and how often, changes.
- No `useMemo` or other memoization added — out of scope per the spec's non-goals.
- No change to `usePagination` (inside `CollectionsTable`) or `useSearch` (inside `CollectionsPage`).
- Build (`npm run build -w client`) and lint (`npm run lint -w client`) must stay clean: 0 errors, only the 2 pre-existing `react-refresh/only-export-components` warnings.
- Full spec: `docs/superpowers/specs/2026-08-11-collections-upgradable-dedup-design.md`.

---

### Task 1: Precompute qualifying-crew and upgradable-status once, wire the page and table to it

**Files:**
- Modify: `client/src/collections/sorters.ts`
- Modify: `client/src/pages/CollectionsPage.tsx`
- Modify: `client/src/collections/CollectionsTable.tsx`
- Verify (throwaway, delete before committing): `client/src/collections/__verify.ts`

**Interfaces:**
- Produces (in `sorters.ts`): `getQualifyingCrewByCollection(collections: Collection[], crewList: CrewMember[], items: OwnedItem[], frozenArchetypeIds: Set<number>): Map<number, CrewMember[]>`; `getUpgradableCollectionIds(collections: Collection[], qualifyingCrewByCollection: Map<number, CrewMember[]>, items: OwnedItem[]): Set<number>`; `byUpgradableThenCompletionThenNameAsc(upgradableIds: Set<number>): Comparator<Collection>` (changed signature — was `(collections, crewList, items, frozenArchetypeIds)`).
- Unchanged: `isCollectionUpgradable(collection: Collection, qualifyingCrew: CrewMember[], items: OwnedItem[]): boolean`; `getCollectionCrew(collection: Collection, crewList: CrewMember[], items: OwnedItem[], frozenArchetypeIds: Set<number>): CrewMember[]` (`collections/getters.ts`, untouched).
- Consumes (in `CollectionsPage.tsx`/`CollectionsTable.tsx`): the three `sorters.ts` exports above.

- [ ] **Step 1: Update `client/src/collections/sorters.ts`**

Replace the full contents of `client/src/collections/sorters.ts` with:

```ts
import type { Collection } from '../types/collection';
import type { CrewMember } from '../types/crew';
import type { OwnedItem } from '../types/item';
import { getCrewTier } from '../crew/getters';
import { byEquipmentSlotsRemainingDesc, byLevelDesc, byMaxRarityDesc, byNameAsc, byTierAsc, sortCrew } from '../crew/sorters';
import { combineComparators, type Comparator } from '../lib/comparator';
import { getCollectionCrew } from './getters';

export function isMaxedOut(collection: Collection): boolean {
  return collection.milestone.goal === 0;
}

const MAXED_OUT_RATIO = -1; // sorts maxed-out collections to the bottom, deliberately — see PROJECT_STATE.md

export function getCollectionCompletionRatio(collection: Collection): number {
  return isMaxedOut(collection) ? MAXED_OUT_RATIO : collection.progress / collection.milestone.goal;
}

export function byCompletionThenNameAsc(a: Collection, b: Collection): number {
  const ratioDiff = getCollectionCompletionRatio(b) - getCollectionCompletionRatio(a);
  if (ratioDiff !== 0) return ratioDiff;
  return a.name.localeCompare(b.name);
}

export function isCollectionUpgradable(collection: Collection, qualifyingCrew: CrewMember[], items: OwnedItem[]): boolean {
  const remaining = collection.milestone.goal - collection.progress;
  if (remaining <= 0) return false;
  const eligible = qualifyingCrew.filter((crew) => {
    const tier = getCrewTier(crew, items);
    return tier === 'ready' || tier === 'needsWork';
  }).length;
  return eligible >= remaining;
}

export function getQualifyingCrewByCollection(
  collections: Collection[],
  crewList: CrewMember[],
  items: OwnedItem[],
  frozenArchetypeIds: Set<number>
): Map<number, CrewMember[]> {
  const result = new Map<number, CrewMember[]>();
  for (const collection of collections) {
    result.set(
      collection.id,
      sortCrew(
        getCollectionCrew(collection, crewList, items, frozenArchetypeIds),
        combineComparators(byTierAsc(items), byMaxRarityDesc, byLevelDesc, byEquipmentSlotsRemainingDesc, byNameAsc)
      )
    );
  }
  return result;
}

export function getUpgradableCollectionIds(
  collections: Collection[],
  qualifyingCrewByCollection: Map<number, CrewMember[]>,
  items: OwnedItem[]
): Set<number> {
  return new Set(
    collections
      .filter((c) => isCollectionUpgradable(c, qualifyingCrewByCollection.get(c.id) ?? [], items))
      .map((c) => c.id)
  );
}

export function byUpgradableThenCompletionThenNameAsc(upgradableIds: Set<number>): Comparator<Collection> {
  return combineComparators(
    (a, b) => Number(upgradableIds.has(b.id)) - Number(upgradableIds.has(a.id)),
    byCompletionThenNameAsc
  );
}
```

The only logic changes from the current file: `getQualifyingCrewByCollection` and `getUpgradableCollectionIds` are new; `byUpgradableThenCompletionThenNameAsc` now takes a precomputed `upgradableIds: Set<number>` instead of `(collections, crewList, items, frozenArchetypeIds)` and no longer calls `getCollectionCrew`/`isCollectionUpgradable` itself. `isMaxedOut`, `getCollectionCompletionRatio`, `byCompletionThenNameAsc`, and `isCollectionUpgradable` are byte-identical to today.

- [ ] **Step 2: Update `client/src/pages/CollectionsPage.tsx`**

Replace the full contents of `client/src/pages/CollectionsPage.tsx` with:

```tsx
import { usePlayerData } from '../hooks/usePlayerData';
import { getCrewList, getFrozenCrewArchetypeIds, getOwnedItems } from '../crew/getters';
import { getCollectionsList } from '../collections/getters';
import {
  byUpgradableThenCompletionThenNameAsc,
  getQualifyingCrewByCollection,
  getUpgradableCollectionIds,
} from '../collections/sorters';
import { useSearch } from '../lib/useSearch';
import CollectionsTable from '../collections/CollectionsTable';
import PageShell from '../layout/PageShell';
import TableSearchBar from '../components/TableSearchBar';

function CollectionsPage() {
  const { data, loading, error, refresh } = usePlayerData();

  const rawCollections = data ? getCollectionsList(data) : [];
  const crew = data ? getCrewList(data) : [];
  const items = data ? getOwnedItems(data) : [];
  const frozenArchetypeIds = data ? getFrozenCrewArchetypeIds(data) : new Set<number>();
  const qualifyingCrewByCollection = getQualifyingCrewByCollection(rawCollections, crew, items, frozenArchetypeIds);
  const upgradableIds = getUpgradableCollectionIds(rawCollections, qualifyingCrewByCollection, items);
  const collections = data
    ? [...rawCollections].sort(byUpgradableThenCompletionThenNameAsc(upgradableIds))
    : [];
  const {
    query,
    setQuery,
    filteredItems: filteredCollections,
    active,
  } = useSearch(collections, (c) => [c.name]);

  const loaded = !loading && !error && !!data;

  return (
    <PageShell
      title="Collections"
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={filteredCollections.length}
      totalCount={collections.length}
      emptyMessage={
        active && filteredCollections.length === 0 ? 'No results found for your search.' : 'No collections found.'
      }
      titleActions={<TableSearchBar value={query} onChange={setQuery} ariaLabel="Search Collections by name" />}
    >
      <CollectionsTable
        collections={filteredCollections}
        items={items}
        qualifyingCrewByCollection={qualifyingCrewByCollection}
        upgradableIds={upgradableIds}
      />
    </PageShell>
  );
}

export default CollectionsPage;
```

Changes from today: `crew`/`frozenArchetypeIds` are still computed locally (needed to build `qualifyingCrewByCollection`) but no longer passed to `<CollectionsTable>`; `qualifyingCrewByCollection` and `upgradableIds` are computed once, over `rawCollections` (before search filtering), and passed down instead. `getQualifyingCrewByCollection`/`getUpgradableCollectionIds` run unconditionally (they safely return an empty Map/Set when `rawCollections` is `[]`, i.e. before `data` loads) — this matches the existing unconditional-when-empty style already used for `rawCollections`/`crew`/`items`/`frozenArchetypeIds` above them, so no `data ? ... : ...` ternary is needed for these two new lines specifically.

- [ ] **Step 3: Update `client/src/collections/CollectionsTable.tsx`**

Replace the full contents of `client/src/collections/CollectionsTable.tsx` with:

```tsx
import { Fragment } from 'react';
import {
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
} from '@mui/material';
import type { CrewMember } from '../types/crew';
import type { Collection } from '../types/collection';
import type { OwnedItem } from '../types/item';
import { getCuratedRewards } from './rewards';
import { isMaxedOut } from './sorters';
import { PAGE_SIZE_OPTIONS, usePagination } from '../lib/usePagination';
import CollectionCrewList from './CollectionCrewList';

export interface CollectionsTableProps {
  collections: Collection[];
  items: OwnedItem[];
  qualifyingCrewByCollection: Map<number, CrewMember[]>;
  upgradableIds: Set<number>;
}

function CollectionsTable({ collections, items, qualifyingCrewByCollection, upgradableIds }: CollectionsTableProps) {
  const { pageItems, page, pageSize, showPagination, handlePageChange, handlePageSizeChange } =
    usePagination(collections);

  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Collection</TableCell>
            <TableCell>Rewards</TableCell>
            <TableCell align="right">Progress</TableCell>
            <TableCell align="right">Milestone</TableCell>
            <TableCell align="right">Crew</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {pageItems.map((collection, index) => {
            const qualifyingCrew = qualifyingCrewByCollection.get(collection.id) ?? [];
            const upgradable = upgradableIds.has(collection.id);
            const rewards = getCuratedRewards(collection);
            const progressDisplay = isMaxedOut(collection)
              ? 'MAX'
              : `${collection.progress}/${collection.milestone.goal}`;
            return (
              <Fragment key={collection.id}>
                <TableRow>
                  <TableCell>{page * pageSize + index + 1}</TableCell>
                  <TableCell>
                    {collection.name}
                    {upgradable && <Chip label="Upgradable" size="small" color="info" sx={{ ml: 1 }} />}
                  </TableCell>
                  <TableCell>{rewards.join(', ')}</TableCell>
                  <TableCell align="right">{progressDisplay}</TableCell>
                  <TableCell align="right">{collection.claimable_milestone_index}</TableCell>
                  <TableCell align="right">{qualifyingCrew.length}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ bgcolor: 'action.hover' }} colSpan={6}>
                    {qualifyingCrew.length === 0 ? (
                      <Typography color="text.secondary" sx={{ py: 1 }}>
                        No crew match.
                      </Typography>
                    ) : (
                      <CollectionCrewList crew={qualifyingCrew} items={items} />
                    )}
                  </TableCell>
                </TableRow>
              </Fragment>
            );
          })}
        </TableBody>
        {showPagination && (
          <TableFooter>
            <TableRow>
              <TablePagination
                count={collections.length}
                page={page}
                onPageChange={handlePageChange}
                rowsPerPage={pageSize}
                onRowsPerPageChange={handlePageSizeChange}
                rowsPerPageOptions={PAGE_SIZE_OPTIONS}
                colSpan={6}
              />
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </TableContainer>
  );
}

export default CollectionsTable;
```

Dropped from this file: the `crew`/`frozenArchetypeIds` props; the `getCollectionCrew` import (`./getters`); the `isCollectionUpgradable` import (`./sorters` — `isMaxedOut` stays); the `byEquipmentSlotsRemainingDesc`/`byLevelDesc`/`byMaxRarityDesc`/`byNameAsc`/`byTierAsc`/`sortCrew` imports (`../crew/sorters`); the `combineComparators` import (`../lib/comparator`). Everything else — JSX structure, pagination, the `Chip`, the two-`TableRow`-per-collection `Fragment` pattern — is unchanged.

- [ ] **Step 4: Build and lint**

Run: `npm run build -w client` — expect success, 0 errors. If `CollectionsTable.tsx` or `CollectionsPage.tsx` still reference a dropped import or the old 4-argument `byUpgradableThenCompletionThenNameAsc` signature anywhere, TypeScript will fail here — treat that as a sign Step 2 or 3 wasn't applied completely, not an unrelated problem.
Run: `npm run lint -w client` — expect 0 errors, only the 2 pre-existing warnings. An unused-import lint error in `CollectionsTable.tsx` specifically would mean one of the "dropped" imports listed above wasn't actually removed.

- [ ] **Step 5: Data-driven verification against all 88 real collections**

Create `client/src/collections/__verify.ts` (this project's established throwaway-verification pattern — delete it before committing) with the following content:

```ts
import data from '../../../example-data.json';
import type { PlayerData } from '../types/player';
import { getCollectionsList, getCollectionCrew } from './getters';
import { getCrewList, getFrozenCrewArchetypeIds, getOwnedItems } from '../crew/getters';
import {
  byCompletionThenNameAsc,
  byUpgradableThenCompletionThenNameAsc,
  getQualifyingCrewByCollection,
  getUpgradableCollectionIds,
  isCollectionUpgradable,
} from './sorters';
import { byEquipmentSlotsRemainingDesc, byLevelDesc, byMaxRarityDesc, byNameAsc, byTierAsc, sortCrew } from '../crew/sorters';
import { combineComparators } from '../lib/comparator';

const playerData = data as unknown as PlayerData;
const rawCollections = getCollectionsList(playerData);
const crew = getCrewList(playerData);
const items = getOwnedItems(playerData);
const frozenArchetypeIds = getFrozenCrewArchetypeIds(playerData);

// OLD path: reconstructs exactly what CollectionsPage.tsx/CollectionsTable.tsx
// computed before this refactor, using only the still-unchanged primitives.
const oldUpgradableIds = new Set(
  rawCollections
    .filter((c) => isCollectionUpgradable(c, getCollectionCrew(c, crew, items, frozenArchetypeIds), items))
    .map((c) => c.id)
);
const oldSortOrder = [...rawCollections]
  .sort(
    combineComparators(
      (a, b) => Number(oldUpgradableIds.has(b.id)) - Number(oldUpgradableIds.has(a.id)),
      byCompletionThenNameAsc
    )
  )
  .map((c) => c.id);
const oldQualifyingCrewByCollection = new Map(
  rawCollections.map((c) => [
    c.id,
    sortCrew(
      getCollectionCrew(c, crew, items, frozenArchetypeIds),
      combineComparators(byTierAsc(items), byMaxRarityDesc, byLevelDesc, byEquipmentSlotsRemainingDesc, byNameAsc)
    ).map((m) => m.id),
  ])
);

// NEW path
const newQualifyingCrewByCollection = getQualifyingCrewByCollection(rawCollections, crew, items, frozenArchetypeIds);
const newUpgradableIds = getUpgradableCollectionIds(rawCollections, newQualifyingCrewByCollection, items);
const newSortOrder = [...rawCollections].sort(byUpgradableThenCompletionThenNameAsc(newUpgradableIds)).map((c) => c.id);

let failures = 0;

if (JSON.stringify(oldSortOrder) !== JSON.stringify(newSortOrder)) {
  console.error('SORT ORDER MISMATCH');
  console.error('old:', oldSortOrder);
  console.error('new:', newSortOrder);
  failures++;
} else {
  console.log(`Sort order: MATCH (${oldSortOrder.length} collections)`);
}

const oldUpgradableSorted = [...oldUpgradableIds].sort((a, b) => a - b);
const newUpgradableSorted = [...newUpgradableIds].sort((a, b) => a - b);
if (JSON.stringify(oldUpgradableSorted) !== JSON.stringify(newUpgradableSorted)) {
  console.error('UPGRADABLE SET MISMATCH');
  console.error('old:', oldUpgradableSorted);
  console.error('new:', newUpgradableSorted);
  failures++;
} else {
  console.log(`Upgradable set: MATCH (${oldUpgradableSorted.length} upgradable of ${rawCollections.length})`);
}

let crewMismatches = 0;
for (const c of rawCollections) {
  const oldCrewIds = oldQualifyingCrewByCollection.get(c.id) ?? [];
  const newCrewIds = (newQualifyingCrewByCollection.get(c.id) ?? []).map((m) => m.id);
  if (JSON.stringify(oldCrewIds) !== JSON.stringify(newCrewIds)) {
    console.error(`QUALIFYING CREW MISMATCH for collection ${c.id} (${c.name})`);
    console.error('old:', oldCrewIds);
    console.error('new:', newCrewIds);
    crewMismatches++;
  }
}
if (crewMismatches === 0) {
  console.log(`Qualifying crew lists: MATCH for all ${rawCollections.length} collections`);
} else {
  failures += crewMismatches;
}

console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} MISMATCH(ES) FOUND`);
process.exit(failures === 0 ? 0 : 1);
```

Run: `npx tsx client/src/collections/__verify.ts` from the repo root.
Expected output: `Sort order: MATCH (88 collections)`, `Upgradable set: MATCH (N upgradable of 88)` (whatever `N` really is in the seeded data), `Qualifying crew lists: MATCH for all 88 collections`, and `ALL CHECKS PASSED`, exit code 0. Record the actual `N` and the actual collection count printed — don't assume 88 without seeing it echoed back, since `example-data.json` is the source of truth here, not this plan.

If any mismatch prints, that means Step 1, 2, or 3 introduced a real behavior difference — stop and fix the underlying code, don't adjust the verify script to match broken output.

Delete `client/src/collections/__verify.ts` once it passes — it must not be committed.

- [ ] **Step 6: Real-browser verification**

Start the dev server. Using real Playwright/chrome-devtools MCP tools (or the `playwright` library per `CLAUDE.md` if the MCP servers aren't available this session), navigate to `/collections` and confirm:

1. The page renders without error, and the "Upgradable" chip appears next to the same collection names Step 5's script reported as upgradable (spot-check at least 3 — one upgradable, one not).
2. The "Crew" column count for at least 3 collections matches the length Step 5's script computed for that collection's qualifying-crew list.
3. Expanding at least 2 collections' crew sub-lists shows the same crew names, in the same order, as before this change (cross-check against the actual observed real data — e.g. via an accessibility snapshot — not from memory of what "should" be there).

Record the actual collection names, chip presence, and counts observed — not the expected values.

- [ ] **Step 7: Commit**

```bash
git add client/src/collections/sorters.ts client/src/pages/CollectionsPage.tsx client/src/collections/CollectionsTable.tsx
git commit -m "Compute Collections qualifying-crew and upgradable-status once per render"
```

Confirm `client/src/collections/__verify.ts` is NOT in this commit (`git status` should show it absent — deleted in Step 5, never staged).

---

## Final integration check

- [ ] Run `npm run build -w client` and `npm run lint -w client` one more time to confirm the same clean result.
- [ ] Update `docs/PROJECT_STATE.md`: strike through (in the established "resolved, kept as a pointer" style used throughout that document) the "Upgradable-status dual computation" deferred-issues entry, and add a feature-history entry plus bump the "Last updated" line, matching every prior feature's documentation pattern.
