# Crew Catalog TTL + Overview Percentage Format Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 24-hour TTL to the crew-catalog server cache so `GET /api/crew-catalog` automatically refetches stale data (falling back to the stale cache on a failed refetch), and change the Overview page's unique-crew percentages from whole-number rounding to 2-decimal-place, rounded-up (ceiling) formatting.

**Architecture:** Two independent tasks — a reviewer could approve either without the other. Task 1 is server-only (`catalogCache.ts` + `routes/catalog.ts`), verified by manipulating a cache file's mtime and temporarily pointing the upstream at an unreachable host, both against a real running server. Task 2 is a single client-side function body change (`OverviewPage.tsx`), verified by direct computation against real data plus two hand-picked edge cases, then a browser check.

**Tech Stack:** Same as the existing client/server workspaces — Node/Express (server), React 19/TypeScript/MUI 6 (client), no new dependencies.

## Global Constraints

- **TTL: 24 hours** (`CACHE_TTL_MS = 24 * 60 * 60 * 1000`), freshness determined by the cache file's on-disk mtime (`statSync(...).mtimeMs`) — no new metadata stored inside the cache file itself.
- **`GET /crew-catalog` behavior matrix** (exact, from the spec):
  - Cache missing → live fetch; 502 on failure.
  - Cache present, fresh (<24h) → served immediately, no upstream call.
  - Cache present, stale (≥24h) → live fetch attempted; **falls back to serving the stale cache** if that fetch fails; only 502s if there's no cache at all.
- **`POST /crew-catalog/refresh` is unchanged** — always fetches live, forced, surfaces a real error (502) on failure, no silent stale-cache fallback (this is an explicit user action via the topbar button, unlike the automatic GET-triggered refresh).
- **Percentage formula:** `Math.ceil((owned / total) * 10000) / 100`, always displayed via `.toFixed(2)` so a whole-number result still shows two digits (e.g. `50.00%`, not `50%`).
- **No automated test framework** (project-wide, deliberate choice). Task 1 verification manipulates a real cache file's mtime and temporarily breaks the real upstream URL (reverted before commit, matching the technique already used in this feature's original final-review fix round). Task 2 verification is direct computation against real numbers plus a browser check.
- **Spec:** `docs/superpowers/specs/2026-08-08-catalog-ttl-and-pct-format-design.md`.

---

### Task 1: Catalog cache TTL

**Files:**
- Modify: `server/src/catalogCache.ts`
- Modify: `server/src/routes/catalog.ts`

**Interfaces:**
- Consumes: `CatalogEntry`, `fetchCrewCatalog` (existing, `server/src/catalogClient.ts`); `UpstreamError` (existing, `server/src/errors.ts`).
- Produces: nothing new consumed by Task 2 — the two tasks are independent. `isCatalogCacheFresh(): boolean` is new but only used within `routes/catalog.ts` in this plan.

- [ ] **Step 1: Confirm the current state of both files matches this plan's assumptions**

Run: `cat -n server/src/catalogCache.ts server/src/routes/catalog.ts`

Confirm `catalogCache.ts` matches exactly:
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

Confirm `routes/catalog.ts` matches exactly:
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

If either differs, stop and re-check the spec before proceeding.

- [ ] **Step 2: Add `isCatalogCacheFresh` to `server/src/catalogCache.ts`**

Replace:
```ts
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { CatalogEntry } from './catalogClient';

const CACHE_PATH = 'data/crew-catalog-cache.json';

export function readCatalogCache(): CatalogEntry[] | null {
```
with:
```ts
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import type { CatalogEntry } from './catalogClient';

const CACHE_PATH = 'data/crew-catalog-cache.json';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — matches datacore's own regeneration cadence

export function isCatalogCacheFresh(): boolean {
  if (!existsSync(CACHE_PATH)) return false;
  try {
    return Date.now() - statSync(CACHE_PATH).mtimeMs < CACHE_TTL_MS;
  } catch {
    return false;
  }
}

export function readCatalogCache(): CatalogEntry[] | null {
```

- [ ] **Step 3: Restructure `server/src/routes/catalog.ts` around the TTL check**

