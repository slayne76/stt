# Retrievable Crew Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new "Retrievable Crew" page listing a small, hand-curated set of crew eligible for Polestar retrieval, showing the usual crew columns plus their 4 chosen Polestars — backed by a new Polestar catalog subsystem and a new gitignored local config file, both read-only this phase.

**Architecture:** Two new server-side catalog-style subsystems mirroring the existing crew/ship catalog pattern exactly (Polestar catalog fetched from `datacore.app/structured/keystones.json`; a small local `retrievable-crew.json` config), plus one additive field on the existing crew catalog (`polestarFilterKeys`, derived from upstream fields `fetchCrewCatalog()` currently discards). The frontend joins four sources — retrievable-crew config, crew catalog, player's owned crew, Polestar catalog — into table rows, reusing existing `Thumbnail`/`StarRating`/`PageShell`/`usePagination` components verbatim.

**Tech Stack:** Express + TypeScript (server), React + TypeScript + MUI (client) — same as the rest of the app. No new dependencies.

**Design doc:** `docs/superpowers/specs/2026-08-19-retrievable-crew-design.md` (read this first if anything below is ambiguous — it explains the *why*, this plan is the *what/how*).

## Global Constraints

- **`npx tsc --noEmit -p client` is a silent no-op** (client/tsconfig.json is solution-style with `"files": []` + `references`) — always use `npx tsc -b client` instead. `npx tsc --noEmit -p server` is a real check and IS correct for the server side.
- **No test framework in this project (deliberate choice)** — do not add one, do not add `@playwright/test`. Verification per task is: `tsc` clean, a live `curl` check against the task's own running dev server, and (only for the final task) a real-browser Playwright check using the plain `playwright` npm library already installed as a devDependency.
- **`server/data/` is entirely gitignored** (existing `.gitignore` entry, covers the whole directory) — `server/data/polestar-catalog-cache.json` and `server/data/retrievable-crew.json` are NOT expected to appear in any task's git diff. A reviewer should not flag their absence from `git diff` as a problem; that's correct, not a gap.
- **Never commit on `main`.** All code changes happen in this plan's worktree. (The design spec and this plan file were already committed directly to `main` by the controller before the worktree was created — that's this project's established, separate convention for spec/plan docs only, not for code.)
- Every commit message ends with:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01F2ssW7YoSRbj7g7jkhdzbU
  ```
- **Realistic verification needs real cache data.** This worktree's `server/data/` starts empty (gitignored, not copied by `git worktree add`). Before any task that needs to `curl` a real, populated `/api/crew-catalog` or `/api/player` response, copy the relevant file(s) from the main checkout's `server/data/` into the worktree's `server/data/` (e.g. `cp <main-repo-root>/server/data/player-cache.json server/data/` — replace `<main-repo-root>` with this worktree's actual main-checkout path). Do not fabricate placeholder data instead.
- Every new server-side catalog subsystem (Polestar catalog) mirrors the ship-catalog subsystem's file/function naming exactly — see each task's code for the literal shapes to use, not just the general pattern.
- `RawCatalogEntry`/`RawKeystoneEntry`-style raw-upstream interfaces keep a `[key: string]: unknown` index signature (matches `catalogClient.ts`'s existing convention) — do not remove it.

---

### Task 1: Server — Polestar catalog subsystem

**Files:**
- Create: `server/src/polestarCatalogClient.ts`
- Create: `server/src/polestarCatalogCache.ts`
- Create: `server/src/routes/polestarCatalog.ts`
- Modify: `server/src/index.ts`

**Interfaces:**
- Produces: `PolestarCatalogEntry` (exported from `polestarCatalogClient.ts`) — consumed by Task 4 (client mirror) and Task 7 (resolver getters).
- Produces: `GET /api/polestar-catalog`, `POST /api/polestar-catalog/refresh` — consumed by Task 4's `polestarCatalogApi.ts`.

- [ ] **Step 1: Create `server/src/polestarCatalogClient.ts`**

```ts
import { UpstreamError } from './errors';

const POLESTAR_CATALOG_UPSTREAM_URL = 'https://datacore.app/structured/keystones.json';

export interface PolestarCatalogEntry {
  id: number;
  name: string;
  short_name: string;
  icon: { file: string };
  rarity: number;
  filter:
    | { type: 'rarity'; rarity: number }
    | { type: 'trait'; trait: string }
    | { type: 'skill'; skill: string };
}

interface RawKeystoneEntry {
  id: number;
  type: string;
  name: string;
  short_name: string;
  icon?: { file?: string };
  rarity: number;
  filter?: { type?: string; rarity?: number; trait?: string; skill?: string };
  [key: string]: unknown;
}

// datacore's keystones.json bundles individual Polestars (type: "keystone")
// together with multi-Polestar "constellation crate" bundles (type:
// "crew_keystone_crate" / "keystone_crate") in one flat list — only the
// former are actual Polestars, confirmed by inspecting the live file
// (278 "keystone" of 1913 total entries).
const POLESTAR_TYPE = 'keystone';

// Polestar icon.file values already end in ".png" (unlike ship catalog
// icon.file values, which don't) — the shared client-side getAssetUrl()
// helper always appends ".png" itself, so strip any existing suffix here
// to avoid a double extension downstream.
function stripPngSuffix(file: string): string {
  return file.replace(/\.png$/i, '');
}

function toPolestarFilter(raw: RawKeystoneEntry['filter']): PolestarCatalogEntry['filter'] | null {
  if (!raw) return null;
  if (raw.type === 'rarity' && typeof raw.rarity === 'number') {
    return { type: 'rarity', rarity: raw.rarity };
  }
  if (raw.type === 'trait' && typeof raw.trait === 'string') {
    return { type: 'trait', trait: raw.trait };
  }
  if (raw.type === 'skill' && typeof raw.skill === 'string') {
    return { type: 'skill', skill: raw.skill };
  }
  return null;
}

