# Dilemmas: ship rewards + ship catalog — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ship rewards to the Dilemmas feature. This requires a new, ownership-independent ship catalog (mirroring the existing crew catalog exactly, since this app has no ship data source that isn't tied to the current player's own owned ships), a `type: 'crew' | 'ship'` discriminant on `Reward`, updated reward rendering, refresh-dropdown wiring so the new catalog refreshes alongside the crew catalog, and one new dilemma chain ("Blow by Blow" / "Friends in Need") whose reward is a ship ("Borg Cube").

**Architecture:** Four tasks, each independently testable: (1) server-side ship catalog proxy/cache/route, mirroring `catalogClient.ts`/`catalogCache.ts`/`routes/catalog.ts` exactly; (2) the `Reward` type-discriminant change on the server plus the new dilemma data; (3) the client-side ship catalog mirror plus refresh-dropdown wiring; (4) client-side dilemmas rendering support for ship rewards, wired to the new catalog.

**Tech Stack:** React 19 + TypeScript (strict) + MUI on the client, Node/Express + TypeScript on the server. No test framework — verification via `tsc -b client` (⚠️ **not** `tsc --noEmit -p client`, which is a documented no-op — see `docs/PROJECT_STATE.md`'s "How this project is worked on"), `tsc --noEmit -p server`, `curl`, and a real-browser check with the `playwright` npm library.

**Design reference:** `docs/superpowers/specs/2026-08-18-dilemmas-ship-rewards-design.md`.

## Global Constraints

- The ship catalog is fetched from `https://datacore.app/structured/ship_schematics.json` — each raw entry has a nested `ship` object with `archetype_id`, `name`, `icon: { file }`, `rarity`. Map to a flat `ShipCatalogEntry { archetype_id, name, icon: { file: string }, rarity }`. Confirmed live: 127 entries, includes `{ archetype_id: 2819, name: "Borg Cube", icon: { file: "/ship_previews/borg_cube" } }`.
- `Reward` becomes a discriminated union on `type: 'crew' | 'ship'`. **Never** a bare shared numeric ID — crew and ship `archetype_id`s are independent spaces that could collide.
  ```ts
  export type Reward =
    | { type: 'crew'; crewArchetypeId: number; dropRatePercent: number; showName: boolean }
    | { type: 'ship'; shipArchetypeId: number; dropRatePercent: number; showName: boolean };
  ```
- Every existing `Reward` object in `dilemmas.json` (52 of them) gets `"type": "crew"` inserted as its first key, via the exact mechanical text substitution in Task 2 Step 2 — not hand-edited, not re-serialized (a full JSON re-dump reformats the whole file into a ~600-line diff; the substitution is a ~120-line diff touching only reward-object lines).
- Ship reward rendering reuses the exact `<Thumbnail asset={...} />` pattern `ShipsTable.tsx` already uses for owned-ship icons — `ShipCatalogEntry.icon` is already the `DatacoreAsset` shape `Thumbnail`'s `asset` prop expects, no new asset-resolution logic.
- `RefreshControl`'s `'catalog'` option label changes from "Refresh catalog" to "Refresh catalogs" (plural) and now refreshes crew + ship catalogs together; `'all'` includes both.
- `ShipCatalogContext`/`useShipCatalog` mirror `CrewCatalogContext`/`useCrewCatalog`'s shape exactly, including the `fetcher`-parameterized `refresh` (this catalog *does* have a `POST /refresh` endpoint, unlike `DilemmasContext`).
- No change to the choice-icon rule, chain-boundary divider, or Drop Rate collapsing logic — a ship reward is just another reward for those purposes.
- No change to `ShipsPage.tsx`/`ShipsTable.tsx`/`ships/getters.ts` — those stay on the player's owned ships, unrelated to this new catalog.

---

### Task 1: Server — ship catalog proxy/cache/route

**Files:**
- Create: `server/src/shipCatalogClient.ts`
- Create: `server/src/shipCatalogCache.ts`
- Create: `server/src/routes/shipCatalog.ts`
- Modify: `server/src/index.ts`

**Interfaces:**
- Produces: `GET /api/ship-catalog` and `POST /api/ship-catalog/refresh`, both returning `ShipCatalogEntry[]` (JSON array, same top-level shape as `GET /api/crew-catalog`). `ShipCatalogEntry { archetype_id: number; name: string; icon: { file: string }; rarity: number }`, exported from `shipCatalogClient.ts`.

- [ ] **Step 1: Create the ship catalog client**

Create `server/src/shipCatalogClient.ts`:

```ts
import { UpstreamError } from './errors';

const SHIP_CATALOG_UPSTREAM_URL = 'https://datacore.app/structured/ship_schematics.json';

export interface ShipCatalogEntry {
  archetype_id: number;
  name: string;
  icon: { file: string };
  rarity: number;
}

interface RawShipSchematicEntry {
  id: number;
  ship?: {
    archetype_id: number;
    name: string;
    icon?: { file: string };
    rarity: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export async function fetchShipCatalog(): Promise<ShipCatalogEntry[]> {
  let response: Response;
  try {
    response = await fetch(SHIP_CATALOG_UPSTREAM_URL, { signal: AbortSignal.timeout(30_000) });
  } catch (cause) {
    throw new UpstreamError(`Network error fetching ship catalog: ${(cause as Error).message}`);
  }

  if (!response.ok) {
    throw new UpstreamError(`Ship catalog host returned HTTP ${response.status}`);
  }

  const raw = (await response.json()) as RawShipSchematicEntry[];
  return raw
    .filter((e): e is RawShipSchematicEntry & {
      ship: NonNullable<RawShipSchematicEntry['ship']> & { icon: { file: string } };
    } =>
      e.ship !== undefined && e.ship.icon !== undefined
    )
    .map((e) => ({
      archetype_id: e.ship.archetype_id,
      name: e.ship.name,
      icon: { file: e.ship.icon.file },
      rarity: e.ship.rarity,
    }));
}
```

(The filter guards against a malformed/missing `ship` or `icon` on some future upstream entry — every entry observed live has both, but this is external data this project doesn't control, same defensive posture as `catalogClient.ts` takes with `?? 0`/`?? []` fallbacks on its own raw fields. The predicate's return type intersects in `icon: { file: string }` explicitly, not just `NonNullable<...ship>` — narrowing only the outer `ship` field left `e.ship.icon` typed as still-possibly-`undefined` inside the subsequent `.map()`, confirmed by dry-running this exact snippet through `tsc --noEmit` before writing it here.)

- [ ] **Step 2: Create the ship catalog cache**

Create `server/src/shipCatalogCache.ts`:

```ts
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ShipCatalogEntry } from './shipCatalogClient';

const CACHE_PATH = 'data/ship-catalog-cache.json';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — matches the crew catalog's cache TTL

export function isShipCatalogCacheFresh(): boolean {
  if (!existsSync(CACHE_PATH)) return false;
  try {
    return Date.now() - statSync(CACHE_PATH).mtimeMs < CACHE_TTL_MS;
  } catch {
    return false;
  }
}

export function readShipCatalogCache(): ShipCatalogEntry[] | null {
  if (!existsSync(CACHE_PATH)) {
    return null;
  }
  try {
    const raw = readFileSync(CACHE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as ShipCatalogEntry[];
    if (
      parsed.length === 0 ||
      typeof parsed[0].archetype_id !== 'number' ||
      typeof parsed[0].name !== 'string' ||
      typeof parsed[0].icon?.file !== 'string'
    ) {
      // Empty, or unexpected shape — treat as absent so callers refetch live.
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeShipCatalogCache(data: ShipCatalogEntry[]): void {
  mkdirSync(dirname(CACHE_PATH), { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), 'utf-8');
}
```

- [ ] **Step 3: Create the route**

Create `server/src/routes/shipCatalog.ts`:

```ts
import { Router, type Response } from 'express';
import { fetchShipCatalog, type ShipCatalogEntry } from '../shipCatalogClient';
import { readShipCatalogCache, writeShipCatalogCache, isShipCatalogCacheFresh } from '../shipCatalogCache';
import { UpstreamError } from '../errors';

export function createShipCatalogRouter(): Router {
  const router = Router();

  router.get('/ship-catalog', async (_req, res) => {
    const cached = readShipCatalogCache();
    if (cached !== null && isShipCatalogCacheFresh()) {
      res.json(cached);
      return;
    }
    try {
      const data = await fetchLiveAndCache();
      res.json(data);
    } catch (err) {
      if (cached !== null) {
        // Background refresh failed but a (stale) cache exists — serve it rather
        // than degrading a previously-working page. POST /refresh (an explicit
        // user action) does NOT get this fallback; see below.
        res.json(cached);
        return;
      }
      respondUpstreamError(res, err);
    }
  });

  router.post('/ship-catalog/refresh', async (_req, res) => {
    try {
      const data = await fetchLiveAndCache();
      res.json(data);
    } catch (err) {
      respondUpstreamError(res, err);
    }
  });

  return router;
}

async function fetchLiveAndCache(): Promise<ShipCatalogEntry[]> {
  const data = await fetchShipCatalog();
  writeShipCatalogCache(data);
  return data;
}

function respondUpstreamError(res: Response, err: unknown): void {
  if (err instanceof UpstreamError) {
    res.status(502).json({ error: err.message, code: 'UPSTREAM_ERROR' });
    return;
  }
  res.status(502).json({ error: 'Unexpected error fetching ship catalog', code: 'UPSTREAM_ERROR' });
}
```

- [ ] **Step 4: Wire the route into the server**

Current code (`server/src/index.ts`):

```ts
import express from 'express';
import { loadConfig } from './config';
import { createPlayerRouter } from './routes/player';
import { createAssetsRouter } from './routes/assets';
import { createCatalogRouter } from './routes/catalog';
import { createCitationPrioritiesRouter } from './routes/citationPriorities';
import { createDilemmasRouter } from './routes/dilemmas';

const PORT = 3001;

const config = loadConfig();
const app = express();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', createPlayerRouter(config));
app.use('/api', createAssetsRouter());
app.use('/api', createCatalogRouter());
app.use('/api', createCitationPrioritiesRouter());
app.use('/api', createDilemmasRouter());

app.listen(PORT, '127.0.0.1', () => {
  console.log(`STT tracker server listening on http://127.0.0.1:${PORT}`);
});
```

Replace with:

```ts
import express from 'express';
import { loadConfig } from './config';
import { createPlayerRouter } from './routes/player';
import { createAssetsRouter } from './routes/assets';
import { createCatalogRouter } from './routes/catalog';
import { createCitationPrioritiesRouter } from './routes/citationPriorities';
import { createDilemmasRouter } from './routes/dilemmas';
import { createShipCatalogRouter } from './routes/shipCatalog';

