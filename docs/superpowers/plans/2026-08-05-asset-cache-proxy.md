# Asset Cache Proxy (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Node-backend proxy/cache so crew and ship thumbnail images load from the local Express server instead of hotlinking `assets.datacore.app` directly on every page view, with a separate manual "Refresh assets" action to bust the cache.

**Architecture:** A new Express route (`GET /api/assets/:filename`) checks a flat on-disk cache before falling back to fetching from the public asset host; a confirmed 404 gets remembered so it's never re-requested, while a transient failure is not remembered and gets retried next time. The client's `ASSET_BASE_URL` constant (the seam Phase 1 built specifically for this) is repointed at the new local route — `getAssetUrl.ts` and `Thumbnail.tsx` need zero other changes. A new, independent "Refresh assets" button clears the server cache on demand.

**Tech Stack:** Node 24 + Express + TypeScript (server workspace), React 19 + TypeScript + MUI 6 (client workspace), native `fetch`.

## Global Constraints

- Server-side upstream constant: `ASSET_UPSTREAM_BASE = 'https://assets.datacore.app'` (in `server/src/assetClient.ts`) — exact literal value.
- Cache directory: `data/assets` (relative to the server workspace's cwd, matching the existing `server/src/cache.ts`'s `data/player-cache.json` convention) — already covered by the existing `server/data/` gitignore entry, no gitignore change needed.
- Cached files are named exactly as the incoming `:filename` route param (e.g. `crew_portraits_cm_pike_amand_rauth_sm.png`); a confirmed-missing asset gets an empty marker file at `<filename>.missing` in the same directory.
- Only a confirmed HTTP 404 from the upstream host is remembered as missing. A network error or any other non-2xx/non-404 status is a transient failure and must NOT be marked missing — it must be retried on the next request.
- `:filename` must be validated against `/^[A-Za-z0-9_-]+\.png$/` before it touches the filesystem or the upstream URL — reject anything else with 400. This is a security boundary (path traversal / URL injection prevention), not a style preference.
- Client-side seam: `client/src/assets/config.ts`'s `ASSET_BASE_URL` changes from `'https://assets.datacore.app'` to `'/api/assets'` — this is the ONLY change to existing client asset code. `getAssetUrl.ts` and `Thumbnail.tsx` must not be modified in this plan.
- The "Refresh assets" button/action is fully independent of the existing "Refresh" (player-data) button — neither triggers the other. The new button uses `variant="outlined"` (not `color="success"`) since it's a secondary, rarer action, and shows its own loading spinner while in flight, following the same spinner pattern as the existing Refresh button.
- This project has no automated test framework (deliberate, repeatedly-reaffirmed project-wide choice — see `docs/PROJECT_STATE.md`). Verification is TypeScript compilation (`npm run build --workspace=server` / `--workspace=client`), ESLint (`npm run lint --workspace=server` / `--workspace=client`), throwaway data-driven verify scripts, and curl-based checks against the real running dev server — outbound internet access to `assets.datacore.app` is available in this environment (confirmed directly: a known-good filename returns HTTP 200, a nonexistent one returns HTTP 404).
- When a task's manual verification needs to start a dev server: if the port is already occupied, do not kill the existing process (it may belong to another concurrent session) — report this in the task report and prefer an alternate port. If you do kill something, flag it explicitly.

---

### Task 1: Server-side asset cache + upstream fetch client

**Files:**
- Create: `server/src/assetCache.ts`
- Create: `server/src/assetClient.ts`
- Verify (throwaway, deleted before commit): `server/src/__verify-assets.ts`

**Interfaces:**
- Produces: `getCachedAssetPath(filename: string): string | null`, `isKnownMissing(filename: string): boolean`, `writeAssetCache(filename: string, data: Buffer): void`, `markAssetMissing(filename: string): void`, `clearAssetCache(): void` (all exported from `server/src/assetCache.ts`); `fetchAsset(filename: string): Promise<Buffer | null>` (exported from `server/src/assetClient.ts`, throws `UpstreamError` — imported from `../errors`, already exists — on transient failure, returns `null` on confirmed 404).

- [ ] **Step 1: Create the asset cache module**

Create `server/src/assetCache.ts`:

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

- [ ] **Step 2: Create the upstream fetch client**

Create `server/src/assetClient.ts`:

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

