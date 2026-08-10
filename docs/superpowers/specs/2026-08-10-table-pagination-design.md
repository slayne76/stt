# Table pagination — Design

**Date:** 2026-08-10
**Status:** Approved

## Problem

Three pages already exceed a reasonable single-page row count today
(Collections: 88, 3/4 Stars crew: 52, 4/4 Stars crew: 52), and the two
newest crew pages (304, 536) make it acute. No page in the app paginates
— every table renders every row at once.

## Goal

A rows-per-page control (50/100/150/200, default 50) at the bottom-right
of every table, visible only when there's more than one page at the
currently-selected page size. Switching pages updates the table in
place — no route change. Applies to all 6 table components in the app:
`CrewTable`, `MissingCrewTable`, `FrozenCrewTable`, `QPsTable`,
`ShipsTable`, `CollectionsTable`.

## Non-goals

- No persistence of the selected page size across navigations — resets
  to 50 on every fresh mount, matching this app's existing convention
  (the refresh dropdown's selection isn't persisted either).
- No fixed/padded table height on a short final page — the table
  shrinks to however many rows are on the current page. Confirmed with
  the user as the recommended, standard behavior (matches MUI's own
  `TablePagination` convention, Gmail, etc.) over artificially padding.
- No changes to any page component — every page already passes its
  full (filtered/sorted) array to its table component unchanged;
  pagination is entirely internal to the table components.
- No changes to any filter, sorter, or getter — this is purely a
  display-layer slicing concern, applied after all existing
  filter/sort logic already runs.
- `CollectionsTable` paginates by **collection** (the outer, 88-item
  array), not by physical `<TableRow>` — each collection on the current
  page still renders its existing summary row + expanded crew sub-list
  row pair, unchanged. Confirmed with the user over excluding this table
  or inventing a different unit.

## Architecture

**New shared hook, `client/src/lib/usePagination.ts`** — generic over
item type, used identically by all 6 table components:

```ts
import { useState, type ChangeEvent, type MouseEvent } from 'react';

export const PAGE_SIZE_OPTIONS = [50, 100, 150, 200];
const DEFAULT_PAGE_SIZE = 50;

export interface UsePaginationResult<T> {
  pageItems: T[];
  page: number;
  pageSize: number;
  showPagination: boolean;
  handlePageChange: (event: MouseEvent<HTMLButtonElement> | null, newPage: number) => void;
  handlePageSizeChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}

export function usePagination<T>(items: T[]): UsePaginationResult<T> {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const maxPage = Math.max(0, Math.ceil(items.length / pageSize) - 1);
  const clampedPage = Math.min(page, maxPage);

  const start = clampedPage * pageSize;
  const pageItems = items.slice(start, start + pageSize);
  const showPagination = items.length > pageSize;

  function handlePageChange(_event: MouseEvent<HTMLButtonElement> | null, newPage: number): void {
    setPage(newPage);
  }

  function handlePageSizeChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    setPageSize(parseInt(event.target.value, 10));
    setPage(0);
  }

  return { pageItems, page: clampedPage, pageSize, showPagination, handlePageChange, handlePageSizeChange };
}
```

**Why clamping instead of a `useEffect`:** if the underlying item list
shrinks (a data refresh returns fewer rows than the page you were on),
`clampedPage` is recomputed fresh on every render directly from the
current `page` state and current `items.length` — no page can ever
render blank because of stale state, and no effect/synchronization code
is needed. `page` itself only ever changes via explicit user action
(`handlePageChange`/`handlePageSizeChange`), matching how every other
piece of UI state in this codebase works.

**Why `usePagination` lives inside each table component, not passed
down from each page:** pagination state must reset naturally when
navigating to a different page/route. Since each table component
unmounts when its parent route changes, `useState`'s own lifecycle
already provides this for free — no explicit reset logic needed, and
zero page-level component changes (all 12 pages that render one of
these 6 table components keep passing their full array exactly as
today).

