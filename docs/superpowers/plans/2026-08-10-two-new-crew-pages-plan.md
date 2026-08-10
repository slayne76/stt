# Two New Crew Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new pages to the Crew nav group — "5 Stars Crew"
(unmaxed 5★ crew, first in the group) and "5 & 4 Stars Frozen Crew"
(frozen crew at either tier, last in the group).

**Architecture:** Two fully independent features sharing no code —
Page 1 reuses the existing `CrewTable`/`PageShell` pattern with one new
filter and one new sorter; Page 2 introduces a new, smaller table
component and cross-references frozen archetype IDs against the crew
catalog (the same structural pattern `getMissingCrew` already
established, applied in the opposite direction). Split into two tasks
since a reviewer could meaningfully approve one page while rejecting the
other — unlike this project's usual single-task plans, these two pages
don't need each other to work or to be verified.

**Tech Stack:** React 19, TypeScript, MUI v6. No test framework in this
project (deliberate, repeated choice) — verification is `tsc`/`eslint`,
data-driven checks against the real `example-data.json`/cached crew
catalog, and real-browser checks. Both tasks' core filter/sort logic was
already dry-run verified against real data before this plan was
written: Page 1 → 304 unmaxed 5★ crew (435 total 5★, 131 already
immortalized, sums correctly); Page 2 → 536 frozen crew at max_rarity 4
or 5 (2× 5★, 534× 4★), sort and catalog cross-reference both confirmed
correct, zero frozen archetype IDs missing from the catalog in this
sample.

## Global Constraints

- Page 1's "not maxed out" filter is `!isImmortalized(crew)`, full stop
  — **not** the same as the existing `filterNeedsWork`, which
  additionally excludes "ready to immortalize" crew. A ready-to-
  immortalize crew still has an unequipped slot and belongs on this
  page.
