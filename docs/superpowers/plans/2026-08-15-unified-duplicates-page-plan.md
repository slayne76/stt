# Unified Duplicates Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two rarity-scoped "4 Stars Duplicates"/"5 Stars Duplicates" pages with one unified "Duplicates" page (`/duplicates`) covering every rarity (5★ down to 1★), with duplicate crew instances grouped (not just listed one-row-per-instance) and a new "Total Owned" column showing each group's size.

**Architecture:** Task 1 is a pure addition — `getDuplicateCrewGroups` in `client/src/crew/getters.ts`, no UI dependency, build stays green throughout (the old `filterFrozenDuplicates` is left in place and untouched, still working, until its caller is deleted). Task 2 builds the new `DuplicatesTable.tsx`/`DuplicatesPage.tsx`, deletes the 3 old page files, removes the now-dead `filterFrozenDuplicates`, and rewires `routes.tsx` — build stays green at every step since the removal happens in the same task as its last caller's deletion.

**Tech Stack:** React 19, TypeScript strict mode, MUI, `tsx` (root devDependency, used for throwaway verification scripts — this project has no automated test framework by deliberate choice).

## Global Constraints

- **Verification for this feature must use the real, live-refreshed `server/data/player-cache.json` — NOT `example-data.json`.** When setting up any worktree for this plan, copy the actual current `server/data/player-cache.json` from the main checkout.
- A duplicate candidate = archetype has a frozen/stored copy (`getFrozenCrewArchetypeIds`) AND `!c.in_buy_back_state`. No `max_rarity` restriction — every rarity is included.
- Candidates group by **archetype_id + rarity + level + items-to-equip** (`getEquipmentSlotsRemaining`) — all four must match for two instances to collapse into one row. `totalOwned` is the group's size.
- An active duplicate that's already fully immortalized still counts toward `totalOwned` — no `isImmortalized`-based exclusion (the user's explicit choice).
- Sort: `max_rarity` descending first (5★ top, 1★ bottom), then `defaultCrewComparator` (level desc, items-to-equip desc, collections desc, name asc) as tie-break.
- The representative `crew` shown for a group can be any member — all displayed fields (image, name, rarity, level, items-to-equip, collections) are guaranteed identical within a group by construction.
- Collections column is count-only (no names column) — matching the old duplicate pages' style, no toggle needed since this is a dedicated single-purpose page now.
- Nav: "Duplicates" replaces "4 Stars Duplicates"/"5 Stars Duplicates" in the same position in the Crew group (between "4/4 Stars crew" and "QPs"), route `/duplicates`.
- Build (`npm run build -w client`) and lint (`npm run lint -w client`) must stay clean: 0 errors, same pre-existing warning count as before this feature.
- Full spec: `docs/superpowers/specs/2026-08-15-unified-duplicates-page-design.md`.
- **Real expected output, computed from `server/data/player-cache.json` as of 2026-08-15 — 15 rows total (from 30 raw candidate crew instances), in final sorted order:**

  ```
   1. 5★: (none today)
   2. 4★ Anxious Kirk            rarity=2 level=100 items=-2  collections=2  totalOwned=1
      4★ Indignant Seven         rarity=1 level=30  items=-2  collections=2  totalOwned=1
      4★ Captain Janeway         rarity=4 level=20  items=-1  collections=4  totalOwned=1
   3. 3★ Commander Scott         rarity=1 level=1   items=-4  collections=6  totalOwned=3
      3★ Groundskeeper Boothby   rarity=1 level=1   items=-4  collections=5  totalOwned=2
      3★ Mirror 'Smiley' O'Brien rarity=1 level=1   items=-4  collections=5  totalOwned=3
      3★ Nepenthe Riker          rarity=1 level=1   items=-4  collections=5  totalOwned=2
      3★ Deanna Troi             rarity=1 level=1   items=-4  collections=4  totalOwned=2
      3★ Dr. Carol Marcus        rarity=1 level=1   items=-4  collections=4  totalOwned=2
      3★ Gilora Rejal            rarity=1 level=1   items=-4  collections=4  totalOwned=3
      3★ The Viceroy             rarity=1 level=1   items=-4  collections=4  totalOwned=2
      3★ Tribunal Pike           rarity=1 level=1   items=-4  collections=4  totalOwned=2
      3★ CMO Ogawa               rarity=1 level=1   items=-4  collections=3  totalOwned=2
      3★ Expedition Vash         rarity=1 level=1   items=-4  collections=3  totalOwned=2
      3★ Sniper Ezri Dax         rarity=1 level=1   items=-4  collections=3  totalOwned=2
   4. 2★/1★: (none today)
  ```

  If the live data has changed since this plan was written, that's fine — see each task's verification step for how to handle it (re-derive independently rather than expecting a byte-match).