**UI: MUI's own `TablePagination`**, not hand-rolled — it already
provides a rows-per-page `Select`, prev/next navigation, and an
"X–Y of Z" range label in one component. Confirmed via a standalone
dry-run compile against this project's real `tsconfig.app.json` before
this spec was finalized: `TablePagination`'s `component` prop defaults
to `TableCell` (its own doc comment: *"A `TableCell` based component for
placing inside `TableFooter` for pagination"*), so no extra prop is
needed to place it inside each table's own `<TableFooter>` — this
directly matches "bottom right of the table" as literally part of the
table, not a floating element below it.

**Per-table integration pattern** (identical shape across all 6 — shown
generically, exact `colSpan` and item-array name vary per table):

```tsx
import { PAGE_SIZE_OPTIONS, usePagination } from '../lib/usePagination';
// ...existing imports...

function SomeTable({ items /* or crew, ships, collections */ }: SomeTableProps) {
  const { pageItems, page, pageSize, showPagination, handlePageChange, handlePageSizeChange } =
    usePagination(items);

  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>{/* unchanged */}</TableHead>
        <TableBody>
          {pageItems.map((item, index) => (
            // unchanged row JSX, but `index` is now the index WITHIN the
            // current page, not the overall list — see "Row numbering" below
          ))}
        </TableBody>
        {showPagination && (
          <TableFooter>
            <TableRow>
              <TablePagination
                count={items.length}
                page={page}
                onPageChange={handlePageChange}
                rowsPerPage={pageSize}
                onRowsPerPageChange={handlePageSizeChange}
                rowsPerPageOptions={PAGE_SIZE_OPTIONS}
                colSpan={/* this table's total column count */}
              />
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </TableContainer>
  );
}
```

**Row numbering (`#` column) must stay continuous across pages, not
reset to 1 on every page.** Every one of these 6 tables' first column
is `{index + 1}` from its `.map((item, index) => ...)` callback — using
the sliced `pageItems` array directly would make every page's first row
show "1". Fix: compute the display index as `page * pageSize + index +
1` instead of the bare `index + 1`, so row 51 on page 2 (at the default
50-per-page) genuinely reads "51", matching what the row would have
shown unpaginated.

## Per-table specifics

| Component | Item prop | Columns | `colSpan` |
|---|---|---|---|
| `CrewTable.tsx` | `crew` | 7, or 8 if `showCollectionsNames` | `showCollectionsNames ? 8 : 7` |
| `MissingCrewTable.tsx` | `crew` | 6 | `6` |
| `FrozenCrewTable.tsx` | `crew` | 4 | `4` |
| `QPsTable.tsx` | `crew` | 8 | `8` |
| `ShipsTable.tsx` | `ships` | 5 | `5` |
| `CollectionsTable.tsx` | `collections` | 6 | `6` (the pagination row itself; the existing per-collection expand row's own `colSpan={6}` is unrelated and unchanged) |

`CollectionsTable.tsx` paginates `collections` (not `crew`/`items`,
which stay full-size and are still passed through unchanged to each
visible collection's `getCollectionCrew`/`CollectionCrewList` call —
only which collections are *shown* is paginated, not their own
membership computation).

## Files touched

- New: `client/src/lib/usePagination.ts`
- Modified: `client/src/crew/CrewTable.tsx`
- Modified: `client/src/catalog/MissingCrewTable.tsx`
- Modified: `client/src/catalog/FrozenCrewTable.tsx`
- Modified: `client/src/crew/QPsTable.tsx`
- Modified: `client/src/ships/ShipsTable.tsx`
- Modified: `client/src/collections/CollectionsTable.tsx`

No page component, filter, sorter, or getter is touched.

## Testing/verification plan

No automated test framework in this project (deliberate, repeated
choice). Verification is data-driven against `example-data.json`/the
cached crew catalog plus real-browser checks:

1. Data check: confirm the real row counts already gathered during
   design (Collections 88, 3/4 Stars crew 52, 4/4 Stars crew 52, 5
   Stars Crew 304, 5 & 4 Stars Frozen Crew 536) still hold, and compute
   expected page counts at each of the 4 page sizes for at least the
   304-row and 536-row tables.
2. Browser check, on a table that exceeds 50 rows (e.g. 5 Stars Crew,
   304 rows): pagination control appears at the bottom-right, inside
   the table; default page size is 50; the `#` column's first row
   reads "1" and the 50th reads "50".
3. Browser check: change page size to 200 on the same table — page
   resets to 1, "#" column now goes up to 200 on the first page (204
   remaining rows on page 2).
4. Browser check: navigate to page 2 at the default 50 page size — the
   `#` column continues from 51 (not resetting to 1), rows update in
   place with **no URL/route change** (confirm the browser's address
   bar is unchanged before/after clicking next page).
5. Browser check: on a table with ≤ 50 rows at the default page size
   (e.g. 4/5 Stars crew, 1 row) — no pagination control appears at all.
6. Browser check: on the same ≤50-row table, manually change the page
   size selector — actually, since no control is visible, instead
   verify a table that's just above 50 (e.g. 3/4 Stars crew, 52 rows)
   correctly shows the control (2 pages at size 50), and set its page
   size to 100 — the control should then disappear (52 rows all fit on
   one page of 100).
7. Browser check: `CollectionsTable` (88 collections) — confirm
   pagination shows at the default size (2 pages), each collection on
   the visible page still shows its full expand/summary row pair
   exactly as before this feature, and the "Collection"/"Crew"/etc.
   column values are unaffected.
8. Browser check: on a genuinely short final page (e.g. navigate to
   the last page of the 536-row Frozen Crew table at page size 200 —
   36 rows on the last page), confirm the table visually shrinks to
   that row count rather than showing padded empty space — matches the
   design's stated recommendation.
