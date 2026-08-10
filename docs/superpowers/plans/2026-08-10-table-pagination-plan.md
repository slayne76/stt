# Table Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared, reusable pagination mechanism (50/100/150/200
rows per page, default 50, visible only when there's more than one
page) to all 6 table components in the app, with no route change on
page navigation and no changes to any page component.

**Architecture:** One new generic hook, `client/src/lib/usePagination.ts`,
consumed identically by all 6 table components. Each table slices its
own already-filtered/sorted item array via the hook before mapping
rows, and renders MUI's own `TablePagination` inside a `<TableFooter>`
row when there's more than one page. `CollectionsTable` paginates by
collection (the outer array), not by physical `<TableRow>`.

**Tech Stack:** React 19, TypeScript, MUI v6 (`TablePagination`,
`TableFooter`). No test framework in this project (deliberate, repeated
choice) — verification is `tsc`/`eslint`, data-driven checks against
the real `example-data.json`/cached crew catalog, and real-browser
checks. `TablePagination`'s default `component` prop (`TableCell`) was
confirmed via a standalone dry-run compile against this project's real
`tsconfig.app.json` before this plan was written — no extra prop is
needed to place it inside a `TableFooter`/`TableRow`. Real row counts
already confirmed against the actual sample data before this plan was
written: Collections 88, 3/4 Stars crew 52, 4/4 Stars crew 52, 5 Stars
Crew 304, 5 & 4 Stars Frozen Crew 536.

## Global Constraints

- No page component changes — every one of the 12 pages that render
  one of these 6 table components keeps passing its full array exactly
  as today. Pagination is entirely internal to the table components.
- No changes to any filter, sorter, or getter.
- `showPagination` is computed against the **currently selected** page
  size (`items.length > pageSize`), not a fixed threshold — a table
  with 88 rows shows no pagination control once 100 or 200 is selected.
- Every table's `#` column must show a display index that's continuous
  across pages (`page * pageSize + index + 1`), not `index + 1` against
  the sliced page array — the second page must not restart at "1".
- `CollectionsTable.tsx` paginates the `collections` array specifically
  — `crew`/`items` stay full-size and are passed through unchanged to
  each visible collection's own membership computation; only which
  collections are *shown* is paginated.
- No persistence of the selected page size across navigations — plain
  `useState`, resets to 50 on every fresh mount.
- No fixed/padded table height on a short final page.

---

### Task 1: The `usePagination` hook + `CrewTable`

**Files:**
- Create: `client/src/lib/usePagination.ts`
- Modify: `client/src/crew/CrewTable.tsx`

**Interfaces:**
- Produces: `PAGE_SIZE_OPTIONS: number[]` and
  `usePagination<T>(items: T[]): UsePaginationResult<T>` from
  `./usePagination`, where
  `UsePaginationResult<T> = { pageItems: T[]; page: number; pageSize: number; showPagination: boolean; handlePageChange: (event, newPage: number) => void; handlePageSizeChange: (event) => void }`.
- Consumes: nothing from other tasks (foundational — but bundled with
  a real table so this task is genuinely browser-verifiable, not just
  a type-check-only foundation task).

`CrewTable` is used by 6 pages, including the two largest tables in the
app (5 Stars Crew: 304 rows; the Duplicates pages, 3/4/4/5/4/4-star
pages at smaller counts) — this task's real-browser verification
exercises pagination at genuine scale from the start.

- [ ] **Step 1: Create `client/src/lib/usePagination.ts`**

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

- [ ] **Step 2: Update `client/src/crew/CrewTable.tsx`**

Replace its entire contents with:

