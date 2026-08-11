# TablePaginationFooter Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the pagination footer JSX duplicated verbatim across 6 tables into one shared `components/TablePaginationFooter.tsx`.

**Architecture:** One new presentational component plus a mechanical, identical swap in each of the 6 tables that currently inline the same `{showPagination && (<TableFooter>...)}` block. All 7 file changes are tightly coupled (the 6 tables can't compile against the new component until it exists) — one indivisible task.

**Tech Stack:** React 19, TypeScript strict mode, MUI v6.

## Global Constraints

- No change to `usePagination.ts` (`client/src/lib/usePagination.ts`) — hook signature, state, clamping, `PAGE_SIZE_OPTIONS` all untouched.
- No change to any table's header row or body row rendering — only the trailing pagination footer.
- No change to pagination behavior itself (default page size, page-size options, the `items.length > pageSize` show/hide threshold).
- `TablePaginationFooter` is not generic over row type — it only ever touches `count`/`page`/`pageSize`/`colSpan`/the two callbacks.
- `TablePaginationFooter` owns the show/hide decision internally (`show: boolean` prop, returns `null` when false) — no `{show && ...}` wrapper at any call site.
- Build (`npm run build -w client`) and lint (`npm run lint -w client`) must stay clean: 0 errors, only the 2 pre-existing `react-refresh/only-export-components` warnings.
- Full spec: `docs/superpowers/specs/2026-08-11-table-pagination-footer-design.md`.

---

### Task 1: Create `TablePaginationFooter` and swap it into all 6 tables

**Files:**
- Create: `client/src/components/TablePaginationFooter.tsx`
- Modify: `client/src/crew/CrewTable.tsx`
- Modify: `client/src/catalog/MissingCrewTable.tsx`
- Modify: `client/src/catalog/FrozenCrewTable.tsx`
- Modify: `client/src/crew/QPsTable.tsx`
- Modify: `client/src/ships/ShipsTable.tsx`
- Modify: `client/src/collections/CollectionsTable.tsx`

**Interfaces:**
- Produces: `TablePaginationFooterProps` — `{ show: boolean; count: number; page: number; pageSize: number; onPageChange: (event: MouseEvent<HTMLButtonElement> | null, newPage: number) => void; onPageSizeChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void; colSpan: number; }`, default-exported as `TablePaginationFooter`.
- Consumes (in each of the 6 tables): the same `usePagination(...)` hook, unchanged — `page`, `pageSize`, `showPagination`, `handlePageChange`, `handlePageSizeChange` are passed straight into the new component's matching props.

- [ ] **Step 1: Create `client/src/components/TablePaginationFooter.tsx`**

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

- [ ] **Step 2: Replace the full contents of `client/src/crew/CrewTable.tsx`**

```tsx
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import type { CrewMember } from '../types/crew';
import type { Collection } from '../types/collection';
import { getEquipmentSlotsRemaining } from './getters';
import { getCrewCollections } from '../collections/getters';
import { usePagination } from '../lib/usePagination';
import StarRating from './StarRating';
import Thumbnail from '../assets/Thumbnail';
import TablePaginationFooter from '../components/TablePaginationFooter';

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
          {pageItems.map((c, index) => {
            const crewCollections = getCrewCollections(c, collections);
            return (
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
                <TableCell align="right">{crewCollections.length}</TableCell>
                {showCollectionsNames && (
                  <TableCell>{crewCollections.map((col) => col.name).join(', ')}</TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
        <TablePaginationFooter
          show={showPagination}
          count={crew.length}
          page={page}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          colSpan={showCollectionsNames ? 8 : 7}
        />
      </Table>
    </TableContainer>
  );
}

export default CrewTable;
```

- [ ] **Step 3: Replace the full contents of `client/src/catalog/MissingCrewTable.tsx`**

```tsx
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import type { CatalogEntry } from '../types/catalogEntry';
import type { Collection } from '../types/collection';
import { getCrewCollections } from '../collections/getters';
import { usePagination } from '../lib/usePagination';
import Thumbnail from '../assets/Thumbnail';
import { ASSET_BASE_URL } from '../assets/config';
import TablePaginationFooter from '../components/TablePaginationFooter';

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
          {pageItems.map((c, index) => {
            const crewCollections = getCrewCollections(c, collections);
            return (
              <TableRow key={c.archetype_id}>
                <TableCell>{page * pageSize + index + 1}</TableCell>
                <TableCell>
                  <Thumbnail url={`${ASSET_BASE_URL}/${c.imageUrlPortrait}`} />
                </TableCell>
                <TableCell>{c.name}</TableCell>
                <TableCell align="right">{c.data_score.toFixed(2)}</TableCell>
                <TableCell align="right">{crewCollections.length}</TableCell>
                <TableCell>{crewCollections.map((col) => col.name).join(', ')}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TablePaginationFooter
          show={showPagination}
          count={crew.length}
          page={page}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          colSpan={6}
        />
      </Table>
    </TableContainer>
  );
}

export default MissingCrewTable;
```

- [ ] **Step 4: Replace the full contents of `client/src/catalog/FrozenCrewTable.tsx`**

```tsx
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import type { CatalogEntry } from '../types/catalogEntry';
import { usePagination } from '../lib/usePagination';
import StarRating from '../crew/StarRating';
import Thumbnail from '../assets/Thumbnail';
import { ASSET_BASE_URL } from '../assets/config';
import TablePaginationFooter from '../components/TablePaginationFooter';

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
        <TablePaginationFooter
          show={showPagination}
          count={crew.length}
          page={page}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          colSpan={4}
        />
      </Table>
    </TableContainer>
  );
}

export default FrozenCrewTable;
```

- [ ] **Step 5: Replace the full contents of `client/src/crew/QPsTable.tsx`**

```tsx
import {
  Box,
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
import { getQPLevel, getQPProgressDisplay, getQPPointsNeeded, getQPRoundsLeft, QP_MAX_LEVEL } from './getters';
import { usePagination } from '../lib/usePagination';
import StarRating from './StarRating';
import Thumbnail from '../assets/Thumbnail';
import StatusChip from '../components/StatusChip';
import TablePaginationFooter from '../components/TablePaginationFooter';

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
        <TablePaginationFooter
          show={showPagination}
          count={crew.length}
          page={page}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          colSpan={8}
        />
      </Table>
    </TableContainer>
  );
}

export default QPsTable;
```

- [ ] **Step 6: Replace the full contents of `client/src/ships/ShipsTable.tsx`**

```tsx
import {
  Box,
  LinearProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type { Ship } from '../types/ship';
import type { OwnedItem } from '../types/item';
import { getShipDisplayLevel, getShipSchematicsDisplay, getShipSchematicsProgress } from './getters';
import { usePagination } from '../lib/usePagination';
import Thumbnail from '../assets/Thumbnail';
import TablePaginationFooter from '../components/TablePaginationFooter';

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
        <TablePaginationFooter
          show={showPagination}
          count={ships.length}
          page={page}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          colSpan={5}
        />
      </Table>
    </TableContainer>
  );
}

export default ShipsTable;
```

- [ ] **Step 7: Replace the full contents of `client/src/collections/CollectionsTable.tsx`**

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
import { getCuratedRewards } from './rewards';
import { isMaxedOut } from './sorters';
import { usePagination } from '../lib/usePagination';
import CollectionCrewList from './CollectionCrewList';
import TablePaginationFooter from '../components/TablePaginationFooter';

export interface CollectionsTableProps {
  collections: Collection[];
  items: OwnedItem[];
  qualifyingCrewByCollection: Map<number, CrewMember[]>;
  upgradableIds: Set<number>;
}

function CollectionsTable({ collections, items, qualifyingCrewByCollection, upgradableIds }: CollectionsTableProps) {
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
            const qualifyingCrew = qualifyingCrewByCollection.get(collection.id) ?? [];
            const upgradable = upgradableIds.has(collection.id);
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
        <TablePaginationFooter
          show={showPagination}
          count={collections.length}
          page={page}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          colSpan={6}
        />
      </Table>
    </TableContainer>
  );
}