export async function fetchPolestarCatalog(): Promise<PolestarCatalogEntry[]> {
  let response: Response;
  try {
    response = await fetch(POLESTAR_CATALOG_UPSTREAM_URL, { signal: AbortSignal.timeout(30_000) });
  } catch (cause) {
    throw new UpstreamError(`Network error fetching polestar catalog: ${(cause as Error).message}`);
  }

  if (!response.ok) {
    throw new UpstreamError(`Polestar catalog host returned HTTP ${response.status}`);
  }

  const raw = (await response.json()) as RawKeystoneEntry[];
  const entries: PolestarCatalogEntry[] = [];
  for (const e of raw) {
    if (e.type !== POLESTAR_TYPE) continue;
    const filter = toPolestarFilter(e.filter);
    const iconFile = e.icon?.file;
    if (filter === null || typeof iconFile !== 'string') continue; // malformed upstream entry — skip rather than crash
    entries.push({
      id: e.id,
      name: e.name,
      short_name: e.short_name,
      icon: { file: stripPngSuffix(iconFile) },
      rarity: e.rarity,
      filter,
    });
  }
  return entries;
}
```

- [ ] **Step 2: Create `server/src/polestarCatalogCache.ts`** (mirrors `shipCatalogCache.ts` exactly, different path/type)

```ts
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import type { PolestarCatalogEntry } from './polestarCatalogClient';

const CACHE_PATH = 'data/polestar-catalog-cache.json';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — matches the crew/ship catalog cache TTL

export function isPolestarCatalogCacheFresh(): boolean {
  if (!existsSync(CACHE_PATH)) return false;
  try {
    return Date.now() - statSync(CACHE_PATH).mtimeMs < CACHE_TTL_MS;
  } catch {
    return false;
  }
}

