# Table Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a free-text, live-filtering search box to the title row of every list table in the app, matching on each row's `name` field, activating at 3 characters, restoring the full list below that threshold.

**Architecture:** A shared `useSearch<T>` hook (page-level, generic over any array + a "searchable text" extractor) filters each page's item array *before* it reaches the table component — the table's existing `usePagination` hook, unchanged, naturally recalculates on the shorter array. A shared `TableSearchBar` component renders the input; `PageShell` gains two new optional props (`titleActions`, `totalCount`) to host it in the title row without touching any page that doesn't opt in.

**Tech Stack:** React 19, TypeScript, MUI v6.5.0 (`TextField` with `slotProps.input.startAdornment`, confirmed as the non-deprecated form in the installed version — `InputProps` still works but is deprecated, removed in v7), `@mui/icons-material` (already a dependency) for the search icon.

## Global Constraints

- Search activates at exactly 3 characters (`query.length >= 3`), not a trimmed length — matches the literal request.
- Match is case-insensitive substring (free/anywhere-in-string), not prefix-only — `"oim"` must match `"Boimler"`.
- No debounce — filtering recalculates synchronously on every keystroke once the threshold is met.
- No persistence of the search query across navigation or reload — plain `useState`, resets on remount (same convention as the pagination feature).
- Filtering happens at the page level, before the array reaches the table component. **None of the 6 table components (`CrewTable`, `MissingCrewTable`, `FrozenCrewTable`, `QPsTable`, `ShipsTable`, `CollectionsTable`) are modified by this plan.**
- Title count while a search is active shows `"(filtered of total)"` — e.g. `"Collections (12 of 88)"` — falling back to the existing `"(count)"` format when `totalCount` is not provided or equals `count`.
- `CollectionsTable`'s search matches `collection.name` only, never nested crew names.
- The hook's `getSearchableText: (item) => string[]` signature exists specifically so a future multi-field search is a call-site change, not a hook change — every call site in this plan passes exactly `(item) => [item.name]`.
- Build (`npm run build -w client`) and lint (`npm run lint -w client`) must stay clean (0 errors; the 2 pre-existing `react-refresh/only-export-components` warnings in `context/*.tsx` are unrelated and expected) after every task.

---

### Task 1: Foundation — `useSearch` hook, `TableSearchBar`, `PageShell`, and the first page

**Files:**
- Create: `client/src/lib/useSearch.ts`
- Create: `client/src/components/TableSearchBar.tsx`
- Modify: `client/src/layout/PageShell.tsx`
- Modify: `client/src/pages/FiveStarsCrewPage.tsx`

**Interfaces:**
- Produces: `useSearch<T>(items: T[], getSearchableText: (item: T) => string[]): UseSearchResult<T>` where `UseSearchResult<T> = { query: string; setQuery: (query: string) => void; filteredItems: T[]; active: boolean }`, exported from `client/src/lib/useSearch.ts` alongside `MIN_QUERY_LENGTH = 3`.
- Produces: `TableSearchBar({ value, onChange, placeholder? }: TableSearchBarProps)`, default export from `client/src/components/TableSearchBar.tsx`.
- Produces: `PageShell` gains two new optional props, `totalCount?: number` and `titleActions?: ReactNode`, on top of its existing `PageShellProps`. All existing callers (not yet updated) keep rendering exactly as before.
- Consumes (Task 2+): every later task's pages call `useSearch` and render `<TableSearchBar>` inside `PageShell`'s new `titleActions` slot, exactly as this task establishes for `FiveStarsCrewPage`.

- [ ] **Step 1: Create the `useSearch` hook**

```ts
// client/src/lib/useSearch.ts
import { useState } from 'react';

export const MIN_QUERY_LENGTH = 3;

export interface UseSearchResult<T> {
  query: string;
  setQuery: (query: string) => void;
  filteredItems: T[];
  active: boolean;
}

export function useSearch<T>(items: T[], getSearchableText: (item: T) => string[]): UseSearchResult<T> {
  const [query, setQuery] = useState('');
  const active = query.length >= MIN_QUERY_LENGTH;
  const needle = query.toLowerCase();
  const filteredItems = active
    ? items.filter((item) => getSearchableText(item).some((text) => text.toLowerCase().includes(needle)))
    : items;

  return { query, setQuery, filteredItems, active };
}
```

- [ ] **Step 2: Create the `TableSearchBar` component**

