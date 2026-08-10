# Collections columns (crew pages + Missing 4 Stars tables) — Design

**Date:** 2026-08-10
**Status:** Approved

## Problem

The four star-tier crew pages (3/4, 4/5, 4/4, 4/4-ready) show only a
collections *count*. The Overview page's two Missing 4 Stars tables show
only collection *names*. Neither shows both, and the terminology isn't
shared ("Collections" means a count in one place, names in the other).

## Goal

Every one of these tables gets both columns, same naming, same relative
order:
- **"Total collections"** — the count (`getCollectionCount`)
- **"Collections names"** — comma-separated names (`getCrewCollections(...).map(c => c.name).join(', ')`)

Applies to: `ThreeFourStarsCrewPage`, `FourFiveStarsCrewPage`,
`FourFourStarsCrewPage`, `FourFourStarsCrewReadyPage` (all render
`CrewTable`), and both of `OverviewPage`'s Missing 4 Stars tables (both
render the single shared `MissingCrewTable`).

Does **not** apply to `FrozenDuplicatesPage` (also renders `CrewTable`,
explicitly excluded per the user) or `QPsPage` (renders a separate
`QPsTable`, untouched by this feature — already excluded structurally,
no code change needed for it).

## Non-goals

- No interactive column-header sorting — neither table has this today
  for any column (sort order is decided per-page, before data reaches
  the table); out of scope.
- No truncation/character limit on the new "Collections names" cell —
  `MissingCrewTable` already renders comma-separated names today with
  no truncation; the crew-page version matches that existing behavior.
- No changes to `crew/sorters.ts`'s `byCollectionCountDesc` or any
  other sort composition — this is a display-only change.

## Architecture

**`client/src/collections/getters.ts`** — widen `getCollectionCount`'s
parameter type from `CrewMember` to `CollectionMatchable` (the same
structural type `getCrewCollections` already uses, introduced in the
Missing 4 Stars tables feature for exactly this kind of type-boundary
crossing). Pure widening: the function body only ever touches
`archetype_id`/`traits`/`traits_hidden`, all present on
`CollectionMatchable`, and `CrewMember` already structurally satisfies
`CollectionMatchable` (confirmed: has all three fields), so no existing
call site's behavior changes. This is what lets `MissingCrewTable` call
`getCollectionCount` with a `CatalogEntry` (unowned catalog crew, not a
`CrewMember`) — the same reason `getCrewCollections` needed the same
widening treatment last time.

**`client/src/crew/CrewTable.tsx`** — gains a new required prop
`showCollectionsNames: boolean` (required, not defaulted — see below).
The existing "Collections" header becomes **"Total collections"**
(`getCollectionCount(c, collections)`, unchanged value). When
`showCollectionsNames` is `true`, one more `<TableCell>` renders at the
end of each row: `getCrewCollections(c, collections).map((col) => col.name).join(', ')`,
under a new **"Collections names"** header.

**Why a required prop, not a default:** `CrewTable` is shared by both
the four pages that want the new column and `FrozenDuplicatesPage`,
which explicitly should not get it. A required boolean means every one
of the 5 call sites states its choice directly in that page's own file
— the Duplicates exclusion is visible there, not an invisible default
that a future 6th page could silently inherit wrong. Confirmed with the
user over the alternative (default-on, Duplicates opts out).

Call sites: `ThreeFourStarsCrewPage.tsx`, `FourFiveStarsCrewPage.tsx`,
`FourFourStarsCrewPage.tsx`, `FourFourStarsCrewReadyPage.tsx` all
change `<CrewTable crew={crew} collections={collections} />` to
`<CrewTable crew={crew} collections={collections} showCollectionsNames={true} />`.
`FrozenDuplicatesPage.tsx` changes the identical line to
`showCollectionsNames={false}`.

**`client/src/catalog/MissingCrewTable.tsx`** — insert a new
`<TableCell align="right">` for **"Total collections"**
(`getCollectionCount(c, collections)`) immediately before the existing
Collections `<TableCell>`, then rename that existing column's header
from "Collections" to **"Collections names"** (its logic — the
`getCrewCollections(...).map(...).join(', ')` expression — is
unchanged). Both of `OverviewPage`'s two `<MissingCrewTable ... />`
usages share this one component, so both tables pick up the change with
no page-level edit needed.

**End state, both table types:** the last two columns are always, in
order, **Total collections** (number, right-aligned, matching the
existing numeric-column convention) then **Collections names**
(comma-separated text, left-aligned, matching the existing text-column
convention) — a consistent pair, consistently ordered, across every
table that shows it.

## Files touched

- Modified: `client/src/collections/getters.ts`
- Modified: `client/src/crew/CrewTable.tsx`
- Modified: `client/src/catalog/MissingCrewTable.tsx`
- Modified: `client/src/pages/ThreeFourStarsCrewPage.tsx`
- Modified: `client/src/pages/FourFiveStarsCrewPage.tsx`
- Modified: `client/src/pages/FourFourStarsCrewPage.tsx`
- Modified: `client/src/pages/FourFourStarsCrewReadyPage.tsx`
- Modified: `client/src/pages/FrozenDuplicatesPage.tsx`

`OverviewPage.tsx` is **not** touched — both `MissingCrewTable` usages
there need no prop changes, since the new column always renders there
(no exclusion case exists for that table, unlike `CrewTable`).

## Testing/verification plan

No automated test framework in this project (deliberate, repeated
choice). Verification is data-driven against `example-data.json` (the
real 597-crew/88-collection sample) plus a real browser check:

1. Data check: for a handful of real crew members with known collection
   memberships (spot-checked against `CollectionsPage`'s existing,
   already-verified membership logic), confirm the new "Total
   collections" count matches "Collections names"'s comma-separated
   name count exactly (same underlying `getCrewCollections` call, so
   this should hold by construction — verify it does, not just assume).
2. Browser check: each of the 4 star-tier crew pages shows both new
   columns, correctly renamed/ordered, with real data. `FrozenDuplicatesPage`
   (and its two thin wrappers, `FourStarsDuplicatesPage`/
   `FiveStarsDuplicatesPage`) shows neither the renamed header nor the
   new column — confirm it still shows the original "Collections" count
   under its original name, completely unaffected.
3. Browser check: both Overview Missing 4 Stars tables show "Total
   collections" immediately before "Collections names", correctly
   renamed/ordered, matching values.
4. Build/lint clean, confirming the `CollectionMatchable` widening
   doesn't break any existing `getCollectionCount` call site.