- Page 2 shows one row per **distinct frozen archetype** — no
  copy-count expansion, no changes to the `StoredImmortal` type
  (confirmed with the user: quantity doesn't matter here).
- Page 2's `PageShell` usage: `loading`/`error`/`onRetry` stay tied to
  player data only (`onRetry` must retry the thing it says it retries).
  `loading` passed to `PageShell` is `loading || catalogLoading` (so
  `PageShell`'s own spinner covers both sources with no separate spinner
  needed). A catalog error surfaces through a **dynamically-computed
  `emptyMessage`** naming the real reason, not a separate error element
  — `PageShell` only renders its content area when `count > 0`, so
  anything placed inside `children` for a `count === 0` case would never
  actually render (this exact mistake was caught and fixed during the
  spec's own self-review — do not reintroduce it).
- Page 2's `catalog/sorters.ts` additions (`byMaxRarityDesc`,
  `byNameAsc`) are `CatalogEntry`-typed and must **not** be confused
  with or replace the same-named `CrewMember`-typed functions already in
  `crew/sorters.ts` — both files keep their own versions.
- No changes to any existing page, component, filter, sorter, or getter
  — every file this plan touches is either new, or an existing file
  gaining a new export/entry, never a modification of existing
  behavior.

---

### Task 1: "5 Stars Crew" page

**Files:**
- Modify: `client/src/crew/filters.ts`
- Modify: `client/src/crew/sorters.ts`
- Create: `client/src/pages/FiveStarsCrewPage.tsx`
- Modify: `client/src/layout/AppLayout.tsx`
- Modify: `client/src/App.tsx`

**Interfaces:**
- Produces: `filterUnmaxed(crew: CrewMember[], maxRarity: number): CrewMember[]` from `./filters`; `byRarityDesc(a: CrewMember, b: CrewMember): number` from `./sorters`; default-exported `FiveStarsCrewPage` component (no props).
- Consumes: `isImmortalized` (pre-existing, from `./getters`, already imported in `filters.ts`), `CrewTable`/`PageShell` (pre-existing, unchanged), `combineComparators` (pre-existing).

- [ ] **Step 1: Add `filterUnmaxed` to `client/src/crew/filters.ts`**

Add this function anywhere in the file (after the existing imports, as
a new exported function alongside the others — do not remove or modify
anything else in this file):

```ts
export function filterUnmaxed(crew: CrewMember[], maxRarity: number): CrewMember[] {
  return crew.filter((c) => c.max_rarity === maxRarity && !isImmortalized(c));
}
```

- [ ] **Step 2: Add `byRarityDesc` to `client/src/crew/sorters.ts`**

Add this function anywhere in the file (as a new exported function
alongside the others):

```ts
export function byRarityDesc(a: CrewMember, b: CrewMember): number {
  return b.rarity - a.rarity;
}
```

- [ ] **Step 3: Create `client/src/pages/FiveStarsCrewPage.tsx`**

```tsx
import { usePlayerData } from '../hooks/usePlayerData';
import { getCrewList } from '../crew/getters';
import { filterUnmaxed } from '../crew/filters';
import { byEquipmentSlotsRemainingDesc, byLevelDesc, byNameAsc, byRarityDesc, sortCrew } from '../crew/sorters';
import { combineComparators } from '../lib/comparator';
import { getCollectionsList } from '../collections/getters';
import CrewTable from '../crew/CrewTable';
import PageShell from '../layout/PageShell';

function FiveStarsCrewPage() {
  const { data, loading, error, refresh } = usePlayerData();

  const collections = data ? getCollectionsList(data) : [];
  const crew = data
    ? sortCrew(
        filterUnmaxed(getCrewList(data), 5),
        combineComparators(byLevelDesc, byEquipmentSlotsRemainingDesc, byRarityDesc, byNameAsc)
      )
    : [];

  const loaded = !loading && !error && !!data;

  return (
    <PageShell
      title="5 Stars crew"
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={crew.length}
      emptyMessage="No unmaxed 5-star crew."
    >
      <CrewTable crew={crew} collections={collections} showCollectionsNames={true} />
    </PageShell>
  );
}

export default FiveStarsCrewPage;
```

- [ ] **Step 4: Add the nav entry to `client/src/layout/AppLayout.tsx`**

In the `NAV_ITEMS` array's `Crew` group, insert a new entry as the
**first** child (before `'3/4 Stars crew'`). Change:

```tsx
    label: 'Crew',
    children: [
      { label: '3/4 Stars crew', path: '/3-4-stars-crew' },
```

to:

```tsx
    label: 'Crew',
    children: [
      { label: '5 Stars Crew', path: '/5-stars-crew' },
      { label: '3/4 Stars crew', path: '/3-4-stars-crew' },
```

- [ ] **Step 5: Add the route to `client/src/App.tsx`**

Add the import (after the existing `OverviewPage` import, before
`ThreeFourStarsCrewPage`, matching the nav order):

```tsx
import OverviewPage from './pages/OverviewPage';
import FiveStarsCrewPage from './pages/FiveStarsCrewPage';
import ThreeFourStarsCrewPage from './pages/ThreeFourStarsCrewPage';
```

Add the route (before the `/3-4-stars-crew` route):

```tsx
              <Route path="/" element={<OverviewPage />} />
              <Route path="/5-stars-crew" element={<FiveStarsCrewPage />} />
              <Route path="/3-4-stars-crew" element={<ThreeFourStarsCrewPage />} />
```

- [ ] **Step 6: Build and lint**

```bash
npm run build -w client
npm run lint -w client
```

Expected: both exit cleanly.

- [ ] **Step 7: Data-driven verification against `example-data.json`**

Create a throwaway script `client-verify-five-stars-crew.mjs` at the
repo root:

```js
import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync('example-data.json', 'utf-8'));
const crewList = data.player.character.crew;

function isImmortalized(c) {
  return c.rarity === c.max_rarity && c.level === 100 && c.equipment.length === 4;
}

const unmaxed5 = crewList.filter((c) => c.max_rarity === 5 && !isImmortalized(c));
const all5 = crewList.filter((c) => c.max_rarity === 5);
const immortalized5 = all5.filter(isImmortalized);

console.log('Total 5-star crew:', all5.length);
console.log('Already immortalized:', immortalized5.length);
console.log('Unmaxed (expected page row count):', unmaxed5.length);
console.log('Sums correctly:', immortalized5.length + unmaxed5.length === all5.length);

if (immortalized5.length + unmaxed5.length !== all5.length) {
  console.error('MISMATCH — investigate before trusting the page');
  process.exit(1);
}
```

Run: `node client-verify-five-stars-crew.mjs`

Expected output (confirmed against the real sample before this plan was
written):
```
Total 5-star crew: 435
Already immortalized: 131
Unmaxed (expected page row count): 304
Sums correctly: true
```

Delete the script afterward: `rm client-verify-five-stars-crew.mjs`

- [ ] **Step 8: Real-browser verification**

Start the dev server (seed `server/data/player-cache.json` from
`example-data.json` first if this is a fresh worktree — standing
worktree setup step):

```bash
npm run dev
```

Using the browser tooling, confirm:
- "5 Stars Crew" appears as the **first** item in the Crew nav flyout,
  before "3/4 Stars crew".
- Navigating to it shows a table with the same columns as "3/4 Stars
  crew" (including Total collections/Collections names), row count 304
  (matching Step 7's script), no crew with `max_rarity !== 5` or with
  `rarity === 5 && level === 100 && equipment.length === 4` (fully
  immortalized) present.
- Spot-check the sort order on the first few rows: level descending,
  then equipment-slots-remaining descending, then current rarity
  descending, then name ascending among ties.

- [ ] **Step 9: Commit**

```bash
git add client/src/crew/filters.ts client/src/crew/sorters.ts \
  client/src/pages/FiveStarsCrewPage.tsx \
  client/src/layout/AppLayout.tsx client/src/App.tsx
git commit -m "Add the 5 Stars Crew page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: "5 & 4 Stars Frozen Crew" page

**Files:**
- Modify: `client/src/catalog/getters.ts`
- Modify: `client/src/catalog/sorters.ts`
- Create: `client/src/catalog/FrozenCrewTable.tsx`
- Create: `client/src/pages/FrozenCrewPage.tsx`
- Modify: `client/src/layout/AppLayout.tsx`
- Modify: `client/src/App.tsx`

**Interfaces:**
- Produces: `getFrozenCrew(catalog: CatalogEntry[], frozenArchetypeIds: Set<number>, maxRarities: number[]): CatalogEntry[]` from `./getters`; `byMaxRarityDesc(a: CatalogEntry, b: CatalogEntry): number` and `byNameAsc(a: CatalogEntry, b: CatalogEntry): number` from `./sorters`; `FrozenCrewTable` — default export, props `{ crew: CatalogEntry[] }`; default-exported `FrozenCrewPage` component (no props).
- Consumes: `getFrozenCrewArchetypeIds` (pre-existing, from `../crew/getters`), `useCrewCatalog`/`usePlayerData` (pre-existing), `PageShell` (pre-existing, unchanged), `Thumbnail`/`ASSET_BASE_URL`/`StarRating` (pre-existing, unchanged).

This task does not depend on Task 1 — both edit `AppLayout.tsx`/
`App.tsx`, but at different, non-overlapping insertion points (Task 1
inserts first-in-list, this task appends last-in-list), so either order
works. If Task 1 already landed, this task's steps 4-5 below insert
relative to whatever `AppLayout.tsx`/`App.tsx` look like *after* Task 1
— re-read those two files fresh before editing them if Task 1 already
merged, rather than assuming their pre-Task-1 content.

- [ ] **Step 1: Add `getFrozenCrew` to `client/src/catalog/getters.ts`**

Add this function anywhere in the file (as a new exported function
alongside `getArchetypeMaxRarityMap`/`getCatalogCount`/`getMissingCrew`):

```ts
export function getFrozenCrew(
  catalog: CatalogEntry[],
  frozenArchetypeIds: Set<number>,
  maxRarities: number[]
): CatalogEntry[] {
  if (!Array.isArray(catalog)) return [];
  return catalog.filter((c) => maxRarities.includes(c.max_rarity) && frozenArchetypeIds.has(c.archetype_id));
}
```

- [ ] **Step 2: Add two sorters to `client/src/catalog/sorters.ts`**

Add these two functions alongside the existing `byDataScoreDesc`:

```ts
export function byMaxRarityDesc(a: CatalogEntry, b: CatalogEntry): number {
  return b.max_rarity - a.max_rarity;
}

export function byNameAsc(a: CatalogEntry, b: CatalogEntry): number {
  return a.name.localeCompare(b.name);
}
```

- [ ] **Step 3: Create `client/src/catalog/FrozenCrewTable.tsx`**

```tsx
import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import type { CatalogEntry } from '../types/catalogEntry';
import StarRating from '../crew/StarRating';
import Thumbnail from '../assets/Thumbnail';
import { ASSET_BASE_URL } from '../assets/config';

export interface FrozenCrewTableProps {
  crew: CatalogEntry[];
}

function FrozenCrewTable({ crew }: FrozenCrewTableProps) {
  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Image</TableCell>
            <TableCell>Stars</TableCell>
            <TableCell>Name</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {crew.map((c, index) => (
            <TableRow key={c.archetype_id}>
              <TableCell>{index + 1}</TableCell>
              <TableCell>
                <Thumbnail url={`${ASSET_BASE_URL}/${c.imageUrlPortrait}`} />
              </TableCell>
              <TableCell>
                <StarRating rarity={c.max_rarity} maxRarity={c.max_rarity} />
              </TableCell>
              <TableCell>{c.name}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default FrozenCrewTable;
```

- [ ] **Step 4: Create `client/src/pages/FrozenCrewPage.tsx`**

```tsx
import { usePlayerData } from '../hooks/usePlayerData';
import { useCrewCatalog } from '../hooks/useCrewCatalog';
import { getFrozenCrewArchetypeIds } from '../crew/getters';
import { getFrozenCrew } from '../catalog/getters';
import { byMaxRarityDesc, byNameAsc } from '../catalog/sorters';
import { combineComparators } from '../lib/comparator';
import FrozenCrewTable from '../catalog/FrozenCrewTable';
import PageShell from '../layout/PageShell';

function FrozenCrewPage() {
  const { data, loading, error, refresh } = usePlayerData();
  const { data: catalog, loading: catalogLoading, error: catalogError } = useCrewCatalog();

  const frozenArchetypeIds = data ? getFrozenCrewArchetypeIds(data) : new Set<number>();
  const crew = catalog
    ? [...getFrozenCrew(catalog, frozenArchetypeIds, [4, 5])].sort(combineComparators(byMaxRarityDesc, byNameAsc))
    : [];

  const loaded = !loading && !catalogLoading && !error && !!data;

  return (
    <PageShell
      title="5 & 4 Stars Frozen Crew"
      loading={loading || catalogLoading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={crew.length}
      emptyMessage={catalogError ? `Crew catalog unavailable: ${catalogError}` : 'No frozen 4 or 5-star crew.'}
    >
      <FrozenCrewTable crew={crew} />
    </PageShell>
  );
}

export default FrozenCrewPage;
```

- [ ] **Step 5: Add the nav entry to `client/src/layout/AppLayout.tsx`**

In the `NAV_ITEMS` array's `Crew` group, append a new entry as the
**last** child (after `'QPs'`). Re-read the file first if Task 1 already
landed — the `'5 Stars Crew'` entry from Task 1 may already be present
at the top of this same array; leave it untouched. Change:

```tsx
      { label: 'QPs', path: '/qps' },
    ],
  },
```

to:

```tsx
      { label: 'QPs', path: '/qps' },
      { label: '5 & 4 Stars Frozen Crew', path: '/5-4-stars-frozen-crew' },
    ],
  },
```

- [ ] **Step 6: Add the route to `client/src/App.tsx`**

Re-read the file first if Task 1 already landed. Add the import (after
the existing `QPsPage` import):

```tsx
import QPsPage from './pages/QPsPage';
import FrozenCrewPage from './pages/FrozenCrewPage';
```

Add the route (after the `/qps` route):

```tsx
              <Route path="/qps" element={<QPsPage />} />
              <Route path="/5-4-stars-frozen-crew" element={<FrozenCrewPage />} />
```

- [ ] **Step 7: Build and lint**

```bash
npm run build -w client
npm run lint -w client
```

Expected: both exit cleanly.

- [ ] **Step 8: Data-driven verification against `example-data.json` and the cached crew catalog**

Requires `server/data/crew-catalog-cache.json` to exist (it does in the
main checkout; seed a worktree's copy from there, or let the app's own
first real fetch populate it before running this script). Create a
throwaway script `client-verify-frozen-crew.mjs` at the repo root:

```js
import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync('example-data.json', 'utf-8'));
const catalog = JSON.parse(readFileSync('server/data/crew-catalog-cache.json', 'utf-8'));
const storedImmortals = data.player.character.stored_immortals ?? [];
const frozenIds = new Set(storedImmortals.map((s) => s.id));

function getFrozenCrew(catalog, frozenArchetypeIds, maxRarities) {
  return catalog.filter((c) => maxRarities.includes(c.max_rarity) && frozenArchetypeIds.has(c.archetype_id));
}

const frozenCrew = getFrozenCrew(catalog, frozenIds, [4, 5]);
const frozen5 = frozenCrew.filter((c) => c.max_rarity === 5).length;
const frozen4 = frozenCrew.filter((c) => c.max_rarity === 4).length;

console.log('Distinct frozen archetype IDs:', frozenIds.size);
console.log('Frozen crew with max_rarity 4 or 5 (expected page row count):', frozenCrew.length);
console.log(`  5-star: ${frozen5}, 4-star: ${frozen4}`);
console.log('Sums correctly:', frozen5 + frozen4 === frozenCrew.length);

const sorted = [...frozenCrew].sort((a, b) => b.max_rarity - a.max_rarity || a.name.localeCompare(b.name));
const firstIsFive = sorted.length === 0 || sorted[0].max_rarity === Math.max(...frozenCrew.map((c) => c.max_rarity));
console.log('First row after sort has the highest max_rarity present:', firstIsFive);

if (frozen5 + frozen4 !== frozenCrew.length) {
  console.error('MISMATCH — investigate before trusting the page');
  process.exit(1);
}
```

Run: `node client-verify-frozen-crew.mjs`

Expected output (confirmed against the real sample before this plan was
written):
```
Distinct frozen archetype IDs: 716
Frozen crew with max_rarity 4 or 5 (expected page row count): 536
  5-star: 2, 4-star: 534
Sums correctly: true
First row after sort has the highest max_rarity present: true
```

Delete the script afterward: `rm client-verify-frozen-crew.mjs`

- [ ] **Step 9: Real-browser verification**

Start the dev server (same standing worktree-seeding step as Task 1;
this task additionally needs a warm crew-catalog cache — if
`server/data/crew-catalog-cache.json` isn't already seeded, the first
page load will trigger a real ~40MB live fetch from datacore.app, which
is slow but not wrong; seeding the cache file from the main checkout
avoids the wait):

```bash
npm run dev
```

Using the browser tooling, confirm:
- "5 & 4 Stars Frozen Crew" appears as the **last** item in the Crew nav
  flyout, after "QPs" (and after "5 Stars Crew" too, if Task 1 already
  landed).
- Navigating to it shows exactly 4 columns — `#`, Image, Stars, Name —
  and no Level/Items-to-equip/Collections columns.
- Row count matches Step 8's script (536 in the reference sample).
  Every row's `StarRating` is fully lit (no partially-filled stars) —
  spot-check at least one real 4★ row and one real 5★ row.
- Sort order: all 5★ rows appear before all 4★ rows, name-ascending
  within each tier — spot-check the first few and last few rows.
- Reload the page and confirm `PageShell`'s own loading spinner (not an
  incorrect empty-state flash reading "No frozen 4 or 5-star crew")
  covers the window before the catalog finishes loading. If the catalog
  cache is already warm this may be hard to observe normally —
  throttling the network in devtools, or temporarily renaming/removing
  `server/data/crew-catalog-cache.json` to force a real live fetch, are
  both valid ways to force a visible loading window for this specific
  check.

- [ ] **Step 10: Commit**

```bash
git add client/src/catalog/getters.ts client/src/catalog/sorters.ts \
  client/src/catalog/FrozenCrewTable.tsx client/src/pages/FrozenCrewPage.tsx \
  client/src/layout/AppLayout.tsx client/src/App.tsx
git commit -m "Add the 5 & 4 Stars Frozen Crew page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** both new filters/sorters/getters, both new page
  components, the new `FrozenCrewTable`, both nav-entry insertions (at
  the correct first/last positions), both routes, and all 5 items from
  the spec's verification plan (data checks for both pages, nav
  position checks, column-set checks, the `PageShell`/catalog-loading
  check) are each covered by a concrete step across the two tasks.
- **No placeholders:** every code block is complete and
  copy-pasteable; every data-driven verification script is real,
  runnable code with real expected output already confirmed against
  the actual sample data and cached catalog before this plan was
  written — not a description of what to check.
- **Type consistency:** `FrozenCrewTableProps.crew: CatalogEntry[]`
  matches its one call site in `FrozenCrewPage.tsx` exactly.
  `getFrozenCrew`'s three parameters match its one call site's argument
  order and types. `filterUnmaxed`'s two parameters match its one call
  site (`filterUnmaxed(getCrewList(data), 5)`).
- **Task independence confirmed correct:** Task 1 and Task 2 touch
  `AppLayout.tsx`/`App.tsx` at genuinely non-overlapping insertion
  points (list-start vs. list-end), so both orderings compile cleanly;
  the only caveat (re-read those two files fresh if executing Task 2
  after Task 1 already landed, rather than assuming pre-Task-1 content)
  is called out explicitly in Task 2's own steps.
- **Real data validated before writing, not just after:** both tasks'
  expected verification-script output was independently confirmed by
  the controller against the actual `example-data.json` and the actual
  cached crew catalog before this plan was finalized — an implementer
  hitting a different number is a real signal to stop and investigate,
  not a script bug to shrug off.