```tsx
// client/src/components/TableSearchBar.tsx
import { InputAdornment, TextField } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';

export interface TableSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

function TableSearchBar({ value, onChange, placeholder = 'Search by name…' }: TableSearchBarProps) {
  return (
    <TextField
      size="small"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
        },
      }}
      sx={{ width: 260 }}
    />
  );
}

export default TableSearchBar;
```

- [ ] **Step 3: Extend `PageShell` with `totalCount` and `titleActions`**

Replace the full contents of `client/src/layout/PageShell.tsx` with:

```tsx
import type { ReactNode } from 'react';
import { Alert, Button, CircularProgress, Stack, Typography } from '@mui/material';

export interface PageShellProps {
  title: string;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  loaded: boolean;
  count: number;
  totalCount?: number;
  emptyMessage: string;
  titleActions?: ReactNode;
  children: ReactNode;
}

function PageShell({
  title,
  loading,
  error,
  onRetry,
  loaded,
  count,
  totalCount,
  emptyMessage,
  titleActions,
  children,
}: PageShellProps) {
  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
        <Typography variant="h4">
          {title}
          {loaded ? ` (${count}${totalCount !== undefined && totalCount !== count ? ` of ${totalCount}` : ''})` : ''}
        </Typography>
        {titleActions}
      </Stack>

      {loading && <CircularProgress />}
      {error && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={onRetry}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {loaded && (count === 0 ? <Typography color="text.secondary">{emptyMessage}</Typography> : children)}
    </Stack>
  );
}

export default PageShell;
```

- [ ] **Step 4: Wire search into `FiveStarsCrewPage`**

Replace the full contents of `client/src/pages/FiveStarsCrewPage.tsx` with:

```tsx
import { usePlayerData } from '../hooks/usePlayerData';
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
  const { data, loading, error, refresh } = usePlayerData();

  const collections = data ? getCollectionsList(data) : [];
  const crew = data
    ? sortCrew(
        filterUnmaxed(getCrewList(data), 5),
        combineComparators(byLevelDesc, byEquipmentSlotsRemainingDesc, byRarityDesc, byNameAsc)
      )
    : [];
  const { query, setQuery, filteredItems: filteredCrew, active } = useSearch(crew, (c) => [c.name]);

  const loaded = !loading && !error && !!data;

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
      titleActions={<TableSearchBar value={query} onChange={setQuery} />}
    >
      <CrewTable crew={filteredCrew} collections={collections} showCollectionsNames={true} />
    </PageShell>
  );
}

export default FiveStarsCrewPage;
```

- [ ] **Step 5: Build and lint**

Run: `npm run build -w client` — expect success, 0 errors.
Run: `npm run lint -w client` — expect 0 errors, only the 2 pre-existing `react-refresh/only-export-components` warnings.

- [ ] **Step 6: Data-driven verification against real data**

Write a throwaway Node script (delete it before committing) that reads the
real `example-data.json` (or the worktree's `server/data/player-cache.json`
if that's what the running dev server is actually serving — check which
one is live before trusting either), independently computes the same
5-star-unmaxed-crew list this page's filter/sort pipeline produces, picks
a real crew name from that list, extracts a 3+ character substring from
the *middle* of that name (not the start — the point is proving free
substring match, not prefix match), and counts how many names in the list
contain that substring case-insensitively. Compare that independently
computed count against what the running app actually shows for the same
query in Step 7 below — do not just assert the two "should" match, run
both and put both numbers in the report.

- [ ] **Step 7: Real-browser verification on `/5-stars-crew`**