export default CollectionsTable;
```

- [ ] **Step 8: Build and lint**

Run: `npm run build -w client` — expect success, 0 errors. If any of the 6 tables still imports `TableFooter`/`TablePagination` from `@mui/material` or `PAGE_SIZE_OPTIONS` from `../lib/usePagination` without using it, or forgot to add the `TablePaginationFooter` import, TypeScript/the bundler will surface it here.
Run: `npm run lint -w client` — expect 0 errors, only the 2 pre-existing warnings. An unused-import lint error in any of the 6 table files means that file's old imports weren't fully cleaned up.

- [ ] **Step 9: Real-browser verification**

Start the dev server. Using real Playwright/chrome-devtools MCP tools (or the `playwright` library per `CLAUDE.md` if the MCP servers aren't available this session), check:

1. **`/5-stars-ships`** (`ShipsTable`, static `colSpan={5}`): confirm the pagination control renders (rows-per-page dropdown showing `50/100/150/200`, page navigation arrows, "X–Y of Z" text) exactly as before, and that clicking "next page" changes the visible rows.
2. **`/5-stars-crew`** (`CrewTable`, the one table with a *conditional* `colSpan`): confirm the same pagination control renders correctly with `showCollectionsNames={true}` (the 8-column case) and that changing the page size (e.g. to 100) both updates the dropdown's selected value and the visible row count.
3. **One more of the remaining 4 tables** (e.g. `/collections` or `/qps`): confirm its pagination control also renders and functions — a spot-check that the swap pattern held there too, not just that it built cleanly.
4. **A table currently showing fewer rows than the default page size** (if one exists in the seeded data — check `showPagination`'s condition, `items.length > pageSize`): confirm no footer/pagination row renders at all, matching the pre-existing threshold behavior.

Record the actual observed row counts, dropdown values, and page-text strings — not the expected ones.

- [ ] **Step 10: Commit**

```bash
git add client/src/components/TablePaginationFooter.tsx \
  client/src/crew/CrewTable.tsx \
  client/src/catalog/MissingCrewTable.tsx \
  client/src/catalog/FrozenCrewTable.tsx \
  client/src/crew/QPsTable.tsx \
  client/src/ships/ShipsTable.tsx \
  client/src/collections/CollectionsTable.tsx
git commit -m "Extract TablePaginationFooter, used by all 6 tables"
```

---

## Final integration check

- [ ] Run `npm run build -w client` and `npm run lint -w client` one more time to confirm the same clean result.
- [ ] Update `docs/PROJECT_STATE.md`: strike through (in the established "resolved, kept as a pointer" style used throughout that document) the "TablePagination footer JSX duplicated 6x verbatim" deferred-issues entry, add a feature-history entry, bump the "Last updated" line, and — per the lesson from the most recent feature's final review — check whether any deep-dive section documents the pre-refactor footer JSX as current and reconcile it if so, not just the deferred-issues/history entries.