```tsx
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TablePagination,
  TableRow,
} from '@mui/material';
import type { CrewMember } from '../types/crew';
import type { Collection } from '../types/collection';
import { getEquipmentSlotsRemaining } from './getters';
import { getCollectionCount, getCrewCollections } from '../collections/getters';
import { PAGE_SIZE_OPTIONS, usePagination } from '../lib/usePagination';
import StarRating from './StarRating';
import Thumbnail from '../assets/Thumbnail';

export interface CrewTableProps {
  crew: CrewMember[];
  collections: Collection[];
  showCollectionsNames: boolean;
}

function CrewTable({ crew, collections, showCollectionsNames }: CrewTableProps) {
  const { pageItems, page, pageSize, showPagination, handlePageChange, handlePageSizeChange } = usePagination(crew);

  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Image</TableCell>
            <TableCell>Stars</TableCell>
            <TableCell>Name</TableCell>
            <TableCell align="right">Level</TableCell>
            <TableCell align="right">Items to equip</TableCell>
            <TableCell align="right">{showCollectionsNames ? 'Total collections' : 'Collections'}</TableCell>
            {showCollectionsNames && <TableCell>Collections names</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {pageItems.map((c, index) => (
            <TableRow key={c.id}>
              <TableCell>{page * pageSize + index + 1}</TableCell>
              <TableCell>
                <Thumbnail asset={c.portrait} />
              </TableCell>
              <TableCell>
                <StarRating rarity={c.rarity} maxRarity={c.max_rarity} />
              </TableCell>
              <TableCell>{c.name}</TableCell>
              <TableCell align="right">{c.level}</TableCell>
              <TableCell align="right">{getEquipmentSlotsRemaining(c)}</TableCell>
              <TableCell align="right">{getCollectionCount(c, collections)}</TableCell>
              {showCollectionsNames && (
                <TableCell>
                  {getCrewCollections(c, collections)
                    .map((col) => col.name)
                    .join(', ')}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
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
      </Table>
    </TableContainer>
  );
}

export default CrewTable;
```

- [ ] **Step 3: Build and lint**

```bash
npm run build -w client
npm run lint -w client
```

Expected: both exit cleanly.

- [ ] **Step 4: Data-driven verification against `example-data.json`**

Create a throwaway script `client-verify-pagination-crewtable.mjs` at
the repo root:

```js
import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync('example-data.json', 'utf-8'));
const crew = data.player.character.crew;

function isImmortalized(c) {
  return c.rarity === c.max_rarity && c.level === 100 && c.equipment.length === 4;
}

const unmaxed5 = crew.filter((c) => c.max_rarity === 5 && !isImmortalized(c));
console.log('5 Stars Crew row count:', unmaxed5.length);
console.log('Pages at size 50:', Math.ceil(unmaxed5.length / 50));
console.log('Pages at size 200:', Math.ceil(unmaxed5.length / 200));

const stars34 = crew.filter((c) => c.rarity === 3 && c.max_rarity === 4);
console.log('3/4 Stars crew row count:', stars34.length, '(expected just over 1 page at size 50)');
```

Run: `node client-verify-pagination-crewtable.mjs`

Expected output (confirmed against the real sample before this plan
was written):
```
5 Stars Crew row count: 304
Pages at size 50: 7
Pages at size 200: 2
3/4 Stars crew row count: 52
```

Delete the script afterward: `rm client-verify-pagination-crewtable.mjs`

- [ ] **Step 5: Real-browser verification**

Start the dev server (seed `server/data/player-cache.json` from
`example-data.json` first if this is a fresh worktree — standing
worktree setup step):

```bash
npm run dev
```

Using the browser tooling, navigate to `/5-stars-crew` (304 rows) and
confirm:
- A pagination control appears at the bottom-right, inside the table
  (part of the same `<Table>`, not floating below `TableContainer`).
- Default page size is 50; the `#` column's first row reads "1", the
  last visible row on page 1 reads "50".
- Clicking next page: the URL/route does **not** change, the table's
  rows update in place, and the `#` column continues from "51" (not
  resetting to "1").
- Changing the rows-per-page selector to 200: page resets to the first
  page, `#` column now runs 1–200 on the first page.
- Navigate to `/4-5-stars-crew` (1 row) — confirm **no** pagination
  control appears at all.
- Navigate to `/3-4-stars-crew` (52 rows) — confirm the pagination
  control **does** appear (2 pages at the default size 50); change the
  page size to 100 — confirm the control then disappears (52 rows fit
  on one page of 100).

