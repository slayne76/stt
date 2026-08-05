# Asset cache proxy (Phase 2 of 2) — design

Date: 2026-08-05

## Context

Phase 1 (`docs/superpowers/specs/2026-08-05-crew-ship-image-column-design.md`,
shipped and merged) added a crew/ship thumbnail image column that hotlinks
directly to `https://assets.datacore.app` on every page render. Phase 1 was
deliberately designed with a single-constant seam (`ASSET_BASE_URL` in
`client/src/assets/config.ts`) specifically so a later caching layer could be
introduced without touching `getAssetUrl`'s logic or the `Thumbnail`
component at all.

This spec is that later phase: a Node-backend proxy/cache so the browser
loads images from the local Express server instead of the public host on
every view, avoiding repeated requests to a third-party site the user
doesn't control. The proxy caches lazily (on first request per asset, not a
bulk pre-fetch) and is asset-type-agnostic — it has no idea whether a
filename is a crew portrait, a ship preview, or a future item/reward icon,
the same agnosticism `getAssetUrl` already has.

## Server: cache storage

New `server/src/assetCache.ts`, following the same flat-file convention as
the existing `server/src/cache.ts` (which caches the player JSON payload),
but for binary image files plus a "confirmed missing" marker:

```ts
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CACHE_DIR = 'data/assets';

function cachedFilePath(filename: string): string {
  return join(CACHE_DIR, filename);
}

function missingMarkerPath(filename: string): string {
  return join(CACHE_DIR, `${filename}.missing`);
}

export function getCachedAssetPath(filename: string): string | null {
  const path = cachedFilePath(filename);
  return existsSync(path) ? path : null;
}

export function isKnownMissing(filename: string): boolean {
  return existsSync(missingMarkerPath(filename));
}

export function writeAssetCache(filename: string, data: Buffer): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cachedFilePath(filename), data);
}

export function markAssetMissing(filename: string): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(missingMarkerPath(filename), '');
}

export function clearAssetCache(): void {
  if (!existsSync(CACHE_DIR)) return;
  for (const entry of readdirSync(CACHE_DIR)) {
    rmSync(join(CACHE_DIR, entry));
  }
}
```

One real file per cached image (e.g.
`data/assets/crew_portraits_cm_pike_amand_rauth_sm.png`), one empty
`<filename>.missing` marker per confirmed-absent asset, both flat in
`data/assets/` — same directory the existing `data/player-cache.json`
already lives under, gitignored the same way (the existing
`server/data/` gitignore entry already covers this; no gitignore change
needed since `data/` as a whole is already ignored).

**Only a confirmed 404 from datacore.app is remembered as missing.** A
network error or a non-404 error status is a transient failure, not
confirmed absence — it must not permanently blacklist an asset from ever
being retried. This distinction is enforced by `fetchAsset`'s return
contract below, not by `assetCache.ts` itself (which just does what it's
told).

## Server: upstream fetch

New `server/src/assetClient.ts`, sibling to the existing `sttClient.ts` but
much simpler — no session cookie, no auth headers:

```ts
import { UpstreamError } from './errors';

const ASSET_UPSTREAM_BASE = 'https://assets.datacore.app';

export async function fetchAsset(filename: string): Promise<Buffer | null> {
  let response: Response;
  try {
    response = await fetch(`${ASSET_UPSTREAM_BASE}/${filename}`);
  } catch (cause) {
    throw new UpstreamError(`Network error fetching asset: ${(cause as Error).message}`);
  }

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new UpstreamError(`Asset host returned HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
```

`null` return means "confirmed does not exist" (caller marks missing).
A thrown `UpstreamError` means "something went wrong that isn't a confirmed
absence" (caller does not mark missing, and responds 502 so the client's
existing `Thumbnail` `onError` fallback handles it exactly like any other
failed image load).

`ASSET_UPSTREAM_BASE` is the server-side equivalent of the client's
`ASSET_BASE_URL` — a literal constant in its own right, matching the
"static URL parts as constants" requirement from the original ask, now on
both sides of the proxy boundary.

## Server: the proxy route

New `server/src/routes/assets.ts`, same router-factory shape as the
existing `server/src/routes/player.ts`:

```ts
import { Router } from 'express';
import { getCachedAssetPath, isKnownMissing, writeAssetCache, markAssetMissing, clearAssetCache } from '../assetCache';
import { fetchAsset } from '../assetClient';
import { UpstreamError } from '../errors';

const FILENAME_PATTERN = /^[A-Za-z0-9_-]+\.png$/;