export function readPolestarCatalogCache(): PolestarCatalogEntry[] | null {
  if (!existsSync(CACHE_PATH)) {
    return null;
  }
  try {
    const raw = readFileSync(CACHE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as PolestarCatalogEntry[];
    if (
      parsed.length === 0 ||
      typeof parsed[0].id !== 'number' ||
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

export function writePolestarCatalogCache(data: PolestarCatalogEntry[]): void {
  mkdirSync(dirname(CACHE_PATH), { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), 'utf-8');
}
```

- [ ] **Step 3: Create `server/src/routes/polestarCatalog.ts`** (mirrors `routes/shipCatalog.ts` exactly, different names)

```ts
import { Router, type Response } from 'express';
import { fetchPolestarCatalog, type PolestarCatalogEntry } from '../polestarCatalogClient';
import {
  readPolestarCatalogCache,
  writePolestarCatalogCache,
  isPolestarCatalogCacheFresh,
} from '../polestarCatalogCache';
import { UpstreamError } from '../errors';

export function createPolestarCatalogRouter(): Router {
  const router = Router();

  router.get('/polestar-catalog', async (_req, res) => {
    const cached = readPolestarCatalogCache();
    if (cached !== null && isPolestarCatalogCacheFresh()) {
      res.json(cached);
      return;
    }
    try {
      const data = await fetchLiveAndCache();
      res.json(data);
    } catch (err) {
      if (cached !== null) {
        res.json(cached);
        return;
      }
      respondUpstreamError(res, err);
    }
  });

  router.post('/polestar-catalog/refresh', async (_req, res) => {
    try {
      const data = await fetchLiveAndCache();
      res.json(data);
    } catch (err) {
      respondUpstreamError(res, err);
    }
  });

  return router;
}

async function fetchLiveAndCache(): Promise<PolestarCatalogEntry[]> {
  const data = await fetchPolestarCatalog();
  writePolestarCatalogCache(data);
  return data;
}

function respondUpstreamError(res: Response, err: unknown): void {
  if (err instanceof UpstreamError) {
    res.status(502).json({ error: err.message, code: 'UPSTREAM_ERROR' });
    return;
  }
  res.status(502).json({ error: 'Unexpected error fetching polestar catalog', code: 'UPSTREAM_ERROR' });
}
```

- [ ] **Step 4: Register the router in `server/src/index.ts`**

Add the import alongside the other route imports:

```ts
import { createPolestarCatalogRouter } from './routes/polestarCatalog';
```

Add the registration alongside the other `app.use` calls:

```ts
app.use('/api', createPolestarCatalogRouter());
```

- [ ] **Step 5: Verify**

```bash
npx tsc --noEmit -p server
```
Expected: no errors.

Start the server (`cd server && npm run dev`, backgrounded) and:

```bash
curl -s http://127.0.0.1:3001/api/polestar-catalog | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('total:', len(d))
names = {e['short_name'] for e in d}
for n in ['Legendary','Communicator','Compromised','Desperate','Explorer','Federation','Human','Spiritual','Starfleet','Command','Diplomacy','Science']:
    print(n, 'OK' if n in names else 'MISSING')
sample = next(e for e in d if e['short_name'] == 'Legendary')
print('sample icon.file:', sample['icon']['file'], '(must NOT end in .png)')
print('sample filter:', sample['filter'])
"
```
Expected: `total: 278`, all 12 names `OK`, icon file has no `.png` suffix, filter shows `{'type': 'rarity', 'rarity': 5}` for Legendary.

- [ ] **Step 6: Commit**

```bash
git add server/src/polestarCatalogClient.ts server/src/polestarCatalogCache.ts server/src/routes/polestarCatalog.ts server/src/index.ts
git commit -m "Add Polestar catalog subsystem (server)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01F2ssW7YoSRbj7g7jkhdzbU"
```

---

### Task 2: Server — crew catalog gains `polestarFilterKeys`

**Files:**
- Modify: `server/src/catalogClient.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `CatalogEntry.polestarFilterKeys: string[]` — consumed by Task 7's `resolveEligiblePolestars` (client).

- [ ] **Step 1: Add `unique_polestar_combos_later` to `RawCatalogEntry` and `polestarFilterKeys` to `CatalogEntry`**

In `server/src/catalogClient.ts`, change:

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
  gauntlet_rank: number;
}
```
to:
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
  gauntlet_rank: number;
  polestarFilterKeys: string[];
}
```

And change:
```ts
interface RawCatalogEntry {
  archetype_id: number;
  max_rarity: number;
  in_portal: boolean;
  name: string;
  imageUrlPortrait: string;
  traits?: string[];
  traits_hidden?: string[];
  ranks?: { scores?: { overall?: number }; gauntletRank?: number };
  unique_polestar_combos?: string[][];
  [key: string]: unknown;
}
```
to:
```ts
interface RawCatalogEntry {
  archetype_id: number;
  max_rarity: number;
  in_portal: boolean;
  name: string;
  imageUrlPortrait: string;
  traits?: string[];
  traits_hidden?: string[];
  ranks?: { scores?: { overall?: number }; gauntletRank?: number };
  unique_polestar_combos?: string[][];
  unique_polestar_combos_later?: string[][];
  [key: string]: unknown;
}
```

- [ ] **Step 2: Add the flattening helper and wire it into the mapping**

Add this function above `fetchCrewCatalog`:

```ts
// The eligible-Polestar pool for a crew, as raw filter keys (e.g.
// "crew_max_rarity_5", "communicator", "command_skill") — datacore splits
// this across two fields that must BOTH be unioned; neither is sufficient
// alone (confirmed on real data: unique_polestar_combos alone is missing
// "human"-type trait keys that only appear in unique_polestar_combos_later,
// and vice versa for some skill keys). Deduplicated and sorted for a
// deterministic response.
function flattenPolestarFilterKeys(e: RawCatalogEntry): string[] {
  const keys = new Set<string>();
  for (const combo of e.unique_polestar_combos ?? []) {
    for (const key of combo) keys.add(key);
  }
  for (const combo of e.unique_polestar_combos_later ?? []) {
    for (const key of combo) keys.add(key);
  }
  return [...keys].sort();
}
```

In `fetchCrewCatalog()`'s `raw.map((e) => ({ ... }))`, add the field:

```ts
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
    gauntlet_rank: e.ranks?.gauntletRank ?? Number.MAX_SAFE_INTEGER,
    polestarFilterKeys: flattenPolestarFilterKeys(e),
  }));
```
(keep the existing `gauntlet_rank` comment above it — only the new line is added, don't remove anything.)

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit -p server
```
Expected: no errors.

With the server running (`cd server && npm run dev`):

```bash
curl -s http://127.0.0.1:3001/api/crew-catalog | python3 -c "
import json, sys
d = json.load(sys.stdin)
m = [e for e in d if e['name'] == 'Minooki Freeman']
assert len(m) == 1, f'expected exactly 1 match, got {len(m)}'
keys = sorted(m[0]['polestarFilterKeys'])
expected = sorted(['command_skill','communicator','compromised','crew_max_rarity_5','desperate',
                    'diplomacy_skill','explorer','federation','human','science_skill','spiritual','starfleet'])
print('archetype_id:', m[0]['archetype_id'])
print('keys match expected 12:', keys == expected)
print('keys:', keys)
"
```
Expected: `keys match expected 12: True`. (If the crew catalog's live upstream data has genuinely changed since this plan was written, note the actual mismatch and flag it — don't force a match.)

- [ ] **Step 4: Commit**

```bash
git add server/src/catalogClient.ts
git commit -m "Add polestarFilterKeys to crew catalog (derived, not stored)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01F2ssW7YoSRbj7g7jkhdzbU"
```

---

### Task 3: Server — Retrievable Crew storage subsystem

**Files:**
- Create: `server/src/retrievableCrewTypes.ts`
- Create: `server/src/retrievableCrewStore.ts`
- Create: `server/src/routes/retrievableCrew.ts`
- Modify: `server/src/index.ts`

**Interfaces:**
- Produces: `RetrievableCrewEntry` (exported from `retrievableCrewTypes.ts`) — consumed by Task 5 (client mirror).
- Produces: `GET /api/retrievable-crew` — consumed by Task 5's `retrievableCrewApi.ts`.
- Produces: `writeRetrievableCrew()` — intentionally unused by any route in this phase (the next, editable phase adds the write endpoint that calls it). Do not remove it as dead code, and do not add a write route in this task — out of scope per the design spec's Non-goals.

- [ ] **Step 1: Create `server/src/retrievableCrewTypes.ts`**

```ts
export interface RetrievableCrewEntry {
  archetypeId: number;
  // Fixed 4-slot array, in Polestar #1..#4 order. null marks an empty slot.
  polestars: (number | null)[];
}
```

- [ ] **Step 2: Create `server/src/retrievableCrewStore.ts`**

```ts
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { RetrievableCrewEntry } from './retrievableCrewTypes';

const STORE_PATH = 'data/retrievable-crew.json';

// Not a remote-fetch cache (no TTL, no upstream) — this is hand-authored
// local state. Missing file just means "nothing tracked yet", not an error.
export function readRetrievableCrew(): RetrievableCrewEntry[] {
  if (!existsSync(STORE_PATH)) {
    return [];
  }
  try {
    const raw = readFileSync(STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as RetrievableCrewEntry[]) : [];
  } catch {
    return [];
  }
}

// Unused this phase — see routes/retrievableCrew.ts. Kept now so the next
// (editable) phase only needs to add a route, not storage logic.
export function writeRetrievableCrew(entries: RetrievableCrewEntry[]): void {
  mkdirSync(dirname(STORE_PATH), { recursive: true });
  writeFileSync(STORE_PATH, JSON.stringify(entries, null, 2), 'utf-8');
}
```

- [ ] **Step 3: Create `server/src/routes/retrievableCrew.ts`**

```ts
import { Router } from 'express';
import { readRetrievableCrew } from '../retrievableCrewStore';

export function createRetrievableCrewRouter(): Router {
  const router = Router();

  router.get('/retrievable-crew', (_req, res) => {
    res.json(readRetrievableCrew());
  });

  return router;
}
```

- [ ] **Step 4: Register the router in `server/src/index.ts`**

Add the import:
```ts
import { createRetrievableCrewRouter } from './routes/retrievableCrew';
```
Add the registration:
```ts
app.use('/api', createRetrievableCrewRouter());
```

- [ ] **Step 5: Verify**

```bash
npx tsc --noEmit -p server
```
Expected: no errors.

With the server running and no `server/data/retrievable-crew.json` present yet:
```bash
curl -s http://127.0.0.1:3001/api/retrievable-crew
```
Expected: `[]`.

Then write a throwaway test file to confirm the read path works end to end:
```bash
echo '[{"archetypeId": 1, "polestars": [10, 20, 30, null]}]' > server/data/retrievable-crew.json
curl -s http://127.0.0.1:3001/api/retrievable-crew
```
Expected: echoes back the exact array. Delete this throwaway file afterward (`rm server/data/retrievable-crew.json`) — it's gitignored either way, but the real seed data lands in Task 8, not here.

- [ ] **Step 6: Commit**

```bash
git add server/src/retrievableCrewTypes.ts server/src/retrievableCrewStore.ts server/src/routes/retrievableCrew.ts server/src/index.ts
git commit -m "Add Retrievable Crew storage subsystem (server, read-only)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01F2ssW7YoSRbj7g7jkhdzbU"
```

---

### Task 4: Client — Polestar catalog subsystem

**Files:**
- Create: `client/src/types/polestarCatalogEntry.ts`
- Create: `client/src/api/polestarCatalogApi.ts`
- Create: `client/src/context/PolestarCatalogContext.tsx`
- Create: `client/src/hooks/usePolestarCatalog.ts`
- Modify: `client/src/App.tsx`

**Interfaces:**
- Consumes: `GET /api/polestar-catalog`, `POST /api/polestar-catalog/refresh` (Task 1).
- Produces: `usePolestarCatalog()` returning `{ data: PolestarCatalogEntry[] | null, loading, error, refresh }` — consumed by Task 6 (refresh wiring), Task 7 (getters), Task 8 (page).

- [ ] **Step 1: Create `client/src/types/polestarCatalogEntry.ts`**

```ts
export interface PolestarCatalogEntry {
  id: number;
  name: string;
  short_name: string;
  icon: { file: string };
  rarity: number;
  filter:
    | { type: 'rarity'; rarity: number }
    | { type: 'trait'; trait: string }
    | { type: 'skill'; skill: string };
}
```

- [ ] **Step 2: Create `client/src/api/polestarCatalogApi.ts`** (mirrors `shipCatalogApi.ts` exactly)

```ts
import type { PolestarCatalogEntry } from '../types/polestarCatalogEntry';

async function parsePolestarCatalogResponse(response: Response): Promise<PolestarCatalogEntry[]> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error((body as { error?: string }).error ?? `Failed to load polestar catalog: HTTP ${response.status}`);
  }
  return response.json() as Promise<PolestarCatalogEntry[]>;
}

export async function fetchPolestarCatalog(): Promise<PolestarCatalogEntry[]> {
  const response = await fetch('/api/polestar-catalog');
  return parsePolestarCatalogResponse(response);
}

export async function refreshPolestarCatalog(): Promise<PolestarCatalogEntry[]> {
  const response = await fetch('/api/polestar-catalog/refresh', { method: 'POST' });
  return parsePolestarCatalogResponse(response);
}
```

- [ ] **Step 3: Create `client/src/context/PolestarCatalogContext.tsx`** (mirrors `ShipCatalogContext.tsx` exactly)

```tsx
import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react';
import type { PolestarCatalogEntry } from '../types/polestarCatalogEntry';
import { fetchPolestarCatalog, refreshPolestarCatalog } from '../api/polestarCatalogApi';

export interface PolestarCatalogContextValue {
  data: PolestarCatalogEntry[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export const PolestarCatalogContext = createContext<PolestarCatalogContextValue | undefined>(undefined);

export function PolestarCatalogProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<PolestarCatalogEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (fetcher: () => Promise<PolestarCatalogEntry[]>) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load polestar catalog');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(fetchPolestarCatalog);
  }, [load]);

  const refresh = useCallback(() => load(refreshPolestarCatalog), [load]);

  return (
    <PolestarCatalogContext.Provider value={{ data, loading, error, refresh }}>
      {children}
    </PolestarCatalogContext.Provider>
  );
}
```

- [ ] **Step 4: Create `client/src/hooks/usePolestarCatalog.ts`** (mirrors `useShipCatalog.ts` exactly)

```ts
import { useContext } from 'react';
import { PolestarCatalogContext } from '../context/PolestarCatalogContext';

export function usePolestarCatalog() {
  const context = useContext(PolestarCatalogContext);
  if (context === undefined) {
    throw new Error('usePolestarCatalog must be used within a PolestarCatalogProvider');
  }
  return context;
}
```

- [ ] **Step 5: Wire `PolestarCatalogProvider` into `client/src/App.tsx`**

Current file:
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

Change to (new import, comment sentence extended, `PolestarCatalogProvider` nested innermost around `BrowserRouter`):
```tsx
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { PlayerDataProvider } from './context/PlayerDataContext';
import { CrewCatalogProvider } from './context/CrewCatalogContext';
import { CitationPrioritiesProvider } from './context/CitationPrioritiesContext';
import { DilemmasProvider } from './context/DilemmasContext';
import { ShipCatalogProvider } from './context/ShipCatalogContext';
import { PolestarCatalogProvider } from './context/PolestarCatalogContext';
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
    // DilemmasProvider/ShipCatalogProvider/PolestarCatalogProvider all fetch
    // small, cheap resources regardless of nesting position — they go
    // innermost, alongside CrewCatalogProvider.
    <CitationPrioritiesProvider>
      <PlayerDataProvider>
        <CrewCatalogProvider>
          <DilemmasProvider>
            <ShipCatalogProvider>
              <PolestarCatalogProvider>
                <BrowserRouter>
                  <Routes>
                    <Route element={<AppLayout />}>
                      {ROUTES.map(({ path, element }) => (
                        <Route key={path} path={path} element={element} />
                      ))}
                    </Route>
                  </Routes>
                </BrowserRouter>
              </PolestarCatalogProvider>
            </ShipCatalogProvider>
          </DilemmasProvider>
        </CrewCatalogProvider>
      </PlayerDataProvider>
    </CitationPrioritiesProvider>
  );
}