---

### Task 1: `getDuplicateCrewGroups` data layer

**Files:**
- Modify: `client/src/crew/getters.ts`

**Interfaces:**
- Produces: `DuplicateCrewGroup { crew: CrewMember; totalOwned: number }`, `getDuplicateCrewGroups(crew: CrewMember[], frozenArchetypeIds: Set<number>): DuplicateCrewGroup[]` — both exported from `client/src/crew/getters.ts`.
- Note: `client/src/crew/filters.ts`'s existing `filterFrozenDuplicates` is untouched by this task — it still works, still has its one caller (`FrozenDuplicatesPage.tsx`), and is removed in Task 2 alongside that caller's deletion, not here.

- [ ] **Step 1: Append `DuplicateCrewGroup`/`getDuplicateCrewGroups` to `client/src/crew/getters.ts`**

Append at the end of the file (after the existing `getTopSkillAbbreviations` function):

```ts

export interface DuplicateCrewGroup {
  crew: CrewMember;
  totalOwned: number;
}

function duplicateGroupKey(crew: CrewMember): string {
  return `${crew.archetype_id}|${crew.rarity}|${crew.level}|${getEquipmentSlotsRemaining(crew)}`;
}

export function getDuplicateCrewGroups(
  crew: CrewMember[],
  frozenArchetypeIds: Set<number>
): DuplicateCrewGroup[] {
  const candidates = crew.filter((c) => frozenArchetypeIds.has(c.archetype_id) && !c.in_buy_back_state);
  const groups = new Map<string, DuplicateCrewGroup>();
  for (const c of candidates) {
    const key = duplicateGroupKey(c);
    const existing = groups.get(key);
    if (existing) {
      existing.totalOwned += 1;
    } else {
      groups.set(key, { crew: c, totalOwned: 1 });
    }
  }
  return [...groups.values()];
}
```

No new imports needed — `CrewMember` and `getEquipmentSlotsRemaining` are already defined/imported in this file.

- [ ] **Step 2: Build and lint**

Run: `npm run build -w client` — expect success, 0 errors.
Run: `npm run lint -w client` — expect 0 errors, same pre-existing warning count as before this feature.

- [ ] **Step 3: Data-driven verification against the real, live-refreshed `server/data/player-cache.json`**

Write a throwaway script at the repo root, `verify-duplicate-groups.ts` (not committed — delete it after capturing output), using `tsx` (already a root devDependency):

```ts
import { readFileSync } from 'node:fs';
import { getCrewList, getFrozenCrewArchetypeIds, getDuplicateCrewGroups } from './client/src/crew/getters';

const data = JSON.parse(readFileSync('server/data/player-cache.json', 'utf-8'));
const crew = getCrewList(data);
const frozenArchetypeIds = getFrozenCrewArchetypeIds(data);
const groups = getDuplicateCrewGroups(crew, frozenArchetypeIds);

const totalCandidates = groups.reduce((sum, g) => sum + g.totalOwned, 0);
console.log('rows:', groups.length, 'total candidate crew:', totalCandidates);

const byMaxRarity: Record<number, number> = {};
for (const g of groups) byMaxRarity[g.crew.max_rarity] = (byMaxRarity[g.crew.max_rarity] ?? 0) + 1;
console.log('rows per max_rarity:', JSON.stringify(byMaxRarity));

const tribunalPike = groups.find((g) => g.crew.name === 'Tribunal Pike');
console.log('Tribunal Pike totalOwned:', tribunalPike?.totalOwned);
```

Run: `npx tsx verify-duplicate-groups.ts` (from the repo root).

**Expected output, computed from the real file as of 2026-08-15 — confirm your run matches exactly:**

```
rows: 15 total candidate crew: 30
rows per max_rarity: {"3":12,"4":3}
Tribunal Pike totalOwned: 2
```

