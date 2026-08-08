# Crew Catalog + Overview Unique-Crew Counts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two rows to the Overview page — "5 Stars unique crew" and "4 Stars unique crew" — showing `owned/total (pct%)` distinct-archetype counts across active + frozen crew, backed by a new server-side proxy/cache for a public community crew catalog (`datacore.app/structured/crew.json`), the only source that carries rarity for frozen crew.

**Architecture:** Three tasks, each independently testable. Task 1 is the backend proxy/cache (mirrors the existing `/api/player` shape — GET serves cache-or-fetch-live, POST always fetches live), verified with `curl` against a real running server, no client involved. Task 2 is the client data layer and pure domain logic (types, API client, React context/hook, `catalog/getters.ts`, one new `crew/getters.ts` function), verified with a throwaway data-driven script — no UI involved. Task 3 is the actual UI: the two Overview rows and the new "Refresh catalog" topbar button, verified interactively against a real running dev server.

**Tech Stack:** Same as the existing client/server workspaces — React 19, TypeScript (strict), MUI 6, Express, no new dependencies (uses the built-in `fetch`, same as `sttClient.ts`/`assetClient.ts`).

## Global Constraints

- **Owned definition:** an archetype of a given `max_rarity` counts as owned if *either* an active-roster crew member has that `archetype_id` (any level/rarity/completion state), *or* the archetype is in `stored_immortals`. This is a new, separate concept from the existing `isImmortalized`-gated "ownedImmortalArchetypes" used by `getCollectionCrew` — do not merge or reuse that logic.
- **Total definition:** every catalog entry of that `max_rarity`, regardless of `in_portal` — i.e. every archetype of that rarity ever added to the game.
- **Percent:** `Math.round((owned / total) * 100)`, guarded against `total === 0` (use `0` in that case).
- **Catalog upstream:** `https://datacore.app/structured/crew.json` — a public, unauthenticated JSON array. No CORS headers, so it must be fetched server-side. No auth/cookie required (unlike the STT player API).
- **The reduced `CatalogEntry` shape is exactly `{ archetype_id: number; max_rarity: number; in_portal: boolean }`** — defined independently in both `server/src/catalogClient.ts` and `client/src/types/catalogEntry.ts` (this monorepo does not share types between the two workspaces; match the existing `CrewMember`/`OwnedItem` precedent of typing only what's used).
- **`getCatalogCount(catalog, maxRarity, inPortal?)` takes `inPortal` as an *optional* third parameter** — omitted for this feature's global-total use; the parameter exists now so a future missing-crew-list feature can pass `true`/`false` for partials without a rework. Do not build any missing-crew-list UI or filtering now — only this parameter shape.
- **No automated test framework** (project-wide, deliberate choice). Verification is `tsc`/`eslint` clean, a throwaway data-driven verify script for Tasks 1-2, and `playwright` MCP browser checks for Task 3.
- **Spec:** `docs/superpowers/specs/2026-08-08-crew-catalog-unique-counts-design.md`.

---

### Task 1: Backend crew-catalog proxy/cache

**Files:**
- Create: `server/src/catalogClient.ts`
- Create: `server/src/catalogCache.ts`
- Create: `server/src/routes/catalog.ts`
- Modify: `server/src/index.ts`

**Interfaces:**
- Consumes: `UpstreamError` (existing, `server/src/errors.ts`).
- Produces (consumed by Task 2): `CatalogEntry` interface and `fetchCrewCatalog(): Promise<CatalogEntry[]>` (`server/src/catalogClient.ts`); `GET /api/crew-catalog` and `POST /api/crew-catalog/refresh` HTTP endpoints, each returning `CatalogEntry[]` as JSON on success or `{ error: string, code: 'UPSTREAM_ERROR' }` with HTTP 502 on failure.

- [ ] **Step 1: Confirm the current state of `server/src/index.ts` and `server/src/errors.ts` matches this plan's assumptions**

Run: `cat -n server/src/index.ts server/src/errors.ts`

Confirm `index.ts` mounts exactly `createPlayerRouter(config)` and `createAssetsRouter()` under `/api`, and `errors.ts` exports `UpstreamAuthError` and `UpstreamError`. If this differs, stop and re-check the spec before proceeding.

- [ ] **Step 2: Create `server/src/catalogClient.ts`**

```ts
import { UpstreamError } from './errors';

const CATALOG_UPSTREAM_URL = 'https://datacore.app/structured/crew.json';

export interface CatalogEntry {
  archetype_id: number;
  max_rarity: number;
  in_portal: boolean;
}

interface RawCatalogEntry {
  archetype_id: number;
  max_rarity: number;
  in_portal: boolean;
  [key: string]: unknown;
}

export async function fetchCrewCatalog(): Promise<CatalogEntry[]> {
  let response: Response;
  try {
    response = await fetch(CATALOG_UPSTREAM_URL);
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
  }));
}
```

- [ ] **Step 3: Create `server/src/catalogCache.ts`**

```ts
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { CatalogEntry } from './catalogClient';

const CACHE_PATH = 'data/crew-catalog-cache.json';

export function readCatalogCache(): CatalogEntry[] | null {
  if (!existsSync(CACHE_PATH)) {
    return null;
  }
  try {
    const raw = readFileSync(CACHE_PATH, 'utf-8');
    return JSON.parse(raw) as CatalogEntry[];
  } catch {
    return null;
  }
}

export function writeCatalogCache(data: CatalogEntry[]): void {
  mkdirSync(dirname(CACHE_PATH), { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), 'utf-8');
}
```

- [ ] **Step 4: Create `server/src/routes/catalog.ts`**

```ts
import { Router, type Response } from 'express';
import { fetchCrewCatalog } from '../catalogClient';
import { readCatalogCache, writeCatalogCache } from '../catalogCache';
import { UpstreamError } from '../errors';

export function createCatalogRouter(): Router {
  const router = Router();

  router.get('/crew-catalog', async (_req, res) => {
    const cached = readCatalogCache();
    if (cached !== null) {
      res.json(cached);
      return;
    }
    await refreshAndRespond(res);
  });

  router.post('/crew-catalog/refresh', async (_req, res) => {
    await refreshAndRespond(res);
  });

  return router;
}

async function refreshAndRespond(res: Response): Promise<void> {
  try {
    const data = await fetchCrewCatalog();
    writeCatalogCache(data);
    res.json(data);
  } catch (err) {
    if (err instanceof UpstreamError) {
      res.status(502).json({ error: err.message, code: 'UPSTREAM_ERROR' });
      return;
    }
    res.status(502).json({ error: 'Unexpected error fetching crew catalog', code: 'UPSTREAM_ERROR' });
  }
}
```

- [ ] **Step 5: Wire the router into `server/src/index.ts`**

Replace:
```ts
import express from 'express';
import { loadConfig } from './config';
import { createPlayerRouter } from './routes/player';
import { createAssetsRouter } from './routes/assets';

const PORT = 3001;

const config = loadConfig();
const app = express();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', createPlayerRouter(config));
app.use('/api', createAssetsRouter());

app.listen(PORT, '127.0.0.1', () => {
  console.log(`STT tracker server listening on http://127.0.0.1:${PORT}`);
});
```
with:
```ts
import express from 'express';
import { loadConfig } from './config';
import { createPlayerRouter } from './routes/player';
import { createAssetsRouter } from './routes/assets';
import { createCatalogRouter } from './routes/catalog';