export default App;
```

- [ ] **Step 6: Verify**

```bash
npx tsc -b client
```
Expected: no errors. (No UI consumes this yet, so this is the only check for this task — Task 1's server is already verified live.)

- [ ] **Step 7: Commit**

```bash
git add client/src/types/polestarCatalogEntry.ts client/src/api/polestarCatalogApi.ts client/src/context/PolestarCatalogContext.tsx client/src/hooks/usePolestarCatalog.ts client/src/App.tsx
git commit -m "Add Polestar catalog subsystem (client)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01F2ssW7YoSRbj7g7jkhdzbU"
```

---

### Task 5: Client — Retrievable Crew subsystem

**Files:**
- Create: `client/src/types/retrievableCrew.ts`
- Create: `client/src/api/retrievableCrewApi.ts`
- Create: `client/src/context/RetrievableCrewContext.tsx`
- Create: `client/src/hooks/useRetrievableCrew.ts`
- Modify: `client/src/App.tsx`

**Interfaces:**
- Consumes: `GET /api/retrievable-crew` (Task 3).
- Produces: `useRetrievableCrew()` returning `{ data: RetrievableCrewEntry[] | null, loading, error, refresh }` — consumed by Task 8 (page).

- [ ] **Step 1: Create `client/src/types/retrievableCrew.ts`**

```ts
export interface RetrievableCrewEntry {
  archetypeId: number;
  // Fixed 4-slot array, in Polestar #1..#4 order. null marks an empty slot.
  polestars: (number | null)[];
}
```

- [ ] **Step 2: Create `client/src/api/retrievableCrewApi.ts`** (mirrors `dilemmasApi.ts` — GET only, no refresh endpoint upstream)

```ts
import type { RetrievableCrewEntry } from '../types/retrievableCrew';

