# Crew Catalog + Overview Unique-Crew Counts — Design

## What this is

Two new rows on the Overview page — "5 Stars unique crew" and "4 Stars
unique crew" — showing how many distinct (no-duplicate) crew archetypes
of that max rarity the player owns, counting **both** active-roster crew
and frozen crew (`stored_immortals`), against the total number of that
rarity that exist in the game, as `owned/total (pct%)`.

This is a genuinely new architectural piece, not just a UI addition: the
player payload alone cannot answer "what rarity is this frozen crew?"
for the vast majority of frozen entries (see below), so this feature
adds the app's third external data source — a small server-side
proxy/cache for a public community crew catalog — alongside the
existing STT-API proxy and asset-image proxy.

## The blocking problem, and how it's resolved

`player.character.stored_immortals` (the frozen-crew list) is `{ id,
quantity, qbits }[]` — `id` is the crew's `archetype_id`, with **no
rarity information**. Checked every other place an archetype could
carry `max_rarity` in the full real payload (active roster, borrowed
crew, voyage crew slots, season-exclusive crew): across all of them,
only **13 of 716** frozen archetype IDs in the sample data are
resolvable. The other **703 have no rarity anywhere in the payload.**

**Resolved via `https://datacore.app/structured/crew.json`** — a public,
unauthenticated, static JSON file published by the same community site
(`stt-datacore`) this app already hotlinks/caches crew and ship images
from (`assets.datacore.app`). It's a flat array of every crew archetype
ever added to the game (1961 entries in the version fetched during
design), each with `archetype_id` and `max_rarity` among many other
fields the app doesn't need. Verified against the real sample data:
**100% of both the 716 frozen archetype IDs and the 595 active-roster
archetype IDs resolve in it**, and everywhere the catalog's `max_rarity`
can be cross-checked against the real payload (active-roster overlap),
it matches exactly — 0 mismatches.

**No CORS headers on that URL** (confirmed directly), so the browser
can't fetch it — the same root cause that required a server proxy for
the STT game API itself. This feature adds one, mirroring the existing
`/api/player` shape exactly (a single cached JSON resource, not
per-file caching like `/api/assets`, since there's one catalog, not many
independent images).

**A lighter `crew.csv` export also exists (~1MB vs. ~40MB for the
JSON) but was ruled out** — it has no `archetype_id` column (only a
crew name and `symbol`), so it can't resolve `stored_immortals` entries,
which only carry the numeric archetype id. The `stt-datacore/website`
repo (cloned locally to check) confirms `crew.json` is the only
crew-archetype export carrying `archetype_id`.

## "Owned" and "total" definitions (confirmed)