const PORT = 3001;

const config = loadConfig();
const app = express();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', createPlayerRouter(config));
app.use('/api', createAssetsRouter());
app.use('/api', createCatalogRouter());
app.use('/api', createCitationPrioritiesRouter());
app.use('/api', createDilemmasRouter());
app.use('/api', createShipCatalogRouter());

app.listen(PORT, '127.0.0.1', () => {
  console.log(`STT tracker server listening on http://127.0.0.1:${PORT}`);
});
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p server`
Expected: PASS, no errors.

- [ ] **Step 6: Real endpoint check**

Start the server dev process if it isn't already running (`npm run dev -w server`, backgrounded).

Run: `curl -s http://127.0.0.1:3001/api/ship-catalog | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d)); print([e for e in d if e['archetype_id']==2819])"`
Expected: a count around 127, and the Borg Cube entry: `[{'archetype_id': 2819, 'name': 'Borg Cube', 'icon': {'file': '/ship_previews/borg_cube'}, 'rarity': 5}]` (rarity may print differently depending on the live feed, but archetype_id/name/icon must match exactly).

Run: `ls -la server/data/ship-catalog-cache.json`
Expected: file exists (created by the GET request above).

- [ ] **Step 7: Commit**

```bash
git add server/src/shipCatalogClient.ts server/src/shipCatalogCache.ts server/src/routes/shipCatalog.ts server/src/index.ts
git commit -m "Add server-side ship catalog (proxy + cache + route)"
```

---

### Task 2: Server — Reward type discriminant + new "Blow by Blow" chain

**Files:**
- Modify: `server/src/dilemmasTypes.ts`
- Modify: `server/src/data/dilemmas.json`

**Interfaces:**
- Produces: `Reward` becomes the discriminated union from Global Constraints, exported from `server/src/dilemmasTypes.ts`. `GET /api/dilemmas` now returns reward objects each carrying `"type": "crew"` or `"type": "ship"`.

- [ ] **Step 1: Change the `Reward` type**

Current code (`server/src/dilemmasTypes.ts`):

```ts
export interface Reward {
  crewArchetypeId: number;
  dropRatePercent: number;
  showName: boolean;
}

export interface Choice {
  letter: 'A' | 'B' | 'C';
  description: string;
  leadsToDilemmaId?: string;
  rewards?: Reward[];
}

export interface Dilemma {
  id: string;
  name: string;
  chainName: string;
  partNumber: number;
  choices: Choice[];
}

export interface DilemmasResponse {
  dilemmas: Dilemma[];
}
```

Replace with:

```ts
export type Reward =
  | { type: 'crew'; crewArchetypeId: number; dropRatePercent: number; showName: boolean }
  | { type: 'ship'; shipArchetypeId: number; dropRatePercent: number; showName: boolean };

export interface Choice {
  letter: 'A' | 'B' | 'C';
  description: string;
  leadsToDilemmaId?: string;
  rewards?: Reward[];
}

export interface Dilemma {
  id: string;
  name: string;
  chainName: string;
  partNumber: number;
  choices: Choice[];
}

export interface DilemmasResponse {
  dilemmas: Dilemma[];
}
```

- [ ] **Step 2: Migrate all existing reward objects to `"type": "crew"`**

Every existing `Reward` object in `server/src/data/dilemmas.json` is written as `{ "crewArchetypeId": ...`. Run this exact command from the repo root (or worktree root) to add the discriminant as each object's first key, touching nothing else in the file:

```bash
sed -i 's/{ "crewArchetypeId":/{ "type": "crew", "crewArchetypeId":/g' server/src/data/dilemmas.json
```

Verify the substitution count matches the number of reward objects (52 as of this plan — confirm the live count first in case more dilemmas were added since this plan was written):

```bash
python3 -c "
import json
d = json.load(open('server/src/data/dilemmas.json'))
count = sum(len(c.get('rewards', [])) for dd in d['dilemmas'] for c in dd['choices'])
all_typed = all(rw.get('type') == 'crew' for dd in d['dilemmas'] for c in dd['choices'] for rw in c.get('rewards', []))
print('total rewards:', count, '| all typed crew:', all_typed)
"
```

Expected: `all typed crew: True`, and `total rewards` matches `grep -c '"crewArchetypeId"' server/src/data/dilemmas.json` run *before* the `sed` (52 at plan-writing time — if the live file has grown since, both counts will simply be larger together; what matters is `all typed crew: True` and the two counts agreeing, not the literal number 52).

Also run `git diff --stat server/src/data/dilemmas.json` and eyeball a few lines of `git diff` — every changed line should show only `"type": "crew", ` inserted immediately after `{ `, nothing else different (no reformatting, no reordering, no accidental double-insertion).

- [ ] **Step 3: Append the new "Blow by Blow" / "Friends in Need" chain**

Open `server/src/data/dilemmas.json`. Find the closing of the `dilemmas` array — the last entry as of this plan is `a-tense-temporal-conundrum`, ending:

```json
        { "letter": "B", "description": "Lie to him." },
        { "letter": "C", "description": "Contact the DTI." }
      ]
    }
  ]
}
```

