# Ships Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new pages, "5 Stars Ships" and "4 Stars Ships," listing the player's not-yet-fully-leveled ships at each rarity, reachable via a new hover-flyout "Ships" nav group — the app's first non-crew/collections data domain and its first nested nav item.

**Architecture:** A new `ships/` domain module (`types/ship.ts`, `ships/getters.ts`, `ships/filters.ts`, `ships/sorters.ts`, `ships/ShipsTable.tsx`), mirroring `crew/`'s defensive-cast-getter + array-filter + comparator-composition conventions exactly. One parameterized internal page (`ShipsPage`, taking `rarity`/`title` props) reused by two thin wrappers, matching every other page's `usePlayerData` + loading/error/empty/title scaffold. A new generic `NavGroupItem` component adds hover/focus-triggered flyout submenus to the sidebar, used for the one "Ships" entry. Four tasks, each independently buildable and reviewable: (1) the ship data layer, (2) filtering/sorting, (3) table + pages + routes, (4) the nav flyout — ordered so each task's build stays green and nothing depends on a task that comes later.

**Tech Stack:** Same as the existing client workspace — React 19, TypeScript (strict), MUI 6, react-router-dom 7, no new dependencies.

## Global Constraints

- **`Ship` type** (`types/ship.ts`): `{ id: number; symbol: string; name: string; rarity: number; level: number; max_level: number; schematic_id: number; schematic_gain_cost_next_level: number }`. `schematic_gain_cost_next_level` is `-1` for already-maxed ships, a real positive number otherwise — verified with zero exceptions across all 128 ships in `example-data.json`.
- **`OwnedItem` (`types/item.ts`) gains an optional `quantity?: number` field.** This is the only change to an existing type. No other existing type, getter, filter, sorter, component, or page changes.
- **A ship is "incomplete" iff `level !== max_level`** (`isShipMaxed(ship)` returns `ship.level === ship.max_level`). Only rarity 4 and 5 ships are ever incomplete in the real data — every rarity 1/2/3 ship is already maxed (verified, 0 exceptions), which is why only two pages exist.
- **Displayed level is `${level + 1}/${max_level + 1}`**, not the raw JSON values — confirmed against two real, independently-described examples (H.M.S. Bounty `level:9/max_level:9` → "10/10"; U.S.S. Reliant `level:8/max_level:9` → "9/10").
- **Schematics owned come from `player.character.items`**, not the ship object: find the item whose `archetype_id === ship.schematic_id`, read its `quantity`, default to `0` if no such item exists (true for 5 of 73 incomplete ships in the sample, all at `level: 0`). Reuses the existing `getOwnedItems(data)` from `crew/getters.ts` unmodified — no duplicate item-extraction logic.
- **Sort order, in this exact key order:** (1) `level` descending, (2) `level / max_level` descending, (3) `(schematic_gain_cost_next_level - owned)` ascending, (4) `name` ascending. Reuses `combineComparators`/`Comparator<T>` imported from `crew/sorters.ts` as-is — not extracted to a shared module (explicit decision).
- **`ShipsTable` columns, in order:** `#`, `Ship` (name), `Level` (right-aligned, the display string above), `Schematics` (right-aligned, `${owned}/${schematic_gain_cost_next_level}`). No Stars/rarity column — every row on a given page shares the same rarity already stated in the page title.
- **`ShipsPage` is internal, not directly routed** — takes `rarity: number` and `title: string` props, same pairing pattern as `FrozenDuplicatesPage`. `FiveStarsShipsPage`/`FourStarsShipsPage` are thin wrappers rendering it with fixed props.
- **New routes:** `/5-stars-ships` (nav label "5 Stars Ships"), `/4-stars-ships` (nav label "4 Stars Ships").
- **Empty-state copy:** "No incomplete ships at this rarity." — same `<Typography color="text.secondary">` pattern every other page uses.
- **Nav:** a new "Ships" flyout group is appended to the end of `AppLayout.tsx`'s nav, after "5 Stars Duplicates". Its two children are ordered "5 Stars Ships" then "4 Stars Ships" (explicit user choice — overrides this project's usual "lower number first" nav-ordering convention, for this group only). "Ships" itself is not clickable and has no route.
- **Flyout mechanics:** a new, domain-agnostic `NavGroupItem` component (`layout/NavGroupItem.tsx`). Opens on mouse-enter or focus of either the trigger row or the flyout panel; closes on a 150ms-delayed timer armed on mouse-leave/blur of either, cancelable by re-entering/re-focusing either — this tolerates diagonal mouse movement and Tab-focus moving from the trigger into a panel item without flicker-closing. Uses MUI `Popper` (portal-based, not `disablePortal`, since the `Drawer`'s paper has `overflow-y: auto` and would clip an inline flyout), anchored `placement="right-start"`. Clicking a child item navigates and closes the flyout immediately.
- No changes to `crew/getters.ts`, `crew/filters.ts`, `crew/sorters.ts`, `collections/*`, `CrewTable.tsx`, `StarRating.tsx`, or any existing page.
- TypeScript strict mode stays on; no new dependencies; `@mui/icons-material`'s `ChevronRight` is already available (same package `StarRating.tsx` already imports `Star` from).
- No automated test framework (project-wide, repeatedly-reaffirmed choice). Verification is TypeScript strict mode + ESLint + throwaway data-driven scripts against real `example-data.json` (deleted before committing) + manual dev-server/browser checks.

---

### Task 1: `Ship` type, `OwnedItem.quantity`, and `ships/getters.ts`

**Files:**
- Create: `client/src/types/ship.ts`
- Modify: `client/src/types/item.ts`
- Create: `client/src/ships/getters.ts`

**Interfaces:**
- Consumes: `PlayerData` (`types/player.ts`), `OwnedItem` (`types/item.ts`) — both pre-existing.
- Produces: `Ship` interface (`types/ship.ts`). `getShipList(data: PlayerData): Ship[]`, `isShipMaxed(ship: Ship): boolean`, `getShipSchematicsOwned(ship: Ship, items: OwnedItem[]): number`, `getShipDisplayLevel(ship: Ship): string`, `getShipSchematicsDisplay(ship: Ship, items: OwnedItem[]): string` — all new exports from `ships/getters.ts`, all used by Tasks 2 and 3.

- [ ] **Step 1: Create `client/src/types/ship.ts`**

```ts
export interface Ship {
  id: number;
  symbol: string;
  name: string;
  rarity: number;
  level: number;
  max_level: number;
  schematic_id: number;
  schematic_gain_cost_next_level: number;
}
```

- [ ] **Step 2: Add `quantity` to `OwnedItem` in `client/src/types/item.ts`**

Replace the file's contents with:

```ts
export interface OwnedItem {
  archetype_id: number;
  quantity?: number;
}
```

- [ ] **Step 3: Create `client/src/ships/getters.ts`**

```ts
import type { PlayerData } from '../types/player';
import type { Ship } from '../types/ship';
import type { OwnedItem } from '../types/item';

export function getShipList(data: PlayerData): Ship[] {
  const player = data.player as Record<string, unknown> | undefined;
  const character = player?.character as Record<string, unknown> | undefined;
  const ships = character?.ships;
  return Array.isArray(ships) ? (ships as Ship[]) : [];
}

export function isShipMaxed(ship: Ship): boolean {
  return ship.level === ship.max_level;
}

export function getShipSchematicsOwned(ship: Ship, items: OwnedItem[]): number {
  return items.find((item) => item.archetype_id === ship.schematic_id)?.quantity ?? 0;
}

export function getShipDisplayLevel(ship: Ship): string {
  return `${ship.level + 1}/${ship.max_level + 1}`;
}

export function getShipSchematicsDisplay(ship: Ship, items: OwnedItem[]): string {
  return `${getShipSchematicsOwned(ship, items)}/${ship.schematic_gain_cost_next_level}`;
}
```

- [ ] **Step 4: Verify against real data**

`example-data.json` (gitignored, real personal game data) is at the repo root. Create a throwaway script at `client/src/ships/__verify.ts` (deleted in Step 6, never committed):

```ts
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { getShipList, isShipMaxed, getShipSchematicsOwned, getShipDisplayLevel, getShipSchematicsDisplay } from './getters';
import { getOwnedItems } from '../crew/getters';

const raw = JSON.parse(readFileSync('example-data.json', 'utf-8')) as Record<string, unknown>;
const ships = getShipList(raw);
const items = getOwnedItems(raw);

assert.equal(ships.length, 128, `expected 128 ships, got ${ships.length}`);

const lowRarityNotMaxed = ships.filter((s) => s.rarity <= 3 && !isShipMaxed(s));
assert.equal(lowRarityNotMaxed.length, 0, `expected 0 non-maxed rarity<=3 ships, got ${lowRarityNotMaxed.length}`);

const reliant = ships.find((s) => s.symbol === 'fed_reliant_ship');
assert.ok(reliant, 'U.S.S. Reliant not found');
assert.equal(getShipSchematicsOwned(reliant, items), 1755);
assert.equal(getShipDisplayLevel(reliant), '9/10');
assert.equal(getShipSchematicsDisplay(reliant, items), '1755/1800');

const bounty = ships.find((s) => s.symbol === 'kdf_birdofprey_bounty_ship');
assert.ok(bounty, 'H.M.S. Bounty not found');
assert.equal(getShipDisplayLevel(bounty), '10/10');

const exeter = ships.find((s) => s.symbol === 'fed_exeter_ship');
assert.ok(exeter, 'U.S.S. Exeter not found');
assert.equal(getShipSchematicsOwned(exeter, items), 0);

console.log('MATCH: all ship getter assertions passed');
```

Run from the **repo root**: `npx tsx client/src/ships/__verify.ts`

Expected output: `MATCH: all ship getter assertions passed`, exit code 0. If any assertion throws, do not proceed — re-check `ships/getters.ts` against this plan's Global Constraints before moving on.

- [ ] **Step 5: Delete the throwaway verification script**

```bash
rm client/src/ships/__verify.ts
```

- [ ] **Step 6: Build and lint check**

Run: `npm run build -w client`
Expected: exits 0.

Run: `npm run lint -w client`
Expected: exits 0, no errors.

- [ ] **Step 7: Commit**

```bash
git add client/src/types/ship.ts client/src/types/item.ts client/src/ships/getters.ts
git commit -m "Add Ship type and ships/getters.ts for ship data extraction"
```

---

### Task 2: `ships/filters.ts` and `ships/sorters.ts`

**Files:**
- Create: `client/src/ships/filters.ts`
- Create: `client/src/ships/sorters.ts`

**Interfaces:**
- Consumes: `Ship` (`types/ship.ts`), `OwnedItem` (`types/item.ts`), `isShipMaxed`/`getShipSchematicsOwned` (`ships/getters.ts`) — all from Task 1. `Comparator<T>`/`combineComparators` (`crew/sorters.ts`) — pre-existing, reused as-is.
- Produces: `filterIncompleteShipsByRarity(ships: Ship[], rarity: number): Ship[]` (`ships/filters.ts`). `byLevelDesc`, `byLevelProgressDesc`, `byNameAsc` (all `(a: Ship, b: Ship) => number`), `byMissingSchematicsAsc(items: OwnedItem[]): Comparator<Ship>`, `sortShips(ships: Ship[], comparator: Comparator<Ship>): Ship[]` — all new exports from `ships/sorters.ts`, all used by Task 3.

- [ ] **Step 1: Create `client/src/ships/filters.ts`**

```ts
import type { Ship } from '../types/ship';
import { isShipMaxed } from './getters';

export function filterIncompleteShipsByRarity(ships: Ship[], rarity: number): Ship[] {
  return ships.filter((s) => s.rarity === rarity && !isShipMaxed(s));
}
```

- [ ] **Step 2: Create `client/src/ships/sorters.ts`**

```ts
import type { Ship } from '../types/ship';
import type { OwnedItem } from '../types/item';
import type { Comparator } from '../crew/sorters';
import { getShipSchematicsOwned } from './getters';

export function byLevelDesc(a: Ship, b: Ship): number {
  return b.level - a.level;
}

export function byLevelProgressDesc(a: Ship, b: Ship): number {
  return b.level / b.max_level - a.level / a.max_level;
}

export function byMissingSchematicsAsc(items: OwnedItem[]): Comparator<Ship> {
  return (a, b) => {
    const remainingA = a.schematic_gain_cost_next_level - getShipSchematicsOwned(a, items);
    const remainingB = b.schematic_gain_cost_next_level - getShipSchematicsOwned(b, items);
    return remainingA - remainingB;
  };
}

export function byNameAsc(a: Ship, b: Ship): number {
  return a.name.localeCompare(b.name);
}

export function sortShips(ships: Ship[], comparator: Comparator<Ship>): Ship[] {
  return [...ships].sort(comparator);
}
```

- [ ] **Step 3: Verify against real data**

Create a throwaway script at `client/src/ships/__verify.ts` (deleted in Step 5, never committed):

```ts
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { getShipList } from './getters';
import { getOwnedItems } from '../crew/getters';
import { filterIncompleteShipsByRarity } from './filters';
import { byLevelDesc, byLevelProgressDesc, byMissingSchematicsAsc, byNameAsc, sortShips } from './sorters';
import { combineComparators } from '../crew/sorters';

const raw = JSON.parse(readFileSync('example-data.json', 'utf-8')) as Record<string, unknown>;
const ships = getShipList(raw);
const items = getOwnedItems(raw);
const comparator = combineComparators(byLevelDesc, byLevelProgressDesc, byMissingSchematicsAsc(items), byNameAsc);

const fourStar = sortShips(filterIncompleteShipsByRarity(ships, 4), comparator);
const fiveStar = sortShips(filterIncompleteShipsByRarity(ships, 5), comparator);

const expectedFourStar = [
  "U.S.S. Yeager", "Generational NX-01 Enterprise", "Kovaalan Ship", "Vidiian Warship",
  "U.S.S. T'Kumbra", "The Dove", "Karemma Ship", "Gorn Raider", "Malon Export Vessel",
  "Tsunkatse Vessel", "I.S.S. Buran", "Harrad-Sar's Barge", "Booker's Ship",
  "U.S.S. Voyager NCC-74656-J", "KDF Targhauler", "U.S.S. Raging Queen",
  "Tellarite Cruiser", "U.S.S. Exeter",
];

const expectedFiveStar = [
  "U.S.S. Reliant", "U.S.S. Glenn", "IKS T'Ong", "U.S.S. Phoenix", "The Artifact",
  "NX-01 Refit", "Warship Voyager", "U.S.S. Excelsior", "Romulan Bird-of-Prey",
  "U.S.S. Uhura", "U.S.S. Discovery", "U.S.S. Roddenberry", "Sikarian Vessel",
  "The Serene Squall", "Assimilated Voyager", "U.S.S. Enterprise NCC-1701-E",
  "Federation Fighter", "U.S.S. Le Guin", "Krenim Weapon Ship",
  "U.S.S. Enterprise NCC-1701-J", "The Scimitar", "U.S.S. Enterprise NCC-1701-C",
  "Jem'Hadar Flagship", "IKS Negh'Var", "Gomtuu", "NX-02 Columbia", "The Shrike",
  "Xindi-Insectoid Patrol Ship", "U.S.S. Enterprise NCC-1701-A",
  "Borg Queen's Vessel", "Monaveen", "Alternate Probability Cerritos",
  "I.S.S. Discovery", "U.S.S. Prometheus", "Breen Command Warship", "Ni'Var",
  "Gorn Destroyer", "U.S.S. Yang", "U.S.S. Raven", "Xindi-Aquatic Cruiser",
  "Orion Vessel", "The Valdore", "Borg Tactical Cube", "S.S. Eleos XII",
  "U.S.S. Titan", "PSS Pakled", "Species 8472 Bioship", "Asaasllich",
  "Free Spirit", "The Seleya", "U.S.S. Enterprise NCC-1701-F", "I.S.S. Cerritos",
  "IKS Bortas", "R'ongovian Flagship", "U.S.S. Pasteur",
];

assert.deepEqual(fourStar.map((s) => s.name), expectedFourStar);
assert.deepEqual(fiveStar.map((s) => s.name), expectedFiveStar);

console.log('MATCH: 4-star and 5-star sort order verified against real data');
```

Run from the **repo root**: `npx tsx client/src/ships/__verify.ts`

Expected output: `MATCH: 4-star and 5-star sort order verified against real data`, exit code 0. If either assertion throws, do not proceed — re-check `filterIncompleteShipsByRarity` and the sort composition against this plan's Global Constraints before moving on.

- [ ] **Step 4: Delete the throwaway verification script**

```bash
rm client/src/ships/__verify.ts
```

- [ ] **Step 5: Build and lint check**

Run: `npm run build -w client`
Expected: exits 0.

Run: `npm run lint -w client`
Expected: exits 0, no errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/ships/filters.ts client/src/ships/sorters.ts
git commit -m "Add ships/filters.ts and ships/sorters.ts"
```

---

### Task 3: `ShipsTable`, the two pages, and routes

**Files:**
- Create: `client/src/ships/ShipsTable.tsx`
- Create: `client/src/pages/ShipsPage.tsx`
- Create: `client/src/pages/FiveStarsShipsPage.tsx`
- Create: `client/src/pages/FourStarsShipsPage.tsx`
- Modify: `client/src/App.tsx`

**Interfaces:**
- Consumes: `Ship` (`types/ship.ts`), `OwnedItem` (`types/item.ts`), `getShipDisplayLevel`/`getShipSchematicsDisplay`/`getShipList` (`ships/getters.ts`), `filterIncompleteShipsByRarity` (`ships/filters.ts`), `byLevelDesc`/`byLevelProgressDesc`/`byMissingSchematicsAsc`/`byNameAsc`/`sortShips` (`ships/sorters.ts`) — all from Tasks 1-2. `getOwnedItems` (`crew/getters.ts`), `combineComparators` (`crew/sorters.ts`), `usePlayerData` — all pre-existing.
- Produces: `ShipsTable` component (`ShipsTableProps { ships: Ship[]; items: OwnedItem[] }`) — new default export from `ships/ShipsTable.tsx`. `ShipsPage` component (`ShipsPageProps { rarity: number; title: string }`) — new default export from `pages/ShipsPage.tsx`, used by Task 4 only indirectly (Task 4 doesn't touch these files, but the routes this task registers are what the nav links in Task 4 will point to).

- [ ] **Step 1: Create `client/src/ships/ShipsTable.tsx`**

```tsx
import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import type { Ship } from '../types/ship';
import type { OwnedItem } from '../types/item';
import { getShipDisplayLevel, getShipSchematicsDisplay } from './getters';

export interface ShipsTableProps {
  ships: Ship[];
  items: OwnedItem[];
}

function ShipsTable({ ships, items }: ShipsTableProps) {
  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Ship</TableCell>
            <TableCell align="right">Level</TableCell>
            <TableCell align="right">Schematics</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {ships.map((s, index) => (
            <TableRow key={s.id}>
              <TableCell>{index + 1}</TableCell>
              <TableCell>{s.name}</TableCell>
              <TableCell align="right">{getShipDisplayLevel(s)}</TableCell>
              <TableCell align="right">{getShipSchematicsDisplay(s, items)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default ShipsTable;
```

- [ ] **Step 2: Create `client/src/pages/ShipsPage.tsx`**

```tsx
import { Alert, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { usePlayerData } from '../hooks/usePlayerData';
import { getOwnedItems } from '../crew/getters';
import { combineComparators } from '../crew/sorters';
import { getShipList } from '../ships/getters';
import { filterIncompleteShipsByRarity } from '../ships/filters';
import { byLevelDesc, byLevelProgressDesc, byMissingSchematicsAsc, byNameAsc, sortShips } from '../ships/sorters';
import ShipsTable from '../ships/ShipsTable';

export interface ShipsPageProps {
  rarity: number;
  title: string;
}

function ShipsPage({ rarity, title }: ShipsPageProps) {
  const { data, loading, error, refresh } = usePlayerData();

  const items = data ? getOwnedItems(data) : [];
  const ships = data
    ? sortShips(
        filterIncompleteShipsByRarity(getShipList(data), rarity),
        combineComparators(byLevelDesc, byLevelProgressDesc, byMissingSchematicsAsc(items), byNameAsc)
      )
    : [];

  const loaded = !loading && !error && data;

  return (
    <Stack spacing={2}>
      <Typography variant="h4">{title}{loaded ? ` (${ships.length})` : ''}</Typography>

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
        ships.length === 0 ? (
          <Typography color="text.secondary">No incomplete ships at this rarity.</Typography>
        ) : (
          <ShipsTable ships={ships} items={items} />
        )
      )}
    </Stack>
  );
}

export default ShipsPage;
```

- [ ] **Step 3: Create `client/src/pages/FiveStarsShipsPage.tsx`**

```tsx
import ShipsPage from './ShipsPage';

function FiveStarsShipsPage() {
  return <ShipsPage rarity={5} title="5 Stars Ships" />;
}

export default FiveStarsShipsPage;
```

- [ ] **Step 4: Create `client/src/pages/FourStarsShipsPage.tsx`**

```tsx
import ShipsPage from './ShipsPage';

function FourStarsShipsPage() {
  return <ShipsPage rarity={4} title="4 Stars Ships" />;
}

export default FourStarsShipsPage;
```

- [ ] **Step 5: Register the routes in `client/src/App.tsx`**

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
import FourStarsDuplicatesPage from './pages/FourStarsDuplicatesPage';
import FiveStarsDuplicatesPage from './pages/FiveStarsDuplicatesPage';
import FiveStarsShipsPage from './pages/FiveStarsShipsPage';
import FourStarsShipsPage from './pages/FourStarsShipsPage';

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
            <Route path="/4-stars-duplicates" element={<FourStarsDuplicatesPage />} />
            <Route path="/5-stars-duplicates" element={<FiveStarsDuplicatesPage />} />
            <Route path="/5-stars-ships" element={<FiveStarsShipsPage />} />
            <Route path="/4-stars-ships" element={<FourStarsShipsPage />} />
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

Run: `curl -s http://localhost:5173/` (or your alternate port) — expect `id="root"` in the response, confirming the client still serves its shell with the two new pages/routes compiled in.

Run: `curl -s http://localhost:5173/5-stars-ships` and `curl -s http://localhost:5173/4-stars-ships` — expect the same shell HTML (client-side routing), no 404/500 from the dev server.

Stop both background processes afterward.

- [ ] **Step 8: Commit**

```bash
git add client/src/ships/ShipsTable.tsx client/src/pages/ShipsPage.tsx client/src/pages/FiveStarsShipsPage.tsx client/src/pages/FourStarsShipsPage.tsx client/src/App.tsx
git commit -m "Add ShipsTable and the 5/4 Stars Ships pages"
```

**Manual follow-up (requires your real credentials, not part of this task):** with a real `STT_SESSION_COOKIE` set, open both `/5-stars-ships` and `/4-stars-ships` directly and confirm the tables render your real incomplete ships correctly.

---

### Task 4: `NavGroupItem` flyout and the "Ships" nav entry

**Files:**
- Create: `client/src/layout/NavGroupItem.tsx`
- Modify: `client/src/layout/AppLayout.tsx`

**Interfaces:**
- Consumes: none from earlier tasks except the two route paths Task 3 registered (`/5-stars-ships`, `/4-stars-ships`), used only as data (`path` strings), not as imports.
- Produces: `NavGroupItem` component (`NavGroupItemProps { label: string; items: { label: string; path: string }[] }`) — new default export from `layout/NavGroupItem.tsx`, used only by `AppLayout.tsx`.

- [ ] **Step 1: Create `client/src/layout/NavGroupItem.tsx`**

```tsx
import { useRef, useState } from 'react';
import { ChevronRight } from '@mui/icons-material';
import { List, ListItemButton, ListItemText, Paper, Popper } from '@mui/material';
import { useNavigate } from 'react-router-dom';

export interface NavGroupItemProps {
  label: string;
  items: { label: string; path: string }[];
}

function NavGroupItem({ label, items }: NavGroupItemProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const navigate = useNavigate();

  const cancelClose = () => {
    if (closeTimeoutRef.current !== undefined) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = undefined;
    }
  };

  const openNow = () => {
    cancelClose();
    setOpen(true);
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimeoutRef.current = setTimeout(() => setOpen(false), 150);
  };

  return (
    <div ref={anchorRef} onMouseEnter={openNow} onMouseLeave={scheduleClose} onFocus={openNow} onBlur={scheduleClose}>
      <ListItemButton sx={{ cursor: 'default' }}>
        <ListItemText primary={label} />
        <ChevronRight fontSize="small" />
      </ListItemButton>
      <Popper open={open} anchorEl={anchorRef.current} placement="right-start" sx={{ zIndex: (theme) => theme.zIndex.drawer + 2 }}>
        <Paper elevation={3} onMouseEnter={openNow} onMouseLeave={scheduleClose} onFocus={openNow} onBlur={scheduleClose}>
          <List>
            {items.map((item) => (
              <ListItemButton
                key={item.path}
                onClick={() => {
                  navigate(item.path);
                  setOpen(false);
                }}
              >
                <ListItemText primary={item.label} />
              </ListItemButton>
            ))}
          </List>
        </Paper>
      </Popper>
    </div>
  );
}

export default NavGroupItem;
```

- [ ] **Step 2: Update `client/src/layout/AppLayout.tsx`**

Replace the file's contents with:

```tsx
import { AppBar, Box, Button, CircularProgress, Drawer, List, ListItemButton, ListItemText, Toolbar, Typography } from '@mui/material';
import { Outlet, useNavigate } from 'react-router-dom';
import { usePlayerData } from '../hooks/usePlayerData';
import NavGroupItem from './NavGroupItem';

const DRAWER_WIDTH = 220;

interface NavLink {
  label: string;
  path: string;
}

interface NavGroup {
  label: string;
  children: NavLink[];
}

function isNavGroup(item: NavLink | NavGroup): item is NavGroup {
  return 'children' in item;
}

const NAV_ITEMS: (NavLink | NavGroup)[] = [
  { label: 'Overview', path: '/' },
  { label: '3/4 Stars crew', path: '/3-4-stars-crew' },
  { label: '4/5 Stars crew', path: '/4-5-stars-crew' },
  { label: '4/4 Stars crew (ready)', path: '/4-4-stars-crew-ready' },
  { label: '4/4 Stars crew', path: '/4-4-stars-crew' },
  { label: 'Collections', path: '/collections' },
  { label: '4 Stars Duplicates', path: '/4-stars-duplicates' },
  { label: '5 Stars Duplicates', path: '/5-stars-duplicates' },
  {
    label: 'Ships',
    children: [
      { label: '5 Stars Ships', path: '/5-stars-ships' },
      { label: '4 Stars Ships', path: '/4-stars-ships' },
    ],
  },
];

function AppLayout() {
  const navigate = useNavigate();
  const { refresh, loading } = usePlayerData();

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <Typography variant="h6" noWrap component="div">
            STT Tracker
          </Typography>
          <Button
            variant="contained"
            color="success"
            onClick={() => void refresh()}
            disabled={loading}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{
              ml: 'auto',
              '&.Mui-disabled': { bgcolor: 'success.dark', color: 'common.white' },
            }}
          >
            Refresh
          </Button>
        </Toolbar>
      </AppBar>
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
        }}
      >
        <Toolbar />
        <List>
          {NAV_ITEMS.map((item) =>
            isNavGroup(item) ? (
              <NavGroupItem key={item.label} label={item.label} items={item.children} />
            ) : (
              <ListItemButton key={item.path} onClick={() => navigate(item.path)}>
                <ListItemText primary={item.label} />
              </ListItemButton>
            )
          )}
        </List>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
}

export default AppLayout;
```

- [ ] **Step 3: Build and lint check**

Run: `npm run build -w client`
Expected: exits 0.

Run: `npm run lint -w client`
Expected: exits 0, no errors.

- [ ] **Step 4: Manual browser verification**

This is a frontend interaction change (hover/focus/click behavior) that cannot be verified with `curl` — use the project's `run` skill, or manually start `npm run dev -w server` and `npm run dev -w client` in the background, then open the client URL in a real browser (a real `STT_SESSION_COOKIE` is not required — the drawer and nav render regardless of the player-data loading/error state). Confirm all of the following:

- Hovering the "Ships" row in the drawer opens a panel to its right showing "5 Stars Ships" above "4 Stars Ships"; "Ships" itself shows a default (not pointer) cursor and does not navigate on click.
- Moving the mouse away from both the "Ships" row and the panel closes the panel shortly after.
- Moving the mouse from the "Ships" row directly into the panel (a diagonal path) keeps the panel open — it must not flicker-close.
- Clicking "5 Stars Ships" navigates to `/5-stars-ships` and closes the panel; clicking "4 Stars Ships" navigates to `/4-stars-ships` and closes the panel.
- Tab-ing keyboard focus onto the "Ships" row also opens the panel; continuing to Tab into a panel item keeps it open (no flicker-close on focus transfer).
- Every pre-existing nav item (Overview through 5 Stars Duplicates) still navigates exactly as before.

Stop the background dev servers afterward.

- [ ] **Step 5: Commit**

```bash
git add client/src/layout/NavGroupItem.tsx client/src/layout/AppLayout.tsx
git commit -m "Add hover-flyout Ships nav group linking to the two new pages"
```
