# 3/4 Stars crew: Equipment Slots Remaining + Composable Sorting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Items to equip" column (derived from each crew member's `equipment` array, range -4 to 0) to the "3/4 Stars crew" table, and add it as a third sort key applied after level — while refactoring sorting from one named function per combination to composable single-key comparators.

**Architecture:** Single cohesive change across four tightly-coupled files (type → getter → sorters rewrite → page). The sorters rewrite replaces the existing `sortByName`/`sortByLevelThenName` functions entirely — both are dead or about-to-be-dead code per the prior final review's flag, and this is the point where the composable pattern replaces them rather than adding a third one-off function alongside.

**Tech Stack:** Same as the existing client workspace — React 19, TypeScript (strict), MUI, no new dependencies.

## Global Constraints

- `getEquipmentSlotsRemaining(crew)` returns `(crew.equipment?.length ?? 0) - 4` — range -4 (none equipped) to 0 (fully equipped), per the user's exact specification. The `4` is a hardcoded constant (confirmed universal across all 597 crew in `example-data.json`'s `equipment_slots.length`).
- Sort order for the "3/4 Stars crew" page: level descending → items-to-equip descending → name ascending. "Descending" on items-to-equip means closer-to-zero (closer to fully equipped) sorts first — e.g. -1 before -4.
- Sorting is composable: `combineComparators(...)` plus single-key comparators (`byLevelDesc`, `byEquipmentSlotsRemainingDesc`, `byNameAsc`) and a `sortCrew(crew, comparator)` applier — replacing the existing named-combination functions, not adding alongside them.
- New column header exactly "Items to equip", right-aligned (matching the existing "Level" column's convention).
- No changes to the rarity filter, `getCrewList`, or `filterByRarity`.
- TypeScript strict mode stays on; no new dependencies added.
- No test framework — verification via type-check, lint, and the same real-data verification technique used for prior crew-page changes (`example-data.json`, gitignored, at the repo root).

---

### Task 1: Equipment slots getter, composable sorters, and page update

**Files:**
- Modify: `client/src/types/crew.ts`
- Modify: `client/src/crew/getters.ts`
- Modify: `client/src/crew/sorters.ts`
- Modify: `client/src/pages/ThreeFourStarsCrewPage.tsx`

**Interfaces:**
- Produces: `CrewMember.equipment: [number, number][]` (new field). `getEquipmentSlotsRemaining(crew: CrewMember): number` (new export from `client/src/crew/getters.ts`). `Comparator<T>`, `combineComparators<T>(...comparators): Comparator<T>`, `byLevelDesc`, `byEquipmentSlotsRemainingDesc`, `byNameAsc`, `sortCrew(crew, comparator): CrewMember[]` — all new exports from `client/src/crew/sorters.ts`, replacing `sortByName` and `sortByLevelThenName` (removed).

- [ ] **Step 1: Add `equipment` to `CrewMember` in `client/src/types/crew.ts`**

Change:

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
  equipment: [number, number][];
}
```

- [ ] **Step 2: Add `getEquipmentSlotsRemaining` to `client/src/crew/getters.ts`**

Append this function to the existing file (keep `getCrewList` exactly as-is):

```ts
export function getEquipmentSlotsRemaining(crew: CrewMember): number {
  return (crew.equipment?.length ?? 0) - 4;
}
```

The resulting file should contain both `getCrewList` (unchanged) and `getEquipmentSlotsRemaining` (new).

- [ ] **Step 3: Rewrite `client/src/crew/sorters.ts` with composable comparators**

Replace the file's entire contents with:

```ts
import type { CrewMember } from '../types/crew';
import { getEquipmentSlotsRemaining } from './getters';

export type Comparator<T> = (a: T, b: T) => number;

export function combineComparators<T>(...comparators: Comparator<T>[]): Comparator<T> {
  return (a, b) => {
    for (const compare of comparators) {
      const result = compare(a, b);
      if (result !== 0) return result;
    }
    return 0;
  };
}

export function byLevelDesc(a: CrewMember, b: CrewMember): number {
  return b.level - a.level;
}

export function byEquipmentSlotsRemainingDesc(a: CrewMember, b: CrewMember): number {
  return getEquipmentSlotsRemaining(b) - getEquipmentSlotsRemaining(a);
}

export function byNameAsc(a: CrewMember, b: CrewMember): number {
  return a.name.localeCompare(b.name);
}

export function sortCrew(crew: CrewMember[], comparator: Comparator<CrewMember>): CrewMember[] {
  return [...crew].sort(comparator);
}
```

This entirely replaces the previous `sortByName`/`sortByLevelThenName` functions — neither name should appear in the file after this step.

- [ ] **Step 4: Update `client/src/pages/ThreeFourStarsCrewPage.tsx`**

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
                  <TableCell align="right">Items to equip</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {crew.map((c) => (
                  <TableRow key={c.id}>
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

- [ ] **Step 5: Verify the sort and getter against real data**

`example-data.json` (gitignored, real personal game data) is at the repo root. Create a throwaway script at `client/src/crew/__verify.ts` (deleted in Step 6, never committed):

```ts
import { readFileSync } from 'node:fs';
import { getCrewList, getEquipmentSlotsRemaining } from './getters';
import { filterByRarity } from './filters';
import { byEquipmentSlotsRemainingDesc, byLevelDesc, byNameAsc, combineComparators, sortCrew } from './sorters';

const raw = JSON.parse(readFileSync('example-data.json', 'utf-8')) as Record<string, unknown>;
const crew = getCrewList(raw);
const filtered = filterByRarity(crew, { rarity: 3, maxRarity: 4 });
const sorted = sortCrew(filtered, combineComparators(byLevelDesc, byEquipmentSlotsRemainingDesc, byNameAsc));

console.log('filtered count:', sorted.length);
console.log(
  'first 8 (name, level, itemsToEquip):',
  sorted.slice(0, 8).map((c) => [c.name, c.level, getEquipmentSlotsRemaining(c)])
);

const allInRange = sorted.every((c) => {
  const v = getEquipmentSlotsRemaining(c);
  return v >= -4 && v <= 0;
});
console.log('all values in range [-4, 0]:', allInRange);

let orderOk = true;
for (let i = 1; i < sorted.length; i++) {
  const prev = sorted[i - 1];
  const curr = sorted[i];
  if (prev.level < curr.level) {
    orderOk = false;
    break;
  }
  if (prev.level === curr.level) {
    const prevItems = getEquipmentSlotsRemaining(prev);
    const currItems = getEquipmentSlotsRemaining(curr);
    if (prevItems < currItems) {
      orderOk = false;
      break;
    }
    if (prevItems === currItems && prev.name.localeCompare(curr.name) > 0) {
      orderOk = false;
      break;
    }
  }
}
console.log('level -> items -> name order correct:', orderOk);
```

Run from the **repo root**: `npx tsx client/src/crew/__verify.ts`

Expected output: `filtered count: 52`, `all values in range [-4, 0]: true`, `level -> items -> name order correct: true`.

- [ ] **Step 6: Delete the throwaway verification script**

```bash
rm client/src/crew/__verify.ts
```

- [ ] **Step 7: Build and lint check**

Run: `npm run build -w client`
Expected: exits 0.

Run: `npm run lint -w client`
Expected: exits 0, no errors.

- [ ] **Step 8: Commit**

```bash
git add client/src/types/crew.ts client/src/crew/getters.ts client/src/crew/sorters.ts client/src/pages/ThreeFourStarsCrewPage.tsx
git commit -m "Add Items to equip column; refactor crew sorting to composable comparators"
```
