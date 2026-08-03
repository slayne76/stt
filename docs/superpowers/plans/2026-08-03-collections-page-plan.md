# Collections Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new "Collections" page: one collapsible table row per distinct collection, each expanding to show a curated, tiered, sorted subset of owned crew linked to that collection.

**Architecture:** Extend the existing `crew/` and `collections/` modules with new pure logic (a generalized crew-tier classifier, two new sort comparators, a reverse-direction collection→crew filter), then build new presentational components on top, following the same page-scaffold pattern every existing page uses. Two tasks: the data layer (classification, sorting, filtering — verified against real data) first, then the UI layer (components, page, route/nav) on top of it.

**Tech Stack:** Same as the existing client workspace — React 19, TypeScript (strict), MUI (including `@mui/icons-material`, already a dependency), no new dependencies.

## Global Constraints

- **Tier classification** (`getCrewTier`, generalizes across every `max_rarity`, not just 4):
  - Already-Immortalized crew (`isImmortalized`) → excluded (`null`).
  - Crew more than one star below their ceiling (`rarity < max_rarity - 1`) → excluded (`null`). This is the corrected rule — the first spec draft included *any* `rarity < max_rarity`, which the user explicitly narrowed to exactly one star short.
  - Crew exactly one star below their ceiling (`rarity === max_rarity - 1`) → `'leveling'`.
  - Crew at their ceiling (`rarity === max_rarity`) → `'ready'` if `isReadyToImmortalize`, else `'needsWork'`.
