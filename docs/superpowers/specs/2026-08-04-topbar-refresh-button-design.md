# Topbar Refresh Button — Design

## What this is

Move the "Refresh" control from the Overview page's own header into the
app's persistent top bar (`AppLayout.tsx`), so it's visible and usable
from every page, not just Overview. Change its color from the default
blue to green, since the top bar itself is blue (MUI's default `primary`)
and a blue-on-blue contained button would have poor visibility there.

## Why this works with zero data-layer changes

`refresh()` already lives in `PlayerDataContext` (`context/PlayerDataContext.tsx`)
as one function shared by every page via `usePlayerData()`
(`hooks/usePlayerData.ts`). It updates the single `data` value in context
state — there is no per-page fetch, no per-page cache. `AppLayout`
(`layout/AppLayout.tsx`) is rendered inside `PlayerDataProvider` in the
component tree (see `App.tsx`: `PlayerDataProvider` wraps `BrowserRouter`,
which contains the `AppLayout` route), so `AppLayout` can call
`usePlayerData()` directly, exactly like every page already does.

This means: clicking Refresh from the top bar re-fetches once, and every
page's already-rendered view re-renders off the same updated context
value — including whatever page happens to be on screen at the moment.
No new plumbing, no prop drilling, no new API call shape. This also
answers the user's stated expectation directly: "hitting refresh would
immediately refresh the current page" — it does, because there is only
ever one shared `data`/`loading`/`error` state, not one per page.

## Placement and appearance

Inside the existing `<Toolbar>` in `AppLayout.tsx`, immediately after the
"STT Tracker" `Typography`, add:

```tsx
<Button
  variant="contained"
  color="success"
  onClick={() => void refresh()}
  disabled={loading}
  startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined}
  sx={{ ml: 'auto' }}
>
  Refresh
</Button>
```

- `color="success"` — MUI's green, the same color already used for the
  "Ready" chip elsewhere in this app (`CollectionCrewList.tsx`), so this
  isn't a new, unprecedented color choice for the palette.
- `sx={{ ml: 'auto' }}` on a flex-row `Toolbar` (MUI's default) pushes the
  button to the right edge, with the title staying left-aligned —
  standard MUI pattern, no new layout primitives.
- `disabled={loading}` — identical semantics to Overview's current
  button. `loading` is `true` both during the very first page-load fetch
  and during an explicit refresh (same shared flag in
  `PlayerDataContext`), so the button is correctly non-clickable before
  there's anything to refresh yet.
- **New relative to Overview's current button:** a small `CircularProgress`
  (`size={16}`, `color="inherit"` so it renders white against the green
  background) as a `startIcon` while `loading` is true — explicit user
  request, since this button is now visible on every page rather than
  one, so a clearer "working on it" signal was judged worth the small
  addition.
- Not tied to `error` state — clicking Refresh while an error is showing
  retries, exactly like every crew page's existing "Retry" button
  (`Alert action`) already does. This is not new behavior, just a new
  location it's available from.

## Overview page simplification

`OverviewPage.tsx` currently wraps its title and Refresh button in a
`Stack direction="row" justifyContent="space-between" alignItems="center"`
purely to position the button next to the title. With the button gone,
this wrapper no longer does anything useful — it becomes a plain
`Typography variant="h4"`, matching the header pattern already used by
every other page (crew pages, Collections). No other part of
`OverviewPage.tsx` changes: `loading`/`error`/`identity` rendering stays
exactly as-is.

## Explicitly decided: remove, not duplicate

Considered and declined: keeping Overview's own button alongside the new
topbar one. Rejected as redundant — one refresh control, reachable from
everywhere, is strictly better than two doing the identical thing on one
specific page.

## Side effect worth documenting, not a scope expansion

This change happens to close (for the general case) a gap already
recorded in this project's own deferred-issues backlog
(`docs/PROJECT_STATE.md`, "Cross-page refresh UX inconsistency"): Overview
previously had a refresh button but no retry-on-error path in its
`Alert`; the crew pages had retry-on-error but no persistent refresh
control. After this change, every page — including Overview on error —
has a way to trigger a refresh from the same always-visible topbar
location. The crew pages' existing per-`Alert` "Retry" buttons are
**not** removed by this change (out of scope, not requested) — they
remain a second, page-local way to do the same thing on those pages
specifically, which is harmless duplication, not a regression.

## Scope

Two files:
- `client/src/layout/AppLayout.tsx` — add the topbar `Button`, call
  `usePlayerData()`.
- `client/src/pages/OverviewPage.tsx` — remove the button and the now-
  unnecessary row `Stack` wrapper around the title.

No changes to `PlayerDataContext.tsx`, `usePlayerData.ts`, any crew page,
the Collections page, or any API/server code. No new types, no new
dependencies (`CircularProgress` and `Button` are both already imported
elsewhere in this codebase from `@mui/material`).
