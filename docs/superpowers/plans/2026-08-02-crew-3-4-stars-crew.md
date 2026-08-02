# Crew Helpers + "3/4 Stars crew" Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable, purpose-grouped crew-data helper library (getters/filters/sorters) and the first page built on it — a "3/4 Stars crew" table listing crew members at `rarity = 3, max_rarity = 4`, sorted by name — backed by a newly shared player-data context so multiple pages stop re-fetching the same payload independently.

**Architecture:** Lift the existing per-page fetch (`usePlayerData`) into a `PlayerDataProvider` React Context at the app root, so `usePlayerData()` becomes a context read with its exact current signature preserved (zero changes to `OverviewPage.tsx`). Add crew types/helpers as pure functions in `client/src/crew/`, grouped by purpose (getters, filters, sorters) not by factor. Add one new route/page that composes those helpers.

**Tech Stack:** Same as the existing client workspace — React 19, TypeScript (strict), MUI, react-router-dom. No new dependencies.

## Global Constraints

- `usePlayerData()`'s public shape (`{ data, loading, error, refresh }`) is unchanged — `OverviewPage.tsx` requires zero code changes as a result of the context refactor.
- The existing `PlayerData` type (`Record<string, unknown>` in `client/src/types/player.ts`) is not modified — crew access stays defensive, mirroring the existing `extractPlayerIdentity` style.
- `CrewMember` is typed narrowly: only `id`, `symbol`, `name`, `short_name`, `rarity`, `max_rarity` — no speculative typing of unused fields.
- `filterByRarity` is an exact-match filter, parameterized by `{ rarity, maxRarity }` — not hardcoded to `(3, 4)`.
- New route path `/3-4-stars-crew`, nav label exactly "3/4 Stars crew".
- `example-data.json` (real personal game data, gitignored) is used only for manual verification, never imported by committed application code, and any throwaway verification script that reads it is deleted before committing.
- No test framework — verification via type-check, lint, a throwaway data-driven verification script, and manual curl checks, per the project's existing Non-goals.
- TypeScript strict mode stays on; no new dependencies are added.

---

### Task 1: Shared player-data context

**Files:**
- Create: `client/src/context/PlayerDataContext.tsx`
- Modify: `client/src/hooks/usePlayerData.ts`
- Modify: `client/src/App.tsx`

**Interfaces:**
- Consumes: `PlayerData` type (`client/src/types/player.ts`), `fetchPlayer`/`refreshPlayer`/`PlayerApiError` (`client/src/api/playerApi.ts`) — all pre-existing, unchanged.
- Produces: `PlayerDataContext` (React context) and `PlayerDataProvider` component from `client/src/context/PlayerDataContext.tsx`. `usePlayerData()` keeps returning `{ data: PlayerData | null; loading: boolean; error: string | null; refresh: () => Promise<void> }` — this exact shape is what `OverviewPage.tsx` already destructures, and what Task 3's new page will also destructure.

- [ ] **Step 1: Create `client/src/context/PlayerDataContext.tsx`**

```tsx
import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react';
import type { PlayerData } from '../types/player';
import { fetchPlayer, refreshPlayer, PlayerApiError } from '../api/playerApi';

export interface PlayerDataContextValue {
  data: PlayerData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export const PlayerDataContext = createContext<PlayerDataContextValue | undefined>(undefined);

export function PlayerDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<PlayerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (fetcher: () => Promise<PlayerData>) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
    } catch (err) {
      setError(err instanceof PlayerApiError ? err.message : 'Failed to load player data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(fetchPlayer);
  }, [load]);

  const refresh = useCallback(() => load(refreshPlayer), [load]);

  return (
    <PlayerDataContext.Provider value={{ data, loading, error, refresh }}>
      {children}
    </PlayerDataContext.Provider>
  );
}
```

This is the same fetch/state logic currently in `usePlayerData.ts`, moved into a provider component.

- [ ] **Step 2: Replace `client/src/hooks/usePlayerData.ts` with a context read**

```ts
import { useContext } from 'react';
import { PlayerDataContext } from '../context/PlayerDataContext';

export function usePlayerData() {
  const context = useContext(PlayerDataContext);
  if (context === undefined) {
    throw new Error('usePlayerData must be used within a PlayerDataProvider');
  }
  return context;
}
```

- [ ] **Step 3: Wrap the routes in `PlayerDataProvider` in `client/src/App.tsx`**

Replace the file's contents with:

```tsx
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { PlayerDataProvider } from './context/PlayerDataContext';
import AppLayout from './layout/AppLayout';
import OverviewPage from './pages/OverviewPage';

function App() {
  return (
    <PlayerDataProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<OverviewPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </PlayerDataProvider>
  );
}

export default App;
```

