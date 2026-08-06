# Asset Cache Proxy Follow-Ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close four independently-scoped, previously-deferred gaps in the asset cache proxy: a `sendFile` error callback (server), atomic cache writes (server), `Thumbnail` alt/placeholder accessibility semantics (client), and a success `Snackbar` for "Refresh assets" (client).

**Architecture:** Two tasks, split by runtime (server / client) since that's the only natural boundary among four otherwise-unrelated fixes — each task is independently buildable and testable, and a reviewer could accept one while rejecting the other without any coupling.

**Tech Stack:** Same as the existing workspaces — Node 24 + Express + TypeScript (server), React 19 + TypeScript + MUI 6 (client). No new dependencies — `randomUUID` is `node:crypto`, already in Node's standard library.

## Global Constraints

- **Item 1 — `sendFile` error callback** (`server/src/routes/assets.ts`): the cache-hit branch's `res.sendFile(cachedPath, { root: process.cwd() })` call gains a callback that answers a clean 404 on any error, guarded by `!res.headersSent`:
  ```ts
  res.type('image/png').sendFile(cachedPath, { root: process.cwd() }, (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ error: 'Asset not found' });
    }
  });
  ```
- **Item 2 — atomic cache writes** (`server/src/assetCache.ts`): `writeAssetCache` writes to a per-call-unique temp path, then `renameSync`s it into place. `markAssetMissing` is unchanged (no meaningful partial-write risk for an empty marker file).
  ```ts
  export function writeAssetCache(filename: string, data: Buffer): void {
    mkdirSync(CACHE_DIR, { recursive: true });
    const finalPath = cachedFilePath(filename);
    const tempPath = `${finalPath}.tmp-${randomUUID()}`;
    writeFileSync(tempPath, data);
    renameSync(tempPath, finalPath);
  }
  ```
- **Item 3 — `Thumbnail` alt/placeholder semantics** (`client/src/assets/Thumbnail.tsx`, `client/src/crew/CrewTable.tsx`, `client/src/ships/ShipsTable.tsx`): `ThumbnailProps` drops `alt` entirely; `Thumbnail` always renders `alt=""` (decorative — the adjacent Name/Ship text cell already conveys the same information); both call sites stop passing `alt={...}`. The placeholder `Box` (no-image / failed-load branch) needs no code change — it's already correct once the image itself is decorative.
- **Item 4 — success `Snackbar`** (`client/src/layout/AppLayout.tsx`): new `assetsSuccess` boolean state, set `true` on `handleRefreshAssets`'s non-throw path, reset to `false` at the start of every attempt (mirroring the existing `assetsError` reset). New `Snackbar`/`Alert` pair with `severity="success"`, `autoHideDuration={6000}` (matches the existing error `Snackbar` exactly), message `"Asset cache refreshed"`.
- **No signature changes visible outside these files** except `ThumbnailProps` losing `alt` (both call sites are updated in the same task, so nothing is left broken).
- **No automated test framework** (project-wide, deliberate choice). Server-side verification is a throwaway script directly exercising Express's `sendFile` callback behavior (isolating the fix from the practically-unforceable real TOCTOU race) plus a curl sequence against a real running dev server for the atomic-write path. Client-side verification is the `playwright` MCP browser tooling against a real running dev server.
- **Spec:** `docs/superpowers/specs/2026-08-06-asset-cache-proxy-follow-ups-design.md`.

---

### Task 1: Server-side fixes — `sendFile` error callback + atomic cache writes

**Files:**
- Modify: `server/src/routes/assets.ts`
- Modify: `server/src/assetCache.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: no exported signature changes. `writeAssetCache(filename: string, data: Buffer): void` keeps the same signature; only its internal write mechanism changes. The route handler's external behavior is unchanged for every existing case (cache hit/miss, known-missing, upstream error) — only the new "cached file vanished mid-request" case gets a defined (404) outcome instead of an undefined one (500).

- [ ] **Step 1: Confirm the current state of both files matches this plan's assumptions**

Run: `cat -n server/src/routes/assets.ts` and `cat -n server/src/assetCache.ts`

Confirm the cache-hit branch in `assets.ts` is exactly:
```ts
    const cachedPath = getCachedAssetPath(filename);
    if (cachedPath !== null) {
      res.type('image/png').sendFile(cachedPath, { root: process.cwd() });
      return;
    }
