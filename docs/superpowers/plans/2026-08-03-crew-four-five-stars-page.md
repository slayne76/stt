# 4/5 Stars Crew Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "4/5 Stars crew" page (crew at `rarity=4, max_rarity=5`) reusing the existing `CrewTable` component, following the exact same structure as `ThreeFourStarsCrewPage.tsx`.

**Architecture:** New page file mirroring the existing rarity-page pattern exactly — its own `usePlayerData()` call, its own `filterByRarity` args, the same sort composition, the same loading/error/empty-state handling — delegating table rendering to the already-reviewed `CrewTable` component. This is the reuse scenario the `CrewTable` extraction was built for; no changes to `CrewTable`, `StarRating`, or any crew helper are needed.

**Tech Stack:** Same as the existing client workspace — React 19, TypeScript (strict), MUI, react-router-dom, no new dependencies.

## Global Constraints

- Filter: `rarity: 4, maxRarity: 5`.
- Same sort composition as the 3/4 page: `combineComparators(byLevelDesc, byEquipmentSlotsRemainingDesc, byNameAsc)`.
- Route path `/4-5-stars-crew`, nav label exactly "4/5 Stars crew", added alongside the existing "Overview" and "3/4 Stars crew" entries (not replacing either).
- No changes to `CrewTable.tsx`, `StarRating.tsx`, `getters.ts`, `filters.ts`, or `sorters.ts` — this task only adds a new page and wires it up.
- TypeScript strict mode stays on; no new dependencies added.
- No test framework — this mirrors an already-verified pattern with no new data-correctness logic; verification is type-check, lint, and a manual dev-server check.

---

### Task 1: 4/5 Stars crew page, nav entry, and route

**Files:**
- Create: `client/src/pages/FourFiveStarsCrewPage.tsx`
- Modify: `client/src/layout/AppLayout.tsx`
- Modify: `client/src/App.tsx`

**Interfaces:**
- Consumes: `usePlayerData()`, `getCrewList`, `filterByRarity`, `byLevelDesc`/`byEquipmentSlotsRemainingDesc`/`byNameAsc`/`combineComparators`/`sortCrew`, `CrewTable` — all pre-existing, unchanged.

- [ ] **Step 1: Create `client/src/pages/FourFiveStarsCrewPage.tsx`**

```tsx
import { Alert, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { usePlayerData } from '../hooks/usePlayerData';
import { getCrewList } from '../crew/getters';
import { filterByRarity } from '../crew/filters';
import { byEquipmentSlotsRemainingDesc, byLevelDesc, byNameAsc, combineComparators, sortCrew } from '../crew/sorters';
import CrewTable from '../crew/CrewTable';

function FourFiveStarsCrewPage() {
  const { data, loading, error, refresh } = usePlayerData();

  const crew = data
    ? sortCrew(
        filterByRarity(getCrewList(data), { rarity: 4, maxRarity: 5 }),
        combineComparators(byLevelDesc, byEquipmentSlotsRemainingDesc, byNameAsc)
      )
    : [];

  const loaded = !loading && !error && data;

  return (
    <Stack spacing={2}>
      <Typography variant="h4">4/5 Stars crew{loaded ? ` (${crew.length})` : ''}</Typography>

      {loading && <CircularProgress />}
      {error && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void refresh()}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {loaded && (
        crew.length === 0 ? (
          <Typography color="text.secondary">No crew at 4/5 stars.</Typography>
        ) : (
          <CrewTable crew={crew} />
        )
      )}
    </Stack>
  );
}

export default FourFiveStarsCrewPage;
```

- [ ] **Step 2: Add the nav entry in `client/src/layout/AppLayout.tsx`**

Change:

```ts
const NAV_ITEMS = [
  { label: 'Overview', path: '/' },
  { label: '3/4 Stars crew', path: '/3-4-stars-crew' },
];
```

to:

```ts
const NAV_ITEMS = [
  { label: 'Overview', path: '/' },
  { label: '3/4 Stars crew', path: '/3-4-stars-crew' },
  { label: '4/5 Stars crew', path: '/4-5-stars-crew' },
];
```

- [ ] **Step 3: Register the route in `client/src/App.tsx`**

Replace the file's contents with:

```tsx
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { PlayerDataProvider } from './context/PlayerDataContext';
import AppLayout from './layout/AppLayout';
import OverviewPage from './pages/OverviewPage';
import ThreeFourStarsCrewPage from './pages/ThreeFourStarsCrewPage';
import FourFiveStarsCrewPage from './pages/FourFiveStarsCrewPage';

function App() {
  return (
    <PlayerDataProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/3-4-stars-crew" element={<ThreeFourStarsCrewPage />} />
            <Route path="/4-5-stars-crew" element={<FourFiveStarsCrewPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </PlayerDataProvider>
  );
}

export default App;
```

- [ ] **Step 4: Build and lint check**

Run: `npm run build -w client`
Expected: exits 0.

Run: `npm run lint -w client`
Expected: exits 0, no errors.

- [ ] **Step 5: Manual dev-server check**

With `server/.env` absent, start `npm run dev -w server` and `npm run dev -w client` in the background (use alternate ports if the defaults are occupied by an unrelated process, and fully revert any temporary port edits before committing).

Run: `curl -s http://localhost:5173/api/player` (or your alternate port) — expect the same 502 `UPSTREAM_AUTH_FAILED` JSON as before, confirming nothing in the server/proxy chain is affected by this purely client-side change.

Run: `curl -s http://localhost:5173/` — expect `id="root"` in the response, confirming the client still serves its shell with the new page/route compiled in.

Stop both background processes afterward.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/FourFiveStarsCrewPage.tsx client/src/layout/AppLayout.tsx client/src/App.tsx
git commit -m "Add 4/5 Stars crew page reusing CrewTable"
```

**Manual follow-up (requires your real credentials, not part of this task):** with a real `STT_SESSION_COOKIE` set, open `http://localhost:5173/4-5-stars-crew` and confirm the table lists your own crew at rarity 4/max_rarity 5, with the same columns (including the Stars indicator showing 5 stars, 4 lit) as the 3/4 page.
