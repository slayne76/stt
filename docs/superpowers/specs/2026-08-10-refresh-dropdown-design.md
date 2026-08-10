# Consolidated refresh dropdown — Design

**Date:** 2026-08-10
**Status:** Approved

## Problem

The topbar currently has three separate `Button`s — "Refresh" (player
data), "Refresh assets", "Refresh catalog" — each with its own loading
spinner and disabled state. This takes up growing horizontal space in
the `AppBar` and doesn't scale as more topbar controls get added later.

## Goal

Replace the three buttons with a single `Select` dropdown + one "Apply"
button. Dropdown options: **"Refresh player data"** (default),
**"Refresh assets"**, **"Refresh catalog"**, and a new **"Refresh all"**
option that triggers all three.

**Refresh all runs the three refreshes in parallel, not sequentially.**
Verified by inspecting each refresh's actual server-side behavior:
player-data refresh fetches live JSON and overwrites its cache; assets
refresh does not pre-fetch any images at all — it only clears the asset
cache, and images are re-fetched lazily on next render regardless of
what triggered the clear; catalog refresh fetches an entirely separate,
player-independent external resource. Three independent caches, no
shared state, no read-after-write dependency between them — there is no
real ordering requirement to preserve, so parallel (`Promise.allSettled`)
is both simpler and faster than a chain.

## Non-goals

- No combined "N of 3 succeeded" summary UI for "Refresh all" — each of
  the three keeps reporting through its own existing, independent path
  exactly as it already does today (player errors on the page via
  `PageShell`, assets/catalog via their existing topbar `Snackbar`s).
  Confirmed with the user.
- No persistence of the dropdown's selected option across page loads —
  always resets to the default ("Refresh player data") on mount. YAGNI.
- No new error class or API/route changes — this is a pure frontend
  reshuffle. `refreshPlayer`/`refreshAssets`/`refreshCrewCatalog` and
  their underlying routes are untouched.

## Architecture

**New file: `client/src/layout/RefreshControl.tsx`** — owns the dropdown
selection state, the `Select`/`MenuItem`/Apply-`Button` markup, and the
dispatch-by-selected-option logic (including the `Promise.allSettled`
fan-out for "all"). Takes the three refresh operations and their loading
flags as props rather than calling any hook or API itself — matches this
project's existing pattern of small, focused, dependency-free UI
components (`NavGroupItem`, `StatusChip`).

```ts
export type RefreshOption = 'player' | 'assets' | 'catalog' | 'all';

interface RefreshControlProps {
  playerLoading: boolean;
  onRefreshPlayer: () => Promise<void>;
  assetsRefreshing: boolean;
  onRefreshAssets: () => Promise<void>;
  catalogRefreshing: boolean;
  onRefreshCatalog: () => Promise<void>;
}
```

Internal `useState<RefreshOption>('player')` for the current selection.
`isRefreshing` is derived from whichever loading flag(s) correspond to
the *currently selected* option (`playerLoading || assetsRefreshing ||
catalogRefreshing` for `'all'`; just the one flag otherwise) — both the
`Select` and the Apply `Button` are disabled while `isRefreshing` is
true, preventing overlapping triggers. `handleApply` dispatches to the
matching prop callback, or `Promise.allSettled([onRefreshPlayer(),
onRefreshAssets(), onRefreshCatalog()])` for `'all'`.

Note: none of the three callback props ever actually reject today (each
already catches its own errors internally and sets error state instead
of throwing — `PlayerDataContext`'s `load()`, `CrewCatalogContext`'s
`load()`, and `AppLayout`'s own `handleRefreshAssets` all follow this
same try/catch-and-set-state shape) — `Promise.allSettled` over
`Promise.all` is defensive/future-proofing, not currently
load-bearing, and costs nothing.

**`client/src/layout/AppLayout.tsx`** — the three `Button`s in the
`AppBar` are replaced with one `<RefreshControl ... />`, wired to the
same state/handlers that already exist there today
(`usePlayerData()`'s `refresh`/`loading`, the local
`refreshingAssets`/`handleRefreshAssets`, `useCrewCatalog()`'s
`refresh`/`loading`). **Nothing about the three `Snackbar`s, the
`catalogErrorSnackbarOpen` effect, or `handleRefreshAssets`'s own
try/catch changes** — they keep living in `AppLayout` exactly as today;
only the buttons that triggered them move into the new component. The
now-unused `Button`/`CircularProgress` imports are removed from
`AppLayout.tsx` (both move to `RefreshControl.tsx`).

## Files touched

- New: `client/src/layout/RefreshControl.tsx`
- Modified: `client/src/layout/AppLayout.tsx`

## Testing/verification plan

No automated test framework in this project (deliberate, repeated
choice). Verification is a real browser check (headless-browser tooling
confirmed working):

1. Default selection on load is "Refresh player data."
2. Selecting each of the four options and clicking Apply triggers the
   correct underlying refresh (confirm via network request or resulting
   UI change — e.g. player data changing, the assets-refreshed success
   Snackbar, the catalog error/success path).
3. While a refresh is running, both the `Select` and Apply button are
   disabled, and Apply shows a spinner.
4. "Refresh all" fires all three requests concurrently (confirm via the
   browser's network panel — three requests starting close together, not
   one finishing before the next starts) and each surfaces its own
   existing success/error UI independently (e.g. force one to fail —
   confirm the other two still show their own success state normally).
5. Visual check: the `Select`'s text/border/dropdown-arrow are legible
   against the `AppBar`'s background (white-on-color, matching the
   removed buttons' existing `color: 'common.white'` styling). This app
   has no `ThemeProvider`/dark-mode handling anywhere (confirmed by
   grep) — default MUI light theme only, so there's no second theme to
   check against.