- **Owned:** an archetype of a given max rarity counts as owned if
  *either* an active-roster crew member has that `archetype_id` (any
  level/rarity/completion state — a fresh, unleveled duplicate still
  counts), *or* the archetype is in `stored_immortals`. This is
  deliberately looser than the existing `getCollectionCrew`/
  `isImmortalized`-gated "ownedImmortalArchetypes" concept used
  elsewhere in this app (see `docs/PROJECT_STATE.md`'s "Frozen crew and
  duplicate exclusion") — that concept answers a different question
  ("does this archetype currently advance a collection?"); this feature
  answers "have I ever obtained this archetype at all?" and is not
  reused from, or merged into, the existing one.
- **Total:** every catalog entry of that max rarity, regardless of
  current obtainability (`in_portal`) — i.e. every archetype of that
  rarity ever added to the game. `in_portal` is a portal/behold-roulette
  mechanic flag, not a clean "can this ever be obtained" signal, so it's
  not used to shrink the denominator.
- Verified against the real sample + a live catalog pull: **5★ 436/1078
  (40%)**, **4★ 683/703 (97%)**.

**Forward-looking, per explicit request:** a future feature will need
lists of *missing* archetypes split by `in_portal`/not. The counting
function below takes `inPortal` as an optional parameter for exactly
this reason — `getCatalogCount(catalog, 5)` is the global total used by
this feature, `getCatalogCount(catalog, 5, true)` / `(..., false)` are
the partials that feature will need. No missing-crew list itself is
built now — only the parameter shape that avoids a rework later.

## Backend: new crew-catalog proxy/cache

Mirrors `cache.ts` / `sttClient.ts` / `routes/player.ts` (a single
whole-resource cache, GET serves cache-or-fetch-live, POST always
fetches live) rather than the per-file `assets.ts` pattern, since this
is one resource, not many independent files.

**`server/src/catalogClient.ts`:**

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

**`server/src/catalogCache.ts`** (mirrors `cache.ts` exactly):

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

**`server/src/routes/catalog.ts`** (mirrors `routes/player.ts` exactly,
including the `refresh` endpoint returning the fresh data body, not
just a status — this project's existing convention for whole-resource
caches, distinct from the per-file assets' status-only refresh):

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

`server/src/index.ts` gains `app.use('/api', createCatalogRouter());`.
No new error class needed — `UpstreamError` (existing) covers it; no
auth is required for this upstream, so `UpstreamAuthError` doesn't
apply here.

## Client: data layer

**`client/src/types/catalogEntry.ts`:**

```ts
export interface CatalogEntry {
  archetype_id: number;
  max_rarity: number;
  in_portal: boolean;
}
```

**`client/src/api/catalogApi.ts`** (mirrors `playerApi.ts`'s shape —
both GET and POST /refresh return the full array directly):

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

**`client/src/context/CrewCatalogContext.tsx`** and
**`client/src/hooks/useCrewCatalog.ts`** — structurally identical to
`PlayerDataContext.tsx`/`usePlayerData.ts` (own `data`/`loading`/
`error`/`refresh`, fetched automatically on mount, `refresh()` swallows
its own error into `error` state rather than throwing — same contract).
A second, independent provider, not merged into `PlayerDataProvider`:
genuinely separate data source with its own lifecycle, so a slow/failed
catalog fetch never blocks player-identity rendering.

`App.tsx` wraps the existing `PlayerDataProvider` tree with
`CrewCatalogProvider` alongside it (both wrap the router/layout; order
between the two doesn't matter, neither depends on the other).

## Domain logic

**New `client/src/catalog/getters.ts`:**

```ts
import type { CatalogEntry } from '../types/catalogEntry';

export function getArchetypeMaxRarityMap(catalog: CatalogEntry[]): Map<number, number> {
  return new Map(catalog.map((c) => [c.archetype_id, c.max_rarity]));
}

export function getCatalogCount(catalog: CatalogEntry[], maxRarity: number, inPortal?: boolean): number {
  return catalog.filter((c) => c.max_rarity === maxRarity && (inPortal === undefined || c.in_portal === inPortal)).length;
}
```

**New function in `client/src/crew/getters.ts`** (appended after
`getFrozenCrewArchetypeIds` — owned-archetype computation is a crew
stat, same home as the existing frozen-set getter; takes catalog data
as a parameter the way `getCollectionCrew` already takes
`frozenArchetypeIds`, no circular import):

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

Returns the `Set`, not just a count — `.size` gives this feature's
number; the set itself is the natural input a future missing-crew
feature would diff against the full catalog.

## Overview page

Two more `<TableRow>`s appended directly in `OverviewPage.tsx` after the
existing `FIELD_LABELS`-driven rows (not folded into that generic loop —
different data source and independent loading/error state):

```tsx
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
    // ...existing Stack/Typography...
    <TableBody>
      {/* ...existing FIELD_LABELS rows... */}
      <TableRow>
        <TableCell component="th" scope="row">5 Stars unique crew</TableCell>
        <TableCell align="right">
          {catalogLoading ? <CircularProgress size={16} /> : catalogError ? 'Unavailable' : uniqueCrewCell(5)}
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell component="th" scope="row">4 Stars unique crew</TableCell>
        <TableCell align="right">
          {catalogLoading ? <CircularProgress size={16} /> : catalogError ? 'Unavailable' : uniqueCrewCell(4)}
        </TableCell>
      </TableRow>
    </TableBody>
    // ...
  );
}
```

The two new rows render inside the same `{!loading && !error && identity
&& (...)}` block as the existing rows (still gated on *player* data
readiness — no identity table without a player), but their own cell
content is independently gated on `catalogLoading`/`catalogError`, so a
slow or failed datacore fetch never blocks or errors the whole page —
only those two cells show a spinner or "Unavailable".

## Topbar "Refresh catalog" button

A third `AppLayout` topbar button, visually matching the existing
"Refresh assets" outlined button, but wired through the new
`CrewCatalogContext` (unlike assets, which has no context/shared state)
so a successful refresh updates the catalog everywhere reactively — the
Overview page's numbers update on their own once the context's `data`
changes, matching how the main "Refresh" button needs no explicit
success feedback. Local component state still drives a transient error
`Snackbar`, since `refresh()` swallows its own error into context state
rather than throwing (matching `PlayerDataContext`'s existing contract)
— a `useEffect` watching `catalogError` opens the Snackbar when it goes
non-null:

```tsx
const { refresh: refreshCatalog, loading: catalogRefreshing, error: catalogError } = useCrewCatalog();
const [catalogErrorSnackbarOpen, setCatalogErrorSnackbarOpen] = useState(false);

useEffect(() => {
  if (catalogError) setCatalogErrorSnackbarOpen(true);
}, [catalogError]);
```

```tsx
<Button
  variant="outlined"
  onClick={() => void refreshCatalog()}
  disabled={catalogRefreshing}
  startIcon={catalogRefreshing ? <CircularProgress size={16} color="inherit" /> : undefined}
  sx={{ ml: 1, color: 'common.white', borderColor: 'common.white' }}
>
  Refresh catalog
</Button>
```

```tsx
<Snackbar open={catalogErrorSnackbarOpen} autoHideDuration={6000} onClose={() => setCatalogErrorSnackbarOpen(false)}>
  <Alert severity="error" onClose={() => setCatalogErrorSnackbarOpen(false)}>
    {catalogError}
  </Alert>
</Snackbar>
```

## Scope

New: `server/src/catalogClient.ts`, `server/src/catalogCache.ts`,
`server/src/routes/catalog.ts`, `client/src/types/catalogEntry.ts`,
`client/src/api/catalogApi.ts`, `client/src/context/CrewCatalogContext.tsx`,
`client/src/hooks/useCrewCatalog.ts`, `client/src/catalog/getters.ts`.
Modified: `server/src/index.ts` (route mount), `client/src/App.tsx`
(provider wiring), `client/src/crew/getters.ts` (one new function),
`client/src/pages/OverviewPage.tsx` (two rows), `client/src/layout/AppLayout.tsx`
(one button + Snackbar). No changes to any existing crew/collections/
ships logic — `getOwnedArchetypeIds` is new, additive, and not reused by
anything else.

## Verification

No automated test framework (deliberate, project-wide choice). This
feature has real new logic and a real new external dependency, so
verification is the full pattern:

- A throwaway `client/src/crew/__verify.ts` script (deleted before
  commit) asserting `getOwnedArchetypeIds`/`getCatalogCount` against
  `example-data.json` plus a real pulled `crew.json` snapshot, matching
  the numbers already verified during design (5★ 436/1078, 4★ 683/703).
- Server-side: a manual `curl localhost:3001/api/crew-catalog` /
  `curl -X POST localhost:3001/api/crew-catalog/refresh` check that the
  cache file is created at `server/data/crew-catalog-cache.json` and
  the response is a plausible-length JSON array of `{archetype_id,
  max_rarity, in_portal}` objects.
- Interactive `playwright` MCP browser checks against a real running
  dev server with live data: navigate to `/`, confirm the two new rows
  render with plausible `owned/total (pct%)` values, confirm clicking
  "Refresh catalog" shows a loading spinner and (assuming success)
  updates without erroring, and confirm the whole page still renders
  normally if catalog data is artificially made to fail (e.g. by
  pointing the fetch at a bad URL temporarily during verification) —
  the identity rows must still show while only the two new cells show
  "Unavailable".