(If dilemmas have been added since this plan was written, the last entry will differ — regardless, insert the two new objects below as new elements at the end of the `dilemmas` array, immediately before the array's closing `]`.)

Replace the tail shown above with:

```json
        { "letter": "B", "description": "Lie to him." },
        { "letter": "C", "description": "Contact the DTI." }
      ]
    },
    {
      "id": "blow-by-blow",
      "name": "Blow by Blow",
      "chainName": "Blow by Blow",
      "partNumber": 1,
      "choices": [
        { "letter": "A", "description": "Protect the Andorian by stunning the Gorn.", "leadsToDilemmaId": "friends-in-need" },
        { "letter": "B", "description": "Protect the Gorn by stunning the Andorian." }
      ]
    },
    {
      "id": "friends-in-need",
      "name": "Friends in Need",
      "chainName": "Blow by Blow",
      "partNumber": 2,
      "choices": [
        { "letter": "A", "description": "Negotiate with the guards for freedom." },
        { "letter": "B", "description": "Ask the Andorian we rescued to distract the guards.", "rewards": [{ "type": "ship", "shipArchetypeId": 2819, "dropRatePercent": 100, "showName": true }] },
        { "letter": "C", "description": "Ask the Gorn we rescued to fight the guards." }
      ]
    }
  ]
}
```

**Do this edit after Step 2's `sed` command**, not before — `sed`'s pattern only matches `{ "crewArchetypeId":`, so it will not touch the new ship-typed reward object either way, but doing the JSON-structure edit first and the mechanical substitution second keeps the diff review simpler (one purely-mechanical commit-worthy change, one purely-additive one, in the order written here — both land in the same commit, this ordering is just for how you work through the file).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p server`
Expected: PASS, no errors. (If this fails, it's a real structural mismatch — the `dilemmasJson as DilemmasResponse` assertion in `routes/dilemmas.ts` won't catch a genuinely wrong shape, only JSON's string-literal widening; see that file's comment.)

Run: `python3 -c "import json; json.load(open('server/src/data/dilemmas.json')); print('valid JSON')"`
Expected: `valid JSON`.

- [ ] **Step 5: Real endpoint check**

Run: `curl -s http://127.0.0.1:3001/api/dilemmas | python3 -c "
import json, sys
d = json.load(sys.stdin)['dilemmas']
print('total dilemmas:', len(d))
bbb = [x for x in d if x['id'] == 'blow-by-blow']
fin = [x for x in d if x['id'] == 'friends-in-need']
print('blow-by-blow found:', len(bbb) == 1)
print('friends-in-need found:', len(fin) == 1)
if fin:
    b_rewards = fin[0]['choices'][1]['rewards']
    print('friends-in-need choice B rewards:', b_rewards)
"`
Expected: `blow-by-blow found: True`, `friends-in-need found: True`, and the reward printed as `[{'type': 'ship', 'shipArchetypeId': 2819, 'dropRatePercent': 100, 'showName': True}]`.

(The running dev server uses `tsx watch`, which does not track plain `.json` data-file changes — if the endpoint still shows the old data, `touch server/src/index.ts` to force a restart, then retry.)

- [ ] **Step 6: Commit**

```bash
git add server/src/dilemmasTypes.ts server/src/data/dilemmas.json
git commit -m "Add Reward type discriminant (crew/ship); add Blow by Blow chain with a ship reward"
```

---

### Task 3: Client — ship catalog + refresh-dropdown wiring

**Files:**
- Create: `client/src/types/shipCatalogEntry.ts`
- Create: `client/src/api/shipCatalogApi.ts`
- Create: `client/src/context/ShipCatalogContext.tsx`
- Create: `client/src/hooks/useShipCatalog.ts`
- Modify: `client/src/App.tsx`
- Modify: `client/src/layout/RefreshControl.tsx`
- Modify: `client/src/layout/AppLayout.tsx`

**Interfaces:**
- Consumes: `GET /api/ship-catalog` / `POST /api/ship-catalog/refresh` (Task 1).
- Produces: `useShipCatalog()` hook returning `{ data: ShipCatalogEntry[] | null, loading: boolean, error: string | null, refresh: () => Promise<void> }`, same shape as `useCrewCatalog()`. This is consumed by Task 4's `DilemmasPage.tsx` (not part of this task).

- [ ] **Step 1: Client-side type mirror**

Create `client/src/types/shipCatalogEntry.ts`:

```ts
export interface ShipCatalogEntry {
  archetype_id: number;
  name: string;
  icon: { file: string };
  rarity: number;
}
```

- [ ] **Step 2: API fetch wrapper**

Create `client/src/api/shipCatalogApi.ts`:

```ts
import type { ShipCatalogEntry } from '../types/shipCatalogEntry';

async function parseShipCatalogResponse(response: Response): Promise<ShipCatalogEntry[]> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error((body as { error?: string }).error ?? `Failed to load ship catalog: HTTP ${response.status}`);
  }
  return response.json() as Promise<ShipCatalogEntry[]>;
}

export async function fetchShipCatalog(): Promise<ShipCatalogEntry[]> {
  const response = await fetch('/api/ship-catalog');
  return parseShipCatalogResponse(response);
}

export async function refreshShipCatalog(): Promise<ShipCatalogEntry[]> {
  const response = await fetch('/api/ship-catalog/refresh', { method: 'POST' });
  return parseShipCatalogResponse(response);
}
```

- [ ] **Step 3: Context provider**

Create `client/src/context/ShipCatalogContext.tsx`:

```tsx
import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react';
import type { ShipCatalogEntry } from '../types/shipCatalogEntry';
import { fetchShipCatalog, refreshShipCatalog } from '../api/shipCatalogApi';

export interface ShipCatalogContextValue {
  data: ShipCatalogEntry[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export const ShipCatalogContext = createContext<ShipCatalogContextValue | undefined>(undefined);

export function ShipCatalogProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<ShipCatalogEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (fetcher: () => Promise<ShipCatalogEntry[]>) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ship catalog');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(fetchShipCatalog);
  }, [load]);

  const refresh = useCallback(() => load(refreshShipCatalog), [load]);

  return (
    <ShipCatalogContext.Provider value={{ data, loading, error, refresh }}>
      {children}
    </ShipCatalogContext.Provider>
  );
}
```

- [ ] **Step 4: Consumer hook**

Create `client/src/hooks/useShipCatalog.ts`:

```ts
import { useContext } from 'react';
import { ShipCatalogContext } from '../context/ShipCatalogContext';

export function useShipCatalog() {
  const context = useContext(ShipCatalogContext);
  if (context === undefined) {
    throw new Error('useShipCatalog must be used within a ShipCatalogProvider');
  }
  return context;
}
```

- [ ] **Step 5: Mount the provider**

Current code (`client/src/App.tsx`):

```tsx
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { PlayerDataProvider } from './context/PlayerDataContext';
import { CrewCatalogProvider } from './context/CrewCatalogContext';
import { CitationPrioritiesProvider } from './context/CitationPrioritiesContext';
import { DilemmasProvider } from './context/DilemmasContext';
import AppLayout from './layout/AppLayout';
import { ROUTES } from './routes';

function App() {
  return (
    // CitationPrioritiesProvider is deliberately OUTERMOST, not nested with
    // the others. React fires child providers' mount effects before parent
    // providers' (child-before-parent), so whichever provider is innermost
    // issues its fetch first. Citation priorities' first fetch can occupy the
    // single-threaded server for ~12-13s (see computeCitationPriorities.ts) —
    // nesting it innermost would make /api/player and /api/catalog queue
    // behind that on every cold load, stalling the whole page instead of just
    // the two citation sections. Outermost means its fetch fires last.
    // DilemmasProvider fetches a small static file — cheap regardless of
    // nesting position — so it goes innermost, alongside CrewCatalogProvider.
    <CitationPrioritiesProvider>
      <PlayerDataProvider>
        <CrewCatalogProvider>
          <DilemmasProvider>
            <BrowserRouter>
              <Routes>
                <Route element={<AppLayout />}>
                  {ROUTES.map(({ path, element }) => (
                    <Route key={path} path={path} element={element} />
                  ))}
                </Route>
              </Routes>
            </BrowserRouter>
          </DilemmasProvider>
        </CrewCatalogProvider>
      </PlayerDataProvider>
    </CitationPrioritiesProvider>
  );
}

export default App;
```

Replace with:

```tsx
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { PlayerDataProvider } from './context/PlayerDataContext';
import { CrewCatalogProvider } from './context/CrewCatalogContext';
import { CitationPrioritiesProvider } from './context/CitationPrioritiesContext';
import { DilemmasProvider } from './context/DilemmasContext';
import { ShipCatalogProvider } from './context/ShipCatalogContext';
import AppLayout from './layout/AppLayout';
import { ROUTES } from './routes';

function App() {
  return (
    // CitationPrioritiesProvider is deliberately OUTERMOST, not nested with
    // the others. React fires child providers' mount effects before parent
    // providers' (child-before-parent), so whichever provider is innermost
    // issues its fetch first. Citation priorities' first fetch can occupy the
    // single-threaded server for ~12-13s (see computeCitationPriorities.ts) —
    // nesting it innermost would make /api/player and /api/catalog queue
    // behind that on every cold load, stalling the whole page instead of just
    // the two citation sections. Outermost means its fetch fires last.
    // DilemmasProvider/ShipCatalogProvider both fetch small, cheap resources
    // regardless of nesting position — they go innermost, alongside
    // CrewCatalogProvider.
    <CitationPrioritiesProvider>
      <PlayerDataProvider>
        <CrewCatalogProvider>
          <DilemmasProvider>
            <ShipCatalogProvider>
              <BrowserRouter>
                <Routes>
                  <Route element={<AppLayout />}>
                    {ROUTES.map(({ path, element }) => (
                      <Route key={path} path={path} element={element} />
                    ))}
                  </Route>
                </Routes>
              </BrowserRouter>
            </ShipCatalogProvider>
          </DilemmasProvider>
        </CrewCatalogProvider>
      </PlayerDataProvider>
    </CitationPrioritiesProvider>
  );
}

export default App;
```

- [ ] **Step 6: Rename and extend the refresh dropdown's "catalog" option**

Current code (`client/src/layout/RefreshControl.tsx`), full file:

```tsx
import { useState } from 'react';
import { Box, Button, CircularProgress, MenuItem, Select, type SelectChangeEvent } from '@mui/material';

export type RefreshOption = 'player' | 'assets' | 'catalog' | 'all';

interface RefreshControlProps {
  playerLoading: boolean;
  onRefreshPlayer: () => Promise<void>;
  assetsRefreshing: boolean;
  onRefreshAssets: () => Promise<void>;
  catalogRefreshing: boolean;
  onRefreshCatalog: () => Promise<void>;
}

const OPTIONS: { value: RefreshOption; label: string }[] = [
  { value: 'player', label: 'Refresh player data' },
  { value: 'assets', label: 'Refresh assets' },
  { value: 'catalog', label: 'Refresh catalog' },
  { value: 'all', label: 'Refresh all' },
];

function RefreshControl({
  playerLoading,
  onRefreshPlayer,
  assetsRefreshing,
  onRefreshAssets,
  catalogRefreshing,
  onRefreshCatalog,
}: RefreshControlProps) {
  const [selected, setSelected] = useState<RefreshOption>('player');

  const isRefreshing =
    selected === 'all'
      ? playerLoading || assetsRefreshing || catalogRefreshing
      : selected === 'player'
        ? playerLoading
        : selected === 'assets'
          ? assetsRefreshing
          : catalogRefreshing;

  function handleChange(event: SelectChangeEvent<RefreshOption>) {
    setSelected(event.target.value as RefreshOption);
  }

  async function handleApply() {
    if (selected === 'player') {
      await onRefreshPlayer();
    } else if (selected === 'assets') {
      await onRefreshAssets();
    } else if (selected === 'catalog') {
      await onRefreshCatalog();
    } else {
      await Promise.allSettled([onRefreshPlayer(), onRefreshAssets(), onRefreshCatalog()]);
    }
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 'auto' }}>
      <Select<RefreshOption>
        size="small"
        value={selected}
        onChange={handleChange}
        disabled={isRefreshing}
        inputProps={{ 'aria-label': 'Refresh target' }}
        sx={{
          color: 'common.white',
          '.MuiOutlinedInput-notchedOutline': { borderColor: 'common.white' },
          '.MuiSvgIcon-root': { color: 'common.white' },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'common.white' },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'common.white' },
          '&.Mui-disabled .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.5)' },
          '&.Mui-disabled .MuiSelect-select': { WebkitTextFillColor: 'rgba(255,255,255,0.5)' },
        }}
      >
        {OPTIONS.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
      <Button
        variant="contained"
        color="success"
        onClick={() => void handleApply()}
        disabled={isRefreshing}
        startIcon={isRefreshing ? <CircularProgress size={16} color="inherit" /> : undefined}
        sx={{ '&.Mui-disabled': { bgcolor: 'success.dark', color: 'common.white' } }}
      >
        Apply
      </Button>
    </Box>
  );
}

export default RefreshControl;
```

Replace with:

```tsx
import { useState } from 'react';
import { Box, Button, CircularProgress, MenuItem, Select, type SelectChangeEvent } from '@mui/material';

export type RefreshOption = 'player' | 'assets' | 'catalog' | 'all';

interface RefreshControlProps {
  playerLoading: boolean;
  onRefreshPlayer: () => Promise<void>;
  assetsRefreshing: boolean;
  onRefreshAssets: () => Promise<void>;
  catalogRefreshing: boolean;
  onRefreshCatalog: () => Promise<void>;
  shipCatalogRefreshing: boolean;
  onRefreshShipCatalog: () => Promise<void>;
}

const OPTIONS: { value: RefreshOption; label: string }[] = [
  { value: 'player', label: 'Refresh player data' },
  { value: 'assets', label: 'Refresh assets' },
  { value: 'catalog', label: 'Refresh catalogs' },
  { value: 'all', label: 'Refresh all' },
];

function RefreshControl({
  playerLoading,
  onRefreshPlayer,
  assetsRefreshing,
  onRefreshAssets,
  catalogRefreshing,
  onRefreshCatalog,
  shipCatalogRefreshing,
  onRefreshShipCatalog,
}: RefreshControlProps) {
  const [selected, setSelected] = useState<RefreshOption>('player');

  const isRefreshing =
    selected === 'all'
      ? playerLoading || assetsRefreshing || catalogRefreshing || shipCatalogRefreshing
      : selected === 'player'
        ? playerLoading
        : selected === 'assets'
          ? assetsRefreshing
          : catalogRefreshing || shipCatalogRefreshing;

  function handleChange(event: SelectChangeEvent<RefreshOption>) {
    setSelected(event.target.value as RefreshOption);
  }

  async function handleApply() {
    if (selected === 'player') {
      await onRefreshPlayer();
    } else if (selected === 'assets') {
      await onRefreshAssets();
    } else if (selected === 'catalog') {
      await Promise.allSettled([onRefreshCatalog(), onRefreshShipCatalog()]);
    } else {
      await Promise.allSettled([onRefreshPlayer(), onRefreshAssets(), onRefreshCatalog(), onRefreshShipCatalog()]);
    }
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 'auto' }}>
      <Select<RefreshOption>
        size="small"
        value={selected}
        onChange={handleChange}
        disabled={isRefreshing}
        inputProps={{ 'aria-label': 'Refresh target' }}
        sx={{
          color: 'common.white',
          '.MuiOutlinedInput-notchedOutline': { borderColor: 'common.white' },
          '.MuiSvgIcon-root': { color: 'common.white' },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'common.white' },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'common.white' },
          '&.Mui-disabled .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.5)' },
          '&.Mui-disabled .MuiSelect-select': { WebkitTextFillColor: 'rgba(255,255,255,0.5)' },
        }}
      >
        {OPTIONS.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
      <Button
        variant="contained"
        color="success"
        onClick={() => void handleApply()}
        disabled={isRefreshing}
        startIcon={isRefreshing ? <CircularProgress size={16} color="inherit" /> : undefined}
        sx={{ '&.Mui-disabled': { bgcolor: 'success.dark', color: 'common.white' } }}
      >
        Apply
      </Button>
    </Box>
  );
}

export default RefreshControl;
```

- [ ] **Step 7: Wire `AppLayout.tsx`**

Current code (`client/src/layout/AppLayout.tsx`), full file:

```tsx
import { useEffect, useState } from 'react';
import { Alert, AppBar, Box, Drawer, List, ListItemButton, ListItemText, Snackbar, Toolbar, Typography } from '@mui/material';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { usePlayerData } from '../hooks/usePlayerData';
import { useCrewCatalog } from '../hooks/useCrewCatalog';
import { refreshAssets } from '../api/assetsApi';
import { NAV_ITEMS, isNavGroup } from '../routes';
import NavGroupItem from './NavGroupItem';
import ErrorBoundary from '../components/ErrorBoundary';
import RefreshControl from './RefreshControl';

const DRAWER_WIDTH = 220;

function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
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
          <RefreshControl
            playerLoading={loading}
            onRefreshPlayer={refresh}
            assetsRefreshing={refreshingAssets}
            onRefreshAssets={handleRefreshAssets}
            catalogRefreshing={catalogRefreshing}
            onRefreshCatalog={refreshCatalog}
          />
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
              <ListItemButton
                key={item.path}
                selected={location.pathname === item.path}
                aria-current={location.pathname === item.path ? 'page' : undefined}
                onClick={() => navigate(item.path)}
              >
                <ListItemText primary={item.label} />
              </ListItemButton>
            )
          )}
        </List>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        <Toolbar />
        <ErrorBoundary key={location.key}>
          <Outlet />
        </ErrorBoundary>
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
        open={catalogErrorSnackbarOpen && catalogError !== null}
        autoHideDuration={6000}
        onClose={() => setCatalogErrorSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
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

Replace with:

```tsx
import { useEffect, useState } from 'react';
import { Alert, AppBar, Box, Drawer, List, ListItemButton, ListItemText, Snackbar, Toolbar, Typography } from '@mui/material';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { usePlayerData } from '../hooks/usePlayerData';
import { useCrewCatalog } from '../hooks/useCrewCatalog';
import { useShipCatalog } from '../hooks/useShipCatalog';
import { refreshAssets } from '../api/assetsApi';
import { NAV_ITEMS, isNavGroup } from '../routes';
import NavGroupItem from './NavGroupItem';
import ErrorBoundary from '../components/ErrorBoundary';
import RefreshControl from './RefreshControl';

const DRAWER_WIDTH = 220;

function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh, loading } = usePlayerData();
  const [refreshingAssets, setRefreshingAssets] = useState(false);
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const [assetsSuccess, setAssetsSuccess] = useState(false);

  const { refresh: refreshCatalog, loading: catalogRefreshing, error: catalogError } = useCrewCatalog();
  const [catalogErrorSnackbarOpen, setCatalogErrorSnackbarOpen] = useState(false);

  const { refresh: refreshShipCatalog, loading: shipCatalogRefreshing, error: shipCatalogError } = useShipCatalog();
  const [shipCatalogErrorSnackbarOpen, setShipCatalogErrorSnackbarOpen] = useState(false);

  useEffect(() => {
    if (catalogError) setCatalogErrorSnackbarOpen(true);
  }, [catalogError]);

  useEffect(() => {
    if (shipCatalogError) setShipCatalogErrorSnackbarOpen(true);
  }, [shipCatalogError]);

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
          <RefreshControl
            playerLoading={loading}
            onRefreshPlayer={refresh}
            assetsRefreshing={refreshingAssets}
            onRefreshAssets={handleRefreshAssets}
            catalogRefreshing={catalogRefreshing}
            onRefreshCatalog={refreshCatalog}
            shipCatalogRefreshing={shipCatalogRefreshing}
            onRefreshShipCatalog={refreshShipCatalog}
          />
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
              <ListItemButton
                key={item.path}
                selected={location.pathname === item.path}
                aria-current={location.pathname === item.path ? 'page' : undefined}
                onClick={() => navigate(item.path)}
              >
                <ListItemText primary={item.label} />
              </ListItemButton>
            )
          )}
        </List>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        <Toolbar />
        <ErrorBoundary key={location.key}>
          <Outlet />
        </ErrorBoundary>
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
        open={catalogErrorSnackbarOpen && catalogError !== null}
        autoHideDuration={6000}
        onClose={() => setCatalogErrorSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity="error" onClose={() => setCatalogErrorSnackbarOpen(false)}>
          {catalogError}
        </Alert>
      </Snackbar>
      <Snackbar
        open={shipCatalogErrorSnackbarOpen && shipCatalogError !== null}
        autoHideDuration={6000}
        onClose={() => setShipCatalogErrorSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity="error" onClose={() => setShipCatalogErrorSnackbarOpen(false)}>
          {shipCatalogError}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default AppLayout;
```

- [ ] **Step 8: Typecheck**

Run: `npx tsc -b client`
Expected: PASS, no errors.

- [ ] **Step 9: Real-browser check**

Using the `playwright` npm library, against the running dev app (any route — the refresh control is in the shared `AppLayout`):

1. Confirm the refresh dropdown's third option reads **"Refresh catalogs"** (not "Refresh catalog").
2. Select "Refresh catalogs", click Apply, confirm the button shows its loading spinner and both `GET /api/crew-catalog`-family and `GET /api/ship-catalog`-family network activity fire (or, simpler: confirm via the Apply button's disabled/spinner state and that no error Snackbar appears with real data).
3. Select "Refresh all", click Apply, confirm it completes without error.

- [ ] **Step 10: Commit**

```bash
git add client/src/types/shipCatalogEntry.ts client/src/api/shipCatalogApi.ts client/src/context/ShipCatalogContext.tsx client/src/hooks/useShipCatalog.ts client/src/App.tsx client/src/layout/RefreshControl.tsx client/src/layout/AppLayout.tsx
git commit -m "Add client-side ship catalog; rename refresh dropdown's catalog option to refresh both catalogs"
```

---

### Task 4: Client — Dilemmas ship-reward rendering

**Files:**
- Modify: `client/src/types/dilemma.ts`
- Modify: `client/src/dilemmas/getters.ts`
- Modify: `client/src/dilemmas/DilemmasTable.tsx`
- Modify: `client/src/pages/DilemmasPage.tsx`

**Interfaces:**
- Consumes: `useShipCatalog()` (Task 3); `GET /api/dilemmas` now returning typed rewards (Task 2).
- Produces: `buildShipCatalogEntryMap(catalog: ShipCatalogEntry[]): Map<number, ShipCatalogEntry>` (mirrors `buildCatalogEntryMap`); `DilemmasTable` gains a `shipCatalogMap` prop.

- [ ] **Step 1: Update the client-side `Reward` type**

Current code (`client/src/types/dilemma.ts`):

```ts
export interface Reward {
  crewArchetypeId: number;
  dropRatePercent: number;
  showName: boolean;
}

export interface Choice {
  letter: 'A' | 'B' | 'C';
  description: string;
  leadsToDilemmaId?: string;
  rewards?: Reward[];
}

export interface Dilemma {
  id: string;
  name: string;
  chainName: string;
  partNumber: number;
  choices: Choice[];
}

export interface DilemmasResponse {
  dilemmas: Dilemma[];
}
```

Replace with:

```ts
export type Reward =
  | { type: 'crew'; crewArchetypeId: number; dropRatePercent: number; showName: boolean }
  | { type: 'ship'; shipArchetypeId: number; dropRatePercent: number; showName: boolean };

export interface Choice {
  letter: 'A' | 'B' | 'C';
  description: string;
  leadsToDilemmaId?: string;
  rewards?: Reward[];
}

export interface Dilemma {
  id: string;
  name: string;
  chainName: string;
  partNumber: number;
  choices: Choice[];
}

export interface DilemmasResponse {
  dilemmas: Dilemma[];
}
```

- [ ] **Step 2: Add `buildShipCatalogEntryMap` to `getters.ts`**

Current code (`client/src/dilemmas/getters.ts`, top import line):

```ts
import type { CatalogEntry } from '../types/catalogEntry';
import type { Choice, Dilemma } from '../types/dilemma';
```

Replace with:

```ts
import type { CatalogEntry } from '../types/catalogEntry';
import type { ShipCatalogEntry } from '../types/shipCatalogEntry';
import type { Choice, Dilemma } from '../types/dilemma';
```

Current code (`buildCatalogEntryMap`, near the end of the file):

```ts
export function buildCatalogEntryMap(catalog: CatalogEntry[]): Map<number, CatalogEntry> {
  return new Map(catalog.map((c) => [c.archetype_id, c]));
}
```

Add immediately after it (keep `buildCatalogEntryMap` unchanged):

```ts
export function buildShipCatalogEntryMap(catalog: ShipCatalogEntry[]): Map<number, ShipCatalogEntry> {
  return new Map(catalog.map((c) => [c.archetype_id, c]));
}
```

- [ ] **Step 3: Update `DilemmasTable.tsx`'s reward rendering**

Current code (`client/src/dilemmas/DilemmasTable.tsx`), full file:

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
import { CheckCircle, Cancel, FiberManualRecord } from '@mui/icons-material';
import type { Choice, Dilemma } from '../types/dilemma';
import type { CatalogEntry } from '../types/catalogEntry';
import { getChoiceIcon, type ChoiceIconKind } from './getters';
import Thumbnail from '../assets/Thumbnail';
import { ASSET_BASE_URL } from '../assets/config';
import { BLOCK_BOUNDARY_COLOR } from '../theme';

export interface DilemmasTableProps {
  // Must already be sorted by chainName then partNumber (see getters.ts's
  // sortedDilemmas) — this component only reads adjacency, it doesn't sort.
  dilemmas: Dilemma[];
  catalogMap: Map<number, CatalogEntry>;
  // chainName -> how many dilemmas share it (see getters.ts's
  // getChainSizeByName) — drives the "(part x/y)" subtitle, shown only
  // when a dilemma's own chain size is > 1.
  chainSizeByName: Map<string, number>;
}

function ChoiceIcon({ kind }: { kind: ChoiceIconKind }) {
  if (kind === 'check') return <CheckCircle fontSize="small" color="success" />;
  if (kind === 'x') return <Cancel fontSize="small" color="error" />;
  return <FiberManualRecord fontSize="small" sx={{ color: 'rgba(0, 0, 0, 0.38)' }} />;
}

function ChoicesList({ dilemma }: { dilemma: Dilemma }) {
  return (
    <Box>
      {dilemma.choices.map((choice) => (
        <Box key={choice.letter} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, py: 0.25 }}>
          <ChoiceIcon kind={getChoiceIcon(dilemma, choice)} />
          <Typography variant="body2">
            <Box component="span" sx={{ fontWeight: 'bold' }}>
              {choice.letter}:
            </Box>{' '}
            {choice.description}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

function rewardChoices(dilemma: Dilemma): Choice[] {
  return dilemma.choices.filter((c) => (c.rewards?.length ?? 0) > 0);
}

function RewardCell({ dilemma, catalogMap }: { dilemma: Dilemma; catalogMap: Map<number, CatalogEntry> }) {
  const choices = rewardChoices(dilemma);
  if (choices.length === 0) {
    return <Typography color="text.secondary">&mdash;</Typography>;
  }
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
      {choices.map((choice) => (
        <Box key={choice.letter} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 'bold', mt: 1.25 }}>
            {choice.letter}:
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {(choice.rewards ?? []).map((reward) => {
              const entry = catalogMap.get(reward.crewArchetypeId);
              return (
                <Box
                  key={reward.crewArchetypeId}
                  sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 44 }}
                >
                  <Thumbnail url={entry ? `${ASSET_BASE_URL}/${entry.imageUrlPortrait}` : undefined} />
                  {reward.showName && (
                    <Typography variant="caption" align="center" sx={{ lineHeight: 1.1, mt: 0.25 }}>
                      {entry?.name ?? `#${reward.crewArchetypeId}`}
                    </Typography>
                  )}
                </Box>
              );
            })}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function DropRateCell({ dilemma }: { dilemma: Dilemma }) {
  const choices = rewardChoices(dilemma);
  if (choices.length === 0) {
    return <Typography color="text.secondary">&mdash;</Typography>;
  }
  // Every reward within one choice's `rewards` array always shares the same
  // dropRatePercent (see Global Constraints) — rewards[0] speaks for the choice.
  const rates = choices.map((c) => (c.rewards ?? [])[0]?.dropRatePercent ?? 0);
  const uniform = rates.every((r) => r === rates[0]);
  if (uniform) {
    return <Typography variant="body2">{rates[0]}%</Typography>;
  }
  return (
    <Box>
      {choices.map((choice, i) => (
        <Typography key={choice.letter} variant="body2">
          {choice.letter}: {rates[i]}%
        </Typography>
      ))}
    </Box>
  );
}