- [ ] **Step 3: Write the throwaway verify script**

Create `server/src/__verify-assets.ts`:

```ts
import { existsSync } from 'node:fs';
import { getCachedAssetPath, isKnownMissing, writeAssetCache, markAssetMissing, clearAssetCache } from './assetCache';
import { fetchAsset } from './assetClient';

async function main() {
  clearAssetCache();

  if (getCachedAssetPath('test_asset.png') !== null) {
    throw new Error('FAIL: expected no cached path before any write');
  }
  console.log('PASS: getCachedAssetPath returns null before write');

  writeAssetCache('test_asset.png', Buffer.from('fake-png-bytes'));
  const path = getCachedAssetPath('test_asset.png');
  if (path === null || !existsSync(path)) {
    throw new Error('FAIL: expected cached path to exist after write');
  }
  console.log('PASS: writeAssetCache + getCachedAssetPath round-trip:', path);

  markAssetMissing('nonexistent_asset.png');
  if (!isKnownMissing('nonexistent_asset.png')) {
    throw new Error('FAIL: expected isKnownMissing to be true after markAssetMissing');
  }
  console.log('PASS: markAssetMissing + isKnownMissing round-trip');

  clearAssetCache();
  if (getCachedAssetPath('test_asset.png') !== null || isKnownMissing('nonexistent_asset.png')) {
    throw new Error('FAIL: expected cache to be empty after clearAssetCache');
  }
  console.log('PASS: clearAssetCache wipes both real files and missing markers');

  const goodData = await fetchAsset('crew_portraits_cm_boimler_bold_sm.png');
  if (goodData === null || goodData.length === 0) {
    throw new Error('FAIL: expected fetchAsset to return real image bytes for a known-good filename');
  }
  console.log(`PASS: fetchAsset returned ${goodData.length} bytes for a known-good asset`);

  const missingData = await fetchAsset('this_definitely_does_not_exist_12345.png');
  if (missingData !== null) {
    throw new Error('FAIL: expected fetchAsset to return null for a confirmed-missing filename');
  }
  console.log('PASS: fetchAsset returns null for a confirmed-404 filename');

  console.log('All assertions passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 4: Run the verify script**

Run from `server/`: `npx tsx src/__verify-assets.ts`

Expected: six `PASS` lines in order, ending with `All assertions passed.`, exit code 0. `crew_portraits_cm_boimler_bold_sm.png` is a real, known-good asset (independently confirmed to return HTTP 200 during this plan's design); `this_definitely_does_not_exist_12345.png` is expected to 404. If the network calls fail for connectivity reasons rather than a code bug (e.g. no outbound internet in this specific execution environment), say so explicitly in the report rather than silently treating it as a pass — the filesystem-only assertions (steps 1-4 in the script) should still pass regardless of network availability, so a partial pass with a clearly-labeled network failure is informative; report it as DONE_WITH_CONCERNS in that case, not BLOCKED.

- [ ] **Step 5: Type-check**

Run: `npm run build --workspace=server`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 6: Delete the throwaway verify script and any test cache artifacts**

```bash
rm server/src/__verify-assets.ts
rm -rf server/data/assets
```

(The verify script's own steps already clear the cache directory before finishing, but removing the directory here guarantees no leftover state regardless — `server/data/` is gitignored, so this is safe scratch space.)

- [ ] **Step 7: Commit**

```bash
git add server/src/assetCache.ts server/src/assetClient.ts
git commit -m "Add server-side asset cache and upstream fetch client"
```

---

### Task 2: The proxy route

**Files:**
- Create: `server/src/routes/assets.ts`
- Modify: `server/src/index.ts`

**Interfaces:**
- Consumes: `getCachedAssetPath`, `isKnownMissing`, `writeAssetCache`, `markAssetMissing`, `clearAssetCache` (from `server/src/assetCache.ts`, Task 1); `fetchAsset` (from `server/src/assetClient.ts`, Task 1); `UpstreamError` (from `server/src/errors.ts`, pre-existing).
- Produces: `createAssetsRouter(): Router` (default export style not used here — named export, matching `createPlayerRouter` in `server/src/routes/player.ts`), mounted at `/api` in `index.ts`. No later task consumes this directly (Task 3 talks to it over HTTP, not as a TS import).

- [ ] **Step 1: Create the proxy route**

Create `server/src/routes/assets.ts`:

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

- [ ] **Step 2: Wire the router into the server**

Modify `server/src/index.ts` so the full file reads exactly:

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

app.listen(PORT, () => {
  console.log(`STT tracker server listening on port ${PORT}`);
});
```

