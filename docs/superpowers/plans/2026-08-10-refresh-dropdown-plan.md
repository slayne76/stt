# Consolidated Refresh Dropdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the topbar's three separate refresh buttons (player
data / assets / catalog) with one `Select` dropdown + an "Apply" button,
including a new "Refresh all" option that fires all three concurrently.

**Architecture:** A new, dependency-free `RefreshControl.tsx` component
owns the dropdown state and dispatch logic, taking the three existing
refresh operations and their loading flags as props. `AppLayout.tsx`
wires it to the same hooks/state it already uses today — the three
`Snackbar`s and `handleRefreshAssets`'s try/catch stay exactly where
they are, unchanged.

**Tech Stack:** React 19, TypeScript, MUI v6 (`Select`, `MenuItem`,
`Button`, `CircularProgress`). No test framework in this project
(deliberate, repeated choice) — verification is `tsc`/`eslint` plus a
real-browser check.

## Global Constraints

- "Refresh all" runs the three refreshes via `Promise.allSettled`, in
  parallel — not sequentially. Verified during design: no shared state,
  no read-after-write dependency between player/assets/catalog refresh.
- No combined "N of 3 succeeded" summary UI — each of the three keeps
  reporting through its own existing, independent path (player errors on
  the page, assets/catalog via their existing `Snackbar`s). Do not add
  new error-aggregation UI.
- No persistence of the selected dropdown option across page loads —
  always defaults to `'player'` on mount.
- `RefreshControl` must not call any hook or API itself — it only takes
  callbacks/flags as props, matching this project's existing pattern of
  small, dependency-free UI components (`NavGroupItem`, `StatusChip`).
- Zero changes to `PlayerDataContext`, `CrewCatalogContext`,
  `assetsApi.ts`, `catalogApi.ts`, or any server-side code — this is a
  pure frontend reshuffle of existing, working behavior.

---

### Task 1: `RefreshControl` component + `AppLayout` wiring

**Files:**
- Create: `client/src/layout/RefreshControl.tsx`
- Modify: `client/src/layout/AppLayout.tsx`

**Interfaces:**
- Produces: `RefreshOption` (`'player' | 'assets' | 'catalog' | 'all'`)
  and `RefreshControl` — default export, a component with props
  `{ playerLoading: boolean; onRefreshPlayer: () => Promise<void>;
  assetsRefreshing: boolean; onRefreshAssets: () => Promise<void>;
  catalogRefreshing: boolean; onRefreshCatalog: () => Promise<void> }`.
- Consumes (in `AppLayout.tsx`): the exact same values it already reads
  today — `usePlayerData()`'s `refresh`/`loading`, the local
  `refreshingAssets`/`handleRefreshAssets`, `useCrewCatalog()`'s
  `refresh`/`loading` (aliased `refreshCatalog`/`catalogRefreshing`).

- [ ] **Step 1: Create `client/src/layout/RefreshControl.tsx`**