Start the dev server (`npm run dev`), navigate to `http://localhost:5173/5-stars-crew`, and using real Playwright navigation/typing (not code-reading, not `curl`) confirm, reading actual DOM text each time:
1. Title initially reads `"5 Stars Crew (N of N)"` (same value twice — no search active) and the full row count matches `N`.
2. Type a 2-character substring into the search box (`input[placeholder="Search by name…"]`) — row count and title are unchanged from the un-filtered baseline.
3. Type a 3rd character that produces a real substring match (e.g. `"oim"`, which should match any crew named containing "Boimler" if one exists in the real data — confirm by reading the actual matched row's name from the DOM, not by assuming) — title updates to `"5 Stars Crew (M of N)"` with `M < N`, and the table shows exactly `M` rows.
4. Delete back to 2 characters — table and title return to the full `N`/`N` baseline.
5. Type a query guaranteed to match nothing (e.g. a string of `z`s) — the table area shows "No results found for your search." and the search box remains visible and editable.
6. Confirm the pagination footer (if the filtered count exceeds 50) reflects the filtered count, not the original total.

Record the actual observed title strings, row counts, and matched names in the task report — not the values you expect, the values you read.

- [ ] **Step 8: Commit**

```bash
git add client/src/lib/useSearch.ts client/src/components/TableSearchBar.tsx client/src/layout/PageShell.tsx client/src/pages/FiveStarsCrewPage.tsx
git commit -m "Add table search: useSearch hook, TableSearchBar, PageShell wiring, first page"
```

---

### Task 2: Wire search into the remaining 5 `CrewTable`-based pages

**Files:**
- Modify: `client/src/pages/FourFiveStarsCrewPage.tsx`
- Modify: `client/src/pages/FourFourStarsCrewPage.tsx`
- Modify: `client/src/pages/FourFourStarsCrewReadyPage.tsx`
- Modify: `client/src/pages/ThreeFourStarsCrewPage.tsx`
- Modify: `client/src/pages/FrozenDuplicatesPage.tsx`

**Interfaces:**
- Consumes: `useSearch` from `../lib/useSearch` (Task 1), `TableSearchBar` from `../components/TableSearchBar` (Task 1), `PageShell`'s `totalCount`/`titleActions` props (Task 1) — identical pattern to `FiveStarsCrewPage`, just a different filter/sort pipeline and empty message per page.

Each file gets exactly 3 changes: (a) two new imports (`useSearch`, `TableSearchBar`), (b) one new line computing `{ query, setQuery, filteredItems: filteredCrew, active }` right after the existing `crew` computation, (c) the `<PageShell>` call passes `count={filteredCrew.length}`, `totalCount={crew.length}`, a conditional `emptyMessage`, and `titleActions={<TableSearchBar value={query} onChange={setQuery} />}`, and `<CrewTable crew={filteredCrew} .../>` instead of `crew={crew}`. Nothing else in any of these 5 files changes — no filter/sort logic, no other props.

- [ ] **Step 1: `FourFiveStarsCrewPage.tsx`**

Replace the full contents with:

```tsx
import { usePlayerData } from '../hooks/usePlayerData';
import { getCrewList } from '../crew/getters';
import { filterByRarity } from '../crew/filters';
import { byCollectionCountDesc, byEquipmentSlotsRemainingDesc, byLevelDesc, byNameAsc, sortCrew } from '../crew/sorters';
import { combineComparators } from '../lib/comparator';
import { getCollectionsList } from '../collections/getters';
import { useSearch } from '../lib/useSearch';
import CrewTable from '../crew/CrewTable';
import PageShell from '../layout/PageShell';
import TableSearchBar from '../components/TableSearchBar';

function FourFiveStarsCrewPage() {
  const { data, loading, error, refresh } = usePlayerData();

  const collections = data ? getCollectionsList(data) : [];
  const crew = data
    ? sortCrew(
        filterByRarity(getCrewList(data), { rarity: 4, maxRarity: 5 }),
        combineComparators(byLevelDesc, byEquipmentSlotsRemainingDesc, byCollectionCountDesc(collections), byNameAsc)
      )
    : [];
  const { query, setQuery, filteredItems: filteredCrew, active } = useSearch(crew, (c) => [c.name]);

  const loaded = !loading && !error && !!data;

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
      titleActions={<TableSearchBar value={query} onChange={setQuery} />}
    >
      <CrewTable crew={filteredCrew} collections={collections} showCollectionsNames={true} />
    </PageShell>
  );
}

export default FourFiveStarsCrewPage;
```

- [ ] **Step 2: `FourFourStarsCrewPage.tsx`**

Replace the full contents with:

```tsx
import { usePlayerData } from '../hooks/usePlayerData';
import { getCrewList, getOwnedItems } from '../crew/getters';
import { filterByRarity, filterNeedsWork } from '../crew/filters';
import { byCollectionCountDesc, byEquipmentSlotsRemainingDesc, byLevelDesc, byNameAsc, sortCrew } from '../crew/sorters';
import { combineComparators } from '../lib/comparator';
import { getCollectionsList } from '../collections/getters';
import { useSearch } from '../lib/useSearch';
import CrewTable from '../crew/CrewTable';
import PageShell from '../layout/PageShell';
import TableSearchBar from '../components/TableSearchBar';

function FourFourStarsCrewPage() {
  const { data, loading, error, refresh } = usePlayerData();

  const collections = data ? getCollectionsList(data) : [];
  const crew = data
    ? sortCrew(
        filterNeedsWork(
          filterByRarity(getCrewList(data), { rarity: 4, maxRarity: 4 }),
          getOwnedItems(data)
        ),
        combineComparators(byLevelDesc, byEquipmentSlotsRemainingDesc, byCollectionCountDesc(collections), byNameAsc)
      )
    : [];
  const { query, setQuery, filteredItems: filteredCrew, active } = useSearch(crew, (c) => [c.name]);

  const loaded = !loading && !error && !!data;

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
      titleActions={<TableSearchBar value={query} onChange={setQuery} />}
    >
      <CrewTable crew={filteredCrew} collections={collections} showCollectionsNames={true} />
    </PageShell>
  );
}

export default FourFourStarsCrewPage;
```

- [ ] **Step 3: `FourFourStarsCrewReadyPage.tsx`**

Replace the full contents with:

```tsx
import { usePlayerData } from '../hooks/usePlayerData';
import { getCrewList, getOwnedItems } from '../crew/getters';
import { filterByRarity, filterReadyToImmortalize } from '../crew/filters';
import { byCollectionCountDesc, byEquipmentSlotsRemainingDesc, byLevelDesc, byNameAsc, sortCrew } from '../crew/sorters';
import { combineComparators } from '../lib/comparator';
import { getCollectionsList } from '../collections/getters';
import { useSearch } from '../lib/useSearch';
import CrewTable from '../crew/CrewTable';
import PageShell from '../layout/PageShell';
import TableSearchBar from '../components/TableSearchBar';

function FourFourStarsCrewReadyPage() {
  const { data, loading, error, refresh } = usePlayerData();

  const collections = data ? getCollectionsList(data) : [];
  const crew = data
    ? sortCrew(
        filterReadyToImmortalize(
          filterByRarity(getCrewList(data), { rarity: 4, maxRarity: 4 }),
          getOwnedItems(data)
        ),
        combineComparators(byLevelDesc, byEquipmentSlotsRemainingDesc, byCollectionCountDesc(collections), byNameAsc)
      )
    : [];
  const { query, setQuery, filteredItems: filteredCrew, active } = useSearch(crew, (c) => [c.name]);

  const loaded = !loading && !error && !!data;

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
      titleActions={<TableSearchBar value={query} onChange={setQuery} />}
    >
      <CrewTable crew={filteredCrew} collections={collections} showCollectionsNames={true} />
    </PageShell>
  );
}

export default FourFourStarsCrewReadyPage;
```

- [ ] **Step 4: `ThreeFourStarsCrewPage.tsx`**

Replace the full contents with:

```tsx
import { usePlayerData } from '../hooks/usePlayerData';
import { getCrewList } from '../crew/getters';
import { filterByRarity } from '../crew/filters';
import { byCollectionCountDesc, byEquipmentSlotsRemainingDesc, byLevelDesc, byNameAsc, sortCrew } from '../crew/sorters';
import { combineComparators } from '../lib/comparator';
import { getCollectionsList } from '../collections/getters';
import { useSearch } from '../lib/useSearch';
import CrewTable from '../crew/CrewTable';
import PageShell from '../layout/PageShell';
import TableSearchBar from '../components/TableSearchBar';

function ThreeFourStarsCrewPage() {
  const { data, loading, error, refresh } = usePlayerData();

  const collections = data ? getCollectionsList(data) : [];
  const crew = data
    ? sortCrew(
        filterByRarity(getCrewList(data), { rarity: 3, maxRarity: 4 }),
        combineComparators(byLevelDesc, byEquipmentSlotsRemainingDesc, byCollectionCountDesc(collections), byNameAsc)
      )
    : [];
  const { query, setQuery, filteredItems: filteredCrew, active } = useSearch(crew, (c) => [c.name]);

  const loaded = !loading && !error && !!data;

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
      titleActions={<TableSearchBar value={query} onChange={setQuery} />}
    >
      <CrewTable crew={filteredCrew} collections={collections} showCollectionsNames={true} />
    </PageShell>
  );
}

export default ThreeFourStarsCrewPage;
```

- [ ] **Step 5: `FrozenDuplicatesPage.tsx`**

Replace the full contents with:

```tsx
import { usePlayerData } from '../hooks/usePlayerData';
import { getCrewList, getFrozenCrewArchetypeIds } from '../crew/getters';
import { filterFrozenDuplicates } from '../crew/filters';
import { byCollectionCountDesc, byEquipmentSlotsRemainingDesc, byLevelDesc, byNameAsc, sortCrew } from '../crew/sorters';
import { combineComparators } from '../lib/comparator';
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
  const { data, loading, error, refresh } = usePlayerData();

  const collections = data ? getCollectionsList(data) : [];
  const frozenArchetypeIds = data ? getFrozenCrewArchetypeIds(data) : new Set<number>();
  const crew = data
    ? sortCrew(
        filterFrozenDuplicates(getCrewList(data), frozenArchetypeIds, maxRarity),
        combineComparators(byLevelDesc, byEquipmentSlotsRemainingDesc, byCollectionCountDesc(collections), byNameAsc)
      )
    : [];
  const { query, setQuery, filteredItems: filteredCrew, active } = useSearch(crew, (c) => [c.name]);

  const loaded = !loading && !error && !!data;

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
      titleActions={<TableSearchBar value={query} onChange={setQuery} />}
    >
      <CrewTable crew={filteredCrew} collections={collections} showCollectionsNames={false} />
    </PageShell>
  );
}

export default FrozenDuplicatesPage;
```

Note: `FrozenDuplicatesPage` is reused by both `FourStarsDuplicatesPage` and `FiveStarsDuplicatesPage` (thin wrappers passing `maxRarity`/`title`) — this one change covers both routes (`/4-stars-duplicates`, `/5-stars-duplicates`). Do not edit the two wrapper files; they need no changes.

- [ ] **Step 6: Build and lint**

Run: `npm run build -w client` — expect success, 0 errors.
Run: `npm run lint -w client` — expect 0 errors, only the 2 pre-existing warnings.

- [ ] **Step 7: Real-browser verification**

Pick at least 2 of the 5 routes covered by this task (e.g. `/4-4-stars-crew` and one of `/4-stars-duplicates`/`/5-stars-duplicates`) and repeat Task 1 Step 6's exact checklist (2-char no-op, 3-char instant filter with a real observed match, restore on shrink, zero-result message, pagination-count consistency). Record actual observed values, not predicted ones.

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/FourFiveStarsCrewPage.tsx client/src/pages/FourFourStarsCrewPage.tsx client/src/pages/FourFourStarsCrewReadyPage.tsx client/src/pages/ThreeFourStarsCrewPage.tsx client/src/pages/FrozenDuplicatesPage.tsx
git commit -m "Wire search into the remaining CrewTable-based pages"
```

---

### Task 3: Wire search into `FrozenCrewPage`, `QPsPage`, `ShipsPage`, `CollectionsPage`

**Files:**
- Modify: `client/src/pages/FrozenCrewPage.tsx`
- Modify: `client/src/pages/QPsPage.tsx`
- Modify: `client/src/pages/ShipsPage.tsx`
- Modify: `client/src/pages/CollectionsPage.tsx`

**Interfaces:**
- Consumes: same `useSearch`/`TableSearchBar`/`PageShell` additions from Task 1. `FrozenCrewTable`/`QPsTable`/`ShipsTable`/`CollectionsTable` are unchanged (per Global Constraints) — each page just narrows what it passes in.
- `CollectionsPage` searches `collection.name` (the outer `collections` array item), per the Global Constraints note on `CollectionsTable`.

- [ ] **Step 1: `FrozenCrewPage.tsx`**

Replace the full contents with:

```tsx
import { usePlayerData } from '../hooks/usePlayerData';
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
  const { data, loading, error, refresh } = usePlayerData();
  const { data: catalog, loading: catalogLoading, error: catalogError } = useCrewCatalog();

  const frozenArchetypeIds = data ? getFrozenCrewArchetypeIds(data) : new Set<number>();
  const crew = catalog
    ? [...getFrozenCrew(catalog, frozenArchetypeIds, [4, 5])].sort(combineComparators(byMaxRarityDesc, byNameAsc))
    : [];
  const { query, setQuery, filteredItems: filteredCrew, active } = useSearch(crew, (c) => [c.name]);

  const loaded = !loading && !catalogLoading && !error && !!data;

  return (
    <PageShell
      title="5 & 4 Stars Frozen Crew"
      loading={loading || catalogLoading}
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
      titleActions={<TableSearchBar value={query} onChange={setQuery} />}
    >
      <FrozenCrewTable crew={filteredCrew} />
    </PageShell>
  );
}