If your run's data file has since changed (the user may have refreshed with newer live data), the important thing is that `Tribunal Pike totalOwned` — or, if that crew member no longer exists in your data, any real crew member you can hand-verify — genuinely matches a manual read of `server/data/player-cache.json`: count how many `crew` array entries share that crew's `archetype_id`, `rarity`, `level`, and are not `in_buy_back_state`, and confirm it equals the group's `totalOwned`. State explicitly in your report whether your run matched the numbers above exactly or differed (and why, if you can tell).

Delete the throwaway script once you've captured its output in your report.

- [ ] **Step 4: Commit**

```bash
git add client/src/crew/getters.ts
git commit -m "Add getDuplicateCrewGroups"
```

---

### Task 2: `DuplicatesTable`/`DuplicatesPage`, delete old duplicate pages, rewire nav

**Files:**
- Create: `client/src/crew/DuplicatesTable.tsx`
- Create: `client/src/pages/DuplicatesPage.tsx`
- Delete: `client/src/pages/FrozenDuplicatesPage.tsx`
- Delete: `client/src/pages/FourStarsDuplicatesPage.tsx`
- Delete: `client/src/pages/FiveStarsDuplicatesPage.tsx`
- Modify: `client/src/routes.tsx`
- Modify: `client/src/crew/filters.ts`

**Interfaces:**
- Consumes: `DuplicateCrewGroup`, `getDuplicateCrewGroups(crew: CrewMember[], frozenArchetypeIds: Set<number>): DuplicateCrewGroup[]` from Task 1 (`../crew/getters`); `byMaxRarityDesc`, `defaultCrewComparator(collections: Collection[]): Comparator<CrewMember>` from `../crew/sorters` (pre-existing, unchanged); `combineComparators` from `../lib/comparator` (pre-existing, unchanged); `getEquipmentSlotsRemaining(crew: CrewMember): number` from `../crew/getters` (pre-existing, unchanged).

- [ ] **Step 1: Create `client/src/crew/DuplicatesTable.tsx`**

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
import type { Collection } from '../types/collection';
import { getEquipmentSlotsRemaining, type DuplicateCrewGroup } from './getters';
import { getCrewCollections } from '../collections/getters';
import { usePagination } from '../lib/usePagination';
import StarRating from './StarRating';
import Thumbnail from '../assets/Thumbnail';
import TablePaginationFooter from '../components/TablePaginationFooter';

export interface DuplicatesTableProps {
  groups: DuplicateCrewGroup[];
  collections: Collection[];
}

