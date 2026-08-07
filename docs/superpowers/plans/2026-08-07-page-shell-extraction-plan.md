# Page Shell Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the identical loading/error/empty/title JSX shell repeated across 7 pages into a shared `PageShell` component, leaving each page's data-fetching and filtering/sorting logic untouched.

**Architecture:** One new presentational component (`client/src/layout/PageShell.tsx`), then every one of the 7 pages rewritten to use it. Two tasks: Task 1 creates `PageShell` and migrates the first page as a fully-verified proof of the pattern (one of the three table-consuming shapes, `CrewTable`); Task 2 migrates the remaining 6 pages, mechanically repeating the now-proven pattern, with its own verification for the two shapes Task 1 doesn't cover (`CollectionsTable` via `CollectionsPage`, `ShipsTable` via `ShipsPage`).

**Tech Stack:** Same as the existing client workspace — React 19, TypeScript (strict), MUI 6, no new dependencies.

## Global Constraints

- **`PageShell` is a pure presentational component**, decoupled from `PlayerData`/data-fetching entirely:
  ```tsx
  export interface PageShellProps {
    title: string;
    loading: boolean;
    error: string | null;
    onRetry: () => void;
    loaded: boolean;
    count: number;
    emptyMessage: string;
    children: ReactNode;
  }
  ```
  `loaded` is computed by each page (`!loading && !error && !!data`), not inferred by `PageShell` from a `data` prop. `onRetry` takes a plain `() => void` — each page still does its own `onRetry={() => void refresh()}` wrapping.
- **Lives in `client/src/layout/PageShell.tsx`** — same category as `AppLayout.tsx`/`NavGroupItem.tsx`, shared structural UI, not a page itself.
- **Every page's data-fetching, filtering, and sorting logic is unchanged** — only each page's JSX return block changes, replacing the `<Stack>...</Stack>` shell with a `<PageShell>` call wrapping the page's table as `children`.
- **`!!data` is a type-correctness addition, not a logic change** — the original `loaded` expression (`!loading && !error && data`) was a truthy check used only in JSX `&&` guards, where it worked fine untyped; `PageShellProps.loaded` is explicitly `boolean`, so each page's `loaded` computation gains `!!` to match. Zero behavioral difference.
- **`OverviewPage.tsx` is untouched** — different shape (key-value table), not part of this pattern.
- **No automated test framework** (project-wide, deliberate choice). This is a JSX-structure move, not a risk-free import move — verification is TypeScript strict mode + ESLint plus interactive checks via the `playwright` MCP tooling against a real running dev server, covering loading/error/loaded-with-data/loaded-empty states, at least once per distinct table shape (`CrewTable`, `CollectionsTable`, `ShipsTable`).
- **Spec:** `docs/superpowers/specs/2026-08-07-page-shell-extraction-design.md`.

---

### Task 1: Create `PageShell` and migrate `ThreeFourStarsCrewPage` (proof of pattern)

**Files:**
- Create: `client/src/layout/PageShell.tsx`
- Modify: `client/src/pages/ThreeFourStarsCrewPage.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `PageShell` component, default export, with `PageShellProps` as defined above — this is what Task 2's 6 pages will all import and use identically.

- [ ] **Step 1: Confirm the current state of `ThreeFourStarsCrewPage.tsx` matches this plan's assumptions**

Run: `cat -n client/src/pages/ThreeFourStarsCrewPage.tsx`

Confirm it matches:
```tsx
import { Alert, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { usePlayerData } from '../hooks/usePlayerData';
import { getCrewList } from '../crew/getters';
import { filterByRarity } from '../crew/filters';
import { byCollectionCountDesc, byEquipmentSlotsRemainingDesc, byLevelDesc, byNameAsc, sortCrew } from '../crew/sorters';
import { combineComparators } from '../lib/comparator';
import { getCollectionsList } from '../collections/getters';
import CrewTable from '../crew/CrewTable';

function ThreeFourStarsCrewPage() {
  const { data, loading, error, refresh } = usePlayerData();

  const collections = data ? getCollectionsList(data) : [];
  const crew = data
    ? sortCrew(
        filterByRarity(getCrewList(data), { rarity: 3, maxRarity: 4 }),
        combineComparators(byLevelDesc, byEquipmentSlotsRemainingDesc, byCollectionCountDesc(collections), byNameAsc)
      )
    : [];

  const loaded = !loading && !error && data;

  return (
    <Stack spacing={2}>
      <Typography variant="h4">3/4 Stars crew{loaded ? ` (${crew.length})` : ''}</Typography>

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
        crew.length === 0 ? (
          <Typography color="text.secondary">No crew at 3/4 stars.</Typography>
        ) : (
          <CrewTable crew={crew} collections={collections} />
        )
      )}
    </Stack>
  );
}