export function createAssetsRouter(): Router {
  const router = Router();

  router.get('/assets/:filename', async (req, res) => {
    const { filename } = req.params;
    if (!FILENAME_PATTERN.test(filename)) {
      res.status(400).json({ error: 'Invalid asset filename' });
      return;
    }

    const cachedPath = getCachedAssetPath(filename);
    if (cachedPath !== null) {
      res.type('image/png').sendFile(cachedPath, { root: process.cwd() });
      return;
    }

    if (isKnownMissing(filename)) {
      res.status(404).json({ error: 'Asset not found (cached)' });
      return;
    }

    try {
      const data = await fetchAsset(filename);
      if (data === null) {
        markAssetMissing(filename);
        res.status(404).json({ error: 'Asset not found' });
        return;
      }
      writeAssetCache(filename, data);
      res.type('image/png').send(data);
    } catch (err) {
      if (err instanceof UpstreamError) {
        res.status(502).json({ error: err.message, code: 'UPSTREAM_ERROR' });
        return;
      }
      res.status(502).json({ error: 'Unexpected error fetching asset', code: 'UPSTREAM_ERROR' });
    }
  });

  router.post('/assets/refresh', (_req, res) => {
    clearAssetCache();
    res.json({ status: 'ok' });
  });

  return router;
}
```

**The `FILENAME_PATTERN` guard is a security boundary, not a nicety.**
`:filename` is attacker-controllable input on a route that uses it to build
both a filesystem path (`getCachedAssetPath`/`writeAssetCache`) and an
upstream URL (`fetchAsset`). Restricting it to
`[A-Za-z0-9_-]+\.png` before it touches either one rules out path
traversal (`..`), absolute paths, and any character that could change the
upstream request's meaning — matching every real filename `getAssetUrl`
actually produces (verified in Phase 1's final review: the real payload's
`file` paths only ever contain `[A-Za-z0-9_-]` segments), so this is a
zero-cost restriction for legitimate traffic.

Wired into `server/src/index.ts` alongside the existing player router:

```ts
app.use('/api', createPlayerRouter(config));
app.use('/api', createAssetsRouter());
```

## Client: repointing the seam

The entire client-side change to existing logic is one constant:

```ts
// client/src/assets/config.ts
export const ASSET_BASE_URL = '/api/assets'; // was 'https://assets.datacore.app'
```

`getAssetUrl.ts` and `Thumbnail.tsx` are untouched. `getAssetUrl` already
builds `${ASSET_BASE_URL}/${path}.png`, so it now produces e.g.
`/api/assets/crew_portraits_cm_pike_amand_rauth_sm.png` — a same-origin
relative path that flows through Vite's existing dev-server proxy (the
`/api` prefix it already forwards to the Express server on port 3001 for
`/api/player`) with no new proxy configuration and no CORS concerns.

## Client: "Refresh assets" action

New `client/src/api/assetsApi.ts`, matching the shape of the existing
`client/src/api/playerApi.ts`:

```ts
export async function refreshAssets(): Promise<void> {
  const response = await fetch('/api/assets/refresh', { method: 'POST' });
  if (!response.ok) {
    throw new Error(`Failed to refresh asset cache: HTTP ${response.status}`);
  }
}
```

New button in `client/src/layout/AppLayout.tsx`'s topbar, next to the
existing green "Refresh" button:

```tsx
<Button
  variant="outlined"
  onClick={() => void handleRefreshAssets()}
  disabled={refreshingAssets}
  startIcon={refreshingAssets ? <CircularProgress size={16} /> : undefined}
  sx={{ ml: 1 }}
>
  Refresh assets
</Button>
```

Visually secondary (`variant="outlined"`, no `color="success"`) since this
is a rare, niche action compared to the primary data Refresh. Uses its own
local `refreshingAssets` loading state (not `usePlayerData()`'s `loading`,
which is specifically about player-data fetch state) — clicking it calls
`refreshAssets()`, shows a spinner while in flight, and does not touch
player data at all. Symmetrically, the existing "Refresh" button continues
to not touch the image cache. The two actions are fully independent, per
explicit design choice.

**Known, accepted simplification:** clicking "Refresh assets" clears the
server's disk cache but does not force the browser to immediately re-fetch
images already loaded in the currently-open page — seeing a re-fetched
image may require navigating away and back, or reloading. Not worth
cache-busting query params or ETag/conditional-request machinery for an
action this rare, given game art essentially never changes upstream.

## Error handling summary

| Situation | Server behavior | Client-visible result |
|---|---|---|
| Asset cached on disk | Served from disk, no upstream call | Image loads normally |
| Not cached, confirmed 404 upstream | Marked missing, 404 returned | `Thumbnail`'s existing `onError` → placeholder |
| Already known-missing | 404 returned immediately, no upstream call | Same placeholder, no repeated upstream request |
| Not cached, network/5xx error upstream | 502 returned, **not** marked missing | Same placeholder this time; retried on next request |
| Malformed `:filename` | 400 returned | Same placeholder (via `onError`) |

No new client-side error-handling code is needed anywhere except the two
new pieces above (`assetsApi.ts`, the button) — `Thumbnail`'s existing
`onError` fallback, built in Phase 1, already treats "any non-2xx image
response" as a failed load and shows the placeholder, which is exactly the
right behavior for every failure row in the table above.

## Verification

Same convention as Phase 1: no automated test framework. A throwaway
`server/src/__verify-assets.ts`-style script (or a handful of `curl`
commands, whichever is more direct) exercising the real proxy route
against a running dev server: a cache-miss request that populates the
cache, a repeat request confirmed to skip the upstream fetch (e.g. by
temporarily pointing `ASSET_UPSTREAM_BASE` at an unreachable host and
confirming the second request still succeeds from disk), a confirmed-404
filename becoming a cached-missing marker, and `POST /api/assets/refresh`
observed to clear both. Plus TypeScript compilation and ESLint for both
workspaces. Manual/browser-based verification of the rendered result
should be attempted again — if the sandbox's headless-browser tooling gap
from Phase 1 (documented in `docs/PROJECT_STATE.md`'s deferred-issues
backlog) still exists, that limitation will be flagged the same way rather
than silently skipped.

## Out of scope

- Bulk pre-fetch/cache-warming (explicitly rejected in favor of lazy
  on-demand caching).
- Any change to which asset variant is used for crew/ships, or extending
  the image column to a new asset kind (items/rewards) — this spec only
  adds the caching layer underneath what Phase 1 already renders.
- Browser-side cache-busting for the "Refresh assets" action (documented
  above as an accepted simplification).
- Any change to `getAssetUrl.ts`'s logic, `Thumbnail.tsx`, or the
  `DatacoreAsset` type — Phase 1's design already made this phase a
  pure-addition, config-swap change by construction.
