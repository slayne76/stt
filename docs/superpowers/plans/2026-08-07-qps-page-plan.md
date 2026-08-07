# QPs Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new "QPs" page under the "Crew" nav group, surfacing immortalized crew closest to their next Q Bit level (QL), sorted per the user's explicit priority rule.

**Architecture:** Two tasks. Task 1 is the pure data layer — one new `CrewMember` field, four new getters, one new filter, three new sorters, all in the existing `crew/` domain module, verified against real data with no UI involved. Task 2 is the UI layer — a new `QPsTable` component, a new `QPsPage` (using the existing `PageShell`), and routing/nav wiring — verified interactively against a real running dev server, since this is new UI, not a pure logic move.

**Tech Stack:** Same as the existing client workspace — React 19, TypeScript (strict), MUI 6, no new dependencies.

## Global Constraints

- **`CrewMember` gains one required field**, verified present on all real crew: `q_bits: number`.
- **QL boundaries (cumulative `q_bits` thresholds to REACH each level):** `[100, 200, 500, 1300]` for QL1/2/3/4. A crew below 100 is QL0. `q_bits` is uncapped and keeps growing past 1300 — QL4 just means "at or past the 1300 threshold," not "exactly 1300."
- **Eligibility for this page requires BOTH `isImmortalized(crew)` AND `getQPLevel(crew) < 4`** — `q_bits > 0` never occurs on a non-immortalized crew in real data, but relying on that alone would be an assumption, not a guarantee; the explicit `isImmortalized` gate is required regardless.
- **Missions grant 25 points on success** — "rounds left" is `Math.ceil(pointsNeeded / 25)`.
- **Sort order, in this exact key order:** (1) crew needing ≤25 points sort **after** crew needing >25 points (the "on hold" group goes to the bottom), (2) QL descending, (3) `q_bits` descending, (4) name ascending.
- **The last two table columns render as negative numbers** (`-25`, `-1`, etc.) — explicit user confirmation, matching their own tracking convention.
- **No server changes** — `q_bits` is already present in the existing `/api/player` payload.
- **No automated test framework** (project-wide, deliberate choice). Task 1's verification is a throwaway `crew/__verify.ts` script (deleted before commit) against real `example-data.json` data, plus hand-constructed cases for QL1/QL2 (the real sample doesn't naturally contain a crew in those ranges — same category as this project's existing hand-constructed equipment-slots test case). Task 2's verification is the `playwright` MCP browser tooling against a real running dev server with live data.
- **Spec:** `docs/superpowers/specs/2026-08-07-qps-page-design.md`.

---

### Task 1: Data layer — type, getters, filters, sorters

**Files:**
- Modify: `client/src/types/crew.ts`
- Modify: `client/src/crew/getters.ts`
- Modify: `client/src/crew/filters.ts`
- Modify: `client/src/crew/sorters.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces (all consumed by Task 2): `CrewMember.q_bits: number`; `getQPLevel(crew: CrewMember): number`; `getQPProgressDisplay(crew: CrewMember): string`; `getQPPointsNeeded(crew: CrewMember): number`; `getQPRoundsLeft(crew: CrewMember): number`; `filterQPEligible(crew: CrewMember[]): CrewMember[]`; `byQPOnHoldAsc`, `byQPLevelDesc`, `byQPPointsDesc` (all `(a: CrewMember, b: CrewMember) => number`).

- [ ] **Step 1: Confirm the current state of all four files matches this plan's assumptions**

Run: `cat -n client/src/types/crew.ts client/src/crew/getters.ts client/src/crew/filters.ts client/src/crew/sorters.ts`

Confirm `types/crew.ts` does not already have a `q_bits` field, and that `crew/getters.ts` ends with `getFrozenCrewArchetypeIds` (the most recently added function), `crew/filters.ts` ends with `filterFrozenDuplicates`, and `crew/sorters.ts` ends with `sortCrew`. If any of this differs, stop and re-check the spec before proceeding.

- [ ] **Step 2: Add `q_bits` to `client/src/types/crew.ts`**

Replace:
```ts
import type { DatacoreAsset } from './asset';

