# Crew Catalog TTL + Overview Percentage Format — Design

## What this is

Two small, independent fixes bundled into one pass:

1. **Catalog cache TTL** — `GET /api/crew-catalog` currently serves its
   disk cache forever once one exists (see "Crew catalog and Overview
   unique-crew counts" in `docs/PROJECT_STATE.md`, Deferred issues
   backlog). Since nothing in normal usage prompts a manual catalog
   refresh (unlike player data, which the user refreshes constantly as
   core gameplay), the Overview page's `owned/total (pct%)` numbers
   would silently understate the real total more and more as new crew
   ship, with no visible indicator. This adds an automatic 24-hour
   background refetch so the number self-corrects without requiring the
   user to remember the "Refresh catalog" button.
2. **Overview percentage format** — the two unique-crew rows currently
   round to a whole-number percent (`97%`). Change to 2 decimal places,
   rounded up (ceiling), e.g. `97.16%` instead of `97%`.

## Catalog TTL

**`server/src/catalogCache.ts`** gains one new exported function, using
the cache file's on-disk modification time as the freshness signal (no
new metadata needs to be stored inside the cache file itself):

```ts
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
// ...existing imports unchanged...

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — matches datacore's own regeneration cadence

export function isCatalogCacheFresh(): boolean {
  if (!existsSync(CACHE_PATH)) return false;
  try {
    return Date.now() - statSync(CACHE_PATH).mtimeMs < CACHE_TTL_MS;
  } catch {
    return false;
  }
}
```

**`server/src/routes/catalog.ts`** restructures around a shared
`fetchLiveAndCache` helper (fetch upstream, write cache, return data —
throws on failure, same as today's inline logic) and a shared
`respondUpstreamError` helper (the existing `UpstreamError`/generic-502
branching, currently duplicated inline):

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

**Behavior matrix:**

| Cache state | GET /crew-catalog | POST /crew-catalog/refresh |
|---|---|---|
| Missing | live fetch; 502 on failure | live fetch; 502 on failure |
| Present, fresh (<24h) | served immediately, no upstream call | live fetch (forced); 502 on failure |
| Present, stale (≥24h) | live fetch; **falls back to stale cache** on failure | live fetch (forced); 502 on failure |

The client sees no difference from today for the happy path (fresh
cache, or successful background refresh) — the only new behavior is a
stale-but-still-present cache surviving a failed automatic refresh
instead of ever needing to (it couldn't fail before, since there was no
automatic refresh at all).

No changes to `client/src/api/catalogApi.ts`, `CrewCatalogContext`, or
any UI — this is a purely server-side behavior change, invisible to the
client except that the numbers it receives self-correct over time.

## Overview percentage format

**`client/src/pages/OverviewPage.tsx`**, `uniqueCrewCell`:

```ts
function uniqueCrewCell(maxRarity: number): string {
  if (!catalog) return '—';
  const owned = getOwnedArchetypeIds(crewList, frozenArchetypeIds, catalogMaxRarityById, maxRarity).size;
  const total = getCatalogCount(catalog, maxRarity);
  const pct = total > 0 ? Math.ceil((owned / total) * 10000) / 100 : 0;
  return `${owned}/${total} (${pct.toFixed(2)}%)`;
}
```

`Math.ceil(x * 10000) / 100` rounds up to 2 decimal places (multiply to
shift 2 decimal digits above the ceiling boundary, ceiling, then shift
back down) — e.g. `683/703 = 0.97155...` → `9715.5...` → `ceil` →
`9716` → `97.16`. `.toFixed(2)` guarantees exactly 2 digits are always
shown even when the ceiling result lands on a whole number (e.g. an
exact `50%` would show `50.00%`, not `50%`).

Verified against real data: **5★ 436/1078 → 40.45%** (was `40%`), **4★
683/703 → 97.16%** (was `97%`).

## Scope

Modified: `server/src/catalogCache.ts` (one new function),
`server/src/routes/catalog.ts` (restructured, same two endpoints/same
external behavior for the fresh-cache and refresh-forced cases),
`client/src/pages/OverviewPage.tsx` (one function body). No new files,
no type changes, no changes to `catalogClient.ts`, `CrewCatalogContext`,
or `catalog/getters.ts`.

## Verification

No automated test framework (deliberate, project-wide choice).

- **TTL logic:** manually manipulate a cache file's mtime (`touch -d`
  or Node's `utimesSync`) to simulate a stale cache, confirm `GET
  /api/crew-catalog` triggers a live refetch (observable via response
  timing and/or a temporary log line, removed before commit) and
  updates the cache file's mtime; confirm a fresh cache is served
  without any upstream call; confirm the stale-cache-fallback path by
  pointing the upstream URL at an unreachable host temporarily (same
  technique used in the original feature's final-review fix) with a
  deliberately-stale cache file present, and confirming the response is
  still the (correct, if old) cached data rather than a 502.
- **Percentage format:** a throwaway verify script or direct
  computation confirming `Math.ceil((owned/total)*10000)/100` against
  the real 436/1078 and 683/703 cases yields `40.45` and `97.16`
  exactly, plus two hand-picked edge cases: `owned=1, total=2` → exactly
  `50.00%` (confirms `.toFixed(2)` still shows two digits on a
  whole-number result, not `50%`), and `owned=1, total=3` → `33.34%`
  (confirms this is really ceiling, not `Math.round` — `1/3 = 33.333...%`
  rounds to `33.33%` under normal rounding but ceils to `33.34%`).
- Interactive `playwright` MCP browser check: navigate to `/`, confirm
  both rows now show 2-decimal percentages.
