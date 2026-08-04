# Collections "Upgradable" Chip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the Collections page, give a collection an "Upgradable" chip next to its name when the crew still needed to reach its next milestone (`milestone.goal - progress`) can already be fully covered by that collection's `ready`- or `needsWork`-tier qualifying crew, and sort upgradable collections to the top of the table.

**Architecture:** A new predicate `isCollectionUpgradable` in `collections/sorters.ts` (alongside the existing `isMaxedOut`, same "used by both a comparator and directly by the table" shape) does the ready/needsWork-count-vs-remaining math on a collection's already-filtered qualifying-crew list. `CollectionsTable.tsx` reuses its existing per-row `qualifyingCrew` computation to render the chip — no new crew filtering there. A new `byUpgradableThenCompletionThenNameAsc` factory in `collections/sorters.ts` precomputes the full upgradable set once (not inside the sort comparator, which would be an `n log n`-multiplied performance trap) and composes an O(1)-lookup boolean key with the existing `byCompletionThenNameAsc` via `combineComparators`. `CollectionsPage.tsx` reorders its declarations so crew/items/frozenArchetypeIds exist before the sort runs. Single task: the three files form one dependency chain (sorters → table → page) with no meaningful independent gate between them.

**Tech Stack:** Same as the existing client workspace — React 19, TypeScript (strict), MUI, no new dependencies.

## Global Constraints

- **`remaining = collection.milestone.goal - collection.progress`.** A collection is never upgradable when `remaining <= 0` — no explicit `isMaxedOut` check needed; verified against real data that all 8 maxed-out collections (`milestone.goal === 0`) retain non-zero `progress`, so `remaining` is always negative for them. Do not add a redundant `isMaxedOut` guard — this was explicitly declined during design.
- **`eligible` = count of the collection's qualifying crew (the same list `getCollectionCrew` already produces, already excluding frozen duplicates and non-close-to-immortalized crew) whose `getCrewTier(crew, items)` is `'ready'` or `'needsWork'`.**
- **A collection is upgradable iff `eligible >= remaining`** (ties count — "equal or greater").
- **`isCollectionUpgradable(collection, qualifyingCrew, items)` takes the already-filtered crew list as a parameter — it must NOT call `getCollectionCrew` itself.** This mirrors `byTierAsc`/`byMaxRarityDesc` in `crew/sorters.ts`, which also operate on pre-filtered lists.
- **Verified against real data, must reproduce exactly:** exactly 5 of 88 collections are upgradable — `Delphic Expanse` (7/8, remaining 1, eligible 1), `Our Man Bashir` (2/3, remaining 1, eligible 1), `Ruthless Aggression` (114/120, remaining 6, eligible 6), `Class A Dress` (13/14, remaining 1, eligible 2), `Perils in Paradise` (2/3, remaining 1, eligible 2).
- **Chip:** `<Chip label="Upgradable" size="small" color="info" sx={{ ml: 1 }} />`, rendered inline immediately after the collection name in the same `Collection` column table cell (not a separate column, not right-aligned) — only when `isCollectionUpgradable(...)` is true for that row.
- **The new sort comparator, `byUpgradableThenCompletionThenNameAsc(collections, crewList, items, frozenArchetypeIds)`, MUST precompute the full upgradable-id `Set` once before returning the comparator function — it must NOT call `isCollectionUpgradable`/`getCollectionCrew` from inside the per-comparison function body.** This is a hard correctness-of-performance requirement, not a style preference: doing it inside the comparator would run an O(597)-crew filter roughly `n log n` times (~1,100+ calls for 88 collections) instead of 88.
- **`collections/sorters.ts` gains two new imports it did not have before: `combineComparators`/`Comparator` from `../crew/sorters`, and `getCollectionCrew` from `./getters`.** This is a deliberate, documented architecture change (the module was previously import-free besides the `Collection` type) — verified acyclic: `crew/sorters.ts` already imports `collections/getters.ts` (for `getCollectionCount`), which imports `crew/getters.ts`; neither imports back into `collections/sorters.ts`, so the new edges stay a DAG.
- **No changes to `getCollectionCrew`, `getCrewTier`, `CollectionCrewList.tsx`, `crew/getters.ts`, `crew/filters.ts`, or any crew page** (3/4, 4/5, 4/4 ready, 4/4 needs work). Scoped entirely to `collections/sorters.ts`, `collections/CollectionsTable.tsx`, `pages/CollectionsPage.tsx`.
- No test framework — verification via type-check, lint, a throwaway data-driven verification script against real `example-data.json`, a real timing measurement of the new sort, and manual dev-server checks.

