# NAV_ITEMS / <Routes> Dedup — Design Spec

Closes the "`NAV_ITEMS` and `<Routes>` are hand-synced lists in two
different files" deferred backlog item in `docs/PROJECT_STATE.md` — the
last of the four user-prioritized backlog items from this cleanup pass.

## Goal

`App.tsx` (a flat `<Route path=... element={<Page/>} />` list, 13 entries
including `/`) and `AppLayout.tsx` (a nested `NAV_ITEMS` array — flat
`Overview`/`Collections` entries plus `Crew`/`Ships` `NavGroup`s, 13 leaf
entries total) currently describe the same set of pages independently, by
hand, in two files. Adding a page means editing both, with nothing at
compile time enforcing they stay consistent. Replace both with a single
source of truth.

## Current state (verified directly against the real files)

- `App.tsx`: imports all 13 page components directly, renders a literal
  `<Routes>` list nested under one `<Route element={<AppLayout />}>`.
- `AppLayout.tsx`: defines `NavLink`/`NavGroup`/`isNavGroup` and the
  literal `NAV_ITEMS` array locally, uses it only to render the drawer's
  `List` (flat items as `ListItemButton`, groups as `NavGroupItem`).
- `NavGroupItem.tsx`: declares its own inline
  `items: { label: string; path: string }[]` prop shape — a *third*,
  independent copy of the same `{ label, path }` structure, not just the
  two named in the backlog entry.
- Today the two lists are consistent (13 routes, 13 nav leaves, matching
  paths) — there is no existing drift to reconcile, only the missing
  structural guarantee that they can't drift going forward.

## Non-goals

- No behavior change: same 13 routes, same paths, same nav grouping,
  same rendering in `AppLayout`/`NavGroupItem`.
- No change to route matching semantics (no new `index` routes, no
  dynamic segments, no reordering that could affect matching — all 13
  paths are distinct static strings, so list order is irrelevant to
  matching either way).
- No lazy-loading / code-splitting of page components — imports stay
  eager, matching today's `App.tsx`.
- No change to `NavGroupItem`'s rendering logic or `AppLayout`'s render
  loop — only where the types/data they consume are declared.

## Design

### `client/src/routes.tsx` (new)

The single source of truth. Imports all 13 page components (moved out of
`App.tsx`), declares the nav/route types, and exports both the nested
shape the nav needs and a flat shape `<Routes>` needs, derived from one
literal array.

```tsx
import type { ReactElement } from 'react';
import OverviewPage from './pages/OverviewPage';
import FiveStarsCrewPage from './pages/FiveStarsCrewPage';
import ThreeFourStarsCrewPage from './pages/ThreeFourStarsCrewPage';
import FourFiveStarsCrewPage from './pages/FourFiveStarsCrewPage';
import FourFourStarsCrewReadyPage from './pages/FourFourStarsCrewReadyPage';
import FourFourStarsCrewPage from './pages/FourFourStarsCrewPage';
import CollectionsPage from './pages/CollectionsPage';
import FourStarsDuplicatesPage from './pages/FourStarsDuplicatesPage';
import FiveStarsDuplicatesPage from './pages/FiveStarsDuplicatesPage';
import FiveStarsShipsPage from './pages/FiveStarsShipsPage';
import FourStarsShipsPage from './pages/FourStarsShipsPage';
import QPsPage from './pages/QPsPage';
import FrozenCrewPage from './pages/FrozenCrewPage';

export interface NavLink {
  label: string;
  path: string;
  element: ReactElement;
}

export interface NavGroup {
  label: string;
  children: NavLink[];
}

export function isNavGroup(item: NavLink | NavGroup): item is NavGroup {
  return 'children' in item;
}

export const NAV_ITEMS: (NavLink | NavGroup)[] = [
  { label: 'Overview', path: '/', element: <OverviewPage /> },
  {
    label: 'Crew',
    children: [
      { label: '5 Stars Crew', path: '/5-stars-crew', element: <FiveStarsCrewPage /> },
      { label: '3/4 Stars crew', path: '/3-4-stars-crew', element: <ThreeFourStarsCrewPage /> },
      { label: '4/5 Stars crew', path: '/4-5-stars-crew', element: <FourFiveStarsCrewPage /> },
      { label: '4/4 Stars crew (ready)', path: '/4-4-stars-crew-ready', element: <FourFourStarsCrewReadyPage /> },
      { label: '4/4 Stars crew', path: '/4-4-stars-crew', element: <FourFourStarsCrewPage /> },
      { label: '4 Stars Duplicates', path: '/4-stars-duplicates', element: <FourStarsDuplicatesPage /> },
      { label: '5 Stars Duplicates', path: '/5-stars-duplicates', element: <FiveStarsDuplicatesPage /> },
      { label: 'QPs', path: '/qps', element: <QPsPage /> },
      { label: '5 & 4 Stars Frozen Crew', path: '/5-4-stars-frozen-crew', element: <FrozenCrewPage /> },
    ],
  },
  {
    label: 'Ships',
    children: [
      { label: '5 Stars Ships', path: '/5-stars-ships', element: <FiveStarsShipsPage /> },
      { label: '4 Stars Ships', path: '/4-stars-ships', element: <FourStarsShipsPage /> },
    ],
  },
  { label: 'Collections', path: '/collections', element: <CollectionsPage /> },
];

function flattenRoutes(items: (NavLink | NavGroup)[]): NavLink[] {
  return items.flatMap((item) => (isNavGroup(item) ? item.children : [item]));
}

export const ROUTES: NavLink[] = flattenRoutes(NAV_ITEMS);
```