```tsx
import { useState } from 'react';
import { Box, Button, CircularProgress, MenuItem, Select, type SelectChangeEvent } from '@mui/material';

export type RefreshOption = 'player' | 'assets' | 'catalog' | 'all';

interface RefreshControlProps {
  playerLoading: boolean;
  onRefreshPlayer: () => Promise<void>;
  assetsRefreshing: boolean;
  onRefreshAssets: () => Promise<void>;
  catalogRefreshing: boolean;
  onRefreshCatalog: () => Promise<void>;
}

const OPTIONS: { value: RefreshOption; label: string }[] = [
  { value: 'player', label: 'Refresh player data' },
  { value: 'assets', label: 'Refresh assets' },
  { value: 'catalog', label: 'Refresh catalog' },
  { value: 'all', label: 'Refresh all' },
];

function RefreshControl({
  playerLoading,
  onRefreshPlayer,
  assetsRefreshing,
  onRefreshAssets,
  catalogRefreshing,
  onRefreshCatalog,
}: RefreshControlProps) {
  const [selected, setSelected] = useState<RefreshOption>('player');

  const isRefreshing =
    selected === 'all'
      ? playerLoading || assetsRefreshing || catalogRefreshing
      : selected === 'player'
        ? playerLoading
        : selected === 'assets'
          ? assetsRefreshing
          : catalogRefreshing;

  function handleChange(event: SelectChangeEvent<RefreshOption>) {
    setSelected(event.target.value as RefreshOption);
  }

  async function handleApply() {
    if (selected === 'player') {
      await onRefreshPlayer();
    } else if (selected === 'assets') {
      await onRefreshAssets();
    } else if (selected === 'catalog') {
      await onRefreshCatalog();
    } else {
      await Promise.allSettled([onRefreshPlayer(), onRefreshAssets(), onRefreshCatalog()]);
    }
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 'auto' }}>
      <Select<RefreshOption>
        size="small"
        value={selected}
        onChange={handleChange}
        disabled={isRefreshing}
        sx={{
          color: 'common.white',
          '.MuiOutlinedInput-notchedOutline': { borderColor: 'common.white' },
          '.MuiSvgIcon-root': { color: 'common.white' },
        }}
      >
        {OPTIONS.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
      <Button
        variant="contained"
        color="success"
        onClick={() => void handleApply()}
        disabled={isRefreshing}
        startIcon={isRefreshing ? <CircularProgress size={16} color="inherit" /> : undefined}
        sx={{ '&.Mui-disabled': { bgcolor: 'success.dark', color: 'common.white' } }}
      >
        Apply
      </Button>
    </Box>
  );
}

export default RefreshControl;
```

Note: the `handleChange` function with an explicit
`SelectChangeEvent<RefreshOption>` parameter (rather than an inline
arrow function) is required here, not stylistic — MUI's generic
`Select<RefreshOption>` doesn't narrow `event.target.value` to
`RefreshOption` on an inline handler under this project's `tsconfig`
(confirmed by a standalone dry-run compile before this plan was
written); the explicit parameter type plus the `as RefreshOption` cast
inside is the verified-working form.

- [ ] **Step 2: Update `client/src/layout/AppLayout.tsx`**