function DilemmasTable({ dilemmas, catalogMap, chainSizeByName }: DilemmasTableProps) {
  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Name</TableCell>
            <TableCell>Choices</TableCell>
            <TableCell>Reward</TableCell>
            <TableCell>Drop Rate</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {dilemmas.map((dilemma, index) => {
            const isChainEnd =
              index === dilemmas.length - 1 || dilemmas[index + 1].chainName !== dilemma.chainName;
            const chainSize = chainSizeByName.get(dilemma.chainName) ?? 1;
            return (
              <TableRow
                key={dilemma.id}
                sx={isChainEnd ? { '& td': { borderBottom: `2px solid ${BLOCK_BOUNDARY_COLOR}` } } : undefined}
              >
                <TableCell>{index + 1}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  {dilemma.name}
                  {chainSize > 1 && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      (part {dilemma.partNumber}/{chainSize})
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <ChoicesList dilemma={dilemma} />
                </TableCell>
                <TableCell>
                  <RewardCell dilemma={dilemma} catalogMap={catalogMap} />
                </TableCell>
                <TableCell>
                  <DropRateCell dilemma={dilemma} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default DilemmasTable;
```

Replace with:

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
import { CheckCircle, Cancel, FiberManualRecord } from '@mui/icons-material';
import type { Choice, Dilemma, Reward } from '../types/dilemma';
import type { CatalogEntry } from '../types/catalogEntry';
import type { ShipCatalogEntry } from '../types/shipCatalogEntry';
import { getChoiceIcon, type ChoiceIconKind } from './getters';
import Thumbnail from '../assets/Thumbnail';
import { ASSET_BASE_URL } from '../assets/config';
import { BLOCK_BOUNDARY_COLOR } from '../theme';

export interface DilemmasTableProps {
  // Must already be sorted by chainName then partNumber (see getters.ts's
  // sortedDilemmas) — this component only reads adjacency, it doesn't sort.
  dilemmas: Dilemma[];
  catalogMap: Map<number, CatalogEntry>;
  shipCatalogMap: Map<number, ShipCatalogEntry>;
  // chainName -> how many dilemmas share it (see getters.ts's
  // getChainSizeByName) — drives the "(part x/y)" subtitle, shown only
  // when a dilemma's own chain size is > 1.
  chainSizeByName: Map<string, number>;
}

function ChoiceIcon({ kind }: { kind: ChoiceIconKind }) {
  if (kind === 'check') return <CheckCircle fontSize="small" color="success" />;
  if (kind === 'x') return <Cancel fontSize="small" color="error" />;
  return <FiberManualRecord fontSize="small" sx={{ color: 'rgba(0, 0, 0, 0.38)' }} />;
}

function ChoicesList({ dilemma }: { dilemma: Dilemma }) {
  return (
    <Box>
      {dilemma.choices.map((choice) => (
        <Box key={choice.letter} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, py: 0.25 }}>
          <ChoiceIcon kind={getChoiceIcon(dilemma, choice)} />
          <Typography variant="body2">
            <Box component="span" sx={{ fontWeight: 'bold' }}>
              {choice.letter}:
            </Box>{' '}
            {choice.description}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

function rewardChoices(dilemma: Dilemma): Choice[] {
  return dilemma.choices.filter((c) => (c.rewards?.length ?? 0) > 0);
}

// One reward icon (+ optional name), branching on the crew/ship discriminant.
// Both catalogs are keyed by their own archetype_id space — a crew reward
// only ever looks itself up in catalogMap, a ship reward only in
// shipCatalogMap, never cross-checked against the other.
function RewardIcon({
  reward,
  catalogMap,
  shipCatalogMap,
}: {
  reward: Reward;
  catalogMap: Map<number, CatalogEntry>;
  shipCatalogMap: Map<number, ShipCatalogEntry>;
}) {
  if (reward.type === 'crew') {
    const entry = catalogMap.get(reward.crewArchetypeId);
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 44 }}>
        <Thumbnail url={entry ? `${ASSET_BASE_URL}/${entry.imageUrlPortrait}` : undefined} />
        {reward.showName && (
          <Typography variant="caption" align="center" sx={{ lineHeight: 1.1, mt: 0.25 }}>
            {entry?.name ?? `#${reward.crewArchetypeId}`}
          </Typography>
        )}
      </Box>
    );
  }
  const entry = shipCatalogMap.get(reward.shipArchetypeId);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 44 }}>
      <Thumbnail asset={entry?.icon} />
      {reward.showName && (
        <Typography variant="caption" align="center" sx={{ lineHeight: 1.1, mt: 0.25 }}>
          {entry?.name ?? `#${reward.shipArchetypeId}`}
        </Typography>
      )}
    </Box>
  );
}