const PORT = 3001;

const config = loadConfig();
const app = express();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', createPlayerRouter(config));
app.use('/api', createAssetsRouter());
app.use('/api', createCatalogRouter());

app.listen(PORT, '127.0.0.1', () => {
  console.log(`STT tracker server listening on http://127.0.0.1:${PORT}`);
});
```

- [ ] **Step 6: Build and lint check**

Run: `npm run build -w server`
Expected: exits 0.

Run: `npm run lint -w server`
Expected: exits 0, no new errors.

- [ ] **Step 7: Verify against a real running server**

Start the server (`npm run dev -w server`, or `npm run dev` from the repo root if that's the project's usual dev-server launch — check `package.json` scripts first; note a fresh cold-cache fetch of the real ~40MB upstream file may take several seconds to tens of seconds depending on network conditions, so allow a generous timeout on the first call).

1. `curl http://127.0.0.1:3001/api/crew-catalog` — expect HTTP 200, a JSON array of roughly 1900-2100 objects (the real game roster grows over time; do not hardcode an exact count), each with exactly the keys `archetype_id`, `max_rarity`, `in_portal`.
2. Confirm `server/data/crew-catalog-cache.json` now exists and contains the same array.
3. `curl http://127.0.0.1:3001/api/crew-catalog` again — expect a fast response (served from cache, not re-fetching upstream) with the same data.
4. `curl -X POST http://127.0.0.1:3001/api/crew-catalog/refresh` — expect HTTP 200, a fresh JSON array (may differ slightly from step 1 if datacore's data changed in the interim, which is expected and fine).
5. Spot-check the rarity distribution:

```bash
curl -s http://127.0.0.1:3001/api/crew-catalog | node -e '
const data = JSON.parse(require("fs").readFileSync(0, "utf-8"));
const counts = {};
for (const e of data) counts[e.max_rarity] = (counts[e.max_rarity] ?? 0) + 1;
console.log(counts);
const validRarities = data.every((e) => e.max_rarity >= 1 && e.max_rarity <= 5);
console.log("all max_rarity in 1..5:", validRarities);
'
```

Expected: an object like `{ "1": 27, "2": 62, "3": 91, "4": 703, "5": 1078 }` (exact numbers will vary slightly as the real game roster grows over time — do not assert an exact match) with `4` and `5` each in the hundreds-to-low-thousands range, and `all max_rarity in 1..5: true`.

- [ ] **Step 8: Commit**

```bash
git add server/src/catalogClient.ts server/src/catalogCache.ts server/src/routes/catalog.ts server/src/index.ts
git commit -m "Add server-side crew catalog proxy/cache (datacore.app crew.json)"
```

---

### Task 2: Client data layer and domain logic

**Files:**
- Create: `client/src/types/catalogEntry.ts`
- Create: `client/src/api/catalogApi.ts`
- Create: `client/src/context/CrewCatalogContext.tsx`
- Create: `client/src/hooks/useCrewCatalog.ts`
- Create: `client/src/catalog/getters.ts`
- Modify: `client/src/crew/getters.ts`
- Modify: `client/src/App.tsx`

**Interfaces:**
- Consumes: `GET /api/crew-catalog` / `POST /api/crew-catalog/refresh` (Task 1, already on this branch); `getFrozenCrewArchetypeIds`, `getCrewList` (existing, `crew/getters.ts`); `CrewMember` (existing, `types/crew.ts`).
- Produces (consumed by Task 3): `CatalogEntry` type (`types/catalogEntry.ts`); `useCrewCatalog()` hook returning `{ data: CatalogEntry[] | null, loading: boolean, error: string | null, refresh: () => Promise<void> }`; `getArchetypeMaxRarityMap(catalog: CatalogEntry[]): Map<number, number>` and `getCatalogCount(catalog: CatalogEntry[], maxRarity: number, inPortal?: boolean): number` (`catalog/getters.ts`); `getOwnedArchetypeIds(crewList: CrewMember[], frozenArchetypeIds: Set<number>, catalogMaxRarityById: Map<number, number>, maxRarity: number): Set<number>` (`crew/getters.ts`).

- [ ] **Step 1: Confirm the current state of `client/src/crew/getters.ts` and `client/src/App.tsx` matches this plan's assumptions**

Run: `cat -n client/src/crew/getters.ts`

Confirm the file ends with the `getQPRoundsLeft` function (the most recently added function).

Run: `cat -n client/src/App.tsx`

Confirm it imports and wraps everything in a single `<PlayerDataProvider>` with no other provider currently present. If either differs, stop and re-check the spec before proceeding.

- [ ] **Step 2: Create `client/src/types/catalogEntry.ts`**

```ts
export interface CatalogEntry {
  archetype_id: number;
  max_rarity: number;
  in_portal: boolean;
}
```

- [ ] **Step 3: Create `client/src/api/catalogApi.ts`**

```ts
import type { CatalogEntry } from '../types/catalogEntry';

async function parseCatalogResponse(response: Response): Promise<CatalogEntry[]> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error((body as { error?: string }).error ?? `Failed to load crew catalog: HTTP ${response.status}`);
  }
  return response.json() as Promise<CatalogEntry[]>;
}

export async function fetchCrewCatalog(): Promise<CatalogEntry[]> {
  const response = await fetch('/api/crew-catalog');
  return parseCatalogResponse(response);
}

export async function refreshCrewCatalog(): Promise<CatalogEntry[]> {
  const response = await fetch('/api/crew-catalog/refresh', { method: 'POST' });
  return parseCatalogResponse(response);
}
```

- [ ] **Step 4: Create `client/src/context/CrewCatalogContext.tsx`**

```tsx
import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react';
import type { CatalogEntry } from '../types/catalogEntry';
import { fetchCrewCatalog, refreshCrewCatalog } from '../api/catalogApi';

export interface CrewCatalogContextValue {
  data: CatalogEntry[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export const CrewCatalogContext = createContext<CrewCatalogContextValue | undefined>(undefined);

export function CrewCatalogProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<CatalogEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (fetcher: () => Promise<CatalogEntry[]>) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load crew catalog');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(fetchCrewCatalog);
  }, [load]);

  const refresh = useCallback(() => load(refreshCrewCatalog), [load]);

  return (
    <CrewCatalogContext.Provider value={{ data, loading, error, refresh }}>
      {children}
    </CrewCatalogContext.Provider>
  );
}
```

- [ ] **Step 5: Create `client/src/hooks/useCrewCatalog.ts`**

```ts
import { useContext } from 'react';
import { CrewCatalogContext } from '../context/CrewCatalogContext';

export function useCrewCatalog() {
  const context = useContext(CrewCatalogContext);
  if (context === undefined) {
    throw new Error('useCrewCatalog must be used within a CrewCatalogProvider');
  }
  return context;
}
```

- [ ] **Step 6: Create `client/src/catalog/getters.ts`**

```ts
import type { CatalogEntry } from '../types/catalogEntry';

export function getArchetypeMaxRarityMap(catalog: CatalogEntry[]): Map<number, number> {
  return new Map(catalog.map((c) => [c.archetype_id, c.max_rarity]));
}

export function getCatalogCount(catalog: CatalogEntry[], maxRarity: number, inPortal?: boolean): number {
  return catalog.filter((c) => c.max_rarity === maxRarity && (inPortal === undefined || c.in_portal === inPortal)).length;
}
```

- [ ] **Step 7: Add `getOwnedArchetypeIds` to `client/src/crew/getters.ts`**

Append at the end of the file (after `getQPRoundsLeft`):
```ts

export function getOwnedArchetypeIds(
  crewList: CrewMember[],
  frozenArchetypeIds: Set<number>,
  catalogMaxRarityById: Map<number, number>,
  maxRarity: number
): Set<number> {
  const owned = new Set<number>();
  for (const c of crewList) {
    if (c.max_rarity === maxRarity) owned.add(c.archetype_id);
  }
  for (const archetypeId of frozenArchetypeIds) {
    if (catalogMaxRarityById.get(archetypeId) === maxRarity) owned.add(archetypeId);
  }
  return owned;
}
```

- [ ] **Step 8: Wire `CrewCatalogProvider` into `client/src/App.tsx`**

Replace the whole file with:
```tsx
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { PlayerDataProvider } from './context/PlayerDataContext';
import { CrewCatalogProvider } from './context/CrewCatalogContext';
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
import QPsPage from './pages/QPsPage';

function App() {
  return (
    <PlayerDataProvider>
      <CrewCatalogProvider>
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
              <Route path="/qps" element={<QPsPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </CrewCatalogProvider>
    </PlayerDataProvider>
  );
}

export default App;
```

- [ ] **Step 9: Build and lint check**

Run: `npm run build -w client`
Expected: exits 0.

Run: `npm run lint -w client`
Expected: exits 0, no new errors.

- [ ] **Step 10: Verify against real data**

`example-data.json` (gitignored, real personal game data) is at the repo root. This task also needs a real catalog snapshot — reuse Task 1's live server if still running (`curl http://127.0.0.1:3001/api/crew-catalog -o /tmp/catalog-snapshot.json` from the repo root; adjust the output path if `/tmp` isn't writable in this environment, e.g. use the scratchpad directory instead), or fetch directly: `curl https://datacore.app/structured/crew.json -o /tmp/catalog-snapshot-raw.json` and reduce it inline in the verify script below.

