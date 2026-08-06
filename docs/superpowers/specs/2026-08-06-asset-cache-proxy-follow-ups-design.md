# Asset Cache Proxy Follow-Ups — Design

## What this is

Four small, independently-scoped gaps flagged at the Asset cache proxy
feature's final review and left deliberately deferred at the time
("each a few lines whenever one is worth a standalone diff" — see
`docs/PROJECT_STATE.md`'s deferred-issues backlog). Closing all four in
one pass since they're each tiny and touch disjoint files, but they are
genuinely independent — no shared design decision links them except
"asset cache proxy polish."

## 1. `sendFile` error callback

**The gap:** `server/src/routes/assets.ts`'s cache-hit branch —

```ts
const cachedPath = getCachedAssetPath(filename);
if (cachedPath !== null) {
  res.type('image/png').sendFile(cachedPath, { root: process.cwd() });
  return;
}
```

— calls `res.sendFile()` with no error callback. If the cached file is
deleted between the cache-check and the actual send (the concrete
trigger identified at the original feature's final review: clicking
"Refresh assets" while a thumbnail-heavy page is still loading, racing
`clearAssetCache`'s deletion against an in-flight `sendFile`), the
resulting `ENOENT` falls through to Express's default error handler — a
raw 500/stack trace — instead of the clean 404 every other "asset not
found" path in this route already returns.

**The fix:**

```ts
res.type('image/png').sendFile(cachedPath, { root: process.cwd() }, (err) => {
  if (err && !res.headersSent) {
    res.status(404).json({ error: 'Asset not found' });
  }
});
```

`!res.headersSent` guards against calling `res.status()` after `sendFile`
has already started streaming a response — not reachable in the
ENOENT-before-send case this fix targets, but a cheap, correct guard
against ever double-sending on some other partial-failure shape.
Every `sendFile` error is treated as 404, matching this route's existing
"unknown = not found" convention rather than distinguishing error types
further (that distinction — confirmed-404 vs. transient — already exists
one layer up, in `fetchAsset`/`UpstreamError`; this is a *local disk*
read failure after the cache already confirmed the file existed
moments ago, not an upstream classification problem).

## 2. Atomic cache writes

**The gap:** `server/src/assetCache.ts`'s `writeAssetCache` writes
directly to the final path:

```ts
export function writeAssetCache(filename: string, data: Buffer): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cachedFilePath(filename), data);
}
```

A concurrent request for the same uncached filename during this write
window could theoretically read a partially-written (truncated) image —
self-healing on reload today, per the original feature's accepted-gap
note, but cheap to close properly.

**The fix:** write-temp-then-rename, the standard atomic-write pattern
(`renameSync` is atomic on the same filesystem, and `CACHE_DIR` is a
fixed local directory so the temp file and final file are always on the
same filesystem):

```ts
import { randomUUID } from 'node:crypto';
// ...
export function writeAssetCache(filename: string, data: Buffer): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  const finalPath = cachedFilePath(filename);
  const tempPath = `${finalPath}.tmp-${randomUUID()}`;
  writeFileSync(tempPath, data);
  renameSync(tempPath, finalPath);
}
```

`randomUUID()`, not just a fixed `.tmp` suffix — two concurrent writes of
the *same* filename must not share a temp path, or the second write could
truncate the first's still-being-written temp file before the first's
`renameSync` runs, reintroducing the exact race this fix removes.
`markAssetMissing` (writes an empty `.missing` marker) is **not** changed
— there is no meaningful "partial write" of zero bytes to protect
against.

## 3. `Thumbnail` alt/placeholder accessibility semantics

**The gap, as one decision, not two:** `Thumbnail.tsx` currently accepts
an `alt` prop (`alt={crew.name}`/`alt={ship.name}` at both call sites),
which duplicates the adjacent Name/Ship text table cell — a screen reader
announces the name twice per row. Separately, the grey placeholder `Box`
(shown when there's no image data, or the image failed to load) has no
`aria-label`/`role` at all. The original feature's final review noted
these are "actually one semantic decision, deferred together": if the
thumbnail is decorative (redundant with adjacent text, conveying no
information a screen reader user doesn't already have), the *correct*
fix for both is `alt=""` on the image — the standard HTML/ARIA way to
mark an image as decorative, which removes it from the accessibility
tree entirely — and no label at all on the placeholder, which is
already correct once the image itself is decorative.

**The fix:**
- `ThumbnailProps` (`client/src/assets/Thumbnail.tsx`) drops the `alt`
  prop entirely — once it's always `""`, keeping it as a parameter that
  every caller must still pass (and whose value is now ignored) would be
  dead API surface, not backwards compatibility.
- `Thumbnail` renders `<Box component="img" alt="" .../>` unconditionally
  instead of `alt={alt}`.
- Both call sites drop their `alt={...}` prop: `client/src/crew/CrewTable.tsx:34`
  (`<Thumbnail asset={c.portrait} alt={c.name} />` → `<Thumbnail asset={c.portrait} />`)
  and `client/src/ships/ShipsTable.tsx:30`
  (`<Thumbnail asset={s.icon} alt={s.name} />` → `<Thumbnail asset={s.icon} />`).
- The placeholder `Box` (no url / failed-load branch) is unchanged code —
  it already renders with no `aria-label`/`role`, which is now
  demonstrably correct rather than an open question.

## 4. Success `Snackbar` for "Refresh assets"

**The gap:** `AppLayout.tsx`'s `handleRefreshAssets` already has an error
path (`assetsError` state → an error `Snackbar`/`Alert`, added in a fix
round during the original feature after a reviewer caught a failed
refresh silently vanishing with zero user feedback) but no success path
— a successful click produces a sub-100ms spinner flicker and nothing
else.

**The fix**, mirroring the existing error `Snackbar` exactly:

```tsx
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

```tsx
<Snackbar open={assetsSuccess} autoHideDuration={6000} onClose={() => setAssetsSuccess(false)}>
  <Alert severity="success" onClose={() => setAssetsSuccess(false)}>
    Asset cache refreshed
  </Alert>
</Snackbar>
```

`setAssetsSuccess(false)` added at the start of `handleRefreshAssets`
(mirroring the existing `setAssetsError(null)` reset) so a lingering
success/error `Snackbar` from a previous click can never persist into a
new attempt's result. `autoHideDuration={6000}` matches the existing
error `Snackbar` exactly — no new timing value introduced without
reason. Message wording ("Asset cache refreshed") matches the button's
own "Refresh assets" language, rather than the more technically precise
but more confusing "cleared" (the endpoint clears the server-side cache;
images re-fetch lazily on next view, not eagerly — "refreshed" is what
the user asked the button to do, and is what they'll observe).

## Scope

Six files: `server/src/routes/assets.ts`, `server/src/assetCache.ts`,
`client/src/assets/Thumbnail.tsx`, `client/src/crew/CrewTable.tsx`,
`client/src/ships/ShipsTable.tsx`, `client/src/layout/AppLayout.tsx`. No
new dependencies — `randomUUID` is `node:crypto`, already in Node's
standard library. No type changes beyond removing `alt` from
`ThumbnailProps`.

## Verification

This project has no automated test framework (deliberate, project-wide
choice). Verification is TypeScript strict mode + ESLint for both
workspaces, plus interactive checks against a real running dev server:
- **Item 1:** a curl sequence reproducing the race directly — cache-hit
  a real asset, delete the cached file out from under the server (or call
  `POST /api/assets/refresh` between the cache-check and the response,
  if timing allows), confirm a clean `404 {"error": "Asset not found"}`
  rather than a 500/stack trace.
- **Item 2:** a curl sequence confirming no visible behavior change for
  the normal path (cache-miss-then-hit still works), plus a filesystem
  check that no `.tmp-*` file is ever left behind after a successful
  write (confirms the rename actually happens).
- **Item 3:** the `playwright` MCP browser tooling (confirmed working
  this session) — load a crew or ship page, take an accessibility
  snapshot, confirm no `img`/placeholder element in the thumbnail column
  has an accessible name (i.e. it's absent from the accessibility tree,
  not present-with-empty-name — the actual behavior `alt=""` produces).
- **Item 4:** the `playwright` MCP browser tooling — click "Refresh
  assets" against a working backend, confirm a green success `Snackbar`
  appears; separately, confirm the pre-existing error path still works
  unchanged (e.g. by temporarily pointing at a broken endpoint, or
  reviewing that the error branch's code is untouched).