- [ ] **Step 6: Commit**

```bash
git add client/src/lib/usePagination.ts client/src/crew/CrewTable.tsx
git commit -m "Add table pagination hook and wire it into CrewTable

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `MissingCrewTable`, `FrozenCrewTable`, `QPsTable`

**Files:**
- Modify: `client/src/catalog/MissingCrewTable.tsx`
- Modify: `client/src/catalog/FrozenCrewTable.tsx`
- Modify: `client/src/crew/QPsTable.tsx`

**Interfaces:**
- Consumes: `PAGE_SIZE_OPTIONS`/`usePagination` from `../lib/usePagination` (Task 1).

This task depends on Task 1 (the hook must exist). All three files
follow the identical integration pattern Task 1 already established —
this task is mechanical repetition of that same pattern across three
more, structurally simpler (no conditional column) tables, including
the largest table in the app (`FrozenCrewTable`, 536 rows).

- [ ] **Step 1: Update `client/src/catalog/MissingCrewTable.tsx`**

Replace its entire contents with:

```tsx
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TablePagination,
  TableRow,
} from '@mui/material';
import type { CatalogEntry } from '../types/catalogEntry';
import type { Collection } from '../types/collection';
import { getCollectionCount, getCrewCollections } from '../collections/getters';
import { PAGE_SIZE_OPTIONS, usePagination } from '../lib/usePagination';
import Thumbnail from '../assets/Thumbnail';
import { ASSET_BASE_URL } from '../assets/config';

export interface MissingCrewTableProps {
  crew: CatalogEntry[];
  collections: Collection[];
}