export default FrozenCrewPage;
```

- [ ] **Step 2: `QPsPage.tsx`**

Replace the full contents with:

```tsx
import { usePlayerData } from '../hooks/usePlayerData';
import { getCrewList } from '../crew/getters';
import { filterQPEligible } from '../crew/filters';
import { byQPOnHoldAsc, byQPLevelDesc, byQPBitsDesc, byNameAsc, sortCrew } from '../crew/sorters';
import { combineComparators } from '../lib/comparator';
import { useSearch } from '../lib/useSearch';
import QPsTable from '../crew/QPsTable';
import PageShell from '../layout/PageShell';
import TableSearchBar from '../components/TableSearchBar';

function QPsPage() {
  const { data, loading, error, refresh } = usePlayerData();

  const crew = data
    ? sortCrew(
        filterQPEligible(getCrewList(data)),
        combineComparators(byQPOnHoldAsc, byQPLevelDesc, byQPBitsDesc, byNameAsc)
      )
    : [];
  const { query, setQuery, filteredItems: filteredCrew, active } = useSearch(crew, (c) => [c.name]);

  const loaded = !loading && !error && !!data;

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
      titleActions={<TableSearchBar value={query} onChange={setQuery} />}
    >
      <QPsTable crew={filteredCrew} />
    </PageShell>
  );
}