`NavLink.element` is a plain `ReactElement` (JSX), matching the idiom
`App.tsx` already uses for `<Route element={...}>` — no component-
reference/`createElement` indirection needed. `ROUTES` is computed once
at module load (a plain array, not a hook — safe to compute at module
scope since `NAV_ITEMS` is a static literal, not derived from props or
state).

File extension is `.tsx` (not `.ts`) since it contains JSX (`<OverviewPage />`
etc.) directly in the data literal.

### `client/src/App.tsx` (changed)

Drops all 13 page imports and the literal `<Route>` list; imports `ROUTES`
instead:

```tsx
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { PlayerDataProvider } from './context/PlayerDataContext';
import { CrewCatalogProvider } from './context/CrewCatalogContext';
import AppLayout from './layout/AppLayout';
import { ROUTES } from './routes';

function App() {
  return (
    <PlayerDataProvider>
      <CrewCatalogProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppLayout />}>
              {ROUTES.map(({ path, element }) => (
                <Route key={path} path={path} element={element} />
              ))}
            </Route>
          </Routes>
        </BrowserRouter>
      </CrewCatalogProvider>
    </PlayerDataProvider>
  );
}

export default App;
```

### `client/src/layout/AppLayout.tsx` (changed)

Drops the local `NavLink`/`NavGroup`/`isNavGroup`/`NAV_ITEMS`
declarations; imports them from `../routes` instead:

```tsx
import { NAV_ITEMS, isNavGroup } from '../routes';
```

The render loop (`NAV_ITEMS.map((item) => isNavGroup(item) ? <NavGroupItem .../> : <ListItemButton>...`)
is byte-identical to today — only where `NAV_ITEMS`/`isNavGroup` come from
changes.

### `client/src/layout/NavGroupItem.tsx` (changed — bonus fold-in)

Replaces its independently-declared inline items type with the shared
`NavLink` type, closing the adjacent "`NavGroupItemProps.items` duplicates
`AppLayout.tsx`'s `NavLink` shape" backlog entry for free (same shape,
same root cause, now moving anyway):

```tsx
import type { NavLink } from '../routes';

export interface NavGroupItemProps {
  label: string;
  items: NavLink[];
}
```

`NavGroupItem`'s internals only ever read `.label`/`.path` off each item
— the extra `.element` field `NavLink` now carries is unused there,
which is harmless (TypeScript structural typing doesn't require a
consumer to use every field of the type it's given).

## Error handling

None introduced — this is a pure structural/import move, no new runtime
logic, no new failure modes.

## Testing / verification plan

No automated test framework exists in this project (deliberate, repeated
choice). Verification:

- Build (`npm run build -w client`) / lint (`npm run lint -w client`)
  clean — particular attention to: `routes.tsx` needing the JSX/React
  import conventions this codebase already uses elsewhere; no leftover
  unused imports in `App.tsx`/`AppLayout.tsx`/`NavGroupItem.tsx` after
  their type/data declarations move out.
- Real-browser check: click through **every one of the 13 nav
  entries** (not a sample) — both top-level items (Overview, Collections)
  and every child in both flyout groups (Crew's 9, Ships' 2) — confirming
  each still lands on the correct page. Exhaustive, not sampled, since the
  whole point of this feature is that route/nav consistency is no longer
  hand-verified per-entry; the one time it's worth checking every entry is
  this migration itself.
- Confirm direct URL navigation (not just nav clicks) still resolves
  correctly for at least one path nested inside each group (e.g. loading
  `/qps` or `/5-4-stars-frozen-crew` directly, not via a nav click) —
  proves `<Routes>` itself, not just the nav's `onClick`/`NavLink`
  wiring, is correctly wired to `ROUTES`.
- Confirm the nav flyout groups (Crew, Ships) and their `Escape`/keyboard
  behavior are visually unchanged — this feature doesn't touch
  `NavGroupItem`'s internals, only the type its `items` prop is declared
  with, so this is a quick sanity check, not deep re-verification.
