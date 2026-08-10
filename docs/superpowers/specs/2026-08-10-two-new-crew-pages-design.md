# Two new crew pages — Design

**Date:** 2026-08-10
**Status:** Approved

## Problem

Two crew segments have no dedicated page: unmaxed 5★ crew (the closest
existing pages, "3/4 Stars crew"/"4/5 Stars crew", are for a fixed
rarity/max-rarity *pair*, not "all not-yet-maxed 5★ regardless of
current rarity"), and frozen crew themselves (the existing "Duplicates"
pages show *active* crew that duplicate a frozen archetype — not the
frozen crew).

## Goal

Two new pages under the Crew nav group:

1. **"5 Stars Crew"** — every owned crew with `max_rarity === 5` that
   isn't fully immortalized yet (`rarity < max_rarity` OR `level < 100`
   OR a missing equipment slot — i.e. the exact negation of
   `isImmortalized`). Same columns as every other star-tier crew page.
   Sort: level desc, equipment-slots-remaining desc, current-rarity
   desc, name asc. **First** item in the Crew nav group.

2. **"5 & 4 Stars Frozen Crew"** — every distinct archetype the player
   has frozen (`stored_immortals`) whose `max_rarity` is 4 or 5, both
   tiers on one page. Columns: `#`, Image, Stars, Name only (no
   Level/Items/Collections — frozen crew are always fully immortalized,
   those columns would be constant/meaningless). Sort: `max_rarity` desc
   (5★ before 4★), name asc. **Last** item in the Crew nav group.

## Non-goals

- No expansion by frozen-copy count — confirmed with the user: one row
  per distinct frozen archetype, matching how frozen crew are already
  tracked everywhere else in this app (`getFrozenCrewArchetypeIds`
  returns a `Set<number>`, no count). The `StoredImmortal` type stays
  `{ id: number }`, unchanged.
- No changes to any existing page, filter, sorter, or table component —
  every addition here is new code alongside the existing patterns, not
  a modification of them.
- Pagination is explicitly **out of scope** for this spec — see
  "Two-phase split" below.

## Two-phase split

The user's original request also asked for global table pagination,
motivated by these two pages having "much more data" than existing
ones. Confirmed with the user to split this into two independent
brainstorm→spec→plan cycles: this spec covers only the two new pages
(shippable and useful on their own, exactly like every existing
unpaginated page); pagination is a separate, later effort applied to
whichever pages qualify once designed, including these two.

## Architecture

### Page 1: "5 Stars Crew"

**New filter**, `client/src/crew/filters.ts`:
```ts
export function filterUnmaxed(crew: CrewMember[], maxRarity: number): CrewMember[] {
  return crew.filter((c) => c.max_rarity === maxRarity && !isImmortalized(c));
}
```
Deliberately **not** the same as the existing `filterNeedsWork` (which
excludes "ready to immortalize" crew) — a ready-to-immortalize crew
still has an unequipped slot (that's the whole reason it's
"ready"), so it correctly belongs on this page under the user's own
literal definition. `isImmortalized` is already imported in this file.

**New sorter**, `client/src/crew/sorters.ts`:
```ts
export function byRarityDesc(a: CrewMember, b: CrewMember): number {
  return b.rarity - a.rarity;
}
```
This sorts by the crew's *current* rarity (which varies 1–5 on this
page, since `max_rarity` is fixed at 5 for every row) — distinct from
the pre-existing `byMaxRarityDesc`, which sorts by the ceiling, not the
current value.

**New page**, `client/src/pages/FiveStarsCrewPage.tsx` — structurally
identical to `ThreeFourStarsCrewPage.tsx`, using the unchanged
`CrewTable` with `showCollectionsNames={true}` (same as every other
star-tier crew page, unlike `FrozenDuplicatesPage`):
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

### Page 2: "5 & 4 Stars Frozen Crew"

Frozen crew carry no name/image/rarity in the player payload itself
(`stored_immortals` is just `{ id: archetype_id }`) — the only place
those fields exist, keyed by `archetype_id`, is the crew catalog
(`CrewCatalogContext`). This page cross-references the frozen-ID set
against the catalog, the structural mirror of how `getMissingCrew`
already cross-references an *owned*-ID set against the catalog for the
Missing 4 Stars tables — same pattern, opposite membership test.

**New getter**, `client/src/catalog/getters.ts`:
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