export default QPsPage;
```

- [ ] **Step 3: `ShipsPage.tsx`**

Replace the full contents with:

```tsx
import { usePlayerData } from '../hooks/usePlayerData';
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
  const { data, loading, error, refresh } = usePlayerData();

  const items = data ? getOwnedItems(data) : [];
  const ships = data
    ? sortShips(
        filterIncompleteShipsByRarity(getShipList(data), rarity),
        combineComparators(byLevelDesc, byLevelProgressDesc, byMissingSchematicsAsc(items), byNameAsc)
      )
    : [];
  const { query, setQuery, filteredItems: filteredShips, active } = useSearch(ships, (s) => [s.name]);

  const loaded = !loading && !error && !!data;

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
      titleActions={<TableSearchBar value={query} onChange={setQuery} />}
    >
      <ShipsTable ships={filteredShips} items={items} />
    </PageShell>
  );
}

export default ShipsPage;
```

Note: reused by both `FiveStarsShipsPage` and `FourStarsShipsPage` wrappers — no changes needed there.

- [ ] **Step 4: `CollectionsPage.tsx`**

Replace the full contents with:

```tsx
import { usePlayerData } from '../hooks/usePlayerData';
import { getCrewList, getFrozenCrewArchetypeIds, getOwnedItems } from '../crew/getters';
import { getCollectionsList } from '../collections/getters';
import { byUpgradableThenCompletionThenNameAsc } from '../collections/sorters';
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
  const collections = data
    ? [...rawCollections].sort(byUpgradableThenCompletionThenNameAsc(rawCollections, crew, items, frozenArchetypeIds))
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
      titleActions={<TableSearchBar value={query} onChange={setQuery} />}
    >
      <CollectionsTable
        collections={filteredCollections}
        crew={crew}
        items={items}
        frozenArchetypeIds={frozenArchetypeIds}
      />
    </PageShell>
  );
}