export async function fetchRetrievableCrew(): Promise<RetrievableCrewEntry[]> {
  const response = await fetch('/api/retrievable-crew');
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error((body as { error?: string }).error ?? `Failed to load retrievable crew: HTTP ${response.status}`);
  }
  return response.json() as Promise<RetrievableCrewEntry[]>;
}
```

- [ ] **Step 3: Create `client/src/context/RetrievableCrewContext.tsx`** (mirrors `DilemmasContext.tsx` exactly — `refresh` just re-fetches our own endpoint, there's no upstream to hit)

```tsx
import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react';
import type { RetrievableCrewEntry } from '../types/retrievableCrew';
import { fetchRetrievableCrew } from '../api/retrievableCrewApi';

export interface RetrievableCrewContextValue {
  data: RetrievableCrewEntry[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export const RetrievableCrewContext = createContext<RetrievableCrewContextValue | undefined>(undefined);

export function RetrievableCrewProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<RetrievableCrewEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchRetrievableCrew();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load retrievable crew');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <RetrievableCrewContext.Provider value={{ data, loading, error, refresh: load }}>
      {children}
    </RetrievableCrewContext.Provider>
  );
}
```

- [ ] **Step 4: Create `client/src/hooks/useRetrievableCrew.ts`** (mirrors `useDilemmas.ts` exactly)

```ts
import { useContext } from 'react';
import { RetrievableCrewContext } from '../context/RetrievableCrewContext';

export function useRetrievableCrew() {
  const context = useContext(RetrievableCrewContext);
  if (context === undefined) {
    throw new Error('useRetrievableCrew must be used within a RetrievableCrewProvider');
  }
  return context;
}
```

- [ ] **Step 5: Wire `RetrievableCrewProvider` into `client/src/App.tsx`**

Starting from Task 4's result, add the import:
```tsx
import { RetrievableCrewProvider } from './context/RetrievableCrewContext';
```
Extend the comment's last sentence to also mention it, and nest it innermost, around `BrowserRouter`:
```tsx
    // DilemmasProvider/ShipCatalogProvider/PolestarCatalogProvider/
    // RetrievableCrewProvider all fetch small, cheap resources regardless of
    // nesting position — they go innermost, alongside CrewCatalogProvider.
    <CitationPrioritiesProvider>
      <PlayerDataProvider>
        <CrewCatalogProvider>
          <DilemmasProvider>
            <ShipCatalogProvider>
              <PolestarCatalogProvider>
                <RetrievableCrewProvider>
                  <BrowserRouter>
                    <Routes>
                      <Route element={<AppLayout />}>
                        {ROUTES.map(({ path, element }) => (
                          <Route key={path} path={path} element={element} />
                        ))}
                      </Route>
                    </Routes>
                  </BrowserRouter>
                </RetrievableCrewProvider>
              </PolestarCatalogProvider>
            </ShipCatalogProvider>
          </DilemmasProvider>
        </CrewCatalogProvider>
      </PlayerDataProvider>
    </CitationPrioritiesProvider>