export interface CrewMember {
  id: number;
  symbol: string;
  name: string;
  short_name: string;
  archetype_id: number;
  rarity: number;
  max_rarity: number;
  level: number;
  equipment: [number, number][];
  equipment_slots: { level: number; archetype: number }[];
  traits: string[];
  traits_hidden: string[];
  portrait?: DatacoreAsset;
}
```
with:
```ts
import type { DatacoreAsset } from './asset';

export interface CrewMember {
  id: number;
  symbol: string;
  name: string;
  short_name: string;
  archetype_id: number;
  rarity: number;
  max_rarity: number;
  level: number;
  equipment: [number, number][];
  equipment_slots: { level: number; archetype: number }[];
  traits: string[];
  traits_hidden: string[];
  portrait?: DatacoreAsset;
  q_bits: number;
}
```

- [ ] **Step 3: Add the QP getters to `client/src/crew/getters.ts`**

Append at the end of the file (after `getFrozenCrewArchetypeIds`):
```ts

const QP_LEVEL_THRESHOLDS = [100, 200, 500, 1300]; // cumulative q_bits to REACH QL1/2/3/4

export function getQPLevel(crew: CrewMember): number {
  for (let i = 0; i < QP_LEVEL_THRESHOLDS.length; i++) {
    if (crew.q_bits < QP_LEVEL_THRESHOLDS[i]) return i;
  }
  return QP_LEVEL_THRESHOLDS.length;
}

function getQPLevelThreshold(crew: CrewMember): number {
  const level = getQPLevel(crew);
  return QP_LEVEL_THRESHOLDS[level] ?? QP_LEVEL_THRESHOLDS[QP_LEVEL_THRESHOLDS.length - 1];
}

export function getQPProgressDisplay(crew: CrewMember): string {
  return `${crew.q_bits}/${getQPLevelThreshold(crew)}`;
}

export function getQPPointsNeeded(crew: CrewMember): number {
  if (getQPLevel(crew) >= QP_LEVEL_THRESHOLDS.length) return 0;
  return getQPLevelThreshold(crew) - crew.q_bits;
}

export function getQPRoundsLeft(crew: CrewMember): number {
  return Math.ceil(getQPPointsNeeded(crew) / 25);
}
```

- [ ] **Step 4: Add `filterQPEligible` to `client/src/crew/filters.ts`**

Append at the end of the file (after `filterFrozenDuplicates`):
```ts

export function filterQPEligible(crew: CrewMember[]): CrewMember[] {
  return crew.filter((c) => isImmortalized(c) && getQPLevel(c) < 4);
}
```

This requires `getQPLevel` to also be imported. Update the file's import line — replace:
```ts
import { isImmortalized, isReadyToImmortalize } from './getters';
```
with:
```ts
import { getQPLevel, isImmortalized, isReadyToImmortalize } from './getters';
```

- [ ] **Step 5: Add the QP sorters to `client/src/crew/sorters.ts`**

Append at the end of the file (after `sortCrew`):
```ts

export function byQPOnHoldAsc(a: CrewMember, b: CrewMember): number {
  const aOnHold = getQPPointsNeeded(a) <= 25 ? 1 : 0;
  const bOnHold = getQPPointsNeeded(b) <= 25 ? 1 : 0;
  return aOnHold - bOnHold;
}

export function byQPLevelDesc(a: CrewMember, b: CrewMember): number {
  return getQPLevel(b) - getQPLevel(a);
}

export function byQPPointsDesc(a: CrewMember, b: CrewMember): number {
  return b.q_bits - a.q_bits;
}
```

This requires `getQPLevel` and `getQPPointsNeeded` to also be imported. Update the file's import line — replace:
```ts
import { getEquipmentSlotsRemaining, getCrewTier, type CrewTier } from './getters';
```
with:
```ts
import { getEquipmentSlotsRemaining, getCrewTier, getQPLevel, getQPPointsNeeded, type CrewTier } from './getters';
```

- [ ] **Step 6: Build and lint check**

Run: `npm run build -w client`
Expected: exits 0.

Run: `npm run lint -w client`
Expected: exits 0, no new errors.

- [ ] **Step 7: Verify against real data**

`example-data.json` (gitignored, real personal game data) is at the repo root. Create a throwaway script at `client/src/crew/__verify.ts` (deleted in Step 9, never committed):

```ts
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { getCrewList, getQPLevel, getQPProgressDisplay, getQPPointsNeeded, getQPRoundsLeft } from './getters';
import { filterQPEligible } from './filters';
import type { CrewMember } from '../types/crew';