export default CollectionsPage;
```

- [ ] **Step 5: Build and lint**

Run: `npm run build -w client` — expect success, 0 errors.
Run: `npm run lint -w client` — expect 0 errors, only the 2 pre-existing warnings.

- [ ] **Step 6: Data-driven verification for the ship-name and collection-name domains**

Same method as Task 1 Step 6, but covering the two searchable domains this
task introduces: independently compute, from the real running data, (a) a
mid-name substring match count for the ships list `ShipsPage` filters down
to at one rarity, and (b) a mid-name substring match count for the real
`collections` array (88 items in the reference sample, whatever the live
count is in practice). Compare each against what the running app actually
shows for the same query — both numbers in the report, not just the app's.

- [ ] **Step 7: Real-browser verification**

For each of `/5-4-stars-frozen-crew`, `/qps`, `/5-stars-ships` (or `/4-stars-ships`), and `/collections`:
- Confirm the 2-char/3-char/restore/zero-result behavior from Task 1 Step 6, with actually-observed values.
- For `/collections` specifically: confirm a matching search narrows the *collections* shown (each surviving collection still renders its full, unfiltered crew sub-list underneath — both rows of its `Fragment` present), and that the title shows `"Collections (M of 88)"` (or whatever the real total is) with the correct `M`.
- Confirm pagination continues to reflect the filtered count on any table where the filtered result still exceeds 50 (or where toggling the search causes the count to cross the 50-row pagination-visibility threshold in either direction).

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/FrozenCrewPage.tsx client/src/pages/QPsPage.tsx client/src/pages/ShipsPage.tsx client/src/pages/CollectionsPage.tsx
git commit -m "Wire search into FrozenCrewPage, QPsPage, ShipsPage, CollectionsPage"
```