Create a throwaway script at `client/src/crew/__verify.ts` (deleted in Step 12, never committed):

```ts
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { getCrewList, getFrozenCrewArchetypeIds, getOwnedArchetypeIds } from './getters';
import { getArchetypeMaxRarityMap, getCatalogCount } from '../catalog/getters';
import type { CatalogEntry } from '../types/catalogEntry';

const raw = JSON.parse(readFileSync('example-data.json', 'utf-8')) as Record<string, unknown>;
const crewList = getCrewList(raw);
const frozenArchetypeIds = getFrozenCrewArchetypeIds(raw);

// Adjust this path to wherever the real catalog snapshot was saved in this step's setup.
const catalogRaw = JSON.parse(readFileSync('/tmp/catalog-snapshot.json', 'utf-8')) as CatalogEntry[];
const catalogMaxRarityById = getArchetypeMaxRarityMap(catalogRaw);

const fiveStarOwned = getOwnedArchetypeIds(crewList, frozenArchetypeIds, catalogMaxRarityById, 5);
const fourStarOwned = getOwnedArchetypeIds(crewList, frozenArchetypeIds, catalogMaxRarityById, 4);

// Expected values verified during design against this exact example-data.json + a live catalog pull.
// If datacore's catalog has changed since design time, these may drift slightly — re-derive by hand
// if this assertion fails, rather than assuming the code is wrong; check the sign/direction of any
// difference against the design spec's methodology before concluding there's a real bug.
console.log('5-star owned:', fiveStarOwned.size, 'expected ~436');
console.log('4-star owned:', fourStarOwned.size, 'expected ~683');
assert.ok(fiveStarOwned.size > 400 && fiveStarOwned.size < 500, `5-star owned count ${fiveStarOwned.size} outside sane range`);
assert.ok(fourStarOwned.size > 600 && fourStarOwned.size < 750, `4-star owned count ${fourStarOwned.size} outside sane range`);

const fiveStarTotal = getCatalogCount(catalogRaw, 5);
const fourStarTotal = getCatalogCount(catalogRaw, 4);
console.log('5-star total:', fiveStarTotal, 'expected ~1078');
console.log('4-star total:', fourStarTotal, 'expected ~703');
assert.ok(fiveStarTotal >= fiveStarOwned.size, '5-star total must be >= owned');
assert.ok(fourStarTotal >= fourStarOwned.size, '4-star total must be >= owned');

// inPortal partial parameter sanity: true + false counts must sum to the unfiltered total.
const fiveStarInPortal = getCatalogCount(catalogRaw, 5, true);
const fiveStarNotInPortal = getCatalogCount(catalogRaw, 5, false);
assert.equal(fiveStarInPortal + fiveStarNotInPortal, fiveStarTotal, 'in_portal true/false counts must partition the total');

console.log('MATCH: all crew-catalog data-layer assertions passed');
```