const raw = JSON.parse(readFileSync('example-data.json', 'utf-8')) as Record<string, unknown>;
const crew = getCrewList(raw);

// Real QL0 example: Minuet, id 391659902, q_bits 75.
const minuet = crew.find((c) => c.id === 391659902);
assert.ok(minuet, 'Minuet not found');
assert.equal(minuet.q_bits, 75);
assert.equal(getQPLevel(minuet), 0);
assert.equal(getQPProgressDisplay(minuet), '75/100');
assert.equal(getQPPointsNeeded(minuet), 25);
assert.equal(getQPRoundsLeft(minuet), 1);

// Real QL3 example: Morphing Vadic, id 1180804169, q_bits 1275.
const vadic = crew.find((c) => c.id === 1180804169);
assert.ok(vadic, 'Morphing Vadic not found');
assert.equal(vadic.q_bits, 1275);
assert.equal(getQPLevel(vadic), 3);
assert.equal(getQPProgressDisplay(vadic), '1275/1300');
assert.equal(getQPPointsNeeded(vadic), 25);
assert.equal(getQPRoundsLeft(vadic), 1);

// Real QL4 example (must be excluded from filterQPEligible): Augment Picard, symbol picard_augment_crew, q_bits 1300.
const augmentPicard = crew.find((c) => c.symbol === 'picard_augment_crew');
assert.ok(augmentPicard, 'Augment Picard not found');
assert.equal(augmentPicard.q_bits, 1300);
assert.equal(getQPLevel(augmentPicard), 4);

// Real non-immortalized example (must be excluded from filterQPEligible even though q_bits is 0, i.e. < 100):
// Dancing Chekov, id 371017383, rarity 1/5 (not immortalized).
const chekov = crew.find((c) => c.id === 371017383);
assert.ok(chekov, 'Dancing Chekov not found');
assert.equal(chekov.q_bits, 0);
assert.equal(chekov.rarity, 1);
assert.equal(chekov.max_rarity, 5);

// Hand-constructed QL1/QL2 cases — the real sample has no crew currently in these ranges,
// same category as this project's existing hand-constructed equipment-slots test case.
const ql1Crew = { ...minuet, q_bits: 150 } as CrewMember;
assert.equal(getQPLevel(ql1Crew), 1);
assert.equal(getQPProgressDisplay(ql1Crew), '150/200');
assert.equal(getQPPointsNeeded(ql1Crew), 50);
assert.equal(getQPRoundsLeft(ql1Crew), 2);

const ql2Crew = { ...minuet, q_bits: 350 } as CrewMember;
assert.equal(getQPLevel(ql2Crew), 2);
assert.equal(getQPProgressDisplay(ql2Crew), '350/500');
assert.equal(getQPPointsNeeded(ql2Crew), 150);
assert.equal(getQPRoundsLeft(ql2Crew), 6);

// filterQPEligible against the full real roster.
const eligible = filterQPEligible(crew);
assert.equal(eligible.length, 62, `expected 62 QP-eligible crew, got ${eligible.length}`);
assert.ok(eligible.every((c) => c.q_bits < 1300), 'no QL4 crew should be present');
assert.ok(!eligible.some((c) => c.id === augmentPicard.id), 'Augment Picard (QL4) must be excluded');
assert.ok(!eligible.some((c) => c.id === chekov.id), 'Dancing Chekov (not immortalized) must be excluded');

