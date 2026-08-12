# NAV_ITEMS / <Routes> Dedup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `App.tsx`'s hand-written `<Route>` list and `AppLayout.tsx`'s hand-written `NAV_ITEMS` array — currently two independent, hand-synced descriptions of the same 13 pages — with a single source of truth in a new `client/src/routes.tsx`, so adding a page in the future means editing one list, not two.

**Architecture:** One new file (`routes.tsx`) holds all 13 page imports plus a nested `NAV_ITEMS` array (each leaf now also carrying its rendered `element`), and derives a flat `ROUTES` list from it via a small internal flatten helper. `App.tsx` consumes `ROUTES` to build `<Routes>`; `AppLayout.tsx` consumes `NAV_ITEMS` (unchanged rendering logic, just a different import source); `NavGroupItem.tsx` imports the shared `NavLink` type instead of redeclaring it. Pure structural move — no behavior change, no new runtime logic — so this is one atomic task: `routes.tsx` alone is inert until all three consumers switch to it in the same commit.

**Tech Stack:** React 19, TypeScript strict mode, react-router-dom, MUI. `"jsx": "react-jsx"` (new JSX transform — no `import React` needed for JSX-containing files).

## Global Constraints

- No behavior change anywhere: same 13 routes, same paths, same nav grouping/order, same rendering.
- No change to route matching semantics — no new `index` routes, no dynamic segments; all 13 paths are distinct static strings so list order doesn't affect matching.
- No lazy-loading/code-splitting of page components — imports stay eager, matching today's `App.tsx`.
- No change to `NavGroupItem`'s or `AppLayout`'s render logic — only where the types/data they consume are declared.
- `client/src/routes.tsx` (not `.ts`) — it contains JSX directly in the `NAV_ITEMS` literal.
- Build (`npm run build -w client`) and lint (`npm run lint -w client`) must stay clean: 0 errors, only the 2 pre-existing `react-refresh/only-export-components` warnings.
- Full spec: `docs/superpowers/specs/2026-08-12-routes-nav-dedup-design.md`.

---

### Task 1: Extract `routes.tsx` and repoint `App.tsx`/`AppLayout.tsx`/`NavGroupItem.tsx`

**Files:**
- Create: `client/src/routes.tsx`
- Modify: `client/src/App.tsx` (full replace)
- Modify: `client/src/layout/AppLayout.tsx:1-51`
- Modify: `client/src/layout/NavGroupItem.tsx:1-9`

**Interfaces:**
- Consumes: nothing new — all 13 page components already exist at their current import paths (`./pages/*`, relative to `client/src/`).
- Produces: `client/src/routes.tsx` exports `NavLink` (`{ label: string; path: string; element: ReactElement }`), `NavGroup` (`{ label: string; children: NavLink[] }`), `isNavGroup(item: NavLink | NavGroup): item is NavGroup`, `NAV_ITEMS: (NavLink | NavGroup)[]`, and `ROUTES: NavLink[]`.

- [ ] **Step 1: Confirm the current state of all four files matches this plan's assumptions**

Run:
```bash
grep -c "^import.*from './pages/" client/src/App.tsx
grep -n "interface NavLink\|interface NavGroup\|function isNavGroup\|const NAV_ITEMS" client/src/layout/AppLayout.tsx
grep -n "items: { label" client/src/layout/NavGroupItem.tsx
```
Expected: the first command prints `13` (one import per page component); the second prints all four declarations (`interface NavLink`, `interface NavGroup`, `function isNavGroup`, `const NAV_ITEMS`); the third prints the inline `items: { label: string; path: string }[]` line. If any of these don't match, stop and re-read the actual file before proceeding — it has already changed from what this plan assumes.

- [ ] **Step 2: Create `client/src/routes.tsx`**

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

This is a byte-for-byte match of every `label`/`path` pair currently in `App.tsx`'s `<Route>` list and `AppLayout.tsx`'s `NAV_ITEMS` — no path, label, group membership, or ordering changes.

- [ ] **Step 3: Replace the full contents of `client/src/App.tsx`**

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

- [ ] **Step 4: Replace lines 1-51 of `client/src/layout/AppLayout.tsx`**

Replace this block (the imports through the end of the `NAV_ITEMS` literal — i.e. everything before `function AppLayout() {`):