```
and `writeAssetCache` in `assetCache.ts` is exactly:
```ts
export function writeAssetCache(filename: string, data: Buffer): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cachedFilePath(filename), data);
}
```
If either differs, stop and re-check the spec before proceeding.

- [ ] **Step 2: Apply the `sendFile` error callback in `server/src/routes/assets.ts`**

Replace:
```ts
    const cachedPath = getCachedAssetPath(filename);
    if (cachedPath !== null) {
      res.type('image/png').sendFile(cachedPath, { root: process.cwd() });
      return;
    }
```
with:
```ts
    const cachedPath = getCachedAssetPath(filename);
    if (cachedPath !== null) {
      res.type('image/png').sendFile(cachedPath, { root: process.cwd() }, (err) => {
        if (err && !res.headersSent) {
          res.status(404).json({ error: 'Asset not found' });
        }
      });
      return;
    }
```

- [ ] **Step 3: Apply the atomic-write fix in `server/src/assetCache.ts`**

Add `randomUUID` to the imports. Replace:
```ts
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
```
with:
```ts
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
```

Then replace:
```ts
export function writeAssetCache(filename: string, data: Buffer): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cachedFilePath(filename), data);
}
```
with:
```ts
export function writeAssetCache(filename: string, data: Buffer): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  const finalPath = cachedFilePath(filename);
  const tempPath = `${finalPath}.tmp-${randomUUID()}`;
  writeFileSync(tempPath, data);
  renameSync(tempPath, finalPath);
}
```

- [ ] **Step 4: Build and lint check**

Run: `npm run build -w server`
Expected: exits 0.

Run: `npm run lint -w server`
Expected: exits 0, no errors.

- [ ] **Step 5: Verify the `sendFile` error callback in isolation**

The real failure mode (a cached file deleted in the TOCTOU window between the cache-check and the send) can't be reliably forced through the full running app from a shell script — it's a genuine race on local disk I/O. Instead, verify the *mechanism* directly: a minimal standalone Express server exercising the exact same `sendFile(path, options, callback)` pattern against both an existing and a deliberately-nonexistent file, proving the callback fires correctly and the route answers 404 rather than crashing.

Create a throwaway script at `server/src/__verify-sendfile.ts` (deleted in Step 6, never committed):

```ts
import express from 'express';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const TEST_DIR = 'data/__verify-sendfile-tmp';
mkdirSync(TEST_DIR, { recursive: true });
const existingFile = join(TEST_DIR, 'exists.png');
const missingFile = join(TEST_DIR, 'missing.png');
writeFileSync(existingFile, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

const app = express();
app.get('/existing', (_req, res) => {
  res.type('image/png').sendFile(existingFile, { root: process.cwd() }, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'Asset not found' });
  });
});
app.get('/missing', (_req, res) => {
  res.type('image/png').sendFile(missingFile, { root: process.cwd() }, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'Asset not found' });
  });
});

const server = app.listen(0, () => {
  void (async () => {
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('unexpected address');
    const port = address.port;

    const existingRes = await fetch(`http://127.0.0.1:${port}/existing`);
    assert.equal(existingRes.status, 200, 'existing file should serve 200');

    const missingRes = await fetch(`http://127.0.0.1:${port}/missing`);
    assert.equal(missingRes.status, 404, 'missing file should serve a clean 404, not a 500');
    const body = (await missingRes.json()) as { error: string };
    assert.equal(body.error, 'Asset not found');

    console.log('MATCH: sendFile error-callback verification passed');
    server.close();
    rmSync(TEST_DIR, { recursive: true, force: true });
  })();
});
```

Run from the **`server/` directory** (so `process.cwd()` matches how the real server process runs, and `data/__verify-sendfile-tmp` lands under `server/data/`, consistent with `CACHE_DIR`): `cd server && npx tsx src/__verify-sendfile.ts`

Expected output: `MATCH: sendFile error-callback verification passed`, exit code 0 (the script calls `server.close()` but doesn't explicitly exit — if the process doesn't terminate within a few seconds, that's fine, `tsx` scripts exit once the event loop drains). If either assertion throws, do not proceed — re-check Step 2 against this plan exactly.

- [ ] **Step 6: Delete the throwaway verification script**

```bash
rm server/src/__verify-sendfile.ts
```

- [ ] **Step 7: Verify atomic writes against a real running dev server**

This requires a live dev server (client + server) with a valid `STT_SESSION_COOKIE` — check whether one is already running and reachable (e.g. `curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/api/player`); if not, start one (`npm run dev` from the repo root, or `npm run dev -w server` alone if only the server is needed — the asset routes don't require the client dev server to be running, since they're plain HTTP endpoints). **If port 3001 is already bound by a different checkout's server process** (this workspace is a git worktree; another checkout may have a stale server running), that other process is not running this task's code — stop it before starting this worktree's own server, since this step specifically needs to exercise *this* worktree's `assetCache.ts` changes. It's safe to stop; nothing in this task depends on it surviving.

Once a server with this worktree's code is reachable at `http://localhost:3001`:

1. Clear the cache: `curl -s -X POST http://localhost:3001/api/assets/refresh`
2. Request a real asset (e.g. `crew_portraits_cm_eddington_sm.png`, known to exist from earlier session verification): `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3001/api/assets/crew_portraits_cm_eddington_sm.png` — expect `200`.
3. Check no temp file was left behind: `ls server/data/assets/ | grep '\.tmp-' || echo "no leftover temp files"` — expect the "no leftover temp files" branch (empty grep match).
4. Confirm the file was actually cached: `ls server/data/assets/crew_portraits_cm_eddington_sm.png` — expect it to exist.
5. Request the same asset again (now a cache hit, exercising the Step 2 code path too): `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3001/api/assets/crew_portraits_cm_eddington_sm.png` — expect `200`.

- [ ] **Step 8: Commit**

```bash
git add server/src/routes/assets.ts server/src/assetCache.ts
git commit -m "Add sendFile error callback and atomic cache writes to the asset proxy"
```

---

### Task 2: Client-side fixes — `Thumbnail` alt/placeholder semantics + success `Snackbar`

**Files:**
- Modify: `client/src/assets/Thumbnail.tsx`
- Modify: `client/src/crew/CrewTable.tsx`
- Modify: `client/src/ships/ShipsTable.tsx`
- Modify: `client/src/layout/AppLayout.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `Thumbnail`'s exported `ThumbnailProps` loses the `alt: string` field — `{ asset: DatacoreAsset | undefined }` only. Both call sites (`CrewTable.tsx`, `ShipsTable.tsx`) are updated in this same task, so nothing outside it is left passing a now-nonexistent prop. `AppLayout`'s internal state gains `assetsSuccess`, not exported/consumed anywhere else.

- [ ] **Step 1: Confirm the current state of all four files matches this plan's assumptions**

Run: `cat -n client/src/assets/Thumbnail.tsx`

Confirm it matches:
```tsx
import { useState } from 'react';
import { Box } from '@mui/material';
import { getAssetUrl } from './getAssetUrl';
import type { DatacoreAsset } from '../types/asset';

export interface ThumbnailProps {
  asset: DatacoreAsset | undefined;
  alt: string;
}

function Thumbnail({ asset, alt }: ThumbnailProps) {
  const [failed, setFailed] = useState(false);
  const url = getAssetUrl(asset);

  if (!url || failed) {
    return <Box sx={{ width: 40, height: 40, bgcolor: 'action.hover', borderRadius: 1 }} />;
  }

  return (
    <Box
      component="img"
      src={url}
      alt={alt}
      onError={() => setFailed(true)}
      loading="lazy"
      decoding="async"
      sx={{ width: 40, height: 40, borderRadius: 1, objectFit: 'cover' }}
    />
  );
}

export default Thumbnail;
```

Run: `grep -n "Thumbnail asset" client/src/crew/CrewTable.tsx client/src/ships/ShipsTable.tsx`

Confirm output is:
```
client/src/crew/CrewTable.tsx:                <Thumbnail asset={c.portrait} alt={c.name} />
client/src/ships/ShipsTable.tsx:                <Thumbnail asset={s.icon} alt={s.name} />
```

Run: `cat -n client/src/layout/AppLayout.tsx`

Confirm `handleRefreshAssets` and the error `Snackbar` match:
```tsx
  async function handleRefreshAssets() {
    setRefreshingAssets(true);
    setAssetsError(null);
    try {
      await refreshAssets();
    } catch (err) {
      setAssetsError(err instanceof Error ? err.message : 'Failed to refresh asset cache');
    } finally {
      setRefreshingAssets(false);
    }
  }
```
```tsx
      <Snackbar open={assetsError !== null} autoHideDuration={6000} onClose={() => setAssetsError(null)}>
        <Alert severity="error" onClose={() => setAssetsError(null)}>
          {assetsError}
        </Alert>
      </Snackbar>
```

If any of these differ, stop and re-check the spec before proceeding.

- [ ] **Step 2: Update `client/src/assets/Thumbnail.tsx`**

Replace the entire file with:

```tsx
import { useState } from 'react';
import { Box } from '@mui/material';
import { getAssetUrl } from './getAssetUrl';
import type { DatacoreAsset } from '../types/asset';