(Task 3 will add the new route's import and `<Route>` entry to this same file — this step only adds the provider wrapper, keeping the existing single route.)

- [ ] **Step 4: Build and lint check**

Run: `npm run build -w client`
Expected: exits 0. `OverviewPage.tsx`'s existing `usePlayerData()` destructuring type-checking cleanly against `PlayerDataContextValue` is the key correctness signal here — if the shapes didn't match, this step would fail.

Run: `npm run lint -w client`
Expected: exits 0, no errors.

- [ ] **Step 5: Manual dev-server check (behavior parity with before the refactor)**

With `server/.env` absent (or without `STT_SESSION_COOKIE` set — do not create a real `.env`), start `npm run dev -w server` and `npm run dev -w client` in the background.

Run: `curl -s http://localhost:5173/api/player` — expect the same 502 error JSON as before this refactor: `{"error":"STT_SESSION_COOKIE is not set in server/.env","code":"UPSTREAM_AUTH_FAILED"}`. This confirms the proxy/server chain is untouched.

Run: `curl -s http://localhost:5173/ | grep 'id="root"'` — expect a match, confirming the client still serves its shell (i.e. the module graph — including the new context file and rewired hook — has no build-time wiring errors).

Stop both background processes afterward.

- [ ] **Step 6: Commit**

```bash
git add client/src/context/PlayerDataContext.tsx client/src/hooks/usePlayerData.ts client/src/App.tsx
git commit -m "Lift player data fetch into a shared PlayerDataProvider context"
```

---

### Task 2: Crew types and helpers (getters, filters, sorters)

**Files:**
- Create: `client/src/types/crew.ts`
- Create: `client/src/crew/getters.ts`
- Create: `client/src/crew/filters.ts`
- Create: `client/src/crew/sorters.ts`

**Interfaces:**
- Consumes: `PlayerData` type from `client/src/types/player.ts` (existing, unchanged).
- Produces: `CrewMember` interface (`client/src/types/crew.ts`) with fields `id: number`, `symbol: string`, `name: string`, `short_name: string`, `rarity: number`, `max_rarity: number`. Produces `getCrewList(data: PlayerData): CrewMember[]`, `filterByRarity(crew: CrewMember[], { rarity, maxRarity }: { rarity: number; maxRarity: number }): CrewMember[]`, and `sortByName(crew: CrewMember[]): CrewMember[]` — Task 3's page imports all three functions and the `CrewMember` type directly.

- [ ] **Step 1: Create `client/src/types/crew.ts`**

```ts
export interface CrewMember {
  id: number;
  symbol: string;
  name: string;
  short_name: string;
  rarity: number;
  max_rarity: number;
}
```

- [ ] **Step 2: Create `client/src/crew/getters.ts`**

```ts
import type { PlayerData } from '../types/player';
import type { CrewMember } from '../types/crew';

export function getCrewList(data: PlayerData): CrewMember[] {
  const player = data.player as Record<string, unknown> | undefined;
  const character = player?.character as Record<string, unknown> | undefined;
  const crew = character?.crew;
  return Array.isArray(crew) ? (crew as CrewMember[]) : [];
}
```

- [ ] **Step 3: Create `client/src/crew/filters.ts`**

```ts
import type { CrewMember } from '../types/crew';

export function filterByRarity(
  crew: CrewMember[],
  { rarity, maxRarity }: { rarity: number; maxRarity: number }
): CrewMember[] {
  return crew.filter((c) => c.rarity === rarity && c.max_rarity === maxRarity);
}
```

- [ ] **Step 4: Create `client/src/crew/sorters.ts`**

```ts
import type { CrewMember } from '../types/crew';

export function sortByName(crew: CrewMember[]): CrewMember[] {
  return [...crew].sort((a, b) => a.name.localeCompare(b.name));
}
```

- [ ] **Step 5: Verify the helpers against the real reference payload**

`example-data.json` (gitignored, real personal game data) sits at the repo root and is the same file used to design this feature. Its `player.character.crew` array has 597 entries; exactly 52 of them have `rarity === 3 && max_rarity === 4`.

Create a throwaway script at `client/src/crew/__verify.ts` (this file is deleted in Step 6, never committed):

```ts
import { readFileSync } from 'node:fs';
import { getCrewList } from './getters';
import { filterByRarity } from './filters';
import { sortByName } from './sorters';

const raw = JSON.parse(readFileSync('example-data.json', 'utf-8')) as Record<string, unknown>;
const crew = getCrewList(raw);
console.log('total crew:', crew.length);

const filtered = filterByRarity(crew, { rarity: 3, maxRarity: 4 });
console.log('filtered count:', filtered.length);

const sorted = sortByName(filtered);
console.log('first 5 names:', sorted.slice(0, 5).map((c) => c.name));

const names = sorted.map((c) => c.name);
const expectedSorted = [...names].sort((a, b) => a.localeCompare(b));
console.log('sorted correctly:', JSON.stringify(names) === JSON.stringify(expectedSorted));
```

Run from the **repo root** (so the relative `example-data.json` path resolves):

`npx tsx client/src/crew/__verify.ts`

(`tsx` is already installed as a devDependency of the `server` workspace and hoisted to the root `node_modules/.bin` by npm workspaces, so no new install should be needed. If `npx tsx` isn't found, run `npx --package tsx tsx client/src/crew/__verify.ts` instead.)

Expected output:
- `total crew: 597`
- `filtered count: 52`
- `sorted correctly: true`

If the counts don't match, do not proceed — re-check `getCrewList`'s property access against the real `example-data.json` structure (`player.character.crew`) before moving on.

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
git add client/src/types/crew.ts client/src/crew/getters.ts client/src/crew/filters.ts client/src/crew/sorters.ts
git commit -m "Add crew types and purpose-grouped helpers (getters, filters, sorters)"
```

---

### Task 3: "3/4 Stars crew" page and route

**Files:**
- Create: `client/src/pages/ThreeFourStarsCrewPage.tsx`
- Modify: `client/src/layout/AppLayout.tsx`
- Modify: `client/src/App.tsx`

**Interfaces:**
- Consumes: `usePlayerData()` (`client/src/hooks/usePlayerData.ts`, Task 1); `getCrewList` (`client/src/crew/getters.ts`), `filterByRarity` (`client/src/crew/filters.ts`), `sortByName` (`client/src/crew/sorters.ts`) — all from Task 2.

- [ ] **Step 1: Create `client/src/pages/ThreeFourStarsCrewPage.tsx`**

```tsx
import {
  Alert,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from '@mui/material';
import { usePlayerData } from '../hooks/usePlayerData';
import { getCrewList } from '../crew/getters';
import { filterByRarity } from '../crew/filters';
import { sortByName } from '../crew/sorters';

function ThreeFourStarsCrewPage() {
  const { data, loading, error } = usePlayerData();

  const crew = data ? sortByName(filterByRarity(getCrewList(data), { rarity: 3, maxRarity: 4 })) : [];

  return (
    <Stack spacing={2}>
      <Typography variant="h4">3/4 Stars crew</Typography>

      {loading && <CircularProgress />}
      {error && <Alert severity="error">{error}</Alert>}

      {!loading && !error && data && (
        <TableContainer component={Paper}>
          <Table>
            <TableBody>
              {crew.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.name}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Stack>
  );
}

export default ThreeFourStarsCrewPage;
```

No Refresh button on this page — data is shared via context now, and Overview's existing Refresh button already covers refreshing the underlying payload for every page.

- [ ] **Step 2: Add the nav entry in `client/src/layout/AppLayout.tsx`**

Change:

```ts
const NAV_ITEMS = [{ label: 'Overview', path: '/' }];
```

to:

```ts
const NAV_ITEMS = [
  { label: 'Overview', path: '/' },
  { label: '3/4 Stars crew', path: '/3-4-stars-crew' },
];
```

- [ ] **Step 3: Register the route in `client/src/App.tsx`**

Replace the file's contents with:

```tsx
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { PlayerDataProvider } from './context/PlayerDataContext';
import AppLayout from './layout/AppLayout';
import OverviewPage from './pages/OverviewPage';
import ThreeFourStarsCrewPage from './pages/ThreeFourStarsCrewPage';

function App() {
  return (
    <PlayerDataProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/3-4-stars-crew" element={<ThreeFourStarsCrewPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </PlayerDataProvider>
  );
}

export default App;
```

- [ ] **Step 4: Build and lint check**

Run: `npm run build -w client`
Expected: exits 0.

Run: `npm run lint -w client`
Expected: exits 0, no errors.

- [ ] **Step 5: Manual dev-server check**

With `server/.env` absent, start `npm run dev -w server` and `npm run dev -w client` in the background.

Run: `curl -s http://localhost:5173/api/player` — expect the same 502 error JSON as in Task 1's check, confirming nothing in the server/proxy chain broke.

Run: `curl -s http://localhost:5173/ | grep 'id="root"'` — expect a match, confirming the client (now with a second route and nav item) still serves its shell without a build-time or module-resolution error.

Stop both background processes afterward.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/ThreeFourStarsCrewPage.tsx client/src/layout/AppLayout.tsx client/src/App.tsx
git commit -m "Add 3/4 Stars crew page, nav entry, and route"
```

**Manual follow-up (requires your real credentials, not part of this task):** with a real `STT_SESSION_COOKIE` set in `server/.env`, run `npm run dev` from the root, open `http://localhost:5173/3-4-stars-crew`, and confirm the table lists your own crew members at rarity 3/max_rarity 4, sorted alphabetically by name.