Replace the whole file with:
```ts
import { Router, type Response } from 'express';
import { fetchCrewCatalog, type CatalogEntry } from '../catalogClient';
import { readCatalogCache, writeCatalogCache, isCatalogCacheFresh } from '../catalogCache';
import { UpstreamError } from '../errors';

export function createCatalogRouter(): Router {
  const router = Router();

  router.get('/crew-catalog', async (_req, res) => {
    const cached = readCatalogCache();
    if (cached !== null && isCatalogCacheFresh()) {
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

  router.post('/crew-catalog/refresh', async (_req, res) => {
    try {
      const data = await fetchLiveAndCache();
      res.json(data);
    } catch (err) {
      respondUpstreamError(res, err);
    }
  });

  return router;
}

async function fetchLiveAndCache(): Promise<CatalogEntry[]> {
  const data = await fetchCrewCatalog();
  writeCatalogCache(data);
  return data;
}

function respondUpstreamError(res: Response, err: unknown): void {
  if (err instanceof UpstreamError) {
    res.status(502).json({ error: err.message, code: 'UPSTREAM_ERROR' });
    return;
  }
  res.status(502).json({ error: 'Unexpected error fetching crew catalog', code: 'UPSTREAM_ERROR' });
}
```

Note: `fetchCrewCatalog` must now also export `CatalogEntry` as a type for this file's import to work — confirm `server/src/catalogClient.ts` already exports `CatalogEntry` (it does, as an `export interface`; TypeScript's `type` import modifier on an already-exported interface is valid and requires no change to `catalogClient.ts` itself).

- [ ] **Step 4: Build and lint check**

Run: `npm run build -w server`
Expected: exits 0.

Run: `npm run lint -w server`
Expected: exits 0, no new errors.

- [ ] **Step 5: Verify the fresh-cache path (no upstream call)**

Start the server if not already running (`npm run dev -w server` from the repo root, or `npm run dev` for both server and client).

1. `curl http://127.0.0.1:3001/api/crew-catalog` — ensure a cache exists and is fresh (if this is a cold start, this first call will fetch live and cache; run it once more afterward to guarantee freshness for this step).
2. Time a second `curl -w '\n%{time_total}\n' http://127.0.0.1:3001/api/crew-catalog` — expect a fast response (well under 1 second; served from cache, not re-fetching the ~40MB upstream).

- [ ] **Step 6: Verify the stale-cache-triggers-refetch path**

