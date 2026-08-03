# Immortalization Concept + Two 4/4 Stars Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the "Immortalized"/"ready to immortalize" crew concepts (ownership-aware equipment completeness) and two new pages splitting "4/4 Stars crew" into a "ready" subset (level 100, all missing items owned) and a "needs work" subset (everything else at 4/4, excluding already-Immortalized crew).

**Architecture:** Extend the existing purpose-grouped `crew/` module (new getters, new filters) with one new narrow type for owned inventory items, then two new pages that follow the exact same structure as `FourFiveStarsCrewPage.tsx` and reuse `CrewTable` unmodified. Split into two tasks: the data layer (types/getters/filters, verified against real data) first, then the two pages built on top of it.

**Tech Stack:** Same as the existing client workspace — React 19, TypeScript (strict), MUI, react-router-dom, no new dependencies.

## Global Constraints

- `isImmortalized(crew)`: `rarity === max_rarity && level === 100 && equipment.length === 4`.
- `isReadyToImmortalize(crew, items)`: `rarity === max_rarity && level === 100 && getEquipmentSlotsRemaining(crew) < 0 && areAllMissingItemsOwned(crew, items)` — "ready" is defined by ownership completeness of whatever is missing, not by a fixed missing-slot count (a crew missing all 4 slots but owning all 4 items still counts as ready).
- `filterNeedsWork(crew, items)` = crew that is neither `isImmortalized` nor `isReadyToImmortalize` — this is the resolved edge case: a level-100 crew missing exactly one item it does NOT own falls here, not on the "ready" page.
- `OwnedItem` type stays narrow: only `archetype_id` (the only field used).
- `CrewMember` gains `equipment_slots: { level: number; archetype: number }[]` — always exactly 4 entries per the real data.
- No changes to `CrewTable`, `StarRating`, `getCrewList`, `filterByRarity`, or the sorters — both new pages reuse them exactly as-is.
- No new table column for ownership status (confirmed with the user) — the page split itself encodes the distinction.
- New routes: `/4-4-stars-crew-ready` (nav label "4/4 Stars crew (ready)") and `/4-4-stars-crew` (nav label "4/4 Stars crew"), added alongside the three existing nav entries/routes.
- TypeScript strict mode stays on; no new dependencies added.
- No test framework — verification via type-check, lint, a throwaway data-driven verification script (Task 1) against the real `example-data.json`, and manual dev-server checks (Task 2).

---

### Task 1: Owned-item type, Immortalization getters, and new filters

**Files:**
- Create: `client/src/types/item.ts`
- Modify: `client/src/types/crew.ts`
- Modify: `client/src/crew/getters.ts`
- Modify: `client/src/crew/filters.ts`

**Interfaces:**
- Consumes: `PlayerData` (`client/src/types/player.ts`), `CrewMember` (`client/src/types/crew.ts`), `getEquipmentSlotsRemaining` (`client/src/crew/getters.ts`) — all pre-existing.
- Produces: `OwnedItem` type (`{ archetype_id: number }`). `getOwnedItems(data: PlayerData): OwnedItem[]`, `getMissingEquipmentArchetypeIds(crew: CrewMember): number[]`, `areAllMissingItemsOwned(crew: CrewMember, items: OwnedItem[]): boolean`, `isImmortalized(crew: CrewMember): boolean`, `isReadyToImmortalize(crew: CrewMember, items: OwnedItem[]): boolean` — all new exports from `client/src/crew/getters.ts`. `filterReadyToImmortalize(crew: CrewMember[], items: OwnedItem[]): CrewMember[]`, `filterNeedsWork(crew: CrewMember[], items: OwnedItem[]): CrewMember[]` — new exports from `client/src/crew/filters.ts`. Task 2's pages import all of these plus the pre-existing `getCrewList`/`filterByRarity`.

- [ ] **Step 1: Create `client/src/types/item.ts`**

```ts
export interface OwnedItem {
  archetype_id: number;
}
```

- [ ] **Step 2: Add `equipment_slots` to `CrewMember` in `client/src/types/crew.ts`**

Change:

```ts
export interface CrewMember {
  id: number;
  symbol: string;
  name: string;
  short_name: string;
  rarity: number;
  max_rarity: number;
  level: number;
  equipment: [number, number][];
}
```

to:

```ts
export interface CrewMember {
  id: number;
  symbol: string;
  name: string;
  short_name: string;
  rarity: number;
  max_rarity: number;
  level: number;
  equipment: [number, number][];
  equipment_slots: { level: number; archetype: number }[];
}
```

- [ ] **Step 3: Add the new getters to `client/src/crew/getters.ts`**

Append these functions to the existing file (keep `getCrewList` and `getEquipmentSlotsRemaining` exactly as-is), adding an import for `OwnedItem` at the top:

```ts
import type { OwnedItem } from '../types/item';
```

