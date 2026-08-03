# 3/4 Stars crew: Row Count in Title + Row Number Column Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the total record count in the "3/4 Stars crew" page title (e.g. "3/4 Stars crew (70)") and add a 1-based row-number column as the first column of the table.

**Architecture:** Single-file UI change to `client/src/pages/ThreeFourStarsCrewPage.tsx` — no new helpers, types, or data-layer changes. The row number is pure row-rendering (array index), not a data concept, so it doesn't belong in `crew/getters.ts`.

**Tech Stack:** Same as the existing client workspace — React 19, TypeScript (strict), MUI, no new dependencies.

## Global Constraints

- The count in the title only appears once data has actually loaded (`!loading && !error && data`) — not during loading/error states, where showing a count (even "(0)") would be misleading.
- The row-number column is the first column, header `#`, values 1 through `crew.length` in display order (i.e. after sorting).
- No changes to filtering, sorting, or any other column.
- TypeScript strict mode stays on; no new dependencies added.
- No test framework — this is a pure rendering change with no data-correctness risk to verify against real data; verification is type-check, lint, and a manual dev-server check.

---

### Task 1: Row count in title and row-number column

**Files:**
- Modify: `client/src/pages/ThreeFourStarsCrewPage.tsx`

**Interfaces:**
- Consumes: nothing new — `crew` (the already-computed, filtered-and-sorted array) is the only thing read.

- [ ] **Step 1: Replace `client/src/pages/ThreeFourStarsCrewPage.tsx`**

Replace the file's contents with:

```tsx
import {
  Alert,
  Button,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { usePlayerData } from '../hooks/usePlayerData';
import { getCrewList, getEquipmentSlotsRemaining } from '../crew/getters';
import { filterByRarity } from '../crew/filters';
import { byEquipmentSlotsRemainingDesc, byLevelDesc, byNameAsc, combineComparators, sortCrew } from '../crew/sorters';

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
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>#</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell align="right">Level</TableCell>
                  <TableCell align="right">Items to equip</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {crew.map((c, index) => (
                  <TableRow key={c.id}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>{c.name}</TableCell>
                    <TableCell align="right">{c.level}</TableCell>
                    <TableCell align="right">{getEquipmentSlotsRemaining(c)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )
      )}
    </Stack>
  );
}

export default ThreeFourStarsCrewPage;
```

(Changes versus the current file: introduces a `loaded` boolean reused for both the title's conditional count and the existing table-gating condition — same truthiness as the prior inline `!loading && !error && data` check, just named and de-duplicated since it's now needed in two places; adds the `#` header and per-row `index + 1` cell as the new first column; everything else — imports, data pipeline, loading spinner, error Alert with Retry, empty-state message — is unchanged.)

- [ ] **Step 2: Build and lint check**

Run: `npm run build -w client`
Expected: exits 0.

Run: `npm run lint -w client`
Expected: exits 0, no errors.

- [ ] **Step 3: Manual dev-server check**

With `server/.env` absent, start `npm run dev -w server` and `npm run dev -w client` in the background (use alternate ports if the defaults are occupied by an unrelated process, exactly as in prior tasks — revert any temporary port edits before committing).

Run: `curl -s http://localhost:5173/api/player` (or your alternate port) — expect the same 502 `UPSTREAM_AUTH_FAILED` JSON as before, confirming nothing in the server/proxy chain is affected by this purely client-side change.

Run: `curl -s http://localhost:5173/` — expect `id="root"` in the response, confirming the client still serves its shell with the new column compiled in.

Stop both background processes afterward.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/ThreeFourStarsCrewPage.tsx
git commit -m "Add row count to 3/4 Stars crew title and a row-number column"
```