function MissingCrewTable({ crew, collections }: MissingCrewTableProps) {
  const { pageItems, page, pageSize, showPagination, handlePageChange, handlePageSizeChange } = usePagination(crew);

  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Image</TableCell>
            <TableCell>Name</TableCell>
            <TableCell align="right">DataScore</TableCell>
            <TableCell align="right">Total collections</TableCell>
            <TableCell>Collections names</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {pageItems.map((c, index) => (
            <TableRow key={c.archetype_id}>
              <TableCell>{page * pageSize + index + 1}</TableCell>
              <TableCell>
                <Thumbnail url={`${ASSET_BASE_URL}/${c.imageUrlPortrait}`} />
              </TableCell>
              <TableCell>{c.name}</TableCell>
              <TableCell align="right">{c.data_score.toFixed(2)}</TableCell>
              <TableCell align="right">{getCollectionCount(c, collections)}</TableCell>
              <TableCell>
                {getCrewCollections(c, collections)
                  .map((col) => col.name)
                  .join(', ')}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
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
                colSpan={6}
              />
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </TableContainer>
  );
}

export default MissingCrewTable;
```

- [ ] **Step 2: Update `client/src/catalog/FrozenCrewTable.tsx`**

Replace its entire contents with:

```tsx
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TablePagination,
  TableRow,
} from '@mui/material';
import type { CatalogEntry } from '../types/catalogEntry';
import { PAGE_SIZE_OPTIONS, usePagination } from '../lib/usePagination';
import StarRating from '../crew/StarRating';
import Thumbnail from '../assets/Thumbnail';
import { ASSET_BASE_URL } from '../assets/config';

export interface FrozenCrewTableProps {
  crew: CatalogEntry[];
}

function FrozenCrewTable({ crew }: FrozenCrewTableProps) {
  const { pageItems, page, pageSize, showPagination, handlePageChange, handlePageSizeChange } = usePagination(crew);

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
          {pageItems.map((c, index) => (
            <TableRow key={c.archetype_id}>
              <TableCell>{page * pageSize + index + 1}</TableCell>
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
                colSpan={4}
              />
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </TableContainer>
  );
}

export default FrozenCrewTable;
```

- [ ] **Step 3: Update `client/src/crew/QPsTable.tsx`**

Replace its entire contents with:

```tsx
import {
  Box,
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
import { getQPLevel, getQPProgressDisplay, getQPPointsNeeded, getQPRoundsLeft, QP_MAX_LEVEL } from './getters';
import { PAGE_SIZE_OPTIONS, usePagination } from '../lib/usePagination';
import StarRating from './StarRating';
import Thumbnail from '../assets/Thumbnail';
import StatusChip from '../components/StatusChip';

export interface QPsTableProps {
  crew: CrewMember[];
}

function QPsTable({ crew }: QPsTableProps) {
  const { pageItems, page, pageSize, showPagination, handlePageChange, handlePageSizeChange } = usePagination(crew);

  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Image</TableCell>
            <TableCell>Stars</TableCell>
            <TableCell>Name</TableCell>
            <TableCell align="right">QL</TableCell>
            <TableCell align="right">QPs</TableCell>
            <TableCell align="right">Points left</TableCell>
            <TableCell align="right">Rounds left</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {pageItems.map((c, index) => {
            const isReady = getQPRoundsLeft(c) <= 1;
            return (
              <TableRow key={c.id}>
                <TableCell>{page * pageSize + index + 1}</TableCell>
                <TableCell>
                  <Thumbnail asset={c.portrait} />
                </TableCell>
                <TableCell>
                  <StarRating rarity={c.rarity} maxRarity={c.max_rarity} />
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: isReady ? 'bold' : 'normal', whiteSpace: 'nowrap' }}
                    >
                      {c.name}
                    </Typography>
                    {isReady && <StatusChip label="Ready" color="success" />}
                  </Box>
                </TableCell>
                <TableCell align="right">{getQPLevel(c)}/{QP_MAX_LEVEL}</TableCell>
                <TableCell align="right">{getQPProgressDisplay(c)}</TableCell>
                <TableCell align="right">-{getQPPointsNeeded(c)}</TableCell>
                <TableCell align="right">-{getQPRoundsLeft(c)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
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
                colSpan={8}
              />
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </TableContainer>
  );
}

export default QPsTable;
```

- [ ] **Step 4: Build and lint**

```bash
npm run build -w client
npm run lint -w client
```

Expected: both exit cleanly.

- [ ] **Step 5: Data-driven verification against `example-data.json` and the cached crew catalog**

Create a throwaway script `client-verify-pagination-others.mjs` at the
repo root:

```js
import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync('example-data.json', 'utf-8'));
const catalog = JSON.parse(readFileSync('server/data/crew-catalog-cache.json', 'utf-8'));
const storedImmortals = data.player.character.stored_immortals ?? [];
const frozenIds = new Set(storedImmortals.map((s) => s.id));

const frozenCrew = catalog.filter((c) => [4, 5].includes(c.max_rarity) && frozenIds.has(c.archetype_id));
console.log('Frozen Crew row count:', frozenCrew.length);
console.log('Pages at size 50:', Math.ceil(frozenCrew.length / 50));
console.log('Pages at size 200:', Math.ceil(frozenCrew.length / 200));
console.log('Last page size at 200:', frozenCrew.length % 200 === 0 ? 200 : frozenCrew.length % 200);
```

Run: `node client-verify-pagination-others.mjs`

Expected output (confirmed against the real sample before this plan
was written):
```
Frozen Crew row count: 536
Pages at size 50: 11
Pages at size 200: 3
Last page size at 200: 136
```

Delete the script afterward: `rm client-verify-pagination-others.mjs`

- [ ] **Step 6: Real-browser verification**

Start the dev server (same standing worktree-seeding step as Task 1;
this task additionally needs a warm crew-catalog cache for the Frozen
Crew page).

Using the browser tooling, navigate to `/5-4-stars-frozen-crew` (536
rows) and confirm:
- Pagination control appears, default page size 50 (11 pages).
- Change page size to 200: 3 pages, last page has 136 rows — navigate
  to that last page and confirm the table visually shrinks to 136 rows
  rather than showing padded empty space (this is the plan's stated
  UX behavior — no fixed height).

Navigate to `/` (Overview page, Missing 4 Stars tables) and confirm
both tables there show pagination correctly if either exceeds 50 rows
in the current sample, or confirm no control appears if both are under
50 (check the actual real counts in the browser — don't assume).

Navigate to `/qps` and confirm the page still renders correctly with
pagination behavior consistent with the other tables (control present
only if the real QPs-eligible crew count exceeds 50).

- [ ] **Step 7: Commit**

```bash
git add client/src/catalog/MissingCrewTable.tsx client/src/catalog/FrozenCrewTable.tsx client/src/crew/QPsTable.tsx
git commit -m "Add pagination to MissingCrewTable, FrozenCrewTable, QPsTable

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `ShipsTable`, `CollectionsTable`

**Files:**
- Modify: `client/src/ships/ShipsTable.tsx`
- Modify: `client/src/collections/CollectionsTable.tsx`

**Interfaces:**
- Consumes: `PAGE_SIZE_OPTIONS`/`usePagination` from `../lib/usePagination` (Task 1).

This task depends on Task 1. `ShipsTable` is the same mechanical
pattern as Task 2's tables. `CollectionsTable` is the one genuinely
different case in this plan — it paginates the outer `collections`
array, not physical `<TableRow>`s, and each visible collection keeps
its existing 2-row (summary + expand) structure unchanged.

- [ ] **Step 1: Update `client/src/ships/ShipsTable.tsx`**

Replace its entire contents with:

```tsx
import {
  Box,
  LinearProgress,
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
import type { Ship } from '../types/ship';
import type { OwnedItem } from '../types/item';
import { getShipDisplayLevel, getShipSchematicsDisplay, getShipSchematicsProgress } from './getters';
import { PAGE_SIZE_OPTIONS, usePagination } from '../lib/usePagination';
import Thumbnail from '../assets/Thumbnail';

export interface ShipsTableProps {
  ships: Ship[];
  items: OwnedItem[];
}

function ShipsTable({ ships, items }: ShipsTableProps) {
  const { pageItems, page, pageSize, showPagination, handlePageChange, handlePageSizeChange } = usePagination(ships);

  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Image</TableCell>
            <TableCell>Ship</TableCell>
            <TableCell align="right">Level</TableCell>
            <TableCell align="right">Schematics</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {pageItems.map((s, index) => (
            <TableRow key={s.id}>
              <TableCell>{page * pageSize + index + 1}</TableCell>
              <TableCell>
                <Thumbnail asset={s.icon} />
              </TableCell>
              <TableCell>{s.name}</TableCell>
              <TableCell align="right">{getShipDisplayLevel(s)}</TableCell>
              <TableCell align="right">
                <Box sx={{ display: 'inline-block', minWidth: 100 }}>
                  <LinearProgress variant="determinate" value={getShipSchematicsProgress(s, items)} color="primary" />
                  <Typography variant="body2">{getShipSchematicsDisplay(s, items)}</Typography>
                </Box>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        {showPagination && (
          <TableFooter>
            <TableRow>
              <TablePagination
                count={ships.length}
                page={page}
                onPageChange={handlePageChange}
                rowsPerPage={pageSize}
                onRowsPerPageChange={handlePageSizeChange}
                rowsPerPageOptions={PAGE_SIZE_OPTIONS}
                colSpan={5}
              />
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </TableContainer>
  );
}

export default ShipsTable;
```

- [ ] **Step 2: Update `client/src/collections/CollectionsTable.tsx`**

Replace its entire contents with:

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
import { getCollectionCrew } from './getters';
import { getCuratedRewards } from './rewards';
import { isCollectionUpgradable, isMaxedOut } from './sorters';
import {
  byEquipmentSlotsRemainingDesc,
  byLevelDesc,
  byMaxRarityDesc,
  byNameAsc,
  byTierAsc,
  sortCrew,
} from '../crew/sorters';
import { combineComparators } from '../lib/comparator';
import { PAGE_SIZE_OPTIONS, usePagination } from '../lib/usePagination';
import CollectionCrewList from './CollectionCrewList';

export interface CollectionsTableProps {
  collections: Collection[];
  crew: CrewMember[];
  items: OwnedItem[];
  frozenArchetypeIds: Set<number>;
}

function CollectionsTable({ collections, crew, items, frozenArchetypeIds }: CollectionsTableProps) {
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

Note: the per-collection expand row's own `colSpan={6}` (inside the
`<Fragment>`, unrelated to pagination) is unchanged — this file now has
two different `colSpan={6}` usages for two different reasons; both are
correct and intentional, not a duplication to simplify away.

- [ ] **Step 3: Build and lint**

```bash
npm run build -w client
npm run lint -w client
```

Expected: both exit cleanly.

- [ ] **Step 4: Data-driven verification against `example-data.json`**

Create a throwaway script `client-verify-pagination-collections.mjs`
at the repo root:

```js
import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync('example-data.json', 'utf-8'));
const collections = data.player.character.cryo_collections;

console.log('Collections row count:', collections.length);
console.log('Pages at size 50:', Math.ceil(collections.length / 50));
console.log('Pages at size 100:', Math.ceil(collections.length / 100));
```

Run: `node client-verify-pagination-collections.mjs`

Expected output (confirmed against the real sample before this plan
was written):
```
Collections row count: 88
Pages at size 50: 2
Pages at size 100: 1
```

Delete the script afterward: `rm client-verify-pagination-collections.mjs`

- [ ] **Step 5: Real-browser verification**

Start the dev server (standard worktree-seeding step).

Using the browser tooling, navigate to `/collections` (88 rows) and
confirm:
- Pagination control appears at the bottom, default page size 50 (2
  pages).
- Each collection visible on the current page still shows its full
  existing summary row + expanded crew sub-list row pair — pick at
  least one collection on page 1 and confirm its "Rewards"/"Progress"/
  "Milestone"/"Crew" values and its expanded crew sub-list still
  render exactly as before this feature (spot-check against a value
  you can independently compute or recall from before this branch).
- Change page size to 100: pagination control disappears (88 rows fit
  on one page of 100).

Navigate to `/5-stars-ships` and `/4-stars-ships` and confirm both
still render correctly (pagination control present only if the real
current row count for that page exceeds 50 — check the actual count in
the browser).

- [ ] **Step 6: Commit**

```bash
git add client/src/ships/ShipsTable.tsx client/src/collections/CollectionsTable.tsx
git commit -m "Add pagination to ShipsTable and CollectionsTable

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** the shared hook, all 6 table components'
  integration (including `CollectionsTable`'s by-collection pagination
  and the `#` column's continuous-across-pages fix everywhere), and all
  8 items from the spec's verification plan are each covered by a
  concrete step across the three tasks.
- **No placeholders:** every code block is complete and
  copy-pasteable; every data-driven verification script is real,
  runnable code with real expected output already confirmed against
  the actual sample data and cached catalog before this plan was
  written.
- **Type consistency:** `usePagination<T>`'s return shape
  (`pageItems`, `page`, `pageSize`, `showPagination`,
  `handlePageChange`, `handlePageSizeChange`) is destructured
  identically at all 6 call sites. `PAGE_SIZE_OPTIONS` is imported,
  never redefined, at every call site. Each table's `colSpan` value
  matches its actual column count exactly (7/8 conditional for
  `CrewTable`, 6 for `MissingCrewTable`/`CollectionsTable`, 4 for
  `FrozenCrewTable`, 8 for `QPsTable`, 5 for `ShipsTable`).
- **Task independence confirmed correct:** Tasks 2 and 3 both depend
  only on Task 1 (the hook), not on each other, and touch entirely
  disjoint files — either order works after Task 1 lands. No task
  leaves an intermediate non-compiling state, since every change is
  either a new file (Task 1's hook) or a full-file replacement that
  only adds imports/usage of an already-existing hook (Tasks 1-3's
  table files).
- **Dry-run validated:** `TablePagination`'s default `component` prop
  behavior (renders as `TableCell`, confirmed via reading its own
  source/doc comment, not assumed) and the full `usePagination` +
  `TableFooter` integration pattern were confirmed to compile cleanly
  against this project's real `tsconfig.app.json` before this plan was
  written.