```

- [ ] **Step 6: Verify**

```bash
npx tsc -b client
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add client/src/types/retrievableCrew.ts client/src/api/retrievableCrewApi.ts client/src/context/RetrievableCrewContext.tsx client/src/hooks/useRetrievableCrew.ts client/src/App.tsx
git commit -m "Add Retrievable Crew subsystem (client, read-only)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01F2ssW7YoSRbj7g7jkhdzbU"
```

---

### Task 6: Client — RefreshControl + AppLayout wiring for Polestar catalog

**Files:**
- Modify: `client/src/layout/RefreshControl.tsx`
- Modify: `client/src/layout/AppLayout.tsx`

**Interfaces:**
- Consumes: `usePolestarCatalog()` (Task 4).

- [ ] **Step 1: Extend `RefreshControlProps` and wiring in `client/src/layout/RefreshControl.tsx`**

Change the props interface from:
```ts
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
```
to:
```ts
interface RefreshControlProps {
  playerLoading: boolean;
  onRefreshPlayer: () => Promise<void>;
  assetsRefreshing: boolean;
  onRefreshAssets: () => Promise<void>;
  catalogRefreshing: boolean;
  onRefreshCatalog: () => Promise<void>;
  shipCatalogRefreshing: boolean;
  onRefreshShipCatalog: () => Promise<void>;
  polestarCatalogRefreshing: boolean;
  onRefreshPolestarCatalog: () => Promise<void>;
}
```

Change the component signature and `isRefreshing` from:
```ts
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
```
to:
```ts
function RefreshControl({
  playerLoading,
  onRefreshPlayer,
  assetsRefreshing,
  onRefreshAssets,
  catalogRefreshing,
  onRefreshCatalog,
  shipCatalogRefreshing,
  onRefreshShipCatalog,
  polestarCatalogRefreshing,
  onRefreshPolestarCatalog,
}: RefreshControlProps) {
  const [selected, setSelected] = useState<RefreshOption>('player');

  const isRefreshing =
    selected === 'all'
      ? playerLoading || assetsRefreshing || catalogRefreshing || shipCatalogRefreshing || polestarCatalogRefreshing
      : selected === 'player'
        ? playerLoading
        : selected === 'assets'
          ? assetsRefreshing
          : catalogRefreshing || shipCatalogRefreshing || polestarCatalogRefreshing;
```

Change `handleApply` from:
```ts
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
```
to:
```ts
  async function handleApply() {
    if (selected === 'player') {
      await onRefreshPlayer();
    } else if (selected === 'assets') {
      await onRefreshAssets();
    } else if (selected === 'catalog') {
      await Promise.allSettled([onRefreshCatalog(), onRefreshShipCatalog(), onRefreshPolestarCatalog()]);
    } else {
      await Promise.allSettled([
        onRefreshPlayer(),
        onRefreshAssets(),
        onRefreshCatalog(),
        onRefreshShipCatalog(),
        onRefreshPolestarCatalog(),
      ]);
    }
  }
```

- [ ] **Step 2: Wire it up in `client/src/layout/AppLayout.tsx`**

Replace the entire file's contents with:

```tsx
import { useEffect, useState } from 'react';
import { Alert, AppBar, Box, Drawer, List, ListItemButton, ListItemText, Snackbar, Toolbar, Typography } from '@mui/material';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { usePlayerData } from '../hooks/usePlayerData';
import { useCrewCatalog } from '../hooks/useCrewCatalog';
import { useShipCatalog } from '../hooks/useShipCatalog';
import { usePolestarCatalog } from '../hooks/usePolestarCatalog';
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

  const { refresh: refreshPolestarCatalog, loading: polestarCatalogRefreshing, error: polestarCatalogError } =
    usePolestarCatalog();
  const [polestarCatalogErrorSnackbarOpen, setPolestarCatalogErrorSnackbarOpen] = useState(false);

  useEffect(() => {
    if (catalogError) setCatalogErrorSnackbarOpen(true);
  }, [catalogError]);

  useEffect(() => {
    if (shipCatalogError) setShipCatalogErrorSnackbarOpen(true);
  }, [shipCatalogError]);

  useEffect(() => {
    if (polestarCatalogError) setPolestarCatalogErrorSnackbarOpen(true);
  }, [polestarCatalogError]);

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
            polestarCatalogRefreshing={polestarCatalogRefreshing}
            onRefreshPolestarCatalog={refreshPolestarCatalog}
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
      <Snackbar
        open={polestarCatalogErrorSnackbarOpen && polestarCatalogError !== null}
        autoHideDuration={6000}
        onClose={() => setPolestarCatalogErrorSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity="error" onClose={() => setPolestarCatalogErrorSnackbarOpen(false)}>
          {polestarCatalogError}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default AppLayout;
```

- [ ] **Step 3: Verify**

```bash
npx tsc -b client
```
Expected: no errors.

With both server and client dev servers running (`cd server && npm run dev`, `cd client && npm run dev`), open the app in a browser (Playwright, headless) and confirm the topbar "Refresh catalogs" and "Refresh all" options are present and don't throw a console error when clicked (network calls will include `/api/polestar-catalog/refresh`).

- [ ] **Step 4: Commit**

```bash
git add client/src/layout/RefreshControl.tsx client/src/layout/AppLayout.tsx
git commit -m "Wire Polestar catalog into Refresh catalogs / Refresh all

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01F2ssW7YoSRbj7g7jkhdzbU"
```

---

### Task 7: Client — crew catalog type extension + Polestar getters + table component

**Files:**
- Modify: `client/src/types/catalogEntry.ts`
- Create: `client/src/polestars/getters.ts`
- Create: `client/src/polestars/RetrievableCrewTable.tsx`

**Interfaces:**
- Consumes: `CatalogEntry` (extended), `PolestarCatalogEntry` (Task 4), `RetrievableCrewEntry` (Task 5), `CrewMember` (existing `types/crew.ts`), `Collection` (existing `types/collection.ts`), `getCrewCollections` (existing `collections/getters.ts`), `getEquipmentSlotsRemaining` (existing `crew/getters.ts`), `ASSET_BASE_URL` (existing `assets/config.ts`).
- Produces: `RetrievableCrewRow`, `buildRetrievableCrewRows`, `buildPolestarCatalogMap`, `resolvePolestarSlot`, `resolveEligiblePolestars`, `resolvePolestarFilterKey` (all from `polestars/getters.ts`) and the default-exported `RetrievableCrewTable` component — all consumed by Task 8 (page).

- [ ] **Step 1: Extend `client/src/types/catalogEntry.ts`**

Change:
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
  gauntlet_rank: number;
}
```
to:
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
  gauntlet_rank: number;
  polestarFilterKeys: string[];
}
```

- [ ] **Step 2: Create `client/src/polestars/getters.ts`**

```ts
import type { CatalogEntry } from '../types/catalogEntry';
import type { CrewMember } from '../types/crew';
import type { Collection } from '../types/collection';
import type { PolestarCatalogEntry } from '../types/polestarCatalogEntry';
import type { RetrievableCrewEntry } from '../types/retrievableCrew';
import { getCrewCollections } from '../collections/getters';
import { getEquipmentSlotsRemaining } from '../crew/getters';
import { ASSET_BASE_URL } from '../assets/config';

export interface RetrievableCrewRow {
  archetypeId: number;
  name: string;
  portraitUrl: string;
  maxRarity: number;
  rarity: number | null; // null = not currently owned
  level: number | null;
  itemsToEquip: number | null;
  totalCollections: number;
  polestarIds: (number | null)[]; // length 4, Polestar #1..#4 in order
}

export function buildPolestarCatalogMap(catalog: PolestarCatalogEntry[]): Map<number, PolestarCatalogEntry> {
  return new Map(catalog.map((p) => [p.id, p]));
}

const SKILL_FILTER_KEYS = new Set([
  'command_skill',
  'diplomacy_skill',
  'security_skill',
  'engineering_skill',
  'science_skill',
  'medicine_skill',
]);

const RARITY_KEY_PATTERN = /^crew_max_rarity_(\d)$/;

// Resolves one raw polestarFilterKey (from CatalogEntry.polestarFilterKeys)
// to its catalog entry: a "crew_max_rarity_N" key is a rarity Polestar, one
// of the 6 known "*_skill" keys is a skill Polestar, anything else is a
// trait Polestar. Unused by RetrievableCrewTable this phase (the table only
// renders the 4 chosen slots) — this is plumbing for the next phase's
// "choose up to 4 from the eligible pool" picker.
export function resolvePolestarFilterKey(
  key: string,
  polestarCatalog: PolestarCatalogEntry[]
): PolestarCatalogEntry | null {
  const rarityMatch = RARITY_KEY_PATTERN.exec(key);
  if (rarityMatch) {
    const rarity = Number(rarityMatch[1]);
    return polestarCatalog.find((p) => p.filter.type === 'rarity' && p.filter.rarity === rarity) ?? null;
  }
  if (SKILL_FILTER_KEYS.has(key)) {
    return polestarCatalog.find((p) => p.filter.type === 'skill' && p.filter.skill === key) ?? null;
  }
  return polestarCatalog.find((p) => p.filter.type === 'trait' && p.filter.trait === key) ?? null;
}

// Same "unused this phase, plumbing for the next" note as above.
export function resolveEligiblePolestars(
  filterKeys: string[],
  polestarCatalog: PolestarCatalogEntry[]
): PolestarCatalogEntry[] {
  return filterKeys
    .map((key) => resolvePolestarFilterKey(key, polestarCatalog))
    .filter((entry): entry is PolestarCatalogEntry => entry !== null);
}

// Resolves one chosen Polestar slot (an id or null) to its catalog entry.
// null in, null out; an id with no catalog match also yields null (renders
// as "—", never throws) — retrievable-crew.json is hand-authored data with
// no schema validation against the live Polestar catalog.
export function resolvePolestarSlot(
  id: number | null,
  polestarCatalogMap: Map<number, PolestarCatalogEntry>
): PolestarCatalogEntry | null {
  if (id === null) return null;
  return polestarCatalogMap.get(id) ?? null;
}

// Picks the most-invested owned copy of a tracked archetype, if any:
// highest rarity first, then highest level. Every other crew page in this
// app shows ALL owned copies as separate rows; this page shows exactly one
// row per tracked crew regardless of how many copies are owned, so a
// tie-break is needed.
function pickBestOwnedCopy(archetypeId: number, crewList: CrewMember[]): CrewMember | null {
  const owned = crewList.filter((c) => c.archetype_id === archetypeId);
  if (owned.length === 0) return null;
  return [...owned].sort((a, b) => b.rarity - a.rarity || b.level - a.level)[0];
}

// A tracked archetype missing from the live crew catalog (e.g. removed
// upstream) is skipped rather than rendered with broken/placeholder data.
export function buildRetrievableCrewRows(
  entries: RetrievableCrewEntry[],
  catalog: CatalogEntry[],
  crewList: CrewMember[],
  collections: Collection[]
): RetrievableCrewRow[] {
  const catalogMap = new Map(catalog.map((c) => [c.archetype_id, c]));
  const rows: RetrievableCrewRow[] = [];
  for (const entry of entries) {
    const catalogEntry = catalogMap.get(entry.archetypeId);
    if (!catalogEntry) continue;
    const owned = pickBestOwnedCopy(entry.archetypeId, crewList);
    rows.push({
      archetypeId: entry.archetypeId,
      name: catalogEntry.name,
      portraitUrl: `${ASSET_BASE_URL}/${catalogEntry.imageUrlPortrait}`,
      maxRarity: catalogEntry.max_rarity,
      rarity: owned?.rarity ?? null,
      level: owned?.level ?? null,
      itemsToEquip: owned ? getEquipmentSlotsRemaining(owned) : null,
      totalCollections: getCrewCollections(catalogEntry, collections).length,
      polestarIds: entry.polestars,
    });
  }
  return rows;
}
```

- [ ] **Step 3: Create `client/src/polestars/RetrievableCrewTable.tsx`**

```tsx
import { Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import type { PolestarCatalogEntry } from '../types/polestarCatalogEntry';
import type { RetrievableCrewRow } from './getters';
import { resolvePolestarSlot } from './getters';
import { usePagination } from '../lib/usePagination';
import StarRating from '../crew/StarRating';
import Thumbnail from '../assets/Thumbnail';
import TablePaginationFooter from '../components/TablePaginationFooter';

export interface RetrievableCrewTableProps {
  rows: RetrievableCrewRow[];
  polestarCatalogMap: Map<number, PolestarCatalogEntry>;
}

function EmDash() {
  return <Typography color="text.secondary">&mdash;</Typography>;
}

function PolestarCell({
  id,
  polestarCatalogMap,
}: {
  id: number | null;
  polestarCatalogMap: Map<number, PolestarCatalogEntry>;
}) {
  const entry = resolvePolestarSlot(id, polestarCatalogMap);
  if (entry === null) {
    return <EmDash />;
  }
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 56 }}>
      <Thumbnail asset={entry.icon} />
      <Typography variant="caption" align="center" sx={{ lineHeight: 1.1, mt: 0.25 }}>
        {entry.short_name}
      </Typography>
    </Box>
  );
}