Run from the **repo root**: `npx tsx client/src/crew/__verify.ts`

Expected output: `MATCH: all crew-catalog data-layer assertions passed`, exit code 0. The sane-range assertions (rather than exact-match) are deliberate — datacore's live catalog changes over time as new crew are added to the game, so exact counts from design time (436/1078, 683/703) may have drifted slightly by the time this runs; a value within the asserted range confirms the code is correct, an out-of-range value needs investigation (re-check Steps 2-7 against this plan, and re-verify the catalog snapshot itself looks sane) before assuming a real bug.

- [ ] **Step 11: Delete the throwaway verification script**

```bash
rm client/src/crew/__verify.ts
```

- [ ] **Step 12: Commit**

```bash
git add client/src/types/catalogEntry.ts client/src/api/catalogApi.ts client/src/context/CrewCatalogContext.tsx client/src/hooks/useCrewCatalog.ts client/src/catalog/getters.ts client/src/crew/getters.ts client/src/App.tsx
git commit -m "Add crew catalog client data layer and getOwnedArchetypeIds"
```

---

### Task 3: Overview page rows and "Refresh catalog" topbar button

**Files:**
- Modify: `client/src/pages/OverviewPage.tsx`
- Modify: `client/src/layout/AppLayout.tsx`

**Interfaces:**
- Consumes: `useCrewCatalog` (`hooks/useCrewCatalog.ts`), `getArchetypeMaxRarityMap`, `getCatalogCount` (`catalog/getters.ts`), `getOwnedArchetypeIds`, `getCrewList`, `getFrozenCrewArchetypeIds` (`crew/getters.ts`) — all from Task 2, already on this branch.
- Produces: nothing new consumed elsewhere — this is the final UI-facing change.

