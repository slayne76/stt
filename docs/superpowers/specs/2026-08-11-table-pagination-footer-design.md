# TablePaginationFooter Extraction — Design Spec

Closes the "TablePagination footer JSX duplicated 6x verbatim" deferred
backlog item in `docs/PROJECT_STATE.md`: `CrewTable`, `MissingCrewTable`,
`FrozenCrewTable`, `QPsTable`, `ShipsTable`, and `CollectionsTable` each
repeat the same ~15-line `{showPagination && (<TableFooter>...)}` block.

## Goal

Extract the pagination footer JSX into one shared
`components/TablePaginationFooter.tsx`, used identically by all 6 tables,
so the pagination UI has a single point of change.

## Non-goals

- No change to `usePagination.ts` (`client/src/lib/usePagination.ts`) —
  its hook signature, state, clamping, and `PAGE_SIZE_OPTIONS` are
  untouched.
- No change to any table's header row, body row rendering, or row-level
  behavior — this is strictly the trailing `<TableFooter>` block.
- No change to pagination behavior itself (default page size, page-size
  options, show/hide threshold `items.length > pageSize`) — purely
  extracting existing JSX verbatim into one shared component.
- No generic typing over row data — the footer only ever touches
  `count`/`page`/`pageSize`/`colSpan`/the two callbacks, never a row.

## Design

### New file: `client/src/components/TablePaginationFooter.tsx`

A non-generic, presentational component — same location as
`TableSearchBar.tsx`/`StatusChip.tsx`, this project's existing precedent
for shared table/page UI:

```tsx
import type { ChangeEvent, MouseEvent } from 'react';
import { TableFooter, TablePagination, TableRow } from '@mui/material';
import { PAGE_SIZE_OPTIONS } from '../lib/usePagination';

export interface TablePaginationFooterProps {
  show: boolean;
  count: number;
  page: number;
  pageSize: number;
  onPageChange: (event: MouseEvent<HTMLButtonElement> | null, newPage: number) => void;
  onPageSizeChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  colSpan: number;
}

function TablePaginationFooter({
  show,
  count,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  colSpan,
}: TablePaginationFooterProps) {
  if (!show) return null;
  return (
    <TableFooter>
      <TableRow>
        <TablePagination
          count={count}
          page={page}
          onPageChange={onPageChange}
          rowsPerPage={pageSize}
          onRowsPerPageChange={onPageSizeChange}
          rowsPerPageOptions={PAGE_SIZE_OPTIONS}
          colSpan={colSpan}
        />
      </TableRow>
    </TableFooter>
  );
}

export default TablePaginationFooter;
```

The component owns the show/hide decision itself (`show: boolean` →
returns `null` when false) — every call site becomes one unconditional
`<TablePaginationFooter .../>`, no `{show && ...}` wrapper needed
anywhere. `onPageChange`/`onPageSizeChange`'s parameter types match
`usePagination`'s `handlePageChange`/`handlePageSizeChange` signatures
exactly, so every call site passes its hook's handlers straight through
with no adapting.

### Every one of the 6 tables gets the same mechanical swap

Example, `client/src/crew/CrewTable.tsx` — replace:

```tsx
{showPagination && (
  <TableFooter>
    <TableRow>
      <TablePagination
        count={crew.length}
        page={page}
        onPageChange={handlePageChange}
        rowsPerPage={pageSize}
        onRowsPerPageChange={handlePageSizeChange}
        rowsPerPageOptions={PAGE_SIZE_OPTIONS}
        colSpan={showCollectionsNames ? 8 : 7}
      />
    </TableRow>
  </TableFooter>
)}
```

with:

```tsx
<TablePaginationFooter
  show={showPagination}
  count={crew.length}
  page={page}
  pageSize={pageSize}
  onPageChange={handlePageChange}
  onPageSizeChange={handlePageSizeChange}
  colSpan={showCollectionsNames ? 8 : 7}
/>
```

`count` stays each table's own array length (the one thing that
genuinely differs per table: `crew.length`, `ships.length`,
`collections.length`), and `colSpan` stays each table's own literal or
conditional value (4, 5, 6, `showCollectionsNames ? 8 : 7`, 8, 6 — see
the table below). Each file drops its now-unused `TableFooter`/
`TablePagination` imports from `@mui/material` and its `PAGE_SIZE_OPTIONS`
import from `../lib/usePagination` (keeping the `usePagination` hook
import itself), and adds one new import:
`import TablePaginationFooter from '../components/TablePaginationFooter';`
(the same relative path works for all 6 — `crew/`, `catalog/`, `ships/`,
`collections/` are each exactly one directory below `client/src/`).

| File | `count` source | `colSpan` |
|---|---|---|
| `client/src/crew/CrewTable.tsx` | `crew.length` | `showCollectionsNames ? 8 : 7` |
| `client/src/catalog/MissingCrewTable.tsx` | `crew.length` | `6` |
| `client/src/catalog/FrozenCrewTable.tsx` | `crew.length` | `4` |
| `client/src/crew/QPsTable.tsx` | `crew.length` | `8` |
| `client/src/ships/ShipsTable.tsx` | `ships.length` | `5` |
| `client/src/collections/CollectionsTable.tsx` | `collections.length` | `6` |

### Approaches considered, not taken

- **Accept the whole `usePagination()` return object as one prop**
  (e.g. `<TablePaginationFooter pagination={pag} count={...} colSpan={...} />`)
  instead of 5 flat props — less typing per call site, but couples the
  footer's interface to the hook's internal field names
  (`handlePageChange` vs. this codebase's established `on*` callback-prop
  convention) and to a return shape the footer only needs part of
  (`pageItems` would ride along unused). Rejected in favor of the flat,
  explicit prop list the backlog itself specified.
- **A bigger structural wrapper around the whole `<Table>`**, not just the
  footer — would touch far more of each table's structure than the actual
  duplication warrants. Rejected as solving more than what's broken.

## Testing / verification plan

No automated test framework exists in this project (deliberate, repeated
choice). Verification:

- Build (`npm run build -w client`) / lint (`npm run lint -w client`)
  clean — with particular attention to unused-import lint errors in each
  of the 6 table files (a sign an old import wasn't fully dropped).
- Real-browser check across a representative subset covering both
  `colSpan` shapes: at least one table with a static `colSpan` (e.g.
  `ShipsTable`, `/5-stars-ships`) and `CrewTable` specifically (the one
  with the conditional `showCollectionsNames ? 8 : 7` colSpan, e.g.
  `/5-stars-crew`), confirming:
  - The pagination control renders identically to before (same page-size
    dropdown options, same row-count text).
  - Changing the page size and navigating to a different page still
    updates the visible rows exactly as before.
  - A table whose current row count is below the default page size
    (`showPagination` false) shows no footer at all, matching
    `usePagination`'s existing `items.length > pageSize` threshold.
- Spot-check at least one more of the remaining 4 tables to confirm the
  swap pattern held there too (not just build-clean, but visually
  rendering).