- [ ] **Step 3: Type-check and lint**

Run: `npm run build --workspace=server && npm run lint --workspace=server`
Expected: both exit 0.

- [ ] **Step 4: Start the server and verify the route end-to-end**

From the repo root: `npm run dev --workspace=server` (starts only the Express server via `tsx watch`, listening on port 3001; if 3001 is already occupied by another process, do not kill it — report this and skip to a written explanation of what you would have checked, per the Global Constraints port-conflict rule). Wait for `STT tracker server listening on port 3001` in the output before proceeding. Run these `curl` checks against it and report every actual response:

```bash
# 1. Cache miss -> fetches from upstream, caches, serves image
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:3001/api/assets/crew_portraits_cm_boimler_bold_sm.png
ls -la server/data/assets/crew_portraits_cm_boimler_bold_sm.png

# 2. Second request for the same file is served from cache, not re-fetched:
#    capture the cached file's mtime, request again, confirm mtime is unchanged
stat -c '%Y' server/data/assets/crew_portraits_cm_boimler_bold_sm.png
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/assets/crew_portraits_cm_boimler_bold_sm.png
stat -c '%Y' server/data/assets/crew_portraits_cm_boimler_bold_sm.png

# 3. Confirmed-missing asset -> 404 + a .missing marker file is created
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/assets/this_definitely_does_not_exist_12345.png
ls -la server/data/assets/this_definitely_does_not_exist_12345.png.missing

# 4. Repeat request for the same missing asset -> still 404
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/assets/this_definitely_does_not_exist_12345.png

# 5. Malformed filename -> 400
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3001/api/assets/..%2F..%2Fetc%2Fpasswd"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/assets/not-a-png.jpg

# 6. Refresh clears the cache
curl -s -X POST -w "%{http_code}\n" http://localhost:3001/api/assets/refresh
ls server/data/assets/ 2>&1
```