```tsx
import { useEffect, useState } from 'react';
import { Alert, AppBar, Box, Drawer, List, ListItemButton, ListItemText, Snackbar, Toolbar, Typography } from '@mui/material';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { usePlayerData } from '../hooks/usePlayerData';
import { useCrewCatalog } from '../hooks/useCrewCatalog';
import { refreshAssets } from '../api/assetsApi';
import NavGroupItem from './NavGroupItem';
import ErrorBoundary from '../components/ErrorBoundary';
import RefreshControl from './RefreshControl';

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
      { label: '5 Stars Crew', path: '/5-stars-crew' },
      { label: '3/4 Stars crew', path: '/3-4-stars-crew' },
      { label: '4/5 Stars crew', path: '/4-5-stars-crew' },
      { label: '4/4 Stars crew (ready)', path: '/4-4-stars-crew-ready' },
      { label: '4/4 Stars crew', path: '/4-4-stars-crew' },
      { label: '4 Stars Duplicates', path: '/4-stars-duplicates' },
      { label: '5 Stars Duplicates', path: '/5-stars-duplicates' },
      { label: 'QPs', path: '/qps' },
      { label: '5 & 4 Stars Frozen Crew', path: '/5-4-stars-frozen-crew' },
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
```

with:

```tsx
import { useEffect, useState } from 'react';
import { Alert, AppBar, Box, Drawer, List, ListItemButton, ListItemText, Snackbar, Toolbar, Typography } from '@mui/material';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { usePlayerData } from '../hooks/usePlayerData';
import { useCrewCatalog } from '../hooks/useCrewCatalog';
import { refreshAssets } from '../api/assetsApi';
import { NAV_ITEMS, isNavGroup } from '../routes';
import NavGroupItem from './NavGroupItem';
import ErrorBoundary from '../components/ErrorBoundary';
import RefreshControl from './RefreshControl';

const DRAWER_WIDTH = 220;
```

Everything from `function AppLayout() {` onward (the rest of the file) is untouched — it already references `NAV_ITEMS` and `isNavGroup` by those exact names, which now resolve to the imported ones instead of local declarations.

- [ ] **Step 5: Replace lines 1-9 of `client/src/layout/NavGroupItem.tsx`**

Replace:

```tsx
import { useEffect, useRef, useState } from 'react';
import { ChevronRight } from '@mui/icons-material';
import { List, ListItemButton, ListItemText, Paper, Popper } from '@mui/material';
import { useNavigate } from 'react-router-dom';

export interface NavGroupItemProps {
  label: string;
  items: { label: string; path: string }[];
}
```

with:

```tsx
import { useEffect, useRef, useState } from 'react';
import { ChevronRight } from '@mui/icons-material';
import { List, ListItemButton, ListItemText, Paper, Popper } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import type { NavLink } from '../routes';

export interface NavGroupItemProps {
  label: string;
  items: NavLink[];
}
```

The rest of the file is untouched — its internals only ever read `.label`/`.path` off each item, so the extra `.element` field `NavLink` now carries is unused but harmless.

- [ ] **Step 6: Build and lint**

Run: `npm run build -w client` — expect success, 0 errors.
Run: `npm run lint -w client` — expect 0 errors, only the 2 pre-existing `react-refresh/only-export-components` warnings (in `PlayerDataContext.tsx`; `routes.tsx` may also trigger this same warning since it now exports both data and a helper function alongside no components — if it does, confirm it's the same warning class, not a new error, before treating it as a regression).

- [ ] **Step 7: Real-browser verification — exhaustive nav click-through**

Seed data first (worktree/fresh-checkout requirement — skip if `server/data/player-cache.json` already exists with real content):
```bash
cp example-data.json server/data/player-cache.json
```

Start the dev server: `npm run dev` (root — runs server + client concurrently). Using Playwright (the `playwright` library directly, or the `mcp__playwright__*`/`mcp__chrome-devtools__*` MCP tools if available in this session — see `CLAUDE.md`), navigate to the app and:

1. Click **all 13 nav entries**, not a sample: Overview, every child in the Crew flyout (5 Stars Crew, 3/4 Stars crew, 4/5 Stars crew, 4/4 Stars crew (ready), 4/4 Stars crew, 4 Stars Duplicates, 5 Stars Duplicates, QPs, 5 & 4 Stars Frozen Crew — 9 total), every child in the Ships flyout (5 Stars Ships, 4 Stars Ships — 2 total), and Collections. For each, confirm the URL and rendered page content match what that entry showed before this change (e.g. clicking "QPs" lands on `/qps` and renders the QPs table, not a blank page or a different page's content).
2. Directly load (via URL navigation, not a nav click) at least one path from inside each group — e.g. `/qps` and `/5-4-stars-frozen-crew` for Crew, `/4-stars-ships` for Ships — confirming `<Routes>` itself (not just the nav's `onClick` wiring) is correctly wired to `ROUTES`.
3. Open the Crew and Ships flyouts and confirm they still open/close on hover/focus and respond to `Escape` as before — this step doesn't touch `NavGroupItem`'s internals, so this is a quick sanity check, not deep re-verification.

Stop the dev server afterward (kill only the process this step started — confirm ownership via the working-directory/port before killing anything if a port conflict comes up).

- [ ] **Step 8: Commit**

```bash
git add client/src/routes.tsx client/src/App.tsx client/src/layout/AppLayout.tsx client/src/layout/NavGroupItem.tsx
git commit -m "Extract routes.tsx as the single source of truth for routes and nav"
```