export interface ThumbnailProps {
  asset: DatacoreAsset | undefined;
}

function Thumbnail({ asset }: ThumbnailProps) {
  const [failed, setFailed] = useState(false);
  const url = getAssetUrl(asset);

  if (!url || failed) {
    return <Box sx={{ width: 40, height: 40, bgcolor: 'action.hover', borderRadius: 1 }} />;
  }

  return (
    <Box
      component="img"
      src={url}
      alt=""
      onError={() => setFailed(true)}
      loading="lazy"
      decoding="async"
      sx={{ width: 40, height: 40, borderRadius: 1, objectFit: 'cover' }}
    />
  );
}

export default Thumbnail;
```

- [ ] **Step 3: Update the two call sites**

In `client/src/crew/CrewTable.tsx`, replace:
```tsx
                <Thumbnail asset={c.portrait} alt={c.name} />
```
with:
```tsx
                <Thumbnail asset={c.portrait} />
```

In `client/src/ships/ShipsTable.tsx`, replace:
```tsx
                <Thumbnail asset={s.icon} alt={s.name} />
```
with:
```tsx
                <Thumbnail asset={s.icon} />
```

- [ ] **Step 4: Add the success `Snackbar` to `client/src/layout/AppLayout.tsx`**

Replace:
```tsx
  const [refreshingAssets, setRefreshingAssets] = useState(false);
  const [assetsError, setAssetsError] = useState<string | null>(null);

  async function handleRefreshAssets() {
    setRefreshingAssets(true);
    setAssetsError(null);
    try {
      await refreshAssets();
    } catch (err) {
      setAssetsError(err instanceof Error ? err.message : 'Failed to refresh asset cache');
    } finally {
      setRefreshingAssets(false);
    }
  }
```
with:
```tsx
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
```

Then replace:
```tsx
      <Snackbar open={assetsError !== null} autoHideDuration={6000} onClose={() => setAssetsError(null)}>
        <Alert severity="error" onClose={() => setAssetsError(null)}>
          {assetsError}
        </Alert>
      </Snackbar>
```
with:
```tsx
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
```

- [ ] **Step 5: Build and lint check**

Run: `npm run build -w client`
Expected: exits 0 (this would catch a missed `alt` removal at either call site as a TypeScript excess-property or missing-property error — `ThumbnailProps` no longer has `alt`, so `<Thumbnail asset={...} alt={...} />` becomes a compile error if Step 3 were skipped).

Run: `npm run lint -w client`
Expected: exits 0, no new errors (the pre-existing `react-refresh/only-export-components` warning in `PlayerDataContext.tsx` is unrelated and expected to still appear).

- [ ] **Step 6: Verify the `Thumbnail` accessibility fix**

Using the `playwright` MCP browser tools against a real running dev server (client dev server; needs a working backend with real crew/ship data to render actual thumbnails — reuse whatever's already running, or start fresh with `npm run dev` if nothing is reachable):

1. Navigate to a crew page with the Image column (e.g. `/3-4-stars-crew`) or a ships page (e.g. `/5-stars-ships`).
2. Take an accessibility snapshot (`browser_snapshot`).
3. Confirm the thumbnail cells in the snapshot show either no accessible-name element at all for the image, or an `img` node with no name/label — i.e. the thumbnail does not appear as a named element a screen reader would announce (contrast with the adjacent Name/Ship cell, which does have a real text node). This is the concrete, observable effect of `alt=""`.

- [ ] **Step 7: Verify the success `Snackbar`**

Using the `playwright` MCP browser tools against a real running dev server with a working backend (the "Refresh assets" button needs `POST /api/assets/refresh` to actually succeed):

1. Navigate to any page (the topbar is present on every route).
2. Click "Refresh assets".
3. `browser_snapshot` — confirm a green success alert/snackbar is visible with the text "Asset cache refreshed".

Separately, confirm by reading the diff (not a live test) that the pre-existing error path is untouched: `handleRefreshAssets`'s `catch` block and the error `Snackbar`/`Alert` JSX are unchanged from Step 1's baseline except for the one added `setAssetsSuccess(false)` line at the top of the function — no other line in either block was touched.

- [ ] **Step 8: Commit**

```bash
git add client/src/assets/Thumbnail.tsx client/src/crew/CrewTable.tsx client/src/ships/ShipsTable.tsx client/src/layout/AppLayout.tsx
git commit -m "Make Thumbnail decorative (alt=\"\") and add a success Snackbar for Refresh assets"
```