- Verified against real data (`example-data.json`, 597 crew): `leveling: 58, ready: 10, needsWork: 43`, `486` excluded. The "Fully Functional" collection shrinks from 8 qualifying crew (first draft's looser rule) to exactly 2 (Dr. Brown/ready, Lal/needsWork) under the corrected rule.
- **Sort priority** for a collection's crew list: `byTierAsc(items), byMaxRarityDesc, byLevelDesc, byEquipmentSlotsRemainingDesc, byNameAsc` — ready before needsWork before leveling; within a tier, higher `max_rarity` first; then level desc, slots desc, name asc as further tiebreaks.
- **Verified worked example — "The Neutral Zone"** (4 qualifying crew), must sort to exactly:
  ```
  4/4 ready       Commander Sela         (lvl 100, slots -1)
  4/4 needsWork   Reclamation Narissa    (lvl 70,  slots -1)
  4/4 needsWork   Zhaban                 (lvl 30,  slots -1)
  1/2 leveling    Telek R'Mor            (lvl 1,   slots -4)
  ```
- **Circular-import avoidance (resolves a gap in the spec's illustrative code):** `crew/sorters.ts` already imports `getCollectionCount` from `collections/getters.ts`. The spec showed `getCollectionCrew` doing both filtering AND sorting, which would require `collections/getters.ts` to import comparators back from `crew/sorters.ts` — a cycle. Instead, `getCollectionCrew` (in `collections/getters.ts`) returns **only the filtered, unsorted** qualifying crew list; sorting is composed at the call site (`CollectionsTable.tsx`, Task 2), exactly like every existing page already composes `filterX(...)` and `sortCrew(..., combineComparators(...))` as separate steps rather than one fused function.
- `byTierAsc(items)` assumes every crew passed to it already has a non-`null` tier (i.e., it's called only after filtering with `getCollectionCrew`, which excludes `null`-tier crew) — it uses a non-null assertion (`!`) on `getCrewTier(...)` for this reason. Never call it on an unfiltered crew list.
- No changes to `CrewTable`, `StarRating`, `filterByRarity`, `filterReadyToImmortalize`, `filterNeedsWork`, `crewBelongsToCollection`, `getCrewCollections`, `getCollectionCount`, `byCollectionCountDesc`, or any existing comparator's signature.
- No pagination/truncation of a collection's crew list (confirmed unnecessary — largest real collection has 21 qualifying crew).
- Every collection gets a row regardless of qualifying-crew count (25 of 88 currently have zero) — a zero-match row shows "No crew match." instead of being omitted.
- Collections are sorted alphabetically by name before being handed to the table.
- Collapsible rows start **expanded** by default (all collection ids initialized into the expanded set).
- A `tier === 'ready'` crew's name renders **bold**, with a small MUI `Chip` reading "Ready" next to it.
- New route `/collections`, nav label "Collections", added alongside the existing 5 nav entries/routes.
- TypeScript strict mode stays on; no new dependencies added.
- No test framework — verification via type-check, lint, a throwaway data-driven verification script (Task 1) against the real `example-data.json`, and manual dev-server checks (Task 2).

---

### Task 1: Crew tier classification, new comparators, and the reverse collection→crew getter

**Files:**
- Modify: `client/src/crew/getters.ts`
- Modify: `client/src/crew/sorters.ts`
- Modify: `client/src/collections/getters.ts`

**Interfaces:**
- Consumes: `CrewMember` (`client/src/types/crew.ts`), `OwnedItem` (`client/src/types/item.ts`), `Collection` (`client/src/types/collection.ts`), `isImmortalized`/`isReadyToImmortalize`/`getEquipmentSlotsRemaining` (`client/src/crew/getters.ts`, pre-existing, unchanged), `crewBelongsToCollection` (`client/src/collections/getters.ts`, pre-existing, unchanged) — all pre-existing.
- Produces: `CrewTier` type (`'ready' | 'needsWork' | 'leveling'`) and `getCrewTier(crew: CrewMember, items: OwnedItem[]): CrewTier | null` — new exports from `client/src/crew/getters.ts`. `byTierAsc(items: OwnedItem[]): Comparator<CrewMember>` and `byMaxRarityDesc(a: CrewMember, b: CrewMember): number` — new exports from `client/src/crew/sorters.ts`. `getCollectionCrew(collection: Collection, crewList: CrewMember[], items: OwnedItem[]): CrewMember[]` (filtered, **unsorted**) — new export from `client/src/collections/getters.ts`. Task 2 imports all of these plus the pre-existing `byLevelDesc`, `byEquipmentSlotsRemainingDesc`, `byNameAsc`, `combineComparators`, `sortCrew`.

- [ ] **Step 1: Add `CrewTier` and `getCrewTier` to `client/src/crew/getters.ts`**

Append to the end of the file (after `isReadyToImmortalize`):

```ts
export type CrewTier = 'ready' | 'needsWork' | 'leveling';

export function getCrewTier(crew: CrewMember, items: OwnedItem[]): CrewTier | null {
  if (isImmortalized(crew)) return null;
  if (crew.rarity < crew.max_rarity - 1) return null;
  if (crew.rarity === crew.max_rarity - 1) return 'leveling';
  return isReadyToImmortalize(crew, items) ? 'ready' : 'needsWork';
}
```

- [ ] **Step 2: Add `byTierAsc` and `byMaxRarityDesc` to `client/src/crew/sorters.ts`**

Replace the file's top import block (everything before `export type Comparator`) with:

```ts
import type { CrewMember } from '../types/crew';
import type { Collection } from '../types/collection';
import type { OwnedItem } from '../types/item';
import { getEquipmentSlotsRemaining, getCrewTier, type CrewTier } from './getters';
import { getCollectionCount } from '../collections/getters';
```

This adds the `OwnedItem` type import and pulls `getCrewTier`/`CrewTier` in alongside the existing `getEquipmentSlotsRemaining` import — everything else in the block is unchanged from before.

Then append these two comparators to the file (placed after `byCollectionCountDesc`, before `byNameAsc`):

```ts
const TIER_ORDER: Record<CrewTier, number> = { ready: 0, needsWork: 1, leveling: 2 };

export function byTierAsc(items: OwnedItem[]): Comparator<CrewMember> {
  return (a, b) => TIER_ORDER[getCrewTier(a, items)!] - TIER_ORDER[getCrewTier(b, items)!];
}

export function byMaxRarityDesc(a: CrewMember, b: CrewMember): number {
  return b.max_rarity - a.max_rarity;
}
```

- [ ] **Step 3: Add `getCollectionCrew` to `client/src/collections/getters.ts`**

Add these two import lines alongside the file's existing three imports (`PlayerData`, `Collection`, `CrewMember` — leave those untouched):

```ts
import type { OwnedItem } from '../types/item';
import { getCrewTier } from '../crew/getters';
```

Then append this function at the end of the file:

```ts
export function getCollectionCrew(collection: Collection, crewList: CrewMember[], items: OwnedItem[]): CrewMember[] {
  return crewList.filter(
    (crew) => crewBelongsToCollection(crew, collection) && getCrewTier(crew, items) !== null
  );
}
```

**This deliberately returns an unsorted list** — sorting is composed at the call site in Task 2, to avoid a circular import (see Global Constraints).

- [ ] **Step 4: Verify against real data**

`example-data.json` (gitignored, real personal game data) is at the repo root. Create a throwaway script at `client/src/collections/__verify.ts` (deleted in Step 6, never committed):

```ts
import { readFileSync } from 'node:fs';
import { getCrewList, getOwnedItems, getCrewTier } from '../crew/getters';
import { byTierAsc, byMaxRarityDesc, byLevelDesc, byEquipmentSlotsRemainingDesc, byNameAsc, combineComparators, sortCrew } from '../crew/sorters';
import { getCollectionsList, getCollectionCrew } from './getters';

const raw = JSON.parse(readFileSync('example-data.json', 'utf-8')) as Record<string, unknown>;
const crew = getCrewList(raw);
const items = getOwnedItems(raw);
const collections = getCollectionsList(raw);

const tierCounts: Record<string, number> = {};
for (const c of crew) {
  const tier = getCrewTier(c, items) ?? 'excluded';
  tierCounts[tier] = (tierCounts[tier] ?? 0) + 1;
}
console.log('tier counts:', tierCounts);

function sortedCollectionCrew(name: string) {
  const collection = collections.find((c) => c.name === name);
  if (!collection) {
    console.log(`collection not found: ${name}`);
    return [];
  }
  return sortCrew(
    getCollectionCrew(collection, crew, items),
    combineComparators(byTierAsc(items), byMaxRarityDesc, byLevelDesc, byEquipmentSlotsRemainingDesc, byNameAsc)
  );
}

const fullyFunctional = sortedCollectionCrew('Fully Functional');
console.log('Fully Functional count:', fullyFunctional.length);
fullyFunctional.forEach((c) => console.log(`  ${c.rarity}/${c.max_rarity} tier=${getCrewTier(c, items)} lvl=${c.level} ${c.name}`));

const neutralZone = sortedCollectionCrew('The Neutral Zone');
console.log('The Neutral Zone count:', neutralZone.length);
neutralZone.forEach((c) => console.log(`  ${c.rarity}/${c.max_rarity} tier=${getCrewTier(c, items)} lvl=${c.level} ${c.name}`));

const sizes = collections.map((col) => getCollectionCrew(col, crew, items).length);
console.log('collections with zero qualifying crew:', sizes.filter((s) => s === 0).length, 'of', collections.length);
console.log('max qualifying crew for any collection:', Math.max(...sizes));
```

Run from the **repo root**: `npx tsx client/src/collections/__verify.ts`

Expected output:
- `tier counts: { leveling: 58, ready: 10, needsWork: 43, excluded: 486 }`
- `Fully Functional count: 2`
  - `4/4 tier=ready lvl=100 Dr. Brown`
  - `4/4 tier=needsWork lvl=50 Lal`
- `The Neutral Zone count: 4`
  - `4/4 tier=ready lvl=100 Commander Sela`
  - `4/4 tier=needsWork lvl=70 Reclamation Narissa`
  - `4/4 tier=needsWork lvl=30 Zhaban`
  - `1/2 tier=leveling lvl=1 Telek R'Mor`
- `collections with zero qualifying crew: 25 of 88`
- `max qualifying crew for any collection: 21`

If any of these don't match, do not proceed — re-check the classification/sort logic against this plan's Global Constraints before moving on.

- [ ] **Step 5: Delete the throwaway verification script**

```bash
rm client/src/collections/__verify.ts
```

- [ ] **Step 6: Build and lint check**

Run: `npm run build -w client`
Expected: exits 0.

Run: `npm run lint -w client`
Expected: exits 0, no errors.

- [ ] **Step 7: Commit**

```bash
git add client/src/crew/getters.ts client/src/crew/sorters.ts client/src/collections/getters.ts
git commit -m "Add crew tier classification and reverse collection-to-crew getter"
```

---

### Task 2: Collections page, collapsible table, crew list component, route/nav

**Files:**
- Create: `client/src/collections/CollectionCrewList.tsx`
- Create: `client/src/collections/CollectionsTable.tsx`
- Create: `client/src/pages/CollectionsPage.tsx`
- Modify: `client/src/layout/AppLayout.tsx`
- Modify: `client/src/App.tsx`

**Interfaces:**
- Consumes: `getCrewTier` (`client/src/crew/getters.ts`, Task 1), `byTierAsc`, `byMaxRarityDesc`, `byLevelDesc`, `byEquipmentSlotsRemainingDesc`, `byNameAsc`, `combineComparators`, `sortCrew` (`client/src/crew/sorters.ts`, Task 1 + pre-existing), `getCollectionCrew`, `getCollectionsList` (`client/src/collections/getters.ts`, Task 1 + pre-existing), `getCrewList`, `getOwnedItems` (`client/src/crew/getters.ts`, pre-existing), `usePlayerData` (pre-existing), `StarRating` (pre-existing).

- [ ] **Step 1: Create `client/src/collections/CollectionCrewList.tsx`**

```tsx
import { Box, Chip, Typography } from '@mui/material';
import type { CrewMember } from '../types/crew';
import type { OwnedItem } from '../types/item';
import { getCrewTier, getEquipmentSlotsRemaining } from '../crew/getters';
import StarRating from '../crew/StarRating';

export interface CollectionCrewListProps {
  crew: CrewMember[];
  items: OwnedItem[];
}

function CollectionCrewList({ crew, items }: CollectionCrewListProps) {
  return (
    <Box sx={{ py: 1 }}>
      {crew.map((c) => {
        const isReady = getCrewTier(c, items) === 'ready';
        return (
          <Box key={c.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
            <StarRating rarity={c.rarity} maxRarity={c.max_rarity} />
            <Typography sx={{ fontWeight: isReady ? 'bold' : 'normal' }}>{c.name}</Typography>
            {isReady && <Chip label="Ready" size="small" color="success" />}
            <Typography color="text.secondary" sx={{ ml: 'auto' }}>
              Lv {c.level}
            </Typography>
            <Typography color="text.secondary" sx={{ minWidth: 80, textAlign: 'right' }}>
              Items: {getEquipmentSlotsRemaining(c)}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

export default CollectionCrewList;
```

- [ ] **Step 2: Create `client/src/collections/CollectionsTable.tsx`**

```tsx
import { Fragment, useState } from 'react';
import {
  Collapse,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { KeyboardArrowDown, KeyboardArrowUp } from '@mui/icons-material';
import type { CrewMember } from '../types/crew';
import type { Collection } from '../types/collection';
import type { OwnedItem } from '../types/item';
import { getCollectionCrew } from './getters';
import {
  byEquipmentSlotsRemainingDesc,
  byLevelDesc,
  byMaxRarityDesc,
  byNameAsc,
  byTierAsc,
  combineComparators,
  sortCrew,
} from '../crew/sorters';
import CollectionCrewList from './CollectionCrewList';

export interface CollectionsTableProps {
  collections: Collection[];
  crew: CrewMember[];
  items: OwnedItem[];
}

function CollectionsTable({ collections, crew, items }: CollectionsTableProps) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(
    () => new Set(collections.map((c) => c.id))
  );

  const toggle = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell />
            <TableCell>Collection</TableCell>
            <TableCell align="right">Crew</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {collections.map((collection) => {
            const qualifyingCrew = sortCrew(
              getCollectionCrew(collection, crew, items),
              combineComparators(
                byTierAsc(items),
                byMaxRarityDesc,
                byLevelDesc,
                byEquipmentSlotsRemainingDesc,
                byNameAsc
              )
            );
            const expanded = expandedIds.has(collection.id);
            return (
              <Fragment key={collection.id}>
                <TableRow>
                  <TableCell>
                    <IconButton size="small" onClick={() => toggle(collection.id)}>
                      {expanded ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                    </IconButton>
                  </TableCell>
                  <TableCell>{collection.name}</TableCell>
                  <TableCell align="right">{qualifyingCrew.length}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={3}>
                    <Collapse in={expanded} timeout="auto" unmountOnExit>
                      {qualifyingCrew.length === 0 ? (
                        <Typography color="text.secondary" sx={{ py: 1 }}>
                          No crew match.
                        </Typography>
                      ) : (
                        <CollectionCrewList crew={qualifyingCrew} items={items} />
                      )}
                    </Collapse>
                  </TableCell>
                </TableRow>
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default CollectionsTable;
```

- [ ] **Step 3: Create `client/src/pages/CollectionsPage.tsx`**

```tsx
import { Alert, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { usePlayerData } from '../hooks/usePlayerData';
import { getCrewList, getOwnedItems } from '../crew/getters';
import { getCollectionsList } from '../collections/getters';
import CollectionsTable from '../collections/CollectionsTable';

function CollectionsPage() {
  const { data, loading, error, refresh } = usePlayerData();

  const collections = data
    ? [...getCollectionsList(data)].sort((a, b) => a.name.localeCompare(b.name))
    : [];
  const crew = data ? getCrewList(data) : [];
  const items = data ? getOwnedItems(data) : [];

  const loaded = !loading && !error && data;

  return (
    <Stack spacing={2}>
      <Typography variant="h4">Collections{loaded ? ` (${collections.length})` : ''}</Typography>

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
        collections.length === 0 ? (
          <Typography color="text.secondary">No collections found.</Typography>
        ) : (
          <CollectionsTable collections={collections} crew={crew} items={items} />
        )
      )}
    </Stack>
  );
}

export default CollectionsPage;
```

- [ ] **Step 4: Add the nav entry in `client/src/layout/AppLayout.tsx`**

Change:

```ts
const NAV_ITEMS = [
  { label: 'Overview', path: '/' },
  { label: '3/4 Stars crew', path: '/3-4-stars-crew' },
  { label: '4/5 Stars crew', path: '/4-5-stars-crew' },
  { label: '4/4 Stars crew (ready)', path: '/4-4-stars-crew-ready' },
  { label: '4/4 Stars crew', path: '/4-4-stars-crew' },
];
```

to:

```ts
const NAV_ITEMS = [
  { label: 'Overview', path: '/' },
  { label: '3/4 Stars crew', path: '/3-4-stars-crew' },
  { label: '4/5 Stars crew', path: '/4-5-stars-crew' },
  { label: '4/4 Stars crew (ready)', path: '/4-4-stars-crew-ready' },
  { label: '4/4 Stars crew', path: '/4-4-stars-crew' },
  { label: 'Collections', path: '/collections' },
];
```

- [ ] **Step 5: Register the route in `client/src/App.tsx`**

Replace the file's contents with:

```tsx
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { PlayerDataProvider } from './context/PlayerDataContext';
import AppLayout from './layout/AppLayout';
import OverviewPage from './pages/OverviewPage';
import ThreeFourStarsCrewPage from './pages/ThreeFourStarsCrewPage';
import FourFiveStarsCrewPage from './pages/FourFiveStarsCrewPage';
import FourFourStarsCrewReadyPage from './pages/FourFourStarsCrewReadyPage';
import FourFourStarsCrewPage from './pages/FourFourStarsCrewPage';
import CollectionsPage from './pages/CollectionsPage';

function App() {
  return (
    <PlayerDataProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/3-4-stars-crew" element={<ThreeFourStarsCrewPage />} />
            <Route path="/4-5-stars-crew" element={<FourFiveStarsCrewPage />} />
            <Route path="/4-4-stars-crew-ready" element={<FourFourStarsCrewReadyPage />} />
            <Route path="/4-4-stars-crew" element={<FourFourStarsCrewPage />} />
            <Route path="/collections" element={<CollectionsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </PlayerDataProvider>
  );
}

export default App;
```

- [ ] **Step 6: Build and lint check**

Run: `npm run build -w client`
Expected: exits 0.

Run: `npm run lint -w client`
Expected: exits 0, no errors.

- [ ] **Step 7: Manual dev-server check**

With `server/.env` absent, start `npm run dev -w server` and `npm run dev -w client` in the background (use alternate ports if the defaults are occupied by an unrelated process, and fully revert any temporary port edits before committing).

Run: `curl -s http://localhost:5173/api/player` (or your alternate port) — expect the same 502 `UPSTREAM_AUTH_FAILED` JSON as before, confirming nothing in the server/proxy chain is affected by this purely client-side change.

Run: `curl -s http://localhost:5173/` — expect `id="root"` in the response, confirming the client still serves its shell with the new page/route compiled in.

Stop both background processes afterward.

- [ ] **Step 8: Commit**

```bash
git add client/src/collections/CollectionCrewList.tsx client/src/collections/CollectionsTable.tsx client/src/pages/CollectionsPage.tsx client/src/layout/AppLayout.tsx client/src/App.tsx
git commit -m "Add Collections page with collapsible per-collection crew lists"
```

**Manual follow-up (requires your real credentials, not part of this task):** with a real `STT_SESSION_COOKIE` set, open `/collections` and confirm the tiers, highlighting, and sort order match what you expect against your own roster.