console.log('MATCH: all QPs data-layer assertions passed');
```

Run from the **repo root**: `npx tsx client/src/crew/__verify.ts`

Expected output: `MATCH: all QPs data-layer assertions passed`, exit code 0. If any assertion throws, do not proceed — re-check Steps 3-5 against this plan exactly.

- [ ] **Step 8: Delete the throwaway verification script**

```bash
rm client/src/crew/__verify.ts
```

- [ ] **Step 9: Commit**

```bash
git add client/src/types/crew.ts client/src/crew/getters.ts client/src/crew/filters.ts client/src/crew/sorters.ts
git commit -m "Add QP level data layer: q_bits field, getters, filter, sorters"
```

---

### Task 2: `QPsTable`, `QPsPage`, routing, and nav

**Files:**
- Create: `client/src/crew/QPsTable.tsx`
- Create: `client/src/pages/QPsPage.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/layout/AppLayout.tsx`

**Interfaces:**
- Consumes: `getQPLevel`, `getQPProgressDisplay`, `getQPPointsNeeded`, `getQPRoundsLeft` (`crew/getters.ts`), `filterQPEligible` (`crew/filters.ts`), `byQPOnHoldAsc`, `byQPLevelDesc`, `byQPPointsDesc`, `byNameAsc`, `sortCrew` (`crew/sorters.ts`) — all from Task 1, already on this branch. `combineComparators` (`lib/comparator.ts`), `PageShell`/`PageShellProps` (`layout/PageShell.tsx`), `Thumbnail` (`assets/Thumbnail.tsx`), `StarRating` (`crew/StarRating.tsx`) — all pre-existing.
- Produces: `QPsTable` (default export, props `{ crew: CrewMember[] }`), `QPsPage` (default export, no props) — new route `/qps`, new nav entry "QPs" under "Crew."

- [ ] **Step 1: Confirm the current state of `App.tsx` and the "Crew" section of `AppLayout.tsx` matches this plan's assumptions**

Run: `cat -n client/src/App.tsx`

Confirm the last route before the closing `</Route>` is `<Route path="/4-stars-ships" element={<FourStarsShipsPage />} />`.

Run: `grep -n "label: '5 Stars Duplicates'" -A2 client/src/layout/AppLayout.tsx`

Confirm the "Crew" group's children array ends with the "5 Stars Duplicates" entry as the last child before the closing `],`. If either differs, stop and re-check the spec before proceeding.

- [ ] **Step 2: Create `client/src/crew/QPsTable.tsx`**

```tsx
import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import type { CrewMember } from '../types/crew';
import { getQPLevel, getQPProgressDisplay, getQPPointsNeeded, getQPRoundsLeft } from './getters';
import StarRating from './StarRating';
import Thumbnail from '../assets/Thumbnail';

export interface QPsTableProps {
  crew: CrewMember[];
}