export default ThreeFourStarsCrewPage;
```

If it differs, stop and re-check the spec before proceeding.

- [ ] **Step 2: Create `client/src/layout/PageShell.tsx`**

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
  emptyMessage: string;
  children: ReactNode;
}

function PageShell({ title, loading, error, onRetry, loaded, count, emptyMessage, children }: PageShellProps) {
  return (
    <Stack spacing={2}>
      <Typography variant="h4">
        {title}
        {loaded ? ` (${count})` : ''}
      </Typography>

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

- [ ] **Step 3: Rewrite `client/src/pages/ThreeFourStarsCrewPage.tsx`**

Replace the entire file with:

```tsx
import { usePlayerData } from '../hooks/usePlayerData';
import { getCrewList } from '../crew/getters';
import { filterByRarity } from '../crew/filters';
import { byCollectionCountDesc, byEquipmentSlotsRemainingDesc, byLevelDesc, byNameAsc, sortCrew } from '../crew/sorters';
import { combineComparators } from '../lib/comparator';
import { getCollectionsList } from '../collections/getters';
import CrewTable from '../crew/CrewTable';
import PageShell from '../layout/PageShell';

function ThreeFourStarsCrewPage() {
  const { data, loading, error, refresh } = usePlayerData();

  const collections = data ? getCollectionsList(data) : [];
  const crew = data
    ? sortCrew(
        filterByRarity(getCrewList(data), { rarity: 3, maxRarity: 4 }),
        combineComparators(byLevelDesc, byEquipmentSlotsRemainingDesc, byCollectionCountDesc(collections), byNameAsc)
      )
    : [];

  const loaded = !loading && !error && !!data;

  return (
    <PageShell
      title="3/4 Stars crew"
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={crew.length}
      emptyMessage="No crew at 3/4 stars."
    >
      <CrewTable crew={crew} collections={collections} />
    </PageShell>
  );
}

export default ThreeFourStarsCrewPage;
```

- [ ] **Step 4: Build and lint check**

Run: `npm run build -w client`
Expected: exits 0.

Run: `npm run lint -w client`
Expected: exits 0, no new errors (the pre-existing `react-refresh/only-export-components` warning in `PlayerDataContext.tsx` is unrelated and expected to still appear). This would also catch an unused `@mui/material` import if Step 3 forgot to remove it, or a missing `PageShellProps` field if Step 3's JSX is incomplete.

- [ ] **Step 5: Verify all four states on `/3-4-stars-crew` against a real running dev server**

Using the `playwright` MCP browser tools:

1. Navigate to `/3-4-stars-crew`. Confirm via `browser_snapshot` that the page title reads "3/4 Stars crew (50)" (the real sample's known count) and that `CrewTable`'s rows render — this is the loaded-with-data state, and confirms `count`/`children` wiring is correct.
2. Confirm no loading spinner or error `Alert` is present once loaded (both conditionally render only in their respective states — this is a straightforward regression check on the same conditions as before, just relocated).
3. To exercise the error state without breaking anything: this is optional and may be skipped if it would require modifying server config — if the existing `session cookie` / dev server setup makes it easy to observe an error state (e.g. temporarily stopping the backend and reloading), do so and confirm the error `Alert` with "Retry" renders; otherwise, confirm by reading the diff that the `error && (...)` block in `PageShell.tsx` is byte-identical in logic to the original (same condition, same `Alert`/`Button` props, only `onClick={onRetry}` replacing `onClick={() => void refresh()}` — and `onRetry` is passed `() => void refresh()` at the call site, so this is provably the same behavior).
4. The loaded-and-empty state (`count === 0`) is not naturally reachable with the real sample data on this page (50 crew) — confirmed correct by reading the code path rather than forcing it live, matching the spec's stated verification approach.

- [ ] **Step 6: Commit**

```bash
git add client/src/layout/PageShell.tsx client/src/pages/ThreeFourStarsCrewPage.tsx
git commit -m "Extract PageShell and migrate ThreeFourStarsCrewPage as the proof of pattern"
```

---

### Task 2: Migrate the remaining 6 pages

**Files:**
- Modify: `client/src/pages/FourFiveStarsCrewPage.tsx`
- Modify: `client/src/pages/FourFourStarsCrewReadyPage.tsx`
- Modify: `client/src/pages/FourFourStarsCrewPage.tsx`
- Modify: `client/src/pages/FrozenDuplicatesPage.tsx`
- Modify: `client/src/pages/CollectionsPage.tsx`
- Modify: `client/src/pages/ShipsPage.tsx`

**Interfaces:**
- Consumes: `PageShell`/`PageShellProps` from `client/src/layout/PageShell.tsx` (Task 1's output) — import it exactly as `ThreeFourStarsCrewPage.tsx` already does: `import PageShell from '../layout/PageShell';`.
- Produces: no new exports — each page's own default export and (for `FrozenDuplicatesPage`/`ShipsPage`) `Props` interface are unchanged.

- [ ] **Step 1: Confirm the current state of all six files matches this plan's assumptions**

Run: `cat -n client/src/pages/FourFiveStarsCrewPage.tsx client/src/pages/FourFourStarsCrewReadyPage.tsx client/src/pages/FourFourStarsCrewPage.tsx client/src/pages/FrozenDuplicatesPage.tsx client/src/pages/CollectionsPage.tsx client/src/pages/ShipsPage.tsx`

Each should still have the same `<Stack>...</Stack>` shell shape as `ThreeFourStarsCrewPage.tsx` had before Task 1 (title line, loading spinner, error `Alert`, loaded/empty conditional) — same structure, different title/data-derivation/table per file. If any file's shell has diverged from this shape, stop and re-check the spec before proceeding.

- [ ] **Step 2: Rewrite `client/src/pages/FourFiveStarsCrewPage.tsx`**

Replace the entire file with:

```tsx
import { usePlayerData } from '../hooks/usePlayerData';
import { getCrewList } from '../crew/getters';
import { filterByRarity } from '../crew/filters';
import { byCollectionCountDesc, byEquipmentSlotsRemainingDesc, byLevelDesc, byNameAsc, sortCrew } from '../crew/sorters';
import { combineComparators } from '../lib/comparator';
import { getCollectionsList } from '../collections/getters';
import CrewTable from '../crew/CrewTable';
import PageShell from '../layout/PageShell';

