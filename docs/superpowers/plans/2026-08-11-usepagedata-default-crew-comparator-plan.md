# usePageData Hook + defaultCrewComparator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract two currently-duplicated pieces into shared helpers: a `usePageData` hook replacing the identical `usePlayerData()` + `loaded` boilerplate across 10 pages, and a `defaultCrewComparator` replacing the identical 5-way crew sort composition across 5 of them.

**Architecture:** Task 1 creates both shared helpers (independent additions, no shared files). Tasks 2-4 each adopt the helpers into a disjoint set of pages — split by which helper(s) each page needs, so no file is touched by more than one task.

**Tech Stack:** React 19, TypeScript strict mode.

## Global Constraints

- No behavior change anywhere: every page's `loading`/`error`/`loaded` values passed to `PageShell`, and every crew list's final sort order, must be identical to before.
- No change to `usePlayerData`/`PlayerDataContext` themselves.
- No change to `OverviewPage` — out of scope (bespoke condition, not duplicated boilerplate).
- No change to `FiveStarsCrewPage`'s sort composition (`byRarityDesc`, not `byCollectionCountDesc`) — it gets `usePageData()` only.
- `usePageData`'s `extraLoading` parameter is a plain optional `boolean` (default `false`), not an options object.
- `defaultCrewComparator` is named in camelCase (not the backlog's literal `DEFAULT_CREW_COMPARATOR`), matching this file's existing comparator-factory naming.
- Build (`npm run build -w client`) and lint (`npm run lint -w client`) must stay clean: 0 errors, only the 2 pre-existing `react-refresh/only-export-components` warnings.
- Full spec: `docs/superpowers/specs/2026-08-11-usepagedata-default-crew-comparator-design.md`.

---

### Task 1: Create `usePageData` and `defaultCrewComparator`

**Files:**
- Create: `client/src/hooks/usePageData.ts`
- Modify: `client/src/crew/sorters.ts`

**Interfaces:**
- Produces: `usePageData(extraLoading?: boolean): UsePageDataResult` where `UsePageDataResult = { data: PlayerData | null; loading: boolean; error: string | null; refresh: () => Promise<void>; loaded: boolean }`.
- Produces: `defaultCrewComparator(collections: Collection[]): Comparator<CrewMember>` (`crew/sorters.ts`).

- [ ] **Step 1: Create `client/src/hooks/usePageData.ts`**

```ts
import { usePlayerData } from './usePlayerData';
import type { PlayerData } from '../types/player';

export interface UsePageDataResult {
  data: PlayerData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  loaded: boolean;
}

export function usePageData(extraLoading = false): UsePageDataResult {
  const { data, loading, error, refresh } = usePlayerData();
  const combinedLoading = loading || extraLoading;
  const loaded = !combinedLoading && !error && !!data;
  return { data, loading: combinedLoading, error, refresh, loaded };
}
```

- [ ] **Step 2: Replace the full contents of `client/src/crew/sorters.ts`**

```ts
import type { CrewMember } from '../types/crew';
import type { Collection } from '../types/collection';
import type { OwnedItem } from '../types/item';
import { combineComparators, type Comparator } from '../lib/comparator';
import { getEquipmentSlotsRemaining, getCrewTier, getQPLevel, getQPPointsNeeded, type CrewTier } from './getters';
import { getCollectionCount } from '../collections/getters';

export function byLevelDesc(a: CrewMember, b: CrewMember): number {
  return b.level - a.level;
}

export function byEquipmentSlotsRemainingDesc(a: CrewMember, b: CrewMember): number {
  return getEquipmentSlotsRemaining(b) - getEquipmentSlotsRemaining(a);
}

export function byCollectionCountDesc(collections: Collection[]): Comparator<CrewMember> {
  return (a, b) => getCollectionCount(b, collections) - getCollectionCount(a, collections);
}

const TIER_ORDER: Record<CrewTier, number> = { ready: 0, needsWork: 1, leveling: 2 };

export function byTierAsc(items: OwnedItem[]): Comparator<CrewMember> {
  return (a, b) => TIER_ORDER[getCrewTier(a, items)!] - TIER_ORDER[getCrewTier(b, items)!];
}

export function byMaxRarityDesc(a: CrewMember, b: CrewMember): number {
  return b.max_rarity - a.max_rarity;
}

export function byNameAsc(a: CrewMember, b: CrewMember): number {
  return a.name.localeCompare(b.name);
}

export function byRarityDesc(a: CrewMember, b: CrewMember): number {
  return b.rarity - a.rarity;
}

export function defaultCrewComparator(collections: Collection[]): Comparator<CrewMember> {
  return combineComparators(byLevelDesc, byEquipmentSlotsRemainingDesc, byCollectionCountDesc(collections), byNameAsc);
}

export function sortCrew(crew: CrewMember[], comparator: Comparator<CrewMember>): CrewMember[] {
  return [...crew].sort(comparator);
}

// These three comparators assume they're only ever called on crew already
// filtered by filterQPEligible (QL < QP_MAX_LEVEL) — an unfiltered QL4
// crew's high q_bits would sort byQPBitsDesc to the top, and
// getQPPointsNeeded/getQPRoundsLeft would render 0 in QPsTable. True
// today only because QPsPage always filters first, not enforced here.
export function byQPOnHoldAsc(a: CrewMember, b: CrewMember): number {
  const aOnHold = getQPPointsNeeded(a) <= 25 ? 1 : 0;
  const bOnHold = getQPPointsNeeded(b) <= 25 ? 1 : 0;
  return aOnHold - bOnHold;
}

export function byQPLevelDesc(a: CrewMember, b: CrewMember): number {
  return getQPLevel(b) - getQPLevel(a);
}

export function byQPBitsDesc(a: CrewMember, b: CrewMember): number {
  return b.q_bits - a.q_bits;
}
```

The only changes from the current file: `combineComparators` added to the `../lib/comparator` import (previously only the `Comparator` type was imported), and the new `defaultCrewComparator` function inserted after `byRarityDesc`. Every other function is byte-identical to today.

- [ ] **Step 3: Build and lint**

Run: `npm run build -w client` — expect success, 0 errors.
Run: `npm run lint -w client` — expect 0 errors, only the 2 pre-existing warnings.

- [ ] **Step 4: Commit**

```bash
git add client/src/hooks/usePageData.ts client/src/crew/sorters.ts
git commit -m "Add usePageData hook and defaultCrewComparator"
```

---

### Task 2: Adopt `usePageData` into the 4 non-comparator pages

**Files:**
- Modify: `client/src/pages/FiveStarsCrewPage.tsx`
- Modify: `client/src/pages/ShipsPage.tsx`
- Modify: `client/src/pages/QPsPage.tsx`
- Modify: `client/src/pages/CollectionsPage.tsx`

**Interfaces:**
- Consumes: `usePageData(): UsePageDataResult` from Task 1 (`../hooks/usePageData`), called with no argument in all 4 files.

- [ ] **Step 1: Replace the full contents of `client/src/pages/FiveStarsCrewPage.tsx`**

```tsx
import { usePageData } from '../hooks/usePageData';
import { getCrewList } from '../crew/getters';
import { filterUnmaxed } from '../crew/filters';
import { byEquipmentSlotsRemainingDesc, byLevelDesc, byNameAsc, byRarityDesc, sortCrew } from '../crew/sorters';
import { combineComparators } from '../lib/comparator';
import { getCollectionsList } from '../collections/getters';
import { useSearch } from '../lib/useSearch';
import CrewTable from '../crew/CrewTable';
import PageShell from '../layout/PageShell';
import TableSearchBar from '../components/TableSearchBar';

function FiveStarsCrewPage() {
  const { data, loading, error, refresh, loaded } = usePageData();

  const collections = data ? getCollectionsList(data) : [];
  const crew = data
    ? sortCrew(
        filterUnmaxed(getCrewList(data), 5),
        combineComparators(byLevelDesc, byEquipmentSlotsRemainingDesc, byRarityDesc, byNameAsc)
      )
    : [];
  const { query, setQuery, filteredItems: filteredCrew, active } = useSearch(crew, (c) => [c.name]);

  return (
    <PageShell
      title="5 Stars Crew"
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={filteredCrew.length}
      totalCount={crew.length}
      emptyMessage={active && filteredCrew.length === 0 ? 'No results found for your search.' : 'No unmaxed 5-star crew.'}
      titleActions={<TableSearchBar value={query} onChange={setQuery} ariaLabel="Search 5 Stars Crew by name" />}
    >
      <CrewTable crew={filteredCrew} collections={collections} showCollectionsNames={true} />
    </PageShell>
  );
}

export default FiveStarsCrewPage;
```

- [ ] **Step 2: Replace the full contents of `client/src/pages/ShipsPage.tsx`**

```tsx
import { usePageData } from '../hooks/usePageData';
import { getOwnedItems } from '../crew/getters';
import { combineComparators } from '../lib/comparator';
import { getShipList } from '../ships/getters';
import { filterIncompleteShipsByRarity } from '../ships/filters';
import { byLevelDesc, byLevelProgressDesc, byMissingSchematicsAsc, byNameAsc, sortShips } from '../ships/sorters';
import { useSearch } from '../lib/useSearch';
import ShipsTable from '../ships/ShipsTable';
import PageShell from '../layout/PageShell';
import TableSearchBar from '../components/TableSearchBar';

export interface ShipsPageProps {
  rarity: number;
  title: string;
}

function ShipsPage({ rarity, title }: ShipsPageProps) {
  const { data, loading, error, refresh, loaded } = usePageData();

  const items = data ? getOwnedItems(data) : [];
  const ships = data
    ? sortShips(
        filterIncompleteShipsByRarity(getShipList(data), rarity),
        combineComparators(byLevelDesc, byLevelProgressDesc, byMissingSchematicsAsc(items), byNameAsc)
      )
    : [];
  const { query, setQuery, filteredItems: filteredShips, active } = useSearch(ships, (s) => [s.name]);

  return (
    <PageShell
      title={title}
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={filteredShips.length}
      totalCount={ships.length}
      emptyMessage={
        active && filteredShips.length === 0 ? 'No results found for your search.' : 'No incomplete ships at this rarity.'
      }
      titleActions={<TableSearchBar value={query} onChange={setQuery} ariaLabel={`Search ${title} by name`} />}
    >
      <ShipsTable ships={filteredShips} items={items} />
    </PageShell>
  );
}

export default ShipsPage;
```

- [ ] **Step 3: Replace the full contents of `client/src/pages/QPsPage.tsx`**

```tsx
import { usePageData } from '../hooks/usePageData';
import { getCrewList } from '../crew/getters';
import { filterQPEligible } from '../crew/filters';
import { byQPOnHoldAsc, byQPLevelDesc, byQPBitsDesc, byNameAsc, sortCrew } from '../crew/sorters';
import { combineComparators } from '../lib/comparator';
import { useSearch } from '../lib/useSearch';
import QPsTable from '../crew/QPsTable';
import PageShell from '../layout/PageShell';
import TableSearchBar from '../components/TableSearchBar';

function QPsPage() {
  const { data, loading, error, refresh, loaded } = usePageData();

  const crew = data
    ? sortCrew(
        filterQPEligible(getCrewList(data)),
        combineComparators(byQPOnHoldAsc, byQPLevelDesc, byQPBitsDesc, byNameAsc)
      )
    : [];
  const { query, setQuery, filteredItems: filteredCrew, active } = useSearch(crew, (c) => [c.name]);

  return (
    <PageShell
      title="QPs"
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={filteredCrew.length}
      totalCount={crew.length}
      emptyMessage={active && filteredCrew.length === 0 ? 'No results found for your search.' : 'No crew need QP leveling.'}
      titleActions={<TableSearchBar value={query} onChange={setQuery} ariaLabel="Search QPs by name" />}
    >
      <QPsTable crew={filteredCrew} />
    </PageShell>
  );
}

export default QPsPage;
```

- [ ] **Step 4: Replace the full contents of `client/src/pages/CollectionsPage.tsx`**

```tsx
import { usePageData } from '../hooks/usePageData';
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
  const { data, loading, error, refresh, loaded } = usePageData();

  const rawCollections = data ? getCollectionsList(data) : [];
  const crew = data ? getCrewList(data) : [];
  const items = data ? getOwnedItems(data) : [];
  const frozenArchetypeIds = data ? getFrozenCrewArchetypeIds(data) : new Set<number>();
  // Called unconditionally (unlike the `data ? ... : <empty>` guards above) — both
  // functions safely return an empty Map/Set when rawCollections is empty, so no guard is needed here.
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

- [ ] **Step 5: Build and lint**

Run: `npm run build -w client` — expect success, 0 errors.
Run: `npm run lint -w client` — expect 0 errors, only the 2 pre-existing warnings.

- [ ] **Step 6: Real-browser verification**

Start the dev server. Using real Playwright/chrome-devtools MCP tools (or the `playwright` library per `CLAUDE.md` if the MCP servers aren't available this session), check at least 2 of the 4 routes (`/5-stars-crew`, `/5-stars-ships` or `/4-stars-ships`, `/qps`, `/collections`):

1. The page loads normally (no permanent spinner, no blocking error) and shows real data.
2. The row count and title/count text match what was shown before this change (compare against `git show HEAD:client/src/pages/<File>.tsx` output rendered mentally, or just confirm the numbers look sane against `example-data.json` — e.g. `/collections` should still show 88 total).

Record the actual observed row counts and titles — not the expected ones.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/FiveStarsCrewPage.tsx client/src/pages/ShipsPage.tsx client/src/pages/QPsPage.tsx client/src/pages/CollectionsPage.tsx
git commit -m "Adopt usePageData in the 4 non-comparator pages"
```

---

### Task 3: Adopt `usePageData` + `defaultCrewComparator` into the 5 comparator pages

**Files:**
- Modify: `client/src/pages/ThreeFourStarsCrewPage.tsx`
- Modify: `client/src/pages/FourFiveStarsCrewPage.tsx`
- Modify: `client/src/pages/FourFourStarsCrewPage.tsx`
- Modify: `client/src/pages/FourFourStarsCrewReadyPage.tsx`
- Modify: `client/src/pages/FrozenDuplicatesPage.tsx`

**Interfaces:**
- Consumes: `usePageData(): UsePageDataResult` and `defaultCrewComparator(collections: Collection[]): Comparator<CrewMember>`, both from Task 1.

- [ ] **Step 1: Replace the full contents of `client/src/pages/ThreeFourStarsCrewPage.tsx`**

```tsx
import { usePageData } from '../hooks/usePageData';
import { getCrewList } from '../crew/getters';
import { filterByRarity } from '../crew/filters';
import { defaultCrewComparator, sortCrew } from '../crew/sorters';
import { getCollectionsList } from '../collections/getters';
import { useSearch } from '../lib/useSearch';
import CrewTable from '../crew/CrewTable';
import PageShell from '../layout/PageShell';
import TableSearchBar from '../components/TableSearchBar';

function ThreeFourStarsCrewPage() {
  const { data, loading, error, refresh, loaded } = usePageData();

  const collections = data ? getCollectionsList(data) : [];
  const crew = data
    ? sortCrew(filterByRarity(getCrewList(data), { rarity: 3, maxRarity: 4 }), defaultCrewComparator(collections))
    : [];
  const { query, setQuery, filteredItems: filteredCrew, active } = useSearch(crew, (c) => [c.name]);

  return (
    <PageShell
      title="3/4 Stars crew"
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={filteredCrew.length}
      totalCount={crew.length}
      emptyMessage={active && filteredCrew.length === 0 ? 'No results found for your search.' : 'No crew at 3/4 stars.'}
      titleActions={<TableSearchBar value={query} onChange={setQuery} ariaLabel="Search 3/4 Stars crew by name" />}
    >
      <CrewTable crew={filteredCrew} collections={collections} showCollectionsNames={true} />
    </PageShell>
  );
}

export default ThreeFourStarsCrewPage;
```

- [ ] **Step 2: Replace the full contents of `client/src/pages/FourFiveStarsCrewPage.tsx`**

```tsx
import { usePageData } from '../hooks/usePageData';
import { getCrewList } from '../crew/getters';
import { filterByRarity } from '../crew/filters';
import { defaultCrewComparator, sortCrew } from '../crew/sorters';
import { getCollectionsList } from '../collections/getters';
import { useSearch } from '../lib/useSearch';
import CrewTable from '../crew/CrewTable';
import PageShell from '../layout/PageShell';
import TableSearchBar from '../components/TableSearchBar';

function FourFiveStarsCrewPage() {
  const { data, loading, error, refresh, loaded } = usePageData();

  const collections = data ? getCollectionsList(data) : [];
  const crew = data
    ? sortCrew(filterByRarity(getCrewList(data), { rarity: 4, maxRarity: 5 }), defaultCrewComparator(collections))
    : [];
  const { query, setQuery, filteredItems: filteredCrew, active } = useSearch(crew, (c) => [c.name]);

  return (
    <PageShell
      title="4/5 Stars crew"
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={filteredCrew.length}
      totalCount={crew.length}
      emptyMessage={active && filteredCrew.length === 0 ? 'No results found for your search.' : 'No crew at 4/5 stars.'}
      titleActions={<TableSearchBar value={query} onChange={setQuery} ariaLabel="Search 4/5 Stars crew by name" />}
    >
      <CrewTable crew={filteredCrew} collections={collections} showCollectionsNames={true} />
    </PageShell>
  );
}

export default FourFiveStarsCrewPage;
```

- [ ] **Step 3: Replace the full contents of `client/src/pages/FourFourStarsCrewPage.tsx`**

```tsx
import { usePageData } from '../hooks/usePageData';
import { getCrewList, getOwnedItems } from '../crew/getters';
import { filterByRarity, filterNeedsWork } from '../crew/filters';
import { defaultCrewComparator, sortCrew } from '../crew/sorters';
import { getCollectionsList } from '../collections/getters';
import { useSearch } from '../lib/useSearch';
import CrewTable from '../crew/CrewTable';
import PageShell from '../layout/PageShell';
import TableSearchBar from '../components/TableSearchBar';

function FourFourStarsCrewPage() {
  const { data, loading, error, refresh, loaded } = usePageData();

  const collections = data ? getCollectionsList(data) : [];
  const crew = data
    ? sortCrew(
        filterNeedsWork(filterByRarity(getCrewList(data), { rarity: 4, maxRarity: 4 }), getOwnedItems(data)),
        defaultCrewComparator(collections)
      )
    : [];
  const { query, setQuery, filteredItems: filteredCrew, active } = useSearch(crew, (c) => [c.name]);

  return (
    <PageShell
      title="4/4 Stars crew"
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={filteredCrew.length}
      totalCount={crew.length}
      emptyMessage={active && filteredCrew.length === 0 ? 'No results found for your search.' : 'No crew at 4/4 stars.'}
      titleActions={<TableSearchBar value={query} onChange={setQuery} ariaLabel="Search 4/4 Stars crew by name" />}
    >
      <CrewTable crew={filteredCrew} collections={collections} showCollectionsNames={true} />
    </PageShell>
  );
}

export default FourFourStarsCrewPage;
```

- [ ] **Step 4: Replace the full contents of `client/src/pages/FourFourStarsCrewReadyPage.tsx`**

```tsx
import { usePageData } from '../hooks/usePageData';
import { getCrewList, getOwnedItems } from '../crew/getters';
import { filterByRarity, filterReadyToImmortalize } from '../crew/filters';
import { defaultCrewComparator, sortCrew } from '../crew/sorters';
import { getCollectionsList } from '../collections/getters';
import { useSearch } from '../lib/useSearch';
import CrewTable from '../crew/CrewTable';
import PageShell from '../layout/PageShell';
import TableSearchBar from '../components/TableSearchBar';

function FourFourStarsCrewReadyPage() {
  const { data, loading, error, refresh, loaded } = usePageData();

  const collections = data ? getCollectionsList(data) : [];
  const crew = data
    ? sortCrew(
        filterReadyToImmortalize(filterByRarity(getCrewList(data), { rarity: 4, maxRarity: 4 }), getOwnedItems(data)),
        defaultCrewComparator(collections)
      )
    : [];
  const { query, setQuery, filteredItems: filteredCrew, active } = useSearch(crew, (c) => [c.name]);

  return (
    <PageShell
      title="4/4 Stars crew (ready)"
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={filteredCrew.length}
      totalCount={crew.length}
      emptyMessage={
        active && filteredCrew.length === 0
          ? 'No results found for your search.'
          : 'No crew ready to immortalize at 4/4 stars.'
      }
      titleActions={<TableSearchBar value={query} onChange={setQuery} ariaLabel="Search 4/4 Stars crew (ready) by name" />}
    >
      <CrewTable crew={filteredCrew} collections={collections} showCollectionsNames={true} />
    </PageShell>
  );
}

export default FourFourStarsCrewReadyPage;
```

- [ ] **Step 5: Replace the full contents of `client/src/pages/FrozenDuplicatesPage.tsx`**

```tsx
import { usePageData } from '../hooks/usePageData';
import { getCrewList, getFrozenCrewArchetypeIds } from '../crew/getters';
import { filterFrozenDuplicates } from '../crew/filters';
import { defaultCrewComparator, sortCrew } from '../crew/sorters';
import { getCollectionsList } from '../collections/getters';
import { useSearch } from '../lib/useSearch';
import CrewTable from '../crew/CrewTable';
import PageShell from '../layout/PageShell';
import TableSearchBar from '../components/TableSearchBar';

export interface FrozenDuplicatesPageProps {
  maxRarity: number;
  title: string;
}

function FrozenDuplicatesPage({ maxRarity, title }: FrozenDuplicatesPageProps) {
  const { data, loading, error, refresh, loaded } = usePageData();

  const collections = data ? getCollectionsList(data) : [];
  const frozenArchetypeIds = data ? getFrozenCrewArchetypeIds(data) : new Set<number>();
  const crew = data
    ? sortCrew(
        filterFrozenDuplicates(getCrewList(data), frozenArchetypeIds, maxRarity),
        defaultCrewComparator(collections)
      )
    : [];
  const { query, setQuery, filteredItems: filteredCrew, active } = useSearch(crew, (c) => [c.name]);

  return (
    <PageShell
      title={title}
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={filteredCrew.length}
      totalCount={crew.length}
      emptyMessage={
        active && filteredCrew.length === 0 ? 'No results found for your search.' : 'No duplicate crew at this rarity.'
      }
      titleActions={<TableSearchBar value={query} onChange={setQuery} ariaLabel={`Search ${title} by name`} />}
    >
      <CrewTable crew={filteredCrew} collections={collections} showCollectionsNames={false} />
    </PageShell>
  );
}

export default FrozenDuplicatesPage;
```

- [ ] **Step 6: Build and lint**

Run: `npm run build -w client` — expect success, 0 errors.
Run: `npm run lint -w client` — expect 0 errors, only the 2 pre-existing warnings.

- [ ] **Step 7: Real-browser verification — confirm sort order is genuinely unchanged**

Start the dev server. Using real Playwright/chrome-devtools MCP tools (or the `playwright` library per `CLAUDE.md`), navigate to at least 2 of the 5 routes (`/3-4-stars-crew`, `/4-5-stars-crew`, `/4-4-stars-crew`, `/4-4-stars-crew-ready`, `/4-stars-duplicates` or `/5-stars-duplicates`) and record the first 5 crew names shown, in order, plus the total row count. This is the specific claim this task must not silently break — `defaultCrewComparator` must produce byte-identical ordering to the old inline `combineComparators(...)` call it replaces (it's the same function calls in the same order, so this should be a formality, but confirm it against real data rather than assuming).

Record the actual observed names/order — not the expected ones.

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/ThreeFourStarsCrewPage.tsx client/src/pages/FourFiveStarsCrewPage.tsx client/src/pages/FourFourStarsCrewPage.tsx client/src/pages/FourFourStarsCrewReadyPage.tsx client/src/pages/FrozenDuplicatesPage.tsx
git commit -m "Adopt usePageData and defaultCrewComparator in the 5 comparator pages"
```

---

### Task 4: Adopt `usePageData(extraLoading)` into `FrozenCrewPage`

**Files:**
- Modify: `client/src/pages/FrozenCrewPage.tsx`

**Interfaces:**
- Consumes: `usePageData(extraLoading?: boolean): UsePageDataResult` from Task 1, called here with `catalogLoading` (from `useCrewCatalog()`, called first) as the argument.

- [ ] **Step 1: Replace the full contents of `client/src/pages/FrozenCrewPage.tsx`**

```tsx
import { usePageData } from '../hooks/usePageData';
import { useCrewCatalog } from '../hooks/useCrewCatalog';
import { getFrozenCrewArchetypeIds } from '../crew/getters';
import { getFrozenCrew } from '../catalog/getters';
import { byMaxRarityDesc, byNameAsc } from '../catalog/sorters';
import { combineComparators } from '../lib/comparator';
import { useSearch } from '../lib/useSearch';
import FrozenCrewTable from '../catalog/FrozenCrewTable';
import PageShell from '../layout/PageShell';
import TableSearchBar from '../components/TableSearchBar';

function FrozenCrewPage() {
  const { data: catalog, loading: catalogLoading, error: catalogError } = useCrewCatalog();
  const { data, loading, error, refresh, loaded } = usePageData(catalogLoading);

  const frozenArchetypeIds = data ? getFrozenCrewArchetypeIds(data) : new Set<number>();
  const crew = catalog
    ? [...getFrozenCrew(catalog, frozenArchetypeIds, [4, 5])].sort(combineComparators(byMaxRarityDesc, byNameAsc))
    : [];
  const { query, setQuery, filteredItems: filteredCrew, active } = useSearch(crew, (c) => [c.name]);

  return (
    <PageShell
      title="5 & 4 Stars Frozen Crew"
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={filteredCrew.length}
      totalCount={crew.length}
      emptyMessage={
        !catalog && catalogError
          ? `Crew catalog unavailable: ${catalogError}`
          : active && filteredCrew.length === 0
            ? 'No results found for your search.'
            : 'No frozen 4 or 5-star crew.'
      }
      titleActions={<TableSearchBar value={query} onChange={setQuery} ariaLabel="Search 5 & 4 Stars Frozen Crew by name" />}
    >
      <FrozenCrewTable crew={filteredCrew} />
    </PageShell>
  );
}

export default FrozenCrewPage;
```

Note the two changes from before: `useCrewCatalog()` is called *before* `usePageData(catalogLoading)` so `catalogLoading` exists when needed, and `<PageShell loading={loading} .../>` now uses the hook's already-combined `loading` directly — the old `loading={loading || catalogLoading}` is gone because `usePageData` did that composition internally. Everything else (the `emptyMessage`'s `catalogError` handling, `crew`, `frozenArchetypeIds`) is untouched.

- [ ] **Step 2: Build and lint**

Run: `npm run build -w client` — expect success, 0 errors.
Run: `npm run lint -w client` — expect 0 errors, only the 2 pre-existing warnings.

- [ ] **Step 3: Real-browser verification — confirm the loading/error asymmetry survived**

Start the dev server. Using real Playwright/chrome-devtools MCP tools (or the `playwright` library per `CLAUDE.md`), navigate to `/5-4-stars-frozen-crew` and confirm:

1. **Normal case:** the page loads to show real frozen-crew rows (not stuck on a spinner), matching what it showed before this change (same row count).
2. **Combined loading:** this is the specific behavior this task must not break — confirm via code reading (not just observation) that `loading` passed to `PageShell` is `catalogLoading || playerLoading` end-to-end, by checking the network tab / initial render briefly shows the loading state on first page load (both `usePlayerData` and `useCrewCatalog` start `loading: true`), same as before this change.
3. **catalogError exclusion (the actual behavior-preservation risk):** this project's established practice for a scenario that isn't naturally reproducible with the seeded data (a live crew-catalog fetch failure) is to close it on code-inspection grounds rather than leave it untested — confirm by re-reading the final `FrozenCrewPage.tsx` and verifying algebraically that `loaded = !(loading || catalogLoading) && !error && !!data` (what `usePageData(catalogLoading)` computes) is identical to the pre-change `!loading && !catalogLoading && !error && !!data` by De Morgan's law, and that `catalogError` still only appears in the `emptyMessage` ternary, nowhere in the `loaded`/`error`/`loading` chain — matching the spec's stated non-goal exactly. Record this as a structural/algebraic check, explicitly labeled as such, not as an observed live failure.

Record the actual observed row count and loading behavior — not the expected ones.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/FrozenCrewPage.tsx
git commit -m "Adopt usePageData(extraLoading) in FrozenCrewPage"
```

---

## Final integration check

- [ ] Run `npm run build -w client` and `npm run lint -w client` one more time to confirm the same clean result across the fully merged branch.
- [ ] Update `docs/PROJECT_STATE.md`: strike through (in the established "resolved, kept as a pointer" style used throughout that document) the "`usePlayerData()`/`loaded` and the default crew-page sort composition still repeat across pages" deferred-issues entry, add a feature-history entry, bump the "Last updated" line, and reconcile any deep-dive section that documents the pre-refactor per-page pattern as current (per the lesson from the two most recent features' final reviews — check the "Page shell extraction" deep-dive specifically, since that's the section most likely to still describe the old per-page `usePlayerData()`+`loaded` pattern).