---

### Task 1: `isCollectionUpgradable`, the upgradable-first sort, chip rendering, and page wiring

**Files:**
- Modify: `client/src/collections/sorters.ts`
- Modify: `client/src/collections/CollectionsTable.tsx`
- Modify: `client/src/pages/CollectionsPage.tsx`

**Interfaces:**
- Consumes: `getCrewTier(crew: CrewMember, items: OwnedItem[]): CrewTier | null` (`crew/getters.ts`, unchanged), `getCollectionCrew(collection: Collection, crewList: CrewMember[], items: OwnedItem[], frozenArchetypeIds: Set<number>): CrewMember[]` (`collections/getters.ts`, unchanged), `combineComparators<T>(...comparators: Comparator<T>[]): Comparator<T>` and `type Comparator<T> = (a: T, b: T) => number` (`crew/sorters.ts`, unchanged), `getCollectionsList`/`getFrozenCrewArchetypeIds` (`collections/getters.ts`, unchanged), `getCrewList`/`getOwnedItems` (`crew/getters.ts`, unchanged), `isMaxedOut`/`getCollectionCompletionRatio`/`byCompletionThenNameAsc` (`collections/sorters.ts`, unchanged, all pre-existing).
- Produces: `isCollectionUpgradable(collection: Collection, qualifyingCrew: CrewMember[], items: OwnedItem[]): boolean` and `byUpgradableThenCompletionThenNameAsc(collections: Collection[], crewList: CrewMember[], items: OwnedItem[], frozenArchetypeIds: Set<number>): Comparator<Collection>` — both new exports from `collections/sorters.ts`.

- [ ] **Step 1: Modify `client/src/collections/sorters.ts`**

Replace the full file contents with:

```ts
import type { Collection } from '../types/collection';
import type { CrewMember } from '../types/crew';
import type { OwnedItem } from '../types/item';
import { getCrewTier } from '../crew/getters';
import { combineComparators, type Comparator } from '../crew/sorters';
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

export function byUpgradableThenCompletionThenNameAsc(
  collections: Collection[],
  crewList: CrewMember[],
  items: OwnedItem[],
  frozenArchetypeIds: Set<number>
): Comparator<Collection> {
  const upgradableIds = new Set(
    collections
      .filter((c) => isCollectionUpgradable(c, getCollectionCrew(c, crewList, items, frozenArchetypeIds), items))
      .map((c) => c.id)
  );
  return combineComparators(
    (a, b) => Number(upgradableIds.has(b.id)) - Number(upgradableIds.has(a.id)),
    byCompletionThenNameAsc
  );
}
```

- [ ] **Step 2: Modify `client/src/collections/CollectionsTable.tsx`**

Replace the full file contents with:

```tsx
import { Fragment } from 'react';
import {
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type { CrewMember } from '../types/crew';
import type { Collection } from '../types/collection';
import type { OwnedItem } from '../types/item';
import { getCollectionCrew } from './getters';
import { getCuratedRewards } from './rewards';
import { isCollectionUpgradable, isMaxedOut } from './sorters';
import {
  byEquipmentSlotsRemainingDesc,
  byLevelDesc,
  byMaxRarityDesc,
  byNameAsc,
  byTierAsc,
  combineComparators,
  sortCrew,
} from '../crew/sorters';
import CollectionCrewList from './CollectionCrewList';

export interface CollectionsTableProps {
  collections: Collection[];
  crew: CrewMember[];
  items: OwnedItem[];
  frozenArchetypeIds: Set<number>;
}

function CollectionsTable({ collections, crew, items, frozenArchetypeIds }: CollectionsTableProps) {
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
          {collections.map((collection, index) => {
            const qualifyingCrew = sortCrew(
              getCollectionCrew(collection, crew, items, frozenArchetypeIds),
              combineComparators(
                byTierAsc(items),
                byMaxRarityDesc,
                byLevelDesc,
                byEquipmentSlotsRemainingDesc,
                byNameAsc
              )
            );
            const upgradable = isCollectionUpgradable(collection, qualifyingCrew, items);
            const rewards = getCuratedRewards(collection);
            const progressDisplay = isMaxedOut(collection)
              ? 'MAX'
              : `${collection.progress}/${collection.milestone.goal}`;
            return (
              <Fragment key={collection.id}>
                <TableRow>
                  <TableCell>{index + 1}</TableCell>
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
      </Table>
    </TableContainer>
  );
}

export default CollectionsTable;
```

(Only two changes from the current file: `Chip` added to the MUI import, `isCollectionUpgradable` added to the `./sorters` import; a new `const upgradable = ...` line; the `Collection` table cell now wraps its content and conditionally renders the chip. Everything else — the sort composition, the sub-row, the empty-state text — is unchanged.)

- [ ] **Step 3: Modify `client/src/pages/CollectionsPage.tsx`**

Replace the full file contents with:

```tsx
import { Alert, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { usePlayerData } from '../hooks/usePlayerData';
import { getCrewList, getOwnedItems } from '../crew/getters';
import { getCollectionsList, getFrozenCrewArchetypeIds } from '../collections/getters';
import { byUpgradableThenCompletionThenNameAsc } from '../collections/sorters';
import CollectionsTable from '../collections/CollectionsTable';

function CollectionsPage() {
  const { data, loading, error, refresh } = usePlayerData();

  const rawCollections = data ? getCollectionsList(data) : [];
  const crew = data ? getCrewList(data) : [];
  const items = data ? getOwnedItems(data) : [];
  const frozenArchetypeIds = data ? getFrozenCrewArchetypeIds(data) : new Set<number>();
  const collections = data
    ? [...rawCollections].sort(byUpgradableThenCompletionThenNameAsc(rawCollections, crew, items, frozenArchetypeIds))
    : [];

  const loaded = !loading && !error && data;

  return (
    <Stack spacing={2}>
      <Typography variant="h4">Collections{loaded ? ` (${collections.length})` : ''}</Typography>

      {loading && <CircularProgress />}
      {error && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void refresh()}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {loaded && (
        collections.length === 0 ? (
          <Typography color="text.secondary">No collections found.</Typography>
        ) : (
          <CollectionsTable
            collections={collections}
            crew={crew}
            items={items}
            frozenArchetypeIds={frozenArchetypeIds}
          />
        )
      )}
    </Stack>
  );
}

export default CollectionsPage;
```

(Only change from the current file: `getCollectionsList(data)` result is now named `rawCollections` and computed before `crew`/`items`/`frozenArchetypeIds`, and `collections` is derived by sorting `rawCollections` with the new `byUpgradableThenCompletionThenNameAsc` comparator instead of `byCompletionThenNameAsc` directly. The `byCompletionThenNameAsc` import is removed since it's no longer used directly here — it's still used internally by the new comparator.)

- [ ] **Step 4: Verify against real data**

`example-data.json` (gitignored, real personal game data) is at the repo root. Create a throwaway script at `client/src/collections/__verify.ts` (deleted in Step 5, never committed):