function FourFiveStarsCrewPage() {
  const { data, loading, error, refresh } = usePlayerData();

  const collections = data ? getCollectionsList(data) : [];
  const crew = data
    ? sortCrew(
        filterByRarity(getCrewList(data), { rarity: 4, maxRarity: 5 }),
        combineComparators(byLevelDesc, byEquipmentSlotsRemainingDesc, byCollectionCountDesc(collections), byNameAsc)
      )
    : [];

  const loaded = !loading && !error && !!data;

  return (
    <PageShell
      title="4/5 Stars crew"
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={crew.length}
      emptyMessage="No crew at 4/5 stars."
    >
      <CrewTable crew={crew} collections={collections} />
    </PageShell>
  );
}

export default FourFiveStarsCrewPage;
```

- [ ] **Step 3: Rewrite `client/src/pages/FourFourStarsCrewReadyPage.tsx`**

Replace the entire file with:

```tsx
import { usePlayerData } from '../hooks/usePlayerData';
import { getCrewList, getOwnedItems } from '../crew/getters';
import { filterByRarity, filterReadyToImmortalize } from '../crew/filters';
import { byCollectionCountDesc, byEquipmentSlotsRemainingDesc, byLevelDesc, byNameAsc, sortCrew } from '../crew/sorters';
import { combineComparators } from '../lib/comparator';
import { getCollectionsList } from '../collections/getters';
import CrewTable from '../crew/CrewTable';
import PageShell from '../layout/PageShell';

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

  const loaded = !loading && !error && !!data;

  return (
    <PageShell
      title="4/4 Stars crew (ready)"
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={crew.length}
      emptyMessage="No crew ready to immortalize at 4/4 stars."
    >
      <CrewTable crew={crew} collections={collections} />
    </PageShell>
  );
}

export default FourFourStarsCrewReadyPage;
```

- [ ] **Step 4: Rewrite `client/src/pages/FourFourStarsCrewPage.tsx`**

Replace the entire file with:

```tsx
import { usePlayerData } from '../hooks/usePlayerData';
import { getCrewList, getOwnedItems } from '../crew/getters';
import { filterByRarity, filterNeedsWork } from '../crew/filters';
import { byCollectionCountDesc, byEquipmentSlotsRemainingDesc, byLevelDesc, byNameAsc, sortCrew } from '../crew/sorters';
import { combineComparators } from '../lib/comparator';
import { getCollectionsList } from '../collections/getters';
import CrewTable from '../crew/CrewTable';
import PageShell from '../layout/PageShell';

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

  const loaded = !loading && !error && !!data;

  return (
    <PageShell
      title="4/4 Stars crew"
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={crew.length}
      emptyMessage="No crew at 4/4 stars."
    >
      <CrewTable crew={crew} collections={collections} />
    </PageShell>
  );
}

export default FourFourStarsCrewPage;
```

- [ ] **Step 5: Rewrite `client/src/pages/FrozenDuplicatesPage.tsx`**

Replace the entire file with:

```tsx
import { usePlayerData } from '../hooks/usePlayerData';
import { getCrewList, getFrozenCrewArchetypeIds } from '../crew/getters';
import { filterFrozenDuplicates } from '../crew/filters';
import { byCollectionCountDesc, byEquipmentSlotsRemainingDesc, byLevelDesc, byNameAsc, sortCrew } from '../crew/sorters';
import { combineComparators } from '../lib/comparator';
import { getCollectionsList } from '../collections/getters';
import CrewTable from '../crew/CrewTable';
import PageShell from '../layout/PageShell';

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

  const loaded = !loading && !error && !!data;

  return (
    <PageShell
      title={title}
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={crew.length}
      emptyMessage="No duplicate crew at this rarity."
    >
      <CrewTable crew={crew} collections={collections} />
    </PageShell>
  );
}