Expected: check 1 → `200 image/png`, file exists on disk. Check 2 → `200`, and the two `stat` timestamps are IDENTICAL (proves the second request was served from cache, not re-fetched — a changed timestamp would mean `writeAssetCache` ran again, which would be a bug). Check 3 → `404`, `.missing` marker file exists (may be a zero-byte file — that's correct). Check 4 → `404` again. Check 5 → both requests `400` (path-traversal attempt and wrong-extension attempt are both rejected by `FILENAME_PATTERN`). Check 6 → `200`, and `server/data/assets/` is empty or the directory no longer exists.

Stop the server afterward (kill only the process you started, identified by the PID `npm run dev` printed or by the port you confirmed was free before starting).

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/assets.ts server/src/index.ts
git commit -m "Add the crew/ship asset proxy route and wire it into the server"
```

---

### Task 3: Client seam repoint + Refresh assets button

**Files:**
- Modify: `client/src/assets/config.ts`
- Create: `client/src/api/assetsApi.ts`
- Modify: `client/src/layout/AppLayout.tsx`

**Interfaces:**
- Consumes: nothing new from Tasks 1-2 as TypeScript imports — this task talks to the proxy over HTTP via `fetch('/api/assets/refresh', ...)`, and relies on `getAssetUrl.ts` (pre-existing, untouched) picking up the new `ASSET_BASE_URL` value automatically.
- Produces: `refreshAssets(): Promise<void>` (exported from `client/src/api/assetsApi.ts`) — not consumed by any later task in this plan (this is the last task).

- [ ] **Step 1: Repoint the asset base URL**

Modify `client/src/assets/config.ts` so the full file reads exactly:

```ts
export const ASSET_BASE_URL = '/api/assets';
```

- [ ] **Step 2: Create the assets API client function**

Create `client/src/api/assetsApi.ts`:

```ts
export async function refreshAssets(): Promise<void> {
  const response = await fetch('/api/assets/refresh', { method: 'POST' });
  if (!response.ok) {
    throw new Error(`Failed to refresh asset cache: HTTP ${response.status}`);
  }
}
```

- [ ] **Step 3: Add the Refresh assets button**

Modify `client/src/layout/AppLayout.tsx` so the full file reads exactly:

```tsx
import { useState } from 'react';
import { AppBar, Box, Button, CircularProgress, Drawer, List, ListItemButton, ListItemText, Toolbar, Typography } from '@mui/material';
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

  async function handleRefreshAssets() {
    setRefreshingAssets(true);
    try {
      await refreshAssets();
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
            startIcon={refreshingAssets ? <CircularProgress size={16} /> : undefined}
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
    </Box>
  );
}

export default AppLayout;
```

Note: `color: 'common.white', borderColor: 'common.white'` on the new button is necessary because the `AppBar` is rendered with a colored background (MUI's default primary color) — an unstyled `variant="outlined"` button defaults to `color="primary"`, which renders as low-contrast text/border against the same-hued AppBar. White text/border matches how the existing "STT Tracker" `Typography` and the drawer nav already read against this AppBar.

- [ ] **Step 4: Type-check and lint**

Run: `npm run build --workspace=client && npm run lint --workspace=client`
Expected: both exit 0.

- [ ] **Step 5: Verify the full flow against the real dev server**

Start the full stack from the repo root: `npm run dev` (starts both server and client via `concurrently`; if port 3001 is already occupied by another process, do not kill it — report this in your task report per the Global Constraints port-conflict rule, and if you cannot get your own server instance running, fall back to whatever port the client picked and note that the `/api` proxy target is a shared, already-running instance rather than one you control).

Attempt full browser-based verification first if any browser-automation tool is available to you (navigate to a crew page, confirm images load from `/api/assets/...` rather than `assets.datacore.app` — check via the browser's network activity or dev tools — then click "Refresh assets" and confirm it completes without error). **If no browser-automation tool is available in this environment** (this happened during Phase 1 — no `chromium-cli`, Playwright's headless Chromium was missing a system library — don't spend time re-diagnosing the same gap), fall back to this curl-based equivalent instead, which still proves the client-server wiring is correct even without rendering pixels:

```bash
# Confirm the client dev server's /api proxy correctly forwards to the new route
# (replace 5173 with whatever port Vite actually printed)
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:5173/api/assets/crew_portraits_cm_boimler_bold_sm.png
curl -s -X POST -w "%{http_code}\n" http://localhost:5173/api/assets/refresh
```

Expected: first curl → `200 image/png` (proves Vite's existing `/api` proxy — already used by `/api/player` — forwards this new route just as transparently, no new proxy config needed). Second curl → `200`.

Report clearly which verification path you actually completed (real browser vs. curl fallback) and why, matching how Phase 1's tasks reported this.

- [ ] **Step 6: Commit**

```bash
git add client/src/assets/config.ts client/src/api/assetsApi.ts client/src/layout/AppLayout.tsx
git commit -m "Repoint asset URLs at the local proxy and add a Refresh assets button"
```

---

## Self-Review Notes

- **Spec coverage:** cache storage (Task 1: `assetCache.ts`), upstream fetch with the confirmed-404-vs-transient distinction (Task 1: `assetClient.ts`), the proxy route with filename validation and both endpoints (Task 2), the client seam repoint (Task 3 Step 1), the independent Refresh assets button with its own loading state (Task 3 Steps 2-3). Error-handling table from the spec is exercised directly by Task 2's curl checks (cache hit, confirmed-404, malformed filename, refresh) and by Task 1's verify script (transient-vs-missing distinction at the `fetchAsset` level). Out-of-scope items from the spec (bulk pre-fetch, browser cache-busting, `getAssetUrl`/`Thumbnail` changes) are correctly absent from every task.
- **Placeholder scan:** no TBD/TODO markers; every step has literal, complete code or a fully-specified curl sequence with expected output.
- **Type consistency:** `getCachedAssetPath`/`isKnownMissing`/`writeAssetCache`/`markAssetMissing`/`clearAssetCache` signatures identical between Task 1's definition and Task 2's usage; `fetchAsset(filename: string): Promise<Buffer | null>` identical between Task 1's definition, Task 1's own verify script, and Task 2's usage; `createAssetsRouter(): Router` identical between Task 2's definition and its `index.ts` wiring; `refreshAssets(): Promise<void>` identical between Task 3's definition and its use in the `AppLayout` button handler.