function QPsTable({ crew }: QPsTableProps) {
  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Image</TableCell>
            <TableCell>Stars</TableCell>
            <TableCell>Name</TableCell>
            <TableCell align="right">QL</TableCell>
            <TableCell align="right">QPs</TableCell>
            <TableCell align="right">Points left</TableCell>
            <TableCell align="right">Rounds left</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {crew.map((c, index) => (
            <TableRow key={c.id}>
              <TableCell>{index + 1}</TableCell>
              <TableCell>
                <Thumbnail asset={c.portrait} />
              </TableCell>
              <TableCell>
                <StarRating rarity={c.rarity} maxRarity={c.max_rarity} />
              </TableCell>
              <TableCell>{c.name}</TableCell>
              <TableCell align="right">{getQPLevel(c)}/4</TableCell>
              <TableCell align="right">{getQPProgressDisplay(c)}</TableCell>
              <TableCell align="right">-{getQPPointsNeeded(c)}</TableCell>
              <TableCell align="right">-{getQPRoundsLeft(c)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default QPsTable;
```

- [ ] **Step 3: Create `client/src/pages/QPsPage.tsx`**

```tsx
import { usePlayerData } from '../hooks/usePlayerData';
import { getCrewList } from '../crew/getters';
import { filterQPEligible } from '../crew/filters';
import { byQPOnHoldAsc, byQPLevelDesc, byQPPointsDesc, byNameAsc, sortCrew } from '../crew/sorters';
import { combineComparators } from '../lib/comparator';
import QPsTable from '../crew/QPsTable';
import PageShell from '../layout/PageShell';

function QPsPage() {
  const { data, loading, error, refresh } = usePlayerData();

  const crew = data
    ? sortCrew(
        filterQPEligible(getCrewList(data)),
        combineComparators(byQPOnHoldAsc, byQPLevelDesc, byQPPointsDesc, byNameAsc)
      )
    : [];

  const loaded = !loading && !error && !!data;

  return (
    <PageShell
      title="QPs"
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={crew.length}
      emptyMessage="No crew need QP leveling."
    >
      <QPsTable crew={crew} />
    </PageShell>
  );
}

export default QPsPage;
```

- [ ] **Step 4: Wire the route into `client/src/App.tsx`**

Replace:
```tsx
import FiveStarsShipsPage from './pages/FiveStarsShipsPage';
import FourStarsShipsPage from './pages/FourStarsShipsPage';
```
with:
```tsx
import FiveStarsShipsPage from './pages/FiveStarsShipsPage';
import FourStarsShipsPage from './pages/FourStarsShipsPage';
import QPsPage from './pages/QPsPage';
```

Replace:
```tsx
            <Route path="/5-stars-ships" element={<FiveStarsShipsPage />} />
            <Route path="/4-stars-ships" element={<FourStarsShipsPage />} />
          </Route>
```
with:
```tsx
            <Route path="/5-stars-ships" element={<FiveStarsShipsPage />} />
            <Route path="/4-stars-ships" element={<FourStarsShipsPage />} />
            <Route path="/qps" element={<QPsPage />} />
          </Route>
```

- [ ] **Step 5: Add the nav entry in `client/src/layout/AppLayout.tsx`**

Replace:
```tsx
      { label: '4 Stars Duplicates', path: '/4-stars-duplicates' },
      { label: '5 Stars Duplicates', path: '/5-stars-duplicates' },
    ],
  },
```
with:
```tsx
      { label: '4 Stars Duplicates', path: '/4-stars-duplicates' },
      { label: '5 Stars Duplicates', path: '/5-stars-duplicates' },
      { label: 'QPs', path: '/qps' },
    ],
  },
```

- [ ] **Step 6: Build and lint check**

Run: `npm run build -w client`
Expected: exits 0.

Run: `npm run lint -w client`
Expected: exits 0, no new errors.

- [ ] **Step 7: Verify against a real running dev server**

Using the `playwright` MCP browser tools against a real running dev server with live data (a fresh `POST /api/player/refresh` beforehand is recommended, so the counts match a truly current pull rather than a stale cache — check with the controller for the exact dev-server URL to use in this environment):

1. Navigate to `/qps`. `browser_snapshot` — confirm the title reads "QPs (N)" for some real count N, and the table's column headers are `#`, `Image`, `Stars`, `Name`, `QL`, `QPs`, `Points left`, `Rounds left`.
2. Confirm the sort order on the first several rows: the very first row should be the crew needing the most points (or, if every eligible crew needs ≤25 points, the highest-QL, then highest-`q_bits`, then alphabetically-first crew within the "on hold" group) — cross-check at least the first 3 rows' QL/QPs values are non-increasing in priority order per the spec's sort rule.
3. Confirm at least one row's "Points left"/"Rounds left" values are negative and consistent with its "QPs" column (e.g. a row showing "QPs: 1275/1300" should show "Points left: -25" and "Rounds left: -1").
4. Hover/click into the "Crew" nav flyout — `browser_snapshot` — confirm it now shows 7 items, with "QPs" present (added at the end, after "5 Stars Duplicates").
5. Click "QPs" from the flyout — confirm navigation to `/qps` and the flyout closes (existing `NavGroupItem` behavior, regression check).

- [ ] **Step 8: Commit**

```bash
git add client/src/crew/QPsTable.tsx client/src/pages/QPsPage.tsx client/src/App.tsx client/src/layout/AppLayout.tsx
git commit -m "Add the QPs page, table, route, and nav entry"
```