---

### Task 4: Overview page's two Missing-4-Stars sections

**Files:**
- Modify: `client/src/pages/OverviewPage.tsx`

**Interfaces:**
- Consumes: `useSearch`, `TableSearchBar` (Task 1). Does **not** touch `PageShell` — this page never used it and doesn't start now; the title-row + search + empty-state pattern is hand-rolled here, matching what `PageShell` does internally but for two independent sections on one page.
- `CatalogEntry` (from `../types/catalogEntry`) is the item type for both `useSearch` calls — its `name: string` field is what's searched.

This is the one page in the whole feature that changes visible behavior beyond adding search: both "Missing 4 Stars" headings currently show no count at all; this task adds `"(N of M)"` to both, matching every other table's convention now that a search box lives there. Flagged in the spec for the user's awareness — implement as specified below unless told otherwise before this task starts.

- [ ] **Step 1: Wire both sections**

Replace the full contents of `client/src/pages/OverviewPage.tsx` with:

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
import { useSearch } from '../lib/useSearch';
import MissingCrewTable from '../catalog/MissingCrewTable';
import TableSearchBar from '../components/TableSearchBar';
import type { PlayerIdentity } from '../types/player';
import type { CatalogEntry } from '../types/catalogEntry';

const getCatalogEntryName = (c: CatalogEntry) => [c.name];

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
  const inPortalSearch = useSearch(missingInPortal, getCatalogEntryName);
  const notInPortalSearch = useSearch(missingNotInPortal, getCatalogEntryName);

  const showMissingTables = Boolean(
    !loading && !error && identity && !catalogLoading && !catalogError && catalog
  );

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
          <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
            <Typography variant="h5">
              Missing 4 Stars (In Portal) ({inPortalSearch.filteredItems.length} of {missingInPortal.length})
            </Typography>
            <TableSearchBar value={inPortalSearch.query} onChange={inPortalSearch.setQuery} />
          </Stack>
          {inPortalSearch.active && inPortalSearch.filteredItems.length === 0 ? (
            <Typography color="text.secondary">No results found for your search.</Typography>
          ) : (
            <MissingCrewTable crew={inPortalSearch.filteredItems} collections={collectionsList} />
          )}
          <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
            <Typography variant="h5">
              Missing 4 Stars (Not in Portal) ({notInPortalSearch.filteredItems.length} of {missingNotInPortal.length})
            </Typography>
            <TableSearchBar value={notInPortalSearch.query} onChange={notInPortalSearch.setQuery} />
          </Stack>
          {notInPortalSearch.active && notInPortalSearch.filteredItems.length === 0 ? (
            <Typography color="text.secondary">No results found for your search.</Typography>
          ) : (
            <MissingCrewTable crew={notInPortalSearch.filteredItems} collections={collectionsList} />
          )}
        </>
      )}
    </Stack>
  );
}

export default OverviewPage;
```

- [ ] **Step 2: Build and lint**

Run: `npm run build -w client` — expect success, 0 errors.
Run: `npm run lint -w client` — expect 0 errors, only the 2 pre-existing warnings.

- [ ] **Step 3: Real-browser verification on `/`**

- Confirm both headings show `"(N of N)"` initially (search inactive) with `N` matching the real current counts.
- Confirm there are exactly 2 search boxes on the page (`input[placeholder="Search by name…"]`), and that typing in one only changes its own section's heading/table — the other section's heading and row count stay exactly as they were.
- Confirm the 2-char/3-char/restore/zero-result behavior independently in each section.
- Confirm the rest of the Overview page (player identity table, unique-crew-count rows) is completely unaffected.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/OverviewPage.tsx
git commit -m "Add search to the Overview page's two Missing 4 Stars sections"
```