function RewardCell({
  dilemma,
  catalogMap,
  shipCatalogMap,
}: {
  dilemma: Dilemma;
  catalogMap: Map<number, CatalogEntry>;
  shipCatalogMap: Map<number, ShipCatalogEntry>;
}) {
  const choices = rewardChoices(dilemma);
  if (choices.length === 0) {
    return <Typography color="text.secondary">&mdash;</Typography>;
  }
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
      {choices.map((choice) => (
        <Box key={choice.letter} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 'bold', mt: 1.25 }}>
            {choice.letter}:
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {(choice.rewards ?? []).map((reward) => (
              <RewardIcon
                key={reward.type === 'crew' ? `crew-${reward.crewArchetypeId}` : `ship-${reward.shipArchetypeId}`}
                reward={reward}
                catalogMap={catalogMap}
                shipCatalogMap={shipCatalogMap}
              />
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function DropRateCell({ dilemma }: { dilemma: Dilemma }) {
  const choices = rewardChoices(dilemma);
  if (choices.length === 0) {
    return <Typography color="text.secondary">&mdash;</Typography>;
  }
  // Every reward within one choice's `rewards` array always shares the same
  // dropRatePercent (see Global Constraints) — rewards[0] speaks for the choice.
  const rates = choices.map((c) => (c.rewards ?? [])[0]?.dropRatePercent ?? 0);
  const uniform = rates.every((r) => r === rates[0]);
  if (uniform) {
    return <Typography variant="body2">{rates[0]}%</Typography>;
  }
  return (
    <Box>
      {choices.map((choice, i) => (
        <Typography key={choice.letter} variant="body2">
          {choice.letter}: {rates[i]}%
        </Typography>
      ))}
    </Box>
  );
}

function DilemmasTable({ dilemmas, catalogMap, shipCatalogMap, chainSizeByName }: DilemmasTableProps) {
  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Name</TableCell>
            <TableCell>Choices</TableCell>
            <TableCell>Reward</TableCell>
            <TableCell>Drop Rate</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {dilemmas.map((dilemma, index) => {
            const isChainEnd =
              index === dilemmas.length - 1 || dilemmas[index + 1].chainName !== dilemma.chainName;
            const chainSize = chainSizeByName.get(dilemma.chainName) ?? 1;
            return (
              <TableRow
                key={dilemma.id}
                sx={isChainEnd ? { '& td': { borderBottom: `2px solid ${BLOCK_BOUNDARY_COLOR}` } } : undefined}
              >
                <TableCell>{index + 1}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  {dilemma.name}
                  {chainSize > 1 && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      (part {dilemma.partNumber}/{chainSize})
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <ChoicesList dilemma={dilemma} />
                </TableCell>
                <TableCell>
                  <RewardCell dilemma={dilemma} catalogMap={catalogMap} shipCatalogMap={shipCatalogMap} />
                </TableCell>
                <TableCell>
                  <DropRateCell dilemma={dilemma} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default DilemmasTable;
```

- [ ] **Step 4: Wire `shipCatalogMap` into `DilemmasPage.tsx`**

Current code (`client/src/pages/DilemmasPage.tsx`), full file:

```tsx
import { useDilemmas } from '../hooks/useDilemmas';
import { useCrewCatalog } from '../hooks/useCrewCatalog';
import { sortedDilemmas, buildCatalogEntryMap, getChainSizeByName } from '../dilemmas/getters';
import DilemmasTable from '../dilemmas/DilemmasTable';
import PageShell from '../layout/PageShell';

function DilemmasPage() {
  const { data: catalog, loading: catalogLoading } = useCrewCatalog();
  const { data, loading: dilemmasLoading, error, refresh } = useDilemmas();

  const loading = dilemmasLoading || catalogLoading;
  const loaded = !loading && !error && !!data;
  const dilemmas = data ? sortedDilemmas(data.dilemmas) : [];
  const catalogMap = buildCatalogEntryMap(catalog ?? []);
  const chainSizeByName = getChainSizeByName(dilemmas);

  return (
    <PageShell
      title="Dilemmas"
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={dilemmas.length}
      emptyMessage="No dilemmas recorded yet."
    >
      <DilemmasTable dilemmas={dilemmas} catalogMap={catalogMap} chainSizeByName={chainSizeByName} />
    </PageShell>
  );
}

export default DilemmasPage;
```

Replace with:

```tsx
import { useDilemmas } from '../hooks/useDilemmas';
import { useCrewCatalog } from '../hooks/useCrewCatalog';
import { useShipCatalog } from '../hooks/useShipCatalog';
import { sortedDilemmas, buildCatalogEntryMap, buildShipCatalogEntryMap, getChainSizeByName } from '../dilemmas/getters';
import DilemmasTable from '../dilemmas/DilemmasTable';
import PageShell from '../layout/PageShell';

function DilemmasPage() {
  const { data: catalog, loading: catalogLoading } = useCrewCatalog();
  const { data: shipCatalog, loading: shipCatalogLoading } = useShipCatalog();
  const { data, loading: dilemmasLoading, error, refresh } = useDilemmas();

  const loading = dilemmasLoading || catalogLoading || shipCatalogLoading;
  const loaded = !loading && !error && !!data;
  const dilemmas = data ? sortedDilemmas(data.dilemmas) : [];
  const catalogMap = buildCatalogEntryMap(catalog ?? []);
  const shipCatalogMap = buildShipCatalogEntryMap(shipCatalog ?? []);
  const chainSizeByName = getChainSizeByName(dilemmas);

  return (
    <PageShell
      title="Dilemmas"
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={dilemmas.length}
      emptyMessage="No dilemmas recorded yet."
    >
      <DilemmasTable
        dilemmas={dilemmas}
        catalogMap={catalogMap}
        shipCatalogMap={shipCatalogMap}
        chainSizeByName={chainSizeByName}
      />
    </PageShell>
  );
}

export default DilemmasPage;
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc -b client`
Expected: PASS, no errors.

- [ ] **Step 6: Real-browser check**

Using the `playwright` npm library, against the running dev app's `/dilemmas` route, with real player/catalog/ship-catalog data loaded:

1. Confirm "Blow by Blow" and "Friends in Need" both appear, sorted correctly (alphabetically among the other chains), each showing the `(part 1/2)`/`(part 2/2)` subtitle.
2. Confirm "Blow by Blow"'s choice A shows the check icon (leads to Friends in Need), B shows X.
3. Confirm "Friends in Need"'s choice B shows the check icon, Reward column shows a real, non-placeholder Borg Cube ship image with "Borg Cube" underneath, Drop Rate `100%`. A and C show X.
4. Confirm at least 3 pre-existing crew-reward rows (e.g. "A Higher Duty, Part 3", "Lost Among the Stars", "The Buried Years") still render their crew portraits and names exactly as before — no regression from the `Reward` type change or the `RewardCell`/`RewardIcon` refactor.
5. Confirm zero console errors on the page.

- [ ] **Step 7: Commit**

```bash
git add client/src/types/dilemma.ts client/src/dilemmas/getters.ts client/src/dilemmas/DilemmasTable.tsx client/src/pages/DilemmasPage.tsx
git commit -m "Render ship rewards on the Dilemmas page"
```
