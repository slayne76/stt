# Stars Column + Reusable CrewTable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Stars" column (rarity/max_rarity indicator, between `#` and `Name`) to the "3/4 Stars crew" table, and extract the table-rendering logic into a reusable `CrewTable` component so future rarity-based pages can reuse it instead of re-implementing the table.

**Architecture:** Two new presentational components (`StarRating`, `CrewTable`) in `client/src/crew/`, consumed by the existing page. `CrewTable` owns no data-fetching/filtering/sorting — it only renders a given `crew` array. The page keeps all of its existing data-pipeline and loading/error/empty-state responsibilities, delegating only the `<Table>` JSX to `CrewTable`.

**Tech Stack:** Same as the existing client workspace — React 19, TypeScript (strict), MUI, `@mui/icons-material` (already installed, no new dependency), no new dependencies.

## Global Constraints

- `StarRating` renders `maxRarity` MUI `Star` icons, gold (`#FFD700`), first `rarity` at full opacity, remainder at `0.3` opacity — driven entirely by its own props, never a hardcoded star count.
- `CrewTable`'s column set is fixed: `#`, `Stars`, `Name`, `Level`, `Items to equip` — no configurable-columns API (deferred to a future spec if ever needed).
- `CrewTable` takes an already filtered-and-sorted `crew: CrewMember[]` — it must not fetch, filter, or sort data itself.
- No changes to `getCrewList`, `filterByRarity`, or the sorters.
- TypeScript strict mode stays on; no new dependencies added.
- No test framework — this is pure rendering, no data-correctness risk; verification is type-check, lint, and a manual dev-server check.

---

### Task 1: StarRating, CrewTable, and page update

**Files:**
- Create: `client/src/crew/StarRating.tsx`
- Create: `client/src/crew/CrewTable.tsx`
- Modify: `client/src/pages/ThreeFourStarsCrewPage.tsx`

**Interfaces:**
- Consumes: `CrewMember` (`client/src/types/crew.ts`), `getEquipmentSlotsRemaining` (`client/src/crew/getters.ts`) — both pre-existing, unchanged.
- Produces: `StarRating` component (props `{ rarity: number; maxRarity: number }`), default export from `client/src/crew/StarRating.tsx`. `CrewTable` component (props `{ crew: CrewMember[] }`), default export from `client/src/crew/CrewTable.tsx` — the page imports and renders it directly.

- [ ] **Step 1: Create `client/src/crew/StarRating.tsx`**

```tsx
import { Star } from '@mui/icons-material';
import { Box } from '@mui/material';

export interface StarRatingProps {
  rarity: number;
  maxRarity: number;
}

function StarRating({ rarity, maxRarity }: StarRatingProps) {
  return (
    <Box sx={{ display: 'inline-flex' }}>
      {Array.from({ length: maxRarity }, (_, i) => (
        <Star key={i} fontSize="small" sx={{ color: '#FFD700', opacity: i < rarity ? 1 : 0.3 }} />
      ))}
    </Box>
  );
}

export default StarRating;
```

- [ ] **Step 2: Create `client/src/crew/CrewTable.tsx`**

```tsx
import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import type { CrewMember } from '../types/crew';
import { getEquipmentSlotsRemaining } from './getters';
import StarRating from './StarRating';

export interface CrewTableProps {
  crew: CrewMember[];
}

function CrewTable({ crew }: CrewTableProps) {
  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Stars</TableCell>
            <TableCell>Name</TableCell>
            <TableCell align="right">Level</TableCell>
            <TableCell align="right">Items to equip</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {crew.map((c, index) => (
            <TableRow key={c.id}>
              <TableCell>{index + 1}</TableCell>
              <TableCell>
                <StarRating rarity={c.rarity} maxRarity={c.max_rarity} />
              </TableCell>
              <TableCell>{c.name}</TableCell>
              <TableCell align="right">{c.level}</TableCell>
              <TableCell align="right">{getEquipmentSlotsRemaining(c)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default CrewTable;
```

- [ ] **Step 3: Update `client/src/pages/ThreeFourStarsCrewPage.tsx`**

Replace the file's contents with:

```tsx
import { Alert, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { usePlayerData } from '../hooks/usePlayerData';
import { getCrewList } from '../crew/getters';
import { filterByRarity } from '../crew/filters';
import { byEquipmentSlotsRemainingDesc, byLevelDesc, byNameAsc, combineComparators, sortCrew } from '../crew/sorters';
import CrewTable from '../crew/CrewTable';

function ThreeFourStarsCrewPage() {
  const { data, loading, error, refresh } = usePlayerData();

  const crew = data
    ? sortCrew(
        filterByRarity(getCrewList(data), { rarity: 3, maxRarity: 4 }),
        combineComparators(byLevelDesc, byEquipmentSlotsRemainingDesc, byNameAsc)
      )
    : [];

  const loaded = !loading && !error && data;

  return (
    <Stack spacing={2}>
      <Typography variant="h4">3/4 Stars crew{loaded ? ` (${crew.length})` : ''}</Typography>

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
          <Typography color="text.secondary">No crew at 3/4 stars.</Typography>
        ) : (
          <CrewTable crew={crew} />
        )
      )}
    </Stack>
  );
}

export default ThreeFourStarsCrewPage;
```

Note the import list shrinks: `Table`, `TableBody`, `TableCell`, `TableContainer`, `TableHead`, `TableRow`, `Paper`, and `getEquipmentSlotsRemaining` are no longer used directly in this file (they moved into `CrewTable`) — only `Alert`, `Button`, `CircularProgress`, `Stack`, `Typography` remain from `@mui/material`, and `getEquipmentSlotsRemaining` is dropped from the `getters` import.

- [ ] **Step 4: Build and lint check**

Run: `npm run build -w client`
Expected: exits 0.

Run: `npm run lint -w client`
Expected: exits 0, no errors.

- [ ] **Step 5: Manual dev-server check**

With `server/.env` absent, start `npm run dev -w server` and `npm run dev -w client` in the background (use alternate ports if the defaults are occupied by an unrelated process, and fully revert any temporary port edits before committing).

Run: `curl -s http://localhost:5173/api/player` (or your alternate port) — expect the same 502 `UPSTREAM_AUTH_FAILED` JSON as before, confirming nothing in the server/proxy chain is affected by this purely client-side change.

Run: `curl -s http://localhost:5173/` — expect `id="root"` in the response, confirming the client still serves its shell with the new components compiled in.

Stop both background processes afterward.

- [ ] **Step 6: Commit**

```bash
git add client/src/crew/StarRating.tsx client/src/crew/CrewTable.tsx client/src/pages/ThreeFourStarsCrewPage.tsx
git commit -m "Add Stars column and extract reusable CrewTable component"
```