Replace its entire contents with:

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
      { label: '3/4 Stars crew', path: '/3-4-stars-crew' },
      { label: '4/5 Stars crew', path: '/4-5-stars-crew' },
      { label: '4/4 Stars crew (ready)', path: '/4-4-stars-crew-ready' },
      { label: '4/4 Stars crew', path: '/4-4-stars-crew' },
      { label: '4 Stars Duplicates', path: '/4-stars-duplicates' },
      { label: '5 Stars Duplicates', path: '/5-stars-duplicates' },
      { label: 'QPs', path: '/qps' },
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
  const location = useLocation();
  const { refresh, loading } = usePlayerData();
  const [refreshingAssets, setRefreshingAssets] = useState(false);
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const [assetsSuccess, setAssetsSuccess] = useState(false);

  const { refresh: refreshCatalog, loading: catalogRefreshing, error: catalogError } = useCrewCatalog();
  const [catalogErrorSnackbarOpen, setCatalogErrorSnackbarOpen] = useState(false);

  useEffect(() => {
    if (catalogError) setCatalogErrorSnackbarOpen(true);
  }, [catalogError]);

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

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <Typography variant="h6" noWrap component="div">
            STT Tracker
          </Typography>
          <RefreshControl
            playerLoading={loading}
            onRefreshPlayer={refresh}
            assetsRefreshing={refreshingAssets}
            onRefreshAssets={handleRefreshAssets}
            catalogRefreshing={catalogRefreshing}
            onRefreshCatalog={refreshCatalog}
          />
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
        <ErrorBoundary key={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </Box>
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
      <Snackbar
        open={catalogErrorSnackbarOpen && catalogError !== null}
        autoHideDuration={6000}
        onClose={() => setCatalogErrorSnackbarOpen(false)}
      >
        <Alert severity="error" onClose={() => setCatalogErrorSnackbarOpen(false)}>
          {catalogError}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default AppLayout;
```

- [ ] **Step 3: Type-check, build, and lint**

```bash
npm run build -w client
npm run lint -w client
```

Expected: both exit cleanly (no `tsc` errors, no new ESLint
errors/warnings).

- [ ] **Step 4: Real-browser verification — default state and each option**

Start the dev server (seed `server/data/player-cache.json` from
`example-data.json` first if this is a fresh worktree — standing
worktree setup step; also seed a working `server/.env` with real
`STT_EMAIL`/`STT_PASSWORD` if this worktree needs to exercise the player
refresh live, or a valid `server/data/session-cache.json` if avoiding a
live login is preferred for this task):

```bash
npm run dev
```

Using the browser tooling, navigate to the app and confirm:
- The dropdown shows "Refresh player data" selected by default, and the
  three old separate buttons are gone.
- Selecting "Refresh assets" and clicking Apply triggers exactly the
  asset-cache-clear request (`POST /api/assets/refresh` in the network
  panel) and the existing "Asset cache refreshed" success `Snackbar`
  appears, matching today's behavior exactly.
- Selecting "Refresh catalog" and clicking Apply triggers
  `POST /api/crew-catalog/refresh`.
- Selecting "Refresh player data" (the default) and clicking Apply
  triggers `POST /api/player/refresh`.
- While any of the above is in flight, both the `Select` and the Apply
  button are visibly disabled, and Apply shows a spinner.

- [ ] **Step 5: Real-browser verification — "Refresh all" runs in parallel**

Select "Refresh all" and click Apply. Using the browser's network panel,
confirm all three refresh requests (`/api/player/refresh`,
`/api/assets/refresh`, `/api/crew-catalog/refresh`) start close together
(concurrently), not one finishing before the next starts. Confirm each
one's existing success/error UI still appears independently and
correctly (e.g. the assets success `Snackbar` still appears for its own
result, unaffected by the other two).

- [ ] **Step 6: Commit**

```bash
git add client/src/layout/RefreshControl.tsx client/src/layout/AppLayout.tsx
git commit -m "Replace topbar refresh buttons with a consolidated dropdown

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** the component's props/types, the "all" option's
  `Promise.allSettled` fan-out, the disabled/loading derivation, the
  file split (new `RefreshControl.tsx` vs. unchanged `AppLayout.tsx`
  state/Snackbars), and all 5 verification-plan items from the spec
  (default state, per-option dispatch, disabled-while-running, parallel
  "all" execution, independent per-source success/error) are each
  covered by this single task's steps.
- **No placeholders:** both files are given in complete, copy-pasteable
  form; every verification step names the exact thing to check.
- **Type consistency:** `RefreshControlProps`'s six fields exactly match
  what `AppLayout.tsx`'s `<RefreshControl ... />` call passes
  (`playerLoading`/`onRefreshPlayer`/`assetsRefreshing`/
  `onRefreshAssets`/`catalogRefreshing`/`onRefreshCatalog`) — no name or
  type mismatch. `RefreshOption` is defined once, in `RefreshControl.tsx`,
  and not duplicated anywhere else.
- **Dry-run validated:** the one real type-safety risk in this plan
  (MUI's generic `Select<RefreshOption>` and its `onChange` event
  typing) was confirmed via a standalone `tsc` compile against this
  project's real `tsconfig.app.json` before this plan was written — the
  first, more obvious inline-arrow-function form was confirmed to
  actually fail (`string` not assignable to `RefreshOption`), and the
  named-handler-with-explicit-event-type form was confirmed to compile
  cleanly. The plan's code uses the verified-working form throughout,
  not the one that was tested and found broken.