```ts
export function getOwnedItems(data: PlayerData): OwnedItem[] {
  const player = data.player as Record<string, unknown> | undefined;
  const character = player?.character as Record<string, unknown> | undefined;
  const items = character?.items;
  return Array.isArray(items) ? (items as OwnedItem[]) : [];
}

export function getMissingEquipmentArchetypeIds(crew: CrewMember): number[] {
  const filledSlots = new Set(crew.equipment.map(([slot]) => slot));
  const missingIndices = [0, 1, 2, 3].filter((i) => !filledSlots.has(i));
  return missingIndices.map((i) => crew.equipment_slots[i].archetype);
}

export function areAllMissingItemsOwned(crew: CrewMember, items: OwnedItem[]): boolean {
  const missingArchetypeIds = getMissingEquipmentArchetypeIds(crew);
  return missingArchetypeIds.every((archetypeId) => items.some((item) => item.archetype_id === archetypeId));
}

export function isImmortalized(crew: CrewMember): boolean {
  return crew.rarity === crew.max_rarity && crew.level === 100 && crew.equipment.length === 4;
}

export function isReadyToImmortalize(crew: CrewMember, items: OwnedItem[]): boolean {
  return (
    crew.rarity === crew.max_rarity &&
    crew.level === 100 &&
    getEquipmentSlotsRemaining(crew) < 0 &&
    areAllMissingItemsOwned(crew, items)
  );
}
```

- [ ] **Step 4: Add the new filters to `client/src/crew/filters.ts`**

Append these functions to the existing file (keep `filterByRarity` exactly as-is), adding imports at the top:

```ts
import type { OwnedItem } from '../types/item';
import { isImmortalized, isReadyToImmortalize } from './getters';
```

```ts
export function filterReadyToImmortalize(crew: CrewMember[], items: OwnedItem[]): CrewMember[] {
  return crew.filter((c) => isReadyToImmortalize(c, items));
}

export function filterNeedsWork(crew: CrewMember[], items: OwnedItem[]): CrewMember[] {
  return crew.filter((c) => !isImmortalized(c) && !isReadyToImmortalize(c, items));
}
```

- [ ] **Step 5: Verify against real data**

`example-data.json` (gitignored, real personal game data) is at the repo root. Create a throwaway script at `client/src/crew/__verify.ts` (deleted in Step 6, never committed):

```ts
import { readFileSync } from 'node:fs';
import { getCrewList, getOwnedItems, isImmortalized, isReadyToImmortalize } from './getters';
import { filterByRarity, filterReadyToImmortalize, filterNeedsWork } from './filters';

const raw = JSON.parse(readFileSync('example-data.json', 'utf-8')) as Record<string, unknown>;
const crew = getCrewList(raw);
const items = getOwnedItems(raw);
console.log('total crew:', crew.length, 'total items:', items.length);

const fourFour = filterByRarity(crew, { rarity: 4, maxRarity: 4 });
console.log('4/4 crew:', fourFour.length);

const ready = filterReadyToImmortalize(fourFour, items);
const needsWork = filterNeedsWork(fourFour, items);
console.log('ready:', ready.length, 'needsWork:', needsWork.length, 'sum matches total:', ready.length + needsWork.length === fourFour.length);

const veradDax = crew.find((c) => c.name === 'Verad Dax');
if (veradDax) {
  console.log('Verad Dax is ready:', isReadyToImmortalize(veradDax, items));
}

const tribbleSpock = crew.find((c) => c.name === 'Tribble Spock');
if (tribbleSpock) {
  console.log('Tribble Spock is ready:', isReadyToImmortalize(tribbleSpock, items));
  console.log('Tribble Spock is in needsWork:', needsWork.some((c) => c.id === tribbleSpock.id));
}

console.log('any immortalized crew leaked into ready or needsWork:', [...ready, ...needsWork].some((c) => isImmortalized(c)));
```

Run from the **repo root**: `npx tsx client/src/crew/__verify.ts`

Expected output:
- `4/4 crew: 52`
- `ready: 10 needsWork: 42 sum matches total: true`
- `Verad Dax is ready: true`
- `Tribble Spock is ready: false`
- `Tribble Spock is in needsWork: true`
- `any immortalized crew leaked into ready or needsWork: false`

If any of these don't match, do not proceed — re-check the getter/filter logic against the real data structure before moving on.

- [ ] **Step 6: Delete the throwaway verification script**

```bash
rm client/src/crew/__verify.ts
```

- [ ] **Step 7: Build and lint check**

Run: `npm run build -w client`
Expected: exits 0.

Run: `npm run lint -w client`
Expected: exits 0, no errors.

- [ ] **Step 8: Commit**

```bash
git add client/src/types/item.ts client/src/types/crew.ts client/src/crew/getters.ts client/src/crew/filters.ts
git commit -m "Add Immortalization concept: owned-item type, getters, and filters"
```

---

### Task 2: Two 4/4 Stars pages, nav entries, and routes

**Files:**
- Create: `client/src/pages/FourFourStarsCrewReadyPage.tsx`
- Create: `client/src/pages/FourFourStarsCrewPage.tsx`
- Modify: `client/src/layout/AppLayout.tsx`
- Modify: `client/src/App.tsx`

