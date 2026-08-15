# "3/5 Stars Crew" Page + Uniquely Retrievable Column Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new "3/5 Stars Crew" page (rarity=3, max_rarity=5) positioned right under "5 Stars Crew" in the Crew nav, and a new, reusable, opt-in "Uniquely Retrievable" column on `CrewTable` (shown only on this new page for now).

**Architecture:** Task 1 widens the existing crew-catalog fetch (server) and adds a client-side getter — no UI, independently testable against the real live catalog endpoint the server already calls. Task 2 adds the modular `CrewTable` column, the new page, and the nav entry, consuming Task 1's exports.

**Tech Stack:** Node/Express + TypeScript (server), React 19 + TypeScript strict mode + MUI (client), `tsx` (root devDependency, used for throwaway verification scripts — this project has no automated test framework by deliberate choice).

## Global Constraints

- `uniquely_retrievable` (boolean) = `in_portal && (unique_polestar_combos?.length ?? 0) > 0` — computed **server-side**, not passed through as a raw array (keeps the catalog cache lean, matches this project's existing "type only what's used" discipline).
- No new upstream call — `https://datacore.app/structured/crew.json` is already fetched in full by `server/src/catalogClient.ts`; this only widens what's extracted from the response it already gets.
- The new `CrewTable` prop, `uniquelyRetrievableArchetypeIds?: Set<number> | null`, is **optional** — `undefined` (every existing caller, unchanged) hides the column entirely; `null` shows the column with `"Unavailable"` per cell (catalog fetch failed); a real `Set<number>` shows `"Yes"`/`"No"` per cell via archetype-id membership.
- The new page uses `usePageData(catalogLoading)` so the whole page waits for both player data and catalog before rendering rows (catalog **loading** blocks; catalog **error** does not — the page still renders with `"Unavailable"` in the new column only).
- New page: filter `filterByRarity(crew, { rarity: 3, maxRarity: 5 })` (existing function), sort `defaultCrewComparator` (matches the "3/4 Stars crew"/"4/5 Stars crew" sibling pages, not "5 Stars Crew"'s own rarity-tiebreak comparator — confirmed with the user during brainstorming since rarity is constant on this new page).
- Nav: "3/5 Stars Crew" at `/3-5-stars-crew`, positioned immediately after "5 Stars Crew" and before "3/4 Stars crew" in the Crew group.
- **Any existing `server/data/crew-catalog-cache.json` predates this feature and lacks the new `uniquely_retrievable` field.** It must be deleted (or refreshed via the app's "Refresh catalog" control) before real-browser verification, or the column will incorrectly show "No" for everyone until it naturally refetches.
- Build (`npm run build -w server` and `npm run build -w client`) and lint (`npm run lint -w client`) must stay clean: 0 errors, same pre-existing warning count as before this feature.
- Full spec: `docs/superpowers/specs/2026-08-16-three-five-stars-crew-page-design.md`.
- **Real expected values, computed from the live `https://datacore.app/structured/crew.json` + `server/data/player-cache.json` as of 2026-08-16 — exactly 5 owned crew match rarity=3/max_rarity=5:**

  ```
  Holo-Engineer Zimmerman      (archetype_id 17579) -> uniquely_retrievable = true
  Lt. Commander Spock          (archetype_id 19192) -> uniquely_retrievable = false
  Minooki Freeman               (archetype_id 26275) -> uniquely_retrievable = true
  Countess Regina Bartholomew  (archetype_id 16777) -> uniquely_retrievable = true
  Determined Worf              (archetype_id 20492) -> uniquely_retrievable = false
  ```

  If the live catalog or the live player data has changed since this plan was written, re-derive independently (see each task's verification step) rather than expecting a byte-match.

---

### Task 1: Widen the catalog fetch (server) + client type/getter

**Files:**
- Modify: `server/src/catalogClient.ts`
- Modify: `client/src/types/catalogEntry.ts`
- Modify: `client/src/catalog/getters.ts`

**Interfaces:**
- Produces: `CatalogEntry.uniquely_retrievable: boolean` (both the server's own `CatalogEntry` interface and the client's `client/src/types/catalogEntry.ts` mirror — these are two separate, independently-declared interfaces with the same shape, matching this project's existing server/client duplication pattern for this type; there is no shared import between server and client code).
- Produces: `getUniquelyRetrievableArchetypeIds(catalog: CatalogEntry[]): Set<number>` exported from `client/src/catalog/getters.ts`.

- [ ] **Step 1: Widen `server/src/catalogClient.ts`**

Replace the full current file contents:

```ts
import { UpstreamError } from './errors';

const CATALOG_UPSTREAM_URL = 'https://datacore.app/structured/crew.json';

export interface CatalogEntry {
  archetype_id: number;
  max_rarity: number;
  in_portal: boolean;
  name: string;
  imageUrlPortrait: string;
  data_score: number;
  traits: string[];
  traits_hidden: string[];
}

interface RawCatalogEntry {
  archetype_id: number;
  max_rarity: number;
  in_portal: boolean;
  name: string;
  imageUrlPortrait: string;
  traits?: string[];
  traits_hidden?: string[];
  ranks?: { scores?: { overall?: number } };
  [key: string]: unknown;
}

export async function fetchCrewCatalog(): Promise<CatalogEntry[]> {
  let response: Response;
  try {
    response = await fetch(CATALOG_UPSTREAM_URL, { signal: AbortSignal.timeout(30_000) });
  } catch (cause) {
    throw new UpstreamError(`Network error fetching crew catalog: ${(cause as Error).message}`);
  }

  if (!response.ok) {
    throw new UpstreamError(`Crew catalog host returned HTTP ${response.status}`);
  }

  const raw = (await response.json()) as RawCatalogEntry[];
  return raw.map((e) => ({
    archetype_id: e.archetype_id,
    max_rarity: e.max_rarity,
    in_portal: e.in_portal,
    name: e.name,
    imageUrlPortrait: e.imageUrlPortrait,
    data_score: e.ranks?.scores?.overall ?? 0,
    traits: e.traits ?? [],
    traits_hidden: e.traits_hidden ?? [],
  }));
}
```

with:

```ts
import { UpstreamError } from './errors';

const CATALOG_UPSTREAM_URL = 'https://datacore.app/structured/crew.json';

export interface CatalogEntry {
  archetype_id: number;
  max_rarity: number;
  in_portal: boolean;
  name: string;
  imageUrlPortrait: string;
  data_score: number;
  traits: string[];
  traits_hidden: string[];
  uniquely_retrievable: boolean;
}

interface RawCatalogEntry {
  archetype_id: number;
  max_rarity: number;
  in_portal: boolean;
  name: string;
  imageUrlPortrait: string;
  traits?: string[];
  traits_hidden?: string[];
  ranks?: { scores?: { overall?: number } };
  unique_polestar_combos?: string[][];
  [key: string]: unknown;
}

export async function fetchCrewCatalog(): Promise<CatalogEntry[]> {
  let response: Response;
  try {
    response = await fetch(CATALOG_UPSTREAM_URL, { signal: AbortSignal.timeout(30_000) });
  } catch (cause) {
    throw new UpstreamError(`Network error fetching crew catalog: ${(cause as Error).message}`);
  }

  if (!response.ok) {
    throw new UpstreamError(`Crew catalog host returned HTTP ${response.status}`);
  }

  const raw = (await response.json()) as RawCatalogEntry[];
  return raw.map((e) => ({
    archetype_id: e.archetype_id,
    max_rarity: e.max_rarity,
    in_portal: e.in_portal,
    name: e.name,
    imageUrlPortrait: e.imageUrlPortrait,
    data_score: e.ranks?.scores?.overall ?? 0,
    traits: e.traits ?? [],
    traits_hidden: e.traits_hidden ?? [],
    uniquely_retrievable: Boolean(e.in_portal) && (e.unique_polestar_combos?.length ?? 0) > 0,
  }));
}
```

- [ ] **Step 2: Mirror the field in `client/src/types/catalogEntry.ts`**

Replace:

```ts
export interface CatalogEntry {
  archetype_id: number;
  max_rarity: number;
  in_portal: boolean;
  name: string;
  imageUrlPortrait: string;
  data_score: number;
  traits: string[];
  traits_hidden: string[];
}
```

with:

```ts
export interface CatalogEntry {
  archetype_id: number;
  max_rarity: number;
  in_portal: boolean;
  name: string;
  imageUrlPortrait: string;
  data_score: number;
  traits: string[];
  traits_hidden: string[];
  uniquely_retrievable: boolean;
}
```

- [ ] **Step 3: Add `getUniquelyRetrievableArchetypeIds` to `client/src/catalog/getters.ts`**

Append at the end of the file:

```ts

export function getUniquelyRetrievableArchetypeIds(catalog: CatalogEntry[]): Set<number> {
  if (!Array.isArray(catalog)) return new Set();
  return new Set(catalog.filter((c) => c.uniquely_retrievable).map((c) => c.archetype_id));
}
```

No new imports needed — `CatalogEntry` is already imported at the top of this file.

- [ ] **Step 4: Build**

Run: `npm run build -w server` — expect success, 0 errors.
Run: `npm run build -w client` — expect success, 0 errors.
Run: `npm run lint -w client` — expect 0 errors, same pre-existing warning count as before this feature.

- [ ] **Step 5: Data-driven verification against the real, live `https://datacore.app/structured/crew.json`**

This calls the real, updated `fetchCrewCatalog()` function directly — a genuine network request to the live upstream (the same one this app's server already makes; expect ~3 seconds wall time and a ~40MB download, consistent with this project's prior measurement of this exact endpoint).

Write a throwaway script at the repo root, `verify-uniquely-retrievable.ts` (not committed — delete it after capturing output), using `tsx` (already a root devDependency):

```ts
import { fetchCrewCatalog } from './server/src/catalogClient';

async function main() {
  const catalog = await fetchCrewCatalog();
  const byId = new Map(catalog.map((c) => [c.archetype_id, c]));

  const checks = [
    { name: 'Holo-Engineer Zimmerman', archetype_id: 17579, expected: true },
    { name: 'Lt. Commander Spock', archetype_id: 19192, expected: false },
    { name: 'Minooki Freeman', archetype_id: 26275, expected: true },
    { name: 'Countess Regina Bartholomew', archetype_id: 16777, expected: true },
    { name: 'Determined Worf', archetype_id: 20492, expected: false },
  ];

  for (const check of checks) {
    const entry = byId.get(check.archetype_id);
    const actual = entry?.uniquely_retrievable;
    console.log(
      `${check.name} (archetype_id ${check.archetype_id}): uniquely_retrievable=${actual}, expected=${check.expected}, ${actual === check.expected ? 'MATCH' : 'MISMATCH'}`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Run: `npx tsx verify-uniquely-retrievable.ts` (from the repo root).

**Expected output, computed as of 2026-08-16 — confirm your run shows MATCH for all 5:**

```
Holo-Engineer Zimmerman (archetype_id 17579): uniquely_retrievable=true, expected=true, MATCH
Lt. Commander Spock (archetype_id 19192): uniquely_retrievable=false, expected=false, MATCH
Minooki Freeman (archetype_id 26275): uniquely_retrievable=true, expected=true, MATCH
Countess Regina Bartholomew (archetype_id 16777): uniquely_retrievable=true, expected=true, MATCH
Determined Worf (archetype_id 20492): uniquely_retrievable=false, expected=false, MATCH
```

If any show MISMATCH, this could mean the crew's real datacore status genuinely changed since this plan was written (the game portal rotates) — cross-check the specific archetype_id manually against `https://datacore.app/structured/crew.json` (search for `"archetype_id":<id>` and inspect its `in_portal`/`unique_polestar_combos` fields directly) before concluding it's a code defect. State explicitly in your report which case applied.

Delete the throwaway script once you've captured its output in your report.

- [ ] **Step 6: Commit**

```bash
git add server/src/catalogClient.ts client/src/types/catalogEntry.ts client/src/catalog/getters.ts
git commit -m "Add uniquely_retrievable to the crew catalog"
```

---

### Task 2: `CrewTable`'s modular column, the new page, and the nav entry

**Files:**
- Modify: `client/src/crew/CrewTable.tsx`
- Create: `client/src/pages/ThreeFiveStarsCrewPage.tsx`
- Modify: `client/src/routes.tsx`

**Interfaces:**
- Consumes: `CatalogEntry`, `getUniquelyRetrievableArchetypeIds(catalog: CatalogEntry[]): Set<number>` from Task 1 (`../catalog/getters`, `../types/catalogEntry`).
- Produces: `CrewTableProps.uniquelyRetrievableArchetypeIds?: Set<number> | null` — the new optional prop other pages can adopt later by simply passing it.

- [ ] **Step 1: Add the modular column to `client/src/crew/CrewTable.tsx`**

Replace the full current file contents:

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

with:

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
  uniquelyRetrievableArchetypeIds?: Set<number> | null;
}

function uniquelyRetrievableLabel(archetypeId: number, ids: Set<number> | null): string {
  if (ids === null) return 'Unavailable';
  return ids.has(archetypeId) ? 'Yes' : 'No';
}

function CrewTable({
  crew,
  collections,
  showCollectionsNames,
  uniquelyRetrievableArchetypeIds,
}: CrewTableProps) {
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
            {uniquelyRetrievableArchetypeIds !== undefined && <TableCell>Uniquely Retrievable</TableCell>}
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
                {uniquelyRetrievableArchetypeIds !== undefined && (
                  <TableCell>{uniquelyRetrievableLabel(c.archetype_id, uniquelyRetrievableArchetypeIds)}</TableCell>
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
          colSpan={(showCollectionsNames ? 8 : 7) + (uniquelyRetrievableArchetypeIds !== undefined ? 1 : 0)}
        />
      </Table>
    </TableContainer>
  );
}

export default CrewTable;
```

(`uniquelyRetrievableArchetypeIds !== undefined` is the single gate used consistently for the header cell, each row's cell, and the `colSpan` — `null` and a real `Set` both count as "shown," only `undefined` hides the column. This is a pure addition: every existing caller passes nothing for this prop, so it stays `undefined`, and every existing rendering path — header, rows, `colSpan` — is byte-identical to before for them.)

- [ ] **Step 2: Create `client/src/pages/ThreeFiveStarsCrewPage.tsx`**

```tsx
import { usePageData } from '../hooks/usePageData';
import { useCrewCatalog } from '../hooks/useCrewCatalog';
import { getCrewList } from '../crew/getters';
import { filterByRarity } from '../crew/filters';
import { defaultCrewComparator, sortCrew } from '../crew/sorters';
import { getCollectionsList } from '../collections/getters';
import { getUniquelyRetrievableArchetypeIds } from '../catalog/getters';
import { useSearch } from '../lib/useSearch';
import CrewTable from '../crew/CrewTable';
import PageShell from '../layout/PageShell';
import TableSearchBar from '../components/TableSearchBar';

function ThreeFiveStarsCrewPage() {
  const { data: catalog, loading: catalogLoading, error: catalogError } = useCrewCatalog();
  const { data, loading, error, refresh, loaded } = usePageData(catalogLoading);

  const collections = data ? getCollectionsList(data) : [];
  const crew = data
    ? sortCrew(filterByRarity(getCrewList(data), { rarity: 3, maxRarity: 5 }), defaultCrewComparator(collections))
    : [];
  const uniquelyRetrievableArchetypeIds = catalog
    ? getUniquelyRetrievableArchetypeIds(catalog)
    : catalogError
      ? null
      : new Set<number>();
  const { query, setQuery, filteredItems: filteredCrew, active } = useSearch(crew, (c) => [c.name]);

  return (
    <PageShell
      title="3/5 Stars Crew"
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={filteredCrew.length}
      totalCount={crew.length}
      emptyMessage={active && filteredCrew.length === 0 ? 'No results found for your search.' : 'No crew at 3/5 stars.'}
      titleActions={<TableSearchBar value={query} onChange={setQuery} ariaLabel="Search 3/5 Stars Crew by name" />}
    >
      <CrewTable
        crew={filteredCrew}
        collections={collections}
        showCollectionsNames={true}
        uniquelyRetrievableArchetypeIds={uniquelyRetrievableArchetypeIds}
      />
    </PageShell>
  );
}

export default ThreeFiveStarsCrewPage;
```

- [ ] **Step 3: Rewire `client/src/routes.tsx`**

Replace:

```tsx
import OverviewPage from './pages/OverviewPage';
import FiveStarsCrewPage from './pages/FiveStarsCrewPage';
import ThreeFourStarsCrewPage from './pages/ThreeFourStarsCrewPage';
```

with:

```tsx
import OverviewPage from './pages/OverviewPage';
import FiveStarsCrewPage from './pages/FiveStarsCrewPage';
import ThreeFiveStarsCrewPage from './pages/ThreeFiveStarsCrewPage';
import ThreeFourStarsCrewPage from './pages/ThreeFourStarsCrewPage';
```

Replace:

```tsx
      { label: '5 Stars Crew', path: '/5-stars-crew', element: <FiveStarsCrewPage /> },
      { label: '3/4 Stars crew', path: '/3-4-stars-crew', element: <ThreeFourStarsCrewPage /> },
```

with:

```tsx
      { label: '5 Stars Crew', path: '/5-stars-crew', element: <FiveStarsCrewPage /> },
      { label: '3/5 Stars Crew', path: '/3-5-stars-crew', element: <ThreeFiveStarsCrewPage /> },
      { label: '3/4 Stars crew', path: '/3-4-stars-crew', element: <ThreeFourStarsCrewPage /> },
```

Everything else in `routes.tsx` is untouched.

- [ ] **Step 4: Build and lint**

Run: `npm run build -w client` — expect success, 0 errors.
Run: `npm run lint -w client` — expect 0 errors, same pre-existing warning count as before this feature.

- [ ] **Step 5: Real-browser verification**

**Before starting the dev server**, delete any existing `server/data/crew-catalog-cache.json` in this worktree (per the Global Constraints note — a cache predating this feature lacks `uniquely_retrievable` and will make every row show "No" until it naturally refetches, up to 24h later). The real, live-refreshed `server/data/player-cache.json` should already be seeded in this worktree (per this project's established worktree-setup convention) — if it's missing, copy it from the main checkout.

Start the dev server: `npm run dev` (root). Using the `playwright` library directly (or the `mcp__playwright__*`/`mcp__chrome-devtools__*` MCP tools if available — see `CLAUDE.md`), navigate to `/` and:

1. Confirm the Crew nav flyout shows "3/5 Stars Crew" immediately after "5 Stars Crew" and before "3/4 Stars crew".
2. Navigate to `/3-5-stars-crew`. Confirm the table header row's last column reads "Uniquely Retrievable", after "Collections names".
3. Read the actual rendered rows (per-cell reads — do not use a whole-row/concatenated text extraction) and confirm exactly 5 rows, and that the "Uniquely Retrievable" cell for each matches the Global Constraints table above (or, if the live catalog/player data has changed since this plan was written, cross-check whichever rows actually appear against a fresh manual check of the live `https://datacore.app/structured/crew.json` for those specific archetype IDs — state explicitly in your report which case applied).
4. Confirm the other columns (#, Image, Stars, Name, Level, Items to equip, Total collections, Collections names) render exactly as they do on "5 Stars Crew"/"3/4 Stars crew" — i.e., no regression to the shared `CrewTable` component.
5. Navigate to at least 2 of the other 5 `CrewTable`-based pages (e.g. "5 Stars Crew" and "3/4 Stars crew") and confirm they render exactly as before — no extra "Uniquely Retrievable" column, no layout shift, no console errors. This is the key regression check for the "modular, opt-in" requirement.

Stop the dev server afterward (kill only the process this step started — confirm ownership via the working-directory/port before killing anything if a port conflict comes up; if the port is already occupied by the user's own separately-running dev server, do not kill it — run on an alternate port instead, same as established practice on this project).

- [ ] **Step 6: Commit**

```bash
git add client/src/crew/CrewTable.tsx client/src/pages/ThreeFiveStarsCrewPage.tsx client/src/routes.tsx
git commit -m "Add 3/5 Stars Crew page with Uniquely Retrievable column"
```