```ts
import { readFileSync } from 'node:fs';
import { getCrewList, getOwnedItems } from '../crew/getters';
import { getCollectionsList, getFrozenCrewArchetypeIds, getCollectionCrew } from './getters';
import { isCollectionUpgradable, byUpgradableThenCompletionThenNameAsc } from './sorters';

const raw = JSON.parse(readFileSync('example-data.json', 'utf-8')) as Record<string, unknown>;
const crew = getCrewList(raw);
const items = getOwnedItems(raw);
const collections = getCollectionsList(raw);
const frozenArchetypeIds = getFrozenCrewArchetypeIds(raw);

const upgradable = collections.filter((c) =>
  isCollectionUpgradable(c, getCollectionCrew(c, crew, items, frozenArchetypeIds), items)
);
console.log('upgradable count:', upgradable.length);
console.log(upgradable.map((c) => `${c.name} (${c.progress}/${c.milestone.goal})`));

const start = performance.now();
const sorted = [...collections].sort(byUpgradableThenCompletionThenNameAsc(collections, crew, items, frozenArchetypeIds));
const elapsedMs = performance.now() - start;
console.log('sort took (ms):', elapsedMs.toFixed(2));
console.log('first 6 after sort:', sorted.slice(0, 6).map((c) => c.name));
```

Run from the **repo root**: `npx tsx client/src/collections/__verify.ts`

Expected output:
- `upgradable count: 5`
- The array contains exactly: `Delphic Expanse (7/8)`, `Our Man Bashir (2/3)`, `Ruthless Aggression (114/120)`, `Class A Dress (13/14)`, `Perils in Paradise (2/3)` (order within the array doesn't matter — this is `.filter()` output, not the page's sort).
- `sort took (ms):` **measured on this exact code during plan authoring: ~29-31ms steady-state (10-run loop), ~79ms on the first/cold call (JIT warm-up).** This is higher than the `byCollectionCountDesc` precedent (~12ms) because this factory calls `getCollectionCrew` 88 times up front — each a fresh filter over 597 crew with a `getCrewTier` computation per crew — rather than `byCollectionCountDesc`'s much cheaper per-crew collection-count lookup. It is still a one-time cost per page render (not per keystroke or per comparison — that's the whole point of precomputing the `Set` before sorting), and 30-80ms is imperceptible during a page load/data-refresh transition. Report whatever you actually measure — if it lands within roughly 20-100ms this is expected and not a defect; if it's dramatically higher (e.g. seconds), stop and re-check that the `Set` precomputation isn't accidentally happening inside the comparator function instead of before it.
- `first 6 after sort:` the first entries should be from the 5-name upgradable set above (in some order determined by their completion ratio/name tiebreak), before any non-upgradable collection appears.

If the count or the named set doesn't match, do not proceed — re-check `isCollectionUpgradable` and the `remaining`/`eligible` computation against this plan's Global Constraints before moving on.

- [ ] **Step 5: Delete the throwaway verification script**

```bash
rm client/src/collections/__verify.ts
```

- [ ] **Step 6: Build and lint check**

Run: `npm run build -w client`
Expected: exits 0.

Run: `npm run lint -w client`
Expected: exits 0, no errors (the pre-existing `PlayerDataContext.tsx` fast-refresh warning is unrelated and expected to still appear).

- [ ] **Step 7: Manual dev-server check**

With `server/.env` absent, start `npm run dev -w server` and `npm run dev -w client` in the background (use alternate ports if the defaults are occupied by an unrelated process, and fully revert any temporary port edits before committing).

Run: `curl -s http://localhost:5173/` (or your alternate port) — expect `id="root"` in the response, confirming the client still serves its shell with the modified components compiled in.

Stop both background processes afterward.

**Manual follow-up (requires your real credentials, not part of this task):** with a real `STT_SESSION_COOKIE` set, open `/collections` and confirm: an "Upgradable" blue chip appears next to collection names where it's earned (e.g. any collection whose remaining-to-milestone count is covered by its ready+needsWork crew), those collections appear at the top of the table ahead of non-upgradable ones, and the existing "Ready"/"4/4 Stars" chips in each collection's crew sub-list are unaffected.

- [ ] **Step 8: Commit**

```bash
git add client/src/collections/sorters.ts client/src/collections/CollectionsTable.tsx client/src/pages/CollectionsPage.tsx
git commit -m "Add Upgradable chip and upgradable-first sort to Collections page"
```