function RetrievableCrewTable({ rows, polestarCatalogMap }: RetrievableCrewTableProps) {
  const { pageItems, page, pageSize, showPagination, handlePageChange, handlePageSizeChange } = usePagination(rows);

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
            <TableCell align="right">Total collections</TableCell>
            <TableCell>Polestar #1</TableCell>
            <TableCell>Polestar #2</TableCell>
            <TableCell>Polestar #3</TableCell>
            <TableCell>Polestar #4</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {pageItems.map((row, index) => (
            <TableRow key={row.archetypeId}>
              <TableCell>{page * pageSize + index + 1}</TableCell>
              <TableCell>
                <Thumbnail url={row.portraitUrl} />
              </TableCell>
              <TableCell>
                {row.rarity === null ? <EmDash /> : <StarRating rarity={row.rarity} maxRarity={row.maxRarity} />}
              </TableCell>
              <TableCell>{row.name}</TableCell>
              <TableCell align="right">{row.level === null ? <EmDash /> : row.level}</TableCell>
              <TableCell align="right">{row.itemsToEquip === null ? <EmDash /> : row.itemsToEquip}</TableCell>
              <TableCell align="right">{row.totalCollections}</TableCell>
              {row.polestarIds.map((id, slotIndex) => (
                <TableCell key={slotIndex}>
                  <PolestarCell id={id} polestarCatalogMap={polestarCatalogMap} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
        <TablePaginationFooter
          show={showPagination}
          count={rows.length}
          page={page}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          colSpan={11}
        />
      </Table>
    </TableContainer>
  );
}

export default RetrievableCrewTable;
```

- [ ] **Step 4: Verify**

```bash
npx tsc -b client
```
Expected: no errors. (No page wires this component up yet — that's Task 8. This task is verified by clean compilation plus the reviewer reading the code against the design spec's cross-check example.)

- [ ] **Step 5: Commit**

```bash
git add client/src/types/catalogEntry.ts client/src/polestars/getters.ts client/src/polestars/RetrievableCrewTable.tsx
git commit -m "Add Polestar getters and RetrievableCrewTable component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01F2ssW7YoSRbj7g7jkhdzbU"
```

---

### Task 8: Client — Retrievable Crew page, nav wiring, seed data, end-to-end verification

**Files:**
- Create: `client/src/pages/RetrievableCrewPage.tsx`
- Modify: `client/src/routes.tsx`

**Interfaces:**
- Consumes: `usePlayerData()`, `useCrewCatalog()`, `usePolestarCatalog()`, `useRetrievableCrew()`, `getCrewList`/`getCollectionsList`, `buildRetrievableCrewRows`/`buildPolestarCatalogMap` (Task 7), `RetrievableCrewTable` (Task 7), `PageShell` (existing).

- [ ] **Step 1: Create `client/src/pages/RetrievableCrewPage.tsx`**

```tsx
import { usePlayerData } from '../hooks/usePlayerData';
import { useCrewCatalog } from '../hooks/useCrewCatalog';
import { usePolestarCatalog } from '../hooks/usePolestarCatalog';
import { useRetrievableCrew } from '../hooks/useRetrievableCrew';
import { getCrewList } from '../crew/getters';
import { getCollectionsList } from '../collections/getters';
import { buildRetrievableCrewRows, buildPolestarCatalogMap } from '../polestars/getters';
import RetrievableCrewTable from '../polestars/RetrievableCrewTable';
import PageShell from '../layout/PageShell';

function RetrievableCrewPage() {
  const { data: playerData, loading: playerLoading } = usePlayerData();
  const { data: catalog, loading: catalogLoading } = useCrewCatalog();
  const { data: polestarCatalog, loading: polestarCatalogLoading } = usePolestarCatalog();
  const { data: retrievableCrew, loading: retrievableCrewLoading, error, refresh } = useRetrievableCrew();

  const loading = playerLoading || catalogLoading || polestarCatalogLoading || retrievableCrewLoading;
  const loaded = !loading && !error && !!retrievableCrew;

  const crewList = playerData ? getCrewList(playerData) : [];
  const collections = playerData ? getCollectionsList(playerData) : [];
  const rows = loaded ? buildRetrievableCrewRows(retrievableCrew, catalog ?? [], crewList, collections) : [];
  const polestarCatalogMap = buildPolestarCatalogMap(polestarCatalog ?? []);

  return (
    <PageShell
      title="Retrievable Crew"
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={rows.length}
      emptyMessage="No retrievable crew tracked yet."
    >
      <RetrievableCrewTable rows={rows} polestarCatalogMap={polestarCatalogMap} />
    </PageShell>
  );
}

export default RetrievableCrewPage;
```

- [ ] **Step 2: Wire the nav item in `client/src/routes.tsx`**

Add the import alongside `DilemmasPage`:
```tsx
import RetrievableCrewPage from './pages/RetrievableCrewPage';
```

Add the nav entry immediately after Dilemmas (last item in `NAV_ITEMS`, top-level — not nested in a group, matching Dilemmas/Collections/Overview):
```tsx
  { label: 'Dilemmas', path: '/dilemmas', element: <DilemmasPage /> },
  { label: 'Retrievable Crew', path: '/retrievable-crew', element: <RetrievableCrewPage /> },
];
```

- [ ] **Step 3: Verify — types**

```bash
npx tsc -b client
npx tsc --noEmit -p server
```
Expected: both clean.

- [ ] **Step 4: Seed real data and verify live**

Ensure both dev servers are running with real cache data available (per Global Constraints — copy `player-cache.json` and any other needed `server/data/*.json` files from the main checkout into this worktree's `server/data/` first if not already done for an earlier task).

Resolve the real archetype ID and confirm the cross-check from the design spec still holds through the actual running server:
```bash
curl -s http://127.0.0.1:3001/api/crew-catalog | python3 -c "
import json, sys
d = json.load(sys.stdin)
m = [e for e in d if e['name'] == 'Minooki Freeman']
assert len(m) == 1
print('archetype_id:', m[0]['archetype_id'])
print('polestarFilterKeys:', sorted(m[0]['polestarFilterKeys']))
"
```

Resolve the three chosen Polestars' real IDs:
```bash
curl -s http://127.0.0.1:3001/api/polestar-catalog | python3 -c "
import json, sys
d = json.load(sys.stdin)
for short_name in ['Desperate', 'Explorer', 'Spiritual']:
    m = [e for e in d if e['short_name'] == short_name]
    assert len(m) == 1, short_name
    print(short_name, m[0]['id'])
"
```

Write the seed file using the real IDs from both commands above (substitute the actual numbers — do not guess or reuse numbers from this plan, they were not known when it was written):
```bash
cat > server/data/retrievable-crew.json <<'EOF'
[
  { "archetypeId": <real Minooki Freeman archetype_id>, "polestars": [<real Desperate id>, <real Explorer id>, <real Spiritual id>, null] }
]
EOF
```

Confirm the API serves it:
```bash
curl -s http://127.0.0.1:3001/api/retrievable-crew
```
Expected: the exact array just written.

- [ ] **Step 5: Verify — real browser**

Using the plain `playwright` npm library (already a devDependency — see this repo's root `CLAUDE.md` for the exact usage pattern; do not install `@playwright/test` or `puppeteer`), navigate to the running client's `/retrievable-crew` route and confirm:
- The left nav shows "Retrievable Crew" immediately after "Dilemmas".
- The table renders exactly one row: Image is a portrait (not a placeholder box), Stars shows the player's actual owned rarity for Minooki Freeman (not `—`, since the design's example implies this crew is owned), Name is "Minooki Freeman", Level and Items to equip show real numbers (not `—`), Total collections shows a number.
- Polestar #1/#2/#3 each show an icon + "Desperate"/"Explorer"/"Spiritual" respectively; Polestar #4 shows `—`.
- No console errors during load.

Take a screenshot of the rendered row as evidence (scroll-to-row technique if the page is tall, matching this session's established Playwright pattern — see `docs/PROJECT_STATE.md`/prior session history if unfamiliar with why full-page screenshots at extreme heights are avoided).

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/RetrievableCrewPage.tsx client/src/routes.tsx
git commit -m "Add Retrievable Crew page + nav item

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01F2ssW7YoSRbj7g7jkhdzbU"
```

Note: `server/data/retrievable-crew.json` (written in Step 4) is gitignored and will NOT be part of this commit — that's expected. It stays in this worktree for now; the controller copies the same content into the main checkout's `server/data/retrievable-crew.json` after this branch merges (see the design spec's "Seed data" section) — that is a controller step, not part of this task.

---

## Post-merge step (controller, not a dispatched task)

After this plan's branch merges to `main` and is verified there: copy (or recreate) `server/data/retrievable-crew.json` — with the same real, resolved values used in Task 8 — into the main checkout's `server/data/`, then re-run the live `curl`/browser verification against the main checkout's running servers before reporting completion to the user.