1. Artificially age the cache file so it's past the 24h TTL:
```bash
touch -d '25 hours ago' server/data/crew-catalog-cache.json
```
(If `touch -d` isn't available in this environment, use `node -e "require('fs').utimesSync('server/data/crew-catalog-cache.json', new Date(Date.now() - 25*60*60*1000), new Date(Date.now() - 25*60*60*1000))"` instead — same effect.)
2. `curl -w '\n%{time_total}\n' http://127.0.0.1:3001/api/crew-catalog` — expect a slower response this time (several seconds, since it should now be re-fetching the real ~40MB upstream) and a 200 with valid catalog data.
3. Check the cache file's mtime updated: `stat server/data/crew-catalog-cache.json` (or `ls -la`) — should now show a recent timestamp, not 25 hours ago.
4. Repeat step 2 immediately — expect a fast response again (the refetch just re-freshened the cache).

- [ ] **Step 7: Verify the stale-cache-fallback-on-failure path**

1. Re-age the cache file (same command as Step 6.1).
2. Temporarily break the upstream URL to simulate a failure: edit `server/src/catalogClient.ts`, change `CATALOG_UPSTREAM_URL` to an unreachable host (e.g. `https://datacore.invalid/structured/crew.json`). Restart the server so the change takes effect.
3. `curl -w '\nHTTP %{http_code}\n' http://127.0.0.1:3001/api/crew-catalog` — expect HTTP `200` with the **stale** (old) cached data returned, NOT a 502 — this is the fallback behavior being verified.
4. `curl -w '\nHTTP %{http_code}\n' -X POST http://127.0.0.1:3001/api/crew-catalog/refresh` — expect HTTP `502` this time (the forced-refresh POST endpoint does NOT fall back to stale data, per the spec).
5. Revert `server/src/catalogClient.ts` back to the real `CATALOG_UPSTREAM_URL` (`https://datacore.app/structured/crew.json`) — this file must show zero diff in the final commit; only `catalogCache.ts` and `routes/catalog.ts` should be modified. Restart the server and confirm `curl http://127.0.0.1:3001/api/crew-catalog` returns real, fresh data again.

- [ ] **Step 8: Commit**

```bash
git add server/src/catalogCache.ts server/src/routes/catalog.ts
git commit -m "Add a 24h TTL to the crew catalog cache with stale-fallback on refresh failure"
```

---

### Task 2: Overview percentage format

**Files:**
- Modify: `client/src/pages/OverviewPage.tsx`

**Interfaces:**
- Consumes: nothing new — `uniqueCrewCell`'s existing inputs (`getOwnedArchetypeIds`, `getCatalogCount`, both already imported) are unchanged.
- Produces: nothing consumed elsewhere — this is a self-contained display change.

- [ ] **Step 1: Confirm the current state of `OverviewPage.tsx` matches this plan's assumptions**

Run: `cat -n client/src/pages/OverviewPage.tsx`

Confirm the `uniqueCrewCell` function reads exactly:
```ts
  function uniqueCrewCell(maxRarity: number): string {
    if (!catalog) return '—';
    const owned = getOwnedArchetypeIds(crewList, frozenArchetypeIds, catalogMaxRarityById, maxRarity).size;
    const total = getCatalogCount(catalog, maxRarity);
    const pct = total > 0 ? Math.round((owned / total) * 100) : 0;
    return `${owned}/${total} (${pct}%)`;
  }
```

If it differs, stop and re-check the spec before proceeding.

- [ ] **Step 2: Change the percentage calculation to 2-decimal ceiling**

Replace:
```ts
  function uniqueCrewCell(maxRarity: number): string {
    if (!catalog) return '—';
    const owned = getOwnedArchetypeIds(crewList, frozenArchetypeIds, catalogMaxRarityById, maxRarity).size;
    const total = getCatalogCount(catalog, maxRarity);
    const pct = total > 0 ? Math.round((owned / total) * 100) : 0;
    return `${owned}/${total} (${pct}%)`;
  }
```
with:
```ts
  function uniqueCrewCell(maxRarity: number): string {
    if (!catalog) return '—';
    const owned = getOwnedArchetypeIds(crewList, frozenArchetypeIds, catalogMaxRarityById, maxRarity).size;
    const total = getCatalogCount(catalog, maxRarity);
    const pct = total > 0 ? Math.ceil((owned / total) * 10000) / 100 : 0;
    return `${owned}/${total} (${pct.toFixed(2)}%)`;
  }
```

- [ ] **Step 3: Build and lint check**

Run: `npm run build -w client`
Expected: exits 0.

Run: `npm run lint -w client`
Expected: exits 0, no new errors.

- [ ] **Step 4: Verify the formula against real and edge-case numbers**

Create a throwaway script at `client/src/__verify_pct.ts` (deleted in Step 5, never committed):

```ts
import assert from 'node:assert/strict';

function formatPct(owned: number, total: number): string {
  const pct = total > 0 ? Math.ceil((owned / total) * 10000) / 100 : 0;
  return pct.toFixed(2);
}

// Real data from the original feature.
assert.equal(formatPct(436, 1078), '40.45');
assert.equal(formatPct(683, 703), '97.16');

// Edge case: exact whole-number result still shows two digits.
assert.equal(formatPct(1, 2), '50.00');

// Edge case: ceiling, not normal rounding — 1/3 = 33.333...%, which
// normal rounding would show as 33.33%, but ceiling shows as 33.34%.
assert.equal(formatPct(1, 3), '33.34');

console.log('MATCH: all percentage-format assertions passed');
```

Run from the **repo root**: `npx tsx client/src/__verify_pct.ts`

Expected output: `MATCH: all percentage-format assertions passed`, exit code 0.

- [ ] **Step 5: Delete the throwaway verification script**

```bash
rm client/src/__verify_pct.ts
```

- [ ] **Step 6: Verify against a real running dev server**

Using the `playwright` MCP browser tools against a real running dev server with live data (check with the controller for the exact dev-server URL to use in this environment, and whether `server/data/player-cache.json` needs seeding from `example-data.json` in this worktree — see the "worktree quirk" note in project memory if unsure):

1. Navigate to `/`. `browser_snapshot`.
2. Confirm both "5 Stars unique crew" and "4 Stars unique crew" rows now show a percentage with exactly 2 decimal digits (e.g. `40.45%`, `97.16%`), not a whole number.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/OverviewPage.tsx
git commit -m "Show the Overview unique-crew percentage to 2 decimal places, rounded up"
```