**Interfaces:**
- Consumes: `usePlayerData()`, `getCrewList`, `getOwnedItems`, `filterByRarity`, `filterReadyToImmortalize`, `filterNeedsWork`, `byLevelDesc`/`byEquipmentSlotsRemainingDesc`/`byNameAsc`/`combineComparators`/`sortCrew`, `CrewTable` — all pre-existing (the last four from Task 1), unchanged.

- [ ] **Step 1: Create `client/src/pages/FourFourStarsCrewReadyPage.tsx`**

```tsx
import { Alert, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { usePlayerData } from '../hooks/usePlayerData';
import { getCrewList, getOwnedItems } from '../crew/getters';
import { filterByRarity, filterReadyToImmortalize } from '../crew/filters';
import { byEquipmentSlotsRemainingDesc, byLevelDesc, byNameAsc, combineComparators, sortCrew } from '../crew/sorters';
import CrewTable from '../crew/CrewTable';

function FourFourStarsCrewReadyPage() {
  const { data, loading, error, refresh } = usePlayerData();

  const crew = data
    ? sortCrew(
        filterReadyToImmortalize(
          filterByRarity(getCrewList(data), { rarity: 4, maxRarity: 4 }),
          getOwnedItems(data)
        ),
        combineComparators(byLevelDesc, byEquipmentSlotsRemainingDesc, byNameAsc)
      )
    : [];

  const loaded = !loading && !error && data;

  return (
    <Stack spacing={2}>
      <Typography variant="h4">4/4 Stars crew (ready){loaded ? ` (${crew.length})` : ''}</Typography>

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
          <Typography color="text.secondary">No crew ready to immortalize at 4/4 stars.</Typography>
        ) : (
          <CrewTable crew={crew} />
        )
      )}
    </Stack>
  );
}

export default FourFourStarsCrewReadyPage;
```

- [ ] **Step 2: Create `client/src/pages/FourFourStarsCrewPage.tsx`**

```tsx
import { Alert, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { usePlayerData } from '../hooks/usePlayerData';
import { getCrewList, getOwnedItems } from '../crew/getters';
import { filterByRarity, filterNeedsWork } from '../crew/filters';
import { byEquipmentSlotsRemainingDesc, byLevelDesc, byNameAsc, combineComparators, sortCrew } from '../crew/sorters';
import CrewTable from '../crew/CrewTable';

function FourFourStarsCrewPage() {
  const { data, loading, error, refresh } = usePlayerData();

  const crew = data
    ? sortCrew(
        filterNeedsWork(
          filterByRarity(getCrewList(data), { rarity: 4, maxRarity: 4 }),
          getOwnedItems(data)
        ),
        combineComparators(byLevelDesc, byEquipmentSlotsRemainingDesc, byNameAsc)
      )
    : [];

  const loaded = !loading && !error && data;

  return (
    <Stack spacing={2}>
      <Typography variant="h4">4/4 Stars crew{loaded ? ` (${crew.length})` : ''}</Typography>

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
          <Typography color="text.secondary">No crew at 4/4 stars.</Typography>
        ) : (
          <CrewTable crew={crew} />
        )
      )}
    </Stack>
  );
}

export default FourFourStarsCrewPage;
```

- [ ] **Step 3: Add the nav entries in `client/src/layout/AppLayout.tsx`**

Change:

```ts
const NAV_ITEMS = [
  { label: 'Overview', path: '/' },
  { label: '3/4 Stars crew', path: '/3-4-stars-crew' },
  { label: '4/5 Stars crew', path: '/4-5-stars-crew' },
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
];
```

- [ ] **Step 4: Register the routes in `client/src/App.tsx`**

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
          </Route>
        </Routes>
      </BrowserRouter>
    </PlayerDataProvider>
  );
}

export default App;
```

- [ ] **Step 5: Build and lint check**

Run: `npm run build -w client`
Expected: exits 0.

Run: `npm run lint -w client`
Expected: exits 0, no errors.

- [ ] **Step 6: Manual dev-server check**

With `server/.env` absent, start `npm run dev -w server` and `npm run dev -w client` in the background (use alternate ports if the defaults are occupied by an unrelated process, and fully revert any temporary port edits before committing).

Run: `curl -s http://localhost:5173/api/player` (or your alternate port) — expect the same 502 `UPSTREAM_AUTH_FAILED` JSON as before, confirming nothing in the server/proxy chain is affected by this purely client-side change.

Run: `curl -s http://localhost:5173/` — expect `id="root"` in the response, confirming the client still serves its shell with the two new pages/routes compiled in.

Stop both background processes afterward.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/FourFourStarsCrewReadyPage.tsx client/src/pages/FourFourStarsCrewPage.tsx client/src/layout/AppLayout.tsx client/src/App.tsx
git commit -m "Add two 4/4 Stars crew pages (ready / needs work)"
```

**Manual follow-up (requires your real credentials, not part of this task):** with a real `STT_SESSION_COOKIE` set, open both `/4-4-stars-crew-ready` and `/4-4-stars-crew` and confirm the split matches what you expect from your own roster.
