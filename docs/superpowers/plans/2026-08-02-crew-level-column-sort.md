# 3/4 Stars crew: Level Column + Level/Name Sort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Level" column to the "3/4 Stars crew" table and change its sort order to level (descending) then name (ascending) as a tie-breaker.

**Architecture:** Single cohesive change across three tightly-coupled files (type → sorter → page); no new modules, no changes to any other page.

**Tech Stack:** Same as the existing client workspace — React 19, TypeScript (strict), MUI, no new dependencies.

## Global Constraints

- Sort order: `level` descending (highest first), then `name` ascending as tie-breaker.
- `sortByName` (existing export in `client/src/crew/sorters.ts`) is not removed or modified — it's a working, independently useful export, kept as-is.
- No changes to the rarity filter or to any file outside the three listed below.
- TypeScript strict mode stays on; no new dependencies added.
- No test framework — verification via type-check, lint, and the same real-data verification technique used for the original crew helpers (`example-data.json`, gitignored, at the repo root).

---

### Task 1: Level column and level/name sort

**Files:**
- Modify: `client/src/types/crew.ts`
- Modify: `client/src/crew/sorters.ts`
- Modify: `client/src/pages/ThreeFourStarsCrewPage.tsx`

**Interfaces:**
- Consumes: nothing new — `CrewMember`, `getCrewList`, `filterByRarity` are all pre-existing and unchanged in signature.
- Produces: `CrewMember.level: number` (new field); `sortByLevelThenName(crew: CrewMember[]): CrewMember[]` (new export from `client/src/crew/sorters.ts`).

- [ ] **Step 1: Add `level` to `CrewMember` in `client/src/types/crew.ts`**

Change:

```ts
export interface CrewMember {
  id: number;
  symbol: string;
  name: string;
  short_name: string;
  rarity: number;
  max_rarity: number;
}
```

to:

```ts
export interface CrewMember {
  id: number;
  symbol: string;
  name: string;
  short_name: string;
  rarity: number;
  max_rarity: number;
  level: number;
}
```

- [ ] **Step 2: Add `sortByLevelThenName` to `client/src/crew/sorters.ts`**

Append this function to the existing file (keep `sortByName` exactly as-is):

```ts
export function sortByLevelThenName(crew: CrewMember[]): CrewMember[] {
  return [...crew].sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
}
```

The resulting file should contain both `sortByName` (unchanged) and `sortByLevelThenName` (new).

- [ ] **Step 3: Update `client/src/pages/ThreeFourStarsCrewPage.tsx`**

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
import { getCrewList } from '../crew/getters';
import { filterByRarity } from '../crew/filters';
import { sortByLevelThenName } from '../crew/sorters';

function ThreeFourStarsCrewPage() {
  const { data, loading, error, refresh } = usePlayerData();

  const crew = data
    ? sortByLevelThenName(filterByRarity(getCrewList(data), { rarity: 3, maxRarity: 4 }))
    : [];

  return (
    <Stack spacing={2}>
      <Typography variant="h4">3/4 Stars crew</Typography>

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

      {!loading && !error && data && (
        crew.length === 0 ? (
          <Typography color="text.secondary">No crew at 3/4 stars.</Typography>
        ) : (
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell align="right">Level</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {crew.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.name}</TableCell>
                    <TableCell align="right">{c.level}</TableCell>
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

(Only the import list, the `sortByName` → `sortByLevelThenName` swap, the added `TableHead`, and the added per-row `Level` cell change versus the current file — the loading/error/empty-state gating is untouched.)

- [ ] **Step 4: Verify the sort against real data**

`example-data.json` (gitignored, real personal game data) is at the repo root. Create a throwaway script at `client/src/crew/__verify.ts` (deleted in Step 5, never committed):

```ts
import { readFileSync } from 'node:fs';
import { getCrewList } from './getters';
import { filterByRarity } from './filters';
import { sortByLevelThenName } from './sorters';

const raw = JSON.parse(readFileSync('example-data.json', 'utf-8')) as Record<string, unknown>;
const crew = getCrewList(raw);
const filtered = filterByRarity(crew, { rarity: 3, maxRarity: 4 });
const sorted = sortByLevelThenName(filtered);

console.log('filtered count:', sorted.length);
console.log('first 5 (name, level):', sorted.slice(0, 5).map((c) => [c.name, c.level]));

const levels = sorted.map((c) => c.level);
const levelsNonIncreasing = levels.every((lvl, i) => i === 0 || levels[i - 1] >= lvl);
console.log('levels non-increasing:', levelsNonIncreasing);

let tieBreakOk = true;
for (let i = 1; i < sorted.length; i++) {
  if (sorted[i - 1].level === sorted[i].level && sorted[i - 1].name.localeCompare(sorted[i].name) > 0) {
    tieBreakOk = false;
    break;
  }
}
console.log('name tie-break correct:', tieBreakOk);
```

Run from the **repo root**: `npx tsx client/src/crew/__verify.ts`

Expected output: `filtered count: 52`, `levels non-increasing: true`, `name tie-break correct: true`.

- [ ] **Step 5: Delete the throwaway verification script**

```bash
rm client/src/crew/__verify.ts
```

- [ ] **Step 6: Build and lint check**

Run: `npm run build -w client`
Expected: exits 0.

Run: `npm run lint -w client`
Expected: exits 0, no errors.

- [ ] **Step 7: Commit**

```bash
git add client/src/types/crew.ts client/src/crew/sorters.ts client/src/pages/ThreeFourStarsCrewPage.tsx
git commit -m "Add Level column to 3/4 Stars crew table, sort by level then name"
```