**New sorters**, `client/src/catalog/sorters.ts` (this file's existing
`byDataScoreDesc` is the only sorter here so far; these two are
`CatalogEntry`-typed — the `crew/sorters.ts` functions of similar names
are `CrewMember`-typed and cannot be reused for this page's row type):
```ts
export function byMaxRarityDesc(a: CatalogEntry, b: CatalogEntry): number {
  return b.max_rarity - a.max_rarity;
}

export function byNameAsc(a: CatalogEntry, b: CatalogEntry): number {
  return a.name.localeCompare(b.name);
}
```

**New table component**, `client/src/catalog/FrozenCrewTable.tsx` — not
`CrewTable` (wrong row type, wrong columns) or `MissingCrewTable`
(carries DataScore/Collections columns this page explicitly doesn't
want). Reuses the same `Thumbnail`/`ASSET_BASE_URL` pattern
`MissingCrewTable` already established for catalog-sourced images.
"Stars" renders full stars, since a frozen crew member was necessarily
fully immortalized (`rarity === max_rarity`) before being frozen — there
is no "current rarity" distinct from `max_rarity` to show:
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

**New page**, `client/src/pages/FrozenCrewPage.tsx`. This is the first
`PageShell`-based page to depend on *both* `usePlayerData()` and
`useCrewCatalog()` — every other `PageShell` page depends on player
data alone, and `PageShell` only accepts one `loading`/`error`/
`onRetry` triple, not two.

**Design correction made during this spec's own self-review** (the
first draft here put a `CircularProgress`/`Alert` for catalog state
inside `PageShell`'s `children` — but `PageShell` only renders
`children` when `count > 0`, so that content would never actually
appear during the one window it exists for; caught and fixed before
this was ever handed to an implementer). The corrected approach: fold
`catalogLoading` into the `loading` passed to `PageShell` (so
`PageShell`'s own spinner naturally covers both sources — no separate
spinner needed), keep `error`/`onRetry` tied to player data only
(`onRetry` correctly means "retry the player fetch," consistent with
every other page), and make `catalogError` surface through a
**dynamically-computed `emptyMessage`** instead of a separate error
element — when the catalog fails, `crew` is necessarily `[]` (nothing
to cross-reference against), so `PageShell` renders its empty-state
message regardless; make that message honestly say the catalog failed
rather than falsely implying "you have no frozen crew":
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

### Nav / routes

`client/src/layout/AppLayout.tsx`'s `NAV_ITEMS` Crew group gains two
entries — `{ label: '5 Stars Crew', path: '/5-stars-crew' }` inserted
**first** (before `'3/4 Stars crew'`), and
`{ label: '5 & 4 Stars Frozen Crew', path: '/5-4-stars-frozen-crew' }`
appended **last** (after `'QPs'`).

`client/src/App.tsx` gains two `<Route>` entries for
`/5-stars-crew` → `FiveStarsCrewPage` and
`/5-4-stars-frozen-crew` → `FrozenCrewPage`, alongside two new imports.

## Files touched

- Modified: `client/src/crew/filters.ts`
- Modified: `client/src/crew/sorters.ts`
- Modified: `client/src/catalog/getters.ts`
- Modified: `client/src/catalog/sorters.ts`
- New: `client/src/catalog/FrozenCrewTable.tsx`
- New: `client/src/pages/FiveStarsCrewPage.tsx`
- New: `client/src/pages/FrozenCrewPage.tsx`
- Modified: `client/src/layout/AppLayout.tsx`
- Modified: `client/src/App.tsx`

## Testing/verification plan

No automated test framework in this project (deliberate, repeated
choice). Verification is data-driven against `example-data.json` plus a
real browser check:

1. Data check: count how many real crew in the sample have
   `max_rarity === 5 && !isImmortalized`, confirm it matches Page 1's
   rendered row count. Spot-check the 4-key sort order on a handful of
   rows.
2. Data check: count how many real frozen archetype IDs (from
   `stored_immortals`) resolve to a catalog entry with `max_rarity` 4 or
   5, confirm it matches Page 2's rendered row count. Spot-check the
   sort order (all 5★ rows before all 4★ rows, name-ascending within
   each).
3. Browser check: both pages appear in the Crew nav flyout at the
   correct position (5 Stars Crew first, 5 & 4 Stars Frozen Crew last).
4. Browser check: Page 1 shows the same column set as 3/4 Stars crew
   (including Total collections/Collections names). Page 2 shows only
   #/Image/Stars/Name, with every row's stars fully lit (no partial
   rating — confirm this holds for at least one real 4★ and one real 5★
   frozen row).
5. Browser check: reload Page 2 and confirm `PageShell`'s own loading
   spinner (not an incorrect empty-state flash) covers the window before
   the catalog finishes loading — the corrected `loading={loading ||
   catalogLoading}` design should make this hold automatically; confirm
   it actually does. If the real catalog cache is already warm this may
   be hard to observe normally — throttling the network in devtools, or
   temporarily clearing the server's catalog cache file, are both valid
   ways to force a visible loading window for this check.
