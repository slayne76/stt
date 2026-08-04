# Topbar Refresh Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the "Refresh" button from the Overview page's own header into the app's persistent top bar (`AppLayout.tsx`), right-aligned, colored green (`color="success"`) instead of the default blue, with a small loading spinner — visible and usable from every page, not just Overview.

**Architecture:** `AppLayout.tsx` calls `usePlayerData()` directly (it already renders inside `PlayerDataProvider` — see `App.tsx`) to get the same shared `refresh`/`loading` values every page already reads, and renders a `Button` inside the existing `Toolbar`. `OverviewPage.tsx` loses its own button and the row-`Stack` wrapper that existed only to position it. No changes to `PlayerDataContext.tsx`, `usePlayerData.ts`, or any other page — the shared-context design means one refresh control anywhere refreshes whatever page is currently on screen, with zero new plumbing.

**Tech Stack:** Same as the existing client workspace — React 19, TypeScript (strict), MUI, no new dependencies.

## Global Constraints

- **Button:** `variant="contained" color="success"`, `onClick={() => void refresh()}`, `disabled={loading}`, `startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined}`, `sx={{ ml: 'auto' }}` to push it to the right edge of the `Toolbar` (MUI `Toolbar` is a flex row by default, so `ml: 'auto'` on the last flex child pushes it to the far right with no other layout changes needed).
- **Not tied to `error` state** — clickable during an error to retry, matching every crew page's existing "Retry" `Alert action` pattern. Only `disabled={loading}`.
- **`color="success"`** (MUI green) — same color already used for the "Ready" chip in `CollectionCrewList.tsx`, not a new, unprecedented palette choice.
- **Overview page: remove, don't duplicate.** `OverviewPage.tsx` loses its `Button` and the `Stack direction="row" justifyContent="space-between" alignItems="center"` wrapper around its title — the title becomes a plain `Typography variant="h4"`, matching every other page's header pattern. `loading`/`error`/`identity` rendering below the title is otherwise unchanged.
- **No changes to `PlayerDataContext.tsx`, `usePlayerData.ts`, any crew page, `CollectionsPage.tsx`, or any server/API code.** Crew pages' existing per-`Alert` "Retry" buttons are left as-is (out of scope, harmless duplication, not a regression).
- No test framework — verification via type-check, lint, and manual dev-server checks (this feature has no crew/collections data logic to verify against `example-data.json` — it's pure UI wiring reusing an existing, already-tested `refresh()` function).

---

### Task 1: Move the Refresh button to the topbar

**Files:**
- Modify: `client/src/layout/AppLayout.tsx`
- Modify: `client/src/pages/OverviewPage.tsx`

**Interfaces:**
- Consumes: `usePlayerData(): { data, loading, error, refresh }` (`hooks/usePlayerData.ts`, unchanged) — specifically `refresh: () => Promise<void>` and `loading: boolean`.
- Produces: no new exports — both files keep their existing default-export component shape; only their internal rendering changes.

- [ ] **Step 1: Modify `client/src/layout/AppLayout.tsx`**

Replace the full file contents with:

```tsx
import { AppBar, Box, Button, CircularProgress, Drawer, List, ListItemButton, ListItemText, Toolbar, Typography } from '@mui/material';
import { Outlet, useNavigate } from 'react-router-dom';
import { usePlayerData } from '../hooks/usePlayerData';

const DRAWER_WIDTH = 220;

const NAV_ITEMS = [
  { label: 'Overview', path: '/' },
  { label: '3/4 Stars crew', path: '/3-4-stars-crew' },
  { label: '4/5 Stars crew', path: '/4-5-stars-crew' },
  { label: '4/4 Stars crew (ready)', path: '/4-4-stars-crew-ready' },
  { label: '4/4 Stars crew', path: '/4-4-stars-crew' },
  { label: 'Collections', path: '/collections' },
  { label: '4 Stars Duplicates', path: '/4-stars-duplicates' },
  { label: '5 Stars Duplicates', path: '/5-stars-duplicates' },
];

function AppLayout() {
  const navigate = useNavigate();
  const { refresh, loading } = usePlayerData();

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
            sx={{ ml: 'auto' }}
          >
            Refresh
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
          {NAV_ITEMS.map((item) => (
            <ListItemButton key={item.path} onClick={() => navigate(item.path)}>
              <ListItemText primary={item.label} />
            </ListItemButton>
          ))}
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

(Only changes from the current file: `Button`/`CircularProgress` added to the MUI import, `usePlayerData` imported, `const { refresh, loading } = usePlayerData();` added, and the new `Button` added inside `Toolbar` right after the title. The `Drawer`, nav list, and main content area are untouched.)

- [ ] **Step 2: Modify `client/src/pages/OverviewPage.tsx`**

Replace the full file contents with:

```tsx
import {
  Alert,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from '@mui/material';
import { usePlayerData } from '../hooks/usePlayerData';
import { extractPlayerIdentity } from '../lib/extractPlayerIdentity';
import type { PlayerIdentity } from '../types/player';

const FIELD_LABELS: Record<keyof PlayerIdentity, string> = {
  playerId: 'Player ID',
  dbid: 'DBID',
};

function OverviewPage() {
  const { data, loading, error } = usePlayerData();
  const identity = data ? extractPlayerIdentity(data) : null;

  return (
    <Stack spacing={2}>
      <Typography variant="h4">Overview</Typography>

      {loading && <CircularProgress />}
      {error && <Alert severity="error">{error}</Alert>}

      {!loading && !error && identity && (
        <TableContainer component={Paper}>
          <Table>
            <TableBody>
              {(Object.keys(FIELD_LABELS) as (keyof PlayerIdentity)[]).map((field) => (
                <TableRow key={field}>
                  <TableCell component="th" scope="row">
                    {FIELD_LABELS[field]}
                  </TableCell>
                  <TableCell align="right">{identity[field] ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Stack>
  );
}

export default OverviewPage;
```

(Changes from the current file: `Button` removed from the MUI import list — no longer used here; `refresh` removed from the `usePlayerData()` destructure — no longer used here; the row `Stack`/`Button` wrapper around the title is replaced with a plain `Typography variant="h4"`. `loading`/`error`/`identity` rendering below is byte-for-byte unchanged.)

- [ ] **Step 3: Build and lint check**

Run: `npm run build -w client`
Expected: exits 0.

Run: `npm run lint -w client`
Expected: exits 0, no errors (the pre-existing `PlayerDataContext.tsx` fast-refresh warning is unrelated and expected to still appear).

- [ ] **Step 4: Manual dev-server check**

With `server/.env` absent, start `npm run dev -w server` and `npm run dev -w client` in the background (use alternate ports if the defaults are occupied by an unrelated process, and fully revert any temporary port edits before committing).

Run: `curl -s http://localhost:5173/` (or your alternate port) — expect `id="root"` in the response, confirming the client still serves its shell with the modified components compiled in.

Stop both background processes afterward.

**Manual follow-up (requires your real credentials, not part of this task):** with a real `STT_SESSION_COOKIE` set, open the app and confirm: a green "Refresh" button appears in the topbar, right-aligned, on every page (not just Overview); clicking it while on a crew page or the Collections page shows the button disabled with a small spinner during the fetch, then that page's data updates once it completes; the Overview page no longer has its own Refresh button, just the plain "Overview" title.

- [ ] **Step 5: Commit**

```bash
git add client/src/layout/AppLayout.tsx client/src/pages/OverviewPage.tsx
git commit -m "Move Refresh button to topbar, colored green, visible on every page"
```