- [ ] **Step 1: Confirm the current state of `OverviewPage.tsx` and `AppLayout.tsx` matches this plan's assumptions**

Run: `cat -n client/src/pages/OverviewPage.tsx`

Confirm it matches exactly:
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
import { extractPlayerIdentity } from '../lib/extractPlayerIdentity';
import type { PlayerIdentity } from '../types/player';

const FIELD_LABELS: Record<keyof PlayerIdentity, string> = {
  playerId: 'Player ID',
  dbid: 'DBID',
};

function OverviewPage() {
  const { data, loading, error } = usePlayerData();
  const identity = data ? extractPlayerIdentity(data) : null;

  return (
    <Stack spacing={2}>
      <Typography variant="h4">Overview</Typography>

      {loading && <CircularProgress />}
      {error && <Alert severity="error">{error}</Alert>}

      {!loading && !error && identity && (
        <TableContainer component={Paper}>
          <Table>
            <TableBody>
              {(Object.keys(FIELD_LABELS) as (keyof PlayerIdentity)[]).map((field) => (
                <TableRow key={field}>
                  <TableCell component="th" scope="row">
                    {FIELD_LABELS[field]}
                  </TableCell>
                  <TableCell align="right">{identity[field] ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Stack>
  );
}

export default OverviewPage;
```

Run: `cat -n client/src/layout/AppLayout.tsx`

Confirm it matches exactly:
```tsx
import { useState } from 'react';
import { Alert, AppBar, Box, Button, CircularProgress, Drawer, List, ListItemButton, ListItemText, Snackbar, Toolbar, Typography } from '@mui/material';
import { Outlet, useNavigate } from 'react-router-dom';
import { usePlayerData } from '../hooks/usePlayerData';
import { refreshAssets } from '../api/assetsApi';
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
  {
    label: 'Crew',
    children: [
      { label: '3/4 Stars crew', path: '/3-4-stars-crew' },
      { label: '4/5 Stars crew', path: '/4-5-stars-crew' },
      { label: '4/4 Stars crew (ready)', path: '/4-4-stars-crew-ready' },
      { label: '4/4 Stars crew', path: '/4-4-stars-crew' },
      { label: '4 Stars Duplicates', path: '/4-stars-duplicates' },
      { label: '5 Stars Duplicates', path: '/5-stars-duplicates' },
      { label: 'QPs', path: '/qps' },
    ],
  },
  {
    label: 'Ships',
    children: [
      { label: '5 Stars Ships', path: '/5-stars-ships' },
      { label: '4 Stars Ships', path: '/4-stars-ships' },
    ],
  },
  { label: 'Collections', path: '/collections' },
];

function AppLayout() {
  const navigate = useNavigate();
  const { refresh, loading } = usePlayerData();
  const [refreshingAssets, setRefreshingAssets] = useState(false);
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const [assetsSuccess, setAssetsSuccess] = useState(false);

  async function handleRefreshAssets() {
    setRefreshingAssets(true);
    setAssetsError(null);
    setAssetsSuccess(false);
    try {
      await refreshAssets();
      setAssetsSuccess(true);
    } catch (err) {
      setAssetsError(err instanceof Error ? err.message : 'Failed to refresh asset cache');
    } finally {
      setRefreshingAssets(false);
    }
  }

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
          <Button
            variant="outlined"
            onClick={() => void handleRefreshAssets()}
            disabled={refreshingAssets}
            startIcon={refreshingAssets ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{ ml: 1, color: 'common.white', borderColor: 'common.white' }}
          >
            Refresh assets
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
      <Snackbar open={assetsError !== null} autoHideDuration={6000} onClose={() => setAssetsError(null)}>
        <Alert severity="error" onClose={() => setAssetsError(null)}>
          {assetsError}
        </Alert>
      </Snackbar>
      <Snackbar open={assetsSuccess} autoHideDuration={6000} onClose={() => setAssetsSuccess(false)}>
        <Alert severity="success" onClose={() => setAssetsSuccess(false)}>
          Asset cache refreshed
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default AppLayout;
```

If either file differs, stop and re-check the spec before proceeding.

- [ ] **Step 2: Rewrite `client/src/pages/OverviewPage.tsx`**

Replace the whole file with:
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
import { useCrewCatalog } from '../hooks/useCrewCatalog';
import { extractPlayerIdentity } from '../lib/extractPlayerIdentity';
import { getCrewList, getFrozenCrewArchetypeIds, getOwnedArchetypeIds } from '../crew/getters';
import { getArchetypeMaxRarityMap, getCatalogCount } from '../catalog/getters';
import type { PlayerIdentity } from '../types/player';

const FIELD_LABELS: Record<keyof PlayerIdentity, string> = {
  playerId: 'Player ID',
  dbid: 'DBID',
};

function OverviewPage() {
  const { data, loading, error } = usePlayerData();
  const { data: catalog, loading: catalogLoading, error: catalogError } = useCrewCatalog();
  const identity = data ? extractPlayerIdentity(data) : null;

  const crewList = data ? getCrewList(data) : [];
  const frozenArchetypeIds = data ? getFrozenCrewArchetypeIds(data) : new Set<number>();
  const catalogMaxRarityById = catalog ? getArchetypeMaxRarityMap(catalog) : new Map<number, number>();

  function uniqueCrewCell(maxRarity: number): string {
    if (!catalog) return '—';
    const owned = getOwnedArchetypeIds(crewList, frozenArchetypeIds, catalogMaxRarityById, maxRarity).size;
    const total = getCatalogCount(catalog, maxRarity);
    const pct = total > 0 ? Math.round((owned / total) * 100) : 0;
    return `${owned}/${total} (${pct}%)`;
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h4">Overview</Typography>

      {loading && <CircularProgress />}
      {error && <Alert severity="error">{error}</Alert>}

      {!loading && !error && identity && (
        <TableContainer component={Paper}>
          <Table>
            <TableBody>
              {(Object.keys(FIELD_LABELS) as (keyof PlayerIdentity)[]).map((field) => (
                <TableRow key={field}>
                  <TableCell component="th" scope="row">
                    {FIELD_LABELS[field]}
                  </TableCell>
                  <TableCell align="right">{identity[field] ?? '—'}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell component="th" scope="row">
                  5 Stars unique crew
                </TableCell>
                <TableCell align="right">
                  {catalogLoading ? (
                    <CircularProgress size={16} />
                  ) : catalogError ? (
                    'Unavailable'
                  ) : (
                    uniqueCrewCell(5)
                  )}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell component="th" scope="row">
                  4 Stars unique crew
                </TableCell>
                <TableCell align="right">
                  {catalogLoading ? (
                    <CircularProgress size={16} />
                  ) : catalogError ? (
                    'Unavailable'
                  ) : (
                    uniqueCrewCell(4)
                  )}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Stack>
  );
}

export default OverviewPage;
```

- [ ] **Step 3: Rewrite `client/src/layout/AppLayout.tsx`**

Replace the whole file with:
```tsx
import { useEffect, useState } from 'react';
import { Alert, AppBar, Box, Button, CircularProgress, Drawer, List, ListItemButton, ListItemText, Snackbar, Toolbar, Typography } from '@mui/material';
import { Outlet, useNavigate } from 'react-router-dom';
import { usePlayerData } from '../hooks/usePlayerData';
import { useCrewCatalog } from '../hooks/useCrewCatalog';
import { refreshAssets } from '../api/assetsApi';
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
  {
    label: 'Crew',
    children: [
      { label: '3/4 Stars crew', path: '/3-4-stars-crew' },
      { label: '4/5 Stars crew', path: '/4-5-stars-crew' },
      { label: '4/4 Stars crew (ready)', path: '/4-4-stars-crew-ready' },
      { label: '4/4 Stars crew', path: '/4-4-stars-crew' },
      { label: '4 Stars Duplicates', path: '/4-stars-duplicates' },
      { label: '5 Stars Duplicates', path: '/5-stars-duplicates' },
      { label: 'QPs', path: '/qps' },
    ],
  },
  {
    label: 'Ships',
    children: [
      { label: '5 Stars Ships', path: '/5-stars-ships' },
      { label: '4 Stars Ships', path: '/4-stars-ships' },
    ],
  },
  { label: 'Collections', path: '/collections' },
];

function AppLayout() {
  const navigate = useNavigate();
  const { refresh, loading } = usePlayerData();
  const [refreshingAssets, setRefreshingAssets] = useState(false);
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const [assetsSuccess, setAssetsSuccess] = useState(false);

  const { refresh: refreshCatalog, loading: catalogRefreshing, error: catalogError } = useCrewCatalog();
  const [catalogErrorSnackbarOpen, setCatalogErrorSnackbarOpen] = useState(false);

  useEffect(() => {
    if (catalogError) setCatalogErrorSnackbarOpen(true);
  }, [catalogError]);

  async function handleRefreshAssets() {
    setRefreshingAssets(true);
    setAssetsError(null);
    setAssetsSuccess(false);
    try {
      await refreshAssets();
      setAssetsSuccess(true);
    } catch (err) {
      setAssetsError(err instanceof Error ? err.message : 'Failed to refresh asset cache');
    } finally {
      setRefreshingAssets(false);
    }
  }

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
          <Button
            variant="outlined"
            onClick={() => void handleRefreshAssets()}
            disabled={refreshingAssets}
            startIcon={refreshingAssets ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{ ml: 1, color: 'common.white', borderColor: 'common.white' }}
          >
            Refresh assets
          </Button>
          <Button
            variant="outlined"
            onClick={() => void refreshCatalog()}
            disabled={catalogRefreshing}
            startIcon={catalogRefreshing ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{ ml: 1, color: 'common.white', borderColor: 'common.white' }}
          >
            Refresh catalog
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
      <Snackbar open={assetsError !== null} autoHideDuration={6000} onClose={() => setAssetsError(null)}>
        <Alert severity="error" onClose={() => setAssetsError(null)}>
          {assetsError}
        </Alert>
      </Snackbar>
      <Snackbar open={assetsSuccess} autoHideDuration={6000} onClose={() => setAssetsSuccess(false)}>
        <Alert severity="success" onClose={() => setAssetsSuccess(false)}>
          Asset cache refreshed
        </Alert>
      </Snackbar>
      <Snackbar
        open={catalogErrorSnackbarOpen}
        autoHideDuration={6000}
        onClose={() => setCatalogErrorSnackbarOpen(false)}
      >
        <Alert severity="error" onClose={() => setCatalogErrorSnackbarOpen(false)}>
          {catalogError}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default AppLayout;
```

- [ ] **Step 4: Build and lint check**

Run: `npm run build -w client`
Expected: exits 0.

Run: `npm run lint -w client`
Expected: exits 0, no new errors.

- [ ] **Step 5: Verify against a real running dev server**

Using the `playwright` MCP browser tools against a real running dev server with live data (check with the controller for the exact dev-server URL to use in this environment; a fresh `POST /api/player/refresh` beforehand is recommended so counts reflect current data):

1. Navigate to `/`. `browser_snapshot`.
2. Confirm the identity table now shows 4 rows: "Player ID", "DBID", "5 Stars unique crew", "4 Stars unique crew".
3. Confirm the two new rows show values in the form `N/M (P%)` with `N <= M` and `P` a plausible percentage (0-100).
4. Confirm the topbar now shows three buttons: "Refresh", "Refresh assets", "Refresh catalog".
5. Click "Refresh catalog". Confirm a loading spinner appears on the button, then disappears, and (assuming a successful fetch) the Overview page's two new rows still show valid values afterward (they may or may not change numerically depending on whether datacore's data changed).
6. Confirm the rest of the page (Player ID/DBID rows) was unaffected by the catalog refresh — this is a regression check that the two data sources are genuinely independent.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/OverviewPage.tsx client/src/layout/AppLayout.tsx
git commit -m "Add Overview unique-crew rows and the Refresh catalog button"
```