function DuplicatesTable({ groups, collections }: DuplicatesTableProps) {
  const { pageItems, page, pageSize, showPagination, handlePageChange, handlePageSizeChange } = usePagination(groups);

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
            <TableCell align="right">Collections</TableCell>
            <TableCell align="right">Total Owned</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {pageItems.map((group, index) => {
            const c = group.crew;
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
                <TableCell align="right">{group.totalOwned}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TablePaginationFooter
          show={showPagination}
          count={groups.length}
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

export default DuplicatesTable;
```

- [ ] **Step 2: Create `client/src/pages/DuplicatesPage.tsx`**

```tsx
import { usePageData } from '../hooks/usePageData';
import { getCrewList, getFrozenCrewArchetypeIds, getDuplicateCrewGroups } from '../crew/getters';
import { byMaxRarityDesc, defaultCrewComparator } from '../crew/sorters';
import { combineComparators } from '../lib/comparator';
import { getCollectionsList } from '../collections/getters';
import { useSearch } from '../lib/useSearch';
import DuplicatesTable from '../crew/DuplicatesTable';
import PageShell from '../layout/PageShell';
import TableSearchBar from '../components/TableSearchBar';

function DuplicatesPage() {
  const { data, loading, error, refresh, loaded } = usePageData();

  const collections = data ? getCollectionsList(data) : [];
  const frozenArchetypeIds = data ? getFrozenCrewArchetypeIds(data) : new Set<number>();
  const groups = data
    ? [...getDuplicateCrewGroups(getCrewList(data), frozenArchetypeIds)].sort((a, b) =>
        combineComparators(byMaxRarityDesc, defaultCrewComparator(collections))(a.crew, b.crew)
      )
    : [];
  const { query, setQuery, filteredItems: filteredGroups, active } = useSearch(groups, (g) => [g.crew.name]);

  return (
    <PageShell
      title="Duplicates"
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={filteredGroups.length}
      totalCount={groups.length}
      emptyMessage={active && filteredGroups.length === 0 ? 'No results found for your search.' : 'No duplicate crew.'}
      titleActions={<TableSearchBar value={query} onChange={setQuery} ariaLabel="Search Duplicates by name" />}
    >
      <DuplicatesTable groups={filteredGroups} collections={collections} />
    </PageShell>
  );
}

export default DuplicatesPage;
```

- [ ] **Step 3: Delete the 3 old files**

```bash
git rm client/src/pages/FrozenDuplicatesPage.tsx client/src/pages/FourStarsDuplicatesPage.tsx client/src/pages/FiveStarsDuplicatesPage.tsx
```

- [ ] **Step 4: Rewire `client/src/routes.tsx`**

Replace:

```tsx
import CollectionsPage from './pages/CollectionsPage';
import FourStarsDuplicatesPage from './pages/FourStarsDuplicatesPage';
import FiveStarsDuplicatesPage from './pages/FiveStarsDuplicatesPage';
import FiveStarsShipsPage from './pages/FiveStarsShipsPage';
```

with:

```tsx
import CollectionsPage from './pages/CollectionsPage';
import DuplicatesPage from './pages/DuplicatesPage';
import FiveStarsShipsPage from './pages/FiveStarsShipsPage';
```

Replace:

```tsx
      { label: '4 Stars Duplicates', path: '/4-stars-duplicates', element: <FourStarsDuplicatesPage /> },
      { label: '5 Stars Duplicates', path: '/5-stars-duplicates', element: <FiveStarsDuplicatesPage /> },
      { label: 'QPs', path: '/qps', element: <QPsPage /> },
```

with:

```tsx
      { label: 'Duplicates', path: '/duplicates', element: <DuplicatesPage /> },
      { label: 'QPs', path: '/qps', element: <QPsPage /> },
```

Everything else in `routes.tsx` (the other 12 imports/entries, `NavLink`/`NavGroup` types, `flattenRoutes`, `ROUTES`) is untouched.

- [ ] **Step 5: Remove `filterFrozenDuplicates` from `client/src/crew/filters.ts`**

Its only caller (`FrozenDuplicatesPage.tsx`) was deleted in Step 3 above, so this function is now genuinely dead code.

Replace the full current file contents:

```ts
import type { CrewMember } from '../types/crew';
import type { OwnedItem } from '../types/item';
import { getQPLevel, isImmortalized, isReadyToImmortalize, QP_MAX_LEVEL } from './getters';

export function filterByRarity(
  crew: CrewMember[],
  { rarity, maxRarity }: { rarity: number; maxRarity: number }
): CrewMember[] {
  return crew.filter((c) => c.rarity === rarity && c.max_rarity === maxRarity);
}

export function filterReadyToImmortalize(crew: CrewMember[], items: OwnedItem[]): CrewMember[] {
  return crew.filter((c) => isReadyToImmortalize(c, items));
}

export function filterNeedsWork(crew: CrewMember[], items: OwnedItem[]): CrewMember[] {
  return crew.filter((c) => !isImmortalized(c) && !isReadyToImmortalize(c, items));
}

// Excludes buyback-state (already trashed in-game) crew here only —
// every other consumer (Collections, QP, Overview, tier pages) counts them normally.
export function filterFrozenDuplicates(crew: CrewMember[], frozenArchetypeIds: Set<number>, maxRarity: number): CrewMember[] {
  return crew.filter((c) => frozenArchetypeIds.has(c.archetype_id) && c.max_rarity === maxRarity && !c.in_buy_back_state);
}

export function filterQPEligible(crew: CrewMember[]): CrewMember[] {
  return crew.filter((c) => isImmortalized(c) && getQPLevel(c) < QP_MAX_LEVEL);
}

export function filterUnmaxed(crew: CrewMember[], maxRarity: number): CrewMember[] {
  return crew.filter((c) => c.max_rarity === maxRarity && !isImmortalized(c));
}
```

with:

```ts
import type { CrewMember } from '../types/crew';
import type { OwnedItem } from '../types/item';
import { getQPLevel, isImmortalized, isReadyToImmortalize, QP_MAX_LEVEL } from './getters';

export function filterByRarity(
  crew: CrewMember[],
  { rarity, maxRarity }: { rarity: number; maxRarity: number }
): CrewMember[] {
  return crew.filter((c) => c.rarity === rarity && c.max_rarity === maxRarity);
}

export function filterReadyToImmortalize(crew: CrewMember[], items: OwnedItem[]): CrewMember[] {
  return crew.filter((c) => isReadyToImmortalize(c, items));
}

export function filterNeedsWork(crew: CrewMember[], items: OwnedItem[]): CrewMember[] {
  return crew.filter((c) => !isImmortalized(c) && !isReadyToImmortalize(c, items));
}

export function filterQPEligible(crew: CrewMember[]): CrewMember[] {
  return crew.filter((c) => isImmortalized(c) && getQPLevel(c) < QP_MAX_LEVEL);
}

export function filterUnmaxed(crew: CrewMember[], maxRarity: number): CrewMember[] {
  return crew.filter((c) => c.max_rarity === maxRarity && !isImmortalized(c));
}
```

(Only `filterFrozenDuplicates` and its preceding comment are removed — `filterByRarity`, `filterReadyToImmortalize`, `filterNeedsWork`, `filterQPEligible`, `filterUnmaxed`, and the imports are all unchanged.)

- [ ] **Step 6: Build and lint**

Run: `npm run build -w client` — expect success, 0 errors (this confirms no file still imports `filterFrozenDuplicates` or any of the 3 deleted pages).
Run: `npm run lint -w client` — expect 0 errors, same pre-existing warning count as before this feature.

- [ ] **Step 7: Real-browser verification**

The real, live-refreshed `server/data/player-cache.json` should already be seeded in this worktree from Task 1's setup (per the Global Constraints note — NOT `example-data.json`). If it's missing, copy it from the main checkout before proceeding.

Start the dev server: `npm run dev` (root). Using the `playwright` library directly (or the `mcp__playwright__*`/`mcp__chrome-devtools__*` MCP tools if available — see `CLAUDE.md`), navigate to `/duplicates` and:

1. Confirm the nav's Crew flyout shows exactly one "Duplicates" entry (no "4 Stars Duplicates"/"5 Stars Duplicates" entries anywhere), positioned between "4/4 Stars crew" and "QPs".
2. Confirm the table header row reads, in order: `#, Image, Stars, Name, Level, Items to equip, Collections, Total Owned`.
3. Read the actual rendered row values (per-cell reads — do not use a whole-row/concatenated text extraction) for at least the first 5 rows and confirm they match, in order:

   ```
   1. Anxious Kirk    — 4★, Level 100, Items -2, Collections 2, Total Owned 1
   2. Indignant Seven — 4★, Level 30,  Items -2, Collections 2, Total Owned 1
   3. Captain Janeway — 4★, Level 20,  Items -1, Collections 4, Total Owned 1
   4. Commander Scott — 3★, Level 1,   Items -4, Collections 6, Total Owned 3
   5. Groundskeeper Boothby — 3★, Level 1, Items -4, Collections 5, Total Owned 2
   ```

   Also scroll/paginate to find "Tribunal Pike" specifically and confirm its "Total Owned" cell reads exactly `2`.

   If the live data has changed since this plan was written (different rows/order), that's fine — instead read whichever rows actually appear first, and independently cross-check each one's "Total Owned" value against a manual count of matching `crew` array entries (same `archetype_id`, `rarity`, `level`, `!in_buy_back_state`) in `server/data/player-cache.json`. State explicitly in your report whether you used the table above or a fresh cross-check, and why.
4. Confirm no 5★ or 2★/1★ rows appear if none exist in the current data (there's no per-rarity heading or empty-section placeholder — the table should simply not contain any 5★/2★/1★ row if the underlying data has none), OR, if the live data does have crew at those rarities, confirm they appear in the correct sorted position (5★ above 4★, 2★/1★ below 3★).
5. Confirm navigating directly to `/4-stars-duplicates` or `/5-stars-duplicates` (the old URLs) does not crash the app (react-router will show its normal not-found/redirect behavior for an unregistered path — just confirm there's no unhandled JS error in the console).

Stop the dev server afterward (kill only the process this step started — confirm ownership via the working-directory/port before killing anything if a port conflict comes up; if the port is already occupied by the user's own separately-running dev server, do not kill it — run on an alternate port instead, same as established practice on this project).

- [ ] **Step 8: Commit**

```bash
git add client/src/crew/DuplicatesTable.tsx client/src/pages/DuplicatesPage.tsx client/src/routes.tsx client/src/crew/filters.ts
git commit -m "Add unified Duplicates page, remove rarity-scoped duplicate pages"
```