export default FrozenDuplicatesPage;
```

- [ ] **Step 6: Rewrite `client/src/pages/CollectionsPage.tsx`**

Replace the entire file with:

```tsx
import { usePlayerData } from '../hooks/usePlayerData';
import { getCrewList, getFrozenCrewArchetypeIds, getOwnedItems } from '../crew/getters';
import { getCollectionsList } from '../collections/getters';
import { byUpgradableThenCompletionThenNameAsc } from '../collections/sorters';
import CollectionsTable from '../collections/CollectionsTable';
import PageShell from '../layout/PageShell';

function CollectionsPage() {
  const { data, loading, error, refresh } = usePlayerData();

  const rawCollections = data ? getCollectionsList(data) : [];
  const crew = data ? getCrewList(data) : [];
  const items = data ? getOwnedItems(data) : [];
  const frozenArchetypeIds = data ? getFrozenCrewArchetypeIds(data) : new Set<number>();
  const collections = data
    ? [...rawCollections].sort(byUpgradableThenCompletionThenNameAsc(rawCollections, crew, items, frozenArchetypeIds))
    : [];

  const loaded = !loading && !error && !!data;

  return (
    <PageShell
      title="Collections"
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={collections.length}
      emptyMessage="No collections found."
    >
      <CollectionsTable
        collections={collections}
        crew={crew}
        items={items}
        frozenArchetypeIds={frozenArchetypeIds}
      />
    </PageShell>
  );
}

export default CollectionsPage;
```

- [ ] **Step 7: Rewrite `client/src/pages/ShipsPage.tsx`**

Replace the entire file with:

```tsx
import { usePlayerData } from '../hooks/usePlayerData';
import { getOwnedItems } from '../crew/getters';
import { combineComparators } from '../lib/comparator';
import { getShipList } from '../ships/getters';
import { filterIncompleteShipsByRarity } from '../ships/filters';
import { byLevelDesc, byLevelProgressDesc, byMissingSchematicsAsc, byNameAsc, sortShips } from '../ships/sorters';
import ShipsTable from '../ships/ShipsTable';
import PageShell from '../layout/PageShell';

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

  const loaded = !loading && !error && !!data;

  return (
    <PageShell
      title={title}
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={ships.length}
      emptyMessage="No incomplete ships at this rarity."
    >
      <ShipsTable ships={ships} items={items} />
    </PageShell>
  );
}

export default ShipsPage;
```

- [ ] **Step 8: Build and lint check**

Run: `npm run build -w client`
Expected: exits 0.

Run: `npm run lint -w client`
Expected: exits 0, no new errors.

- [ ] **Step 9: Verify one page of each remaining table shape against a real running dev server**

`ThreeFourStarsCrewPage` (Task 1) already proved the `CrewTable` shape end-to-end. This step covers the two shapes Task 1 didn't touch, plus a spot-check that the mechanical repetition across the other 4 `CrewTable`-shaped pages didn't introduce a copy-paste error.

Using the `playwright` MCP browser tools against a real running dev server:

1. Navigate to `/collections`. `browser_snapshot` — confirm the title reads "Collections (88)" (the real sample's known collection count) and `CollectionsTable`'s rows render with real data (rewards/progress/milestone columns visible).
2. Navigate to `/5-stars-ships`. `browser_snapshot` — confirm the title reads "5 Stars Ships (55)" (the real sample's known count, per the Ships pages feature's own prior verification) and `ShipsTable`'s rows render.
3. Navigate to `/4-4-stars-crew-ready` (one of the 4 mechanically-repeated `CrewTable` pages) and `/4-stars-duplicates` (the `FrozenDuplicatesPage` instance, which additionally exercises the `title`-as-prop path). `browser_snapshot` each — confirm both titles and counts render correctly and `CrewTable` rows are present, confirming the repeated pattern was applied correctly to files not directly spot-checked otherwise.

- [ ] **Step 10: Commit**

```bash
git add client/src/pages/FourFiveStarsCrewPage.tsx client/src/pages/FourFourStarsCrewReadyPage.tsx client/src/pages/FourFourStarsCrewPage.tsx client/src/pages/FrozenDuplicatesPage.tsx client/src/pages/CollectionsPage.tsx client/src/pages/ShipsPage.tsx
git commit -m "Migrate the remaining 6 pages to PageShell"
```
