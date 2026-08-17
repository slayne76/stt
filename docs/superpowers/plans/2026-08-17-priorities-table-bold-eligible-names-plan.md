# Overview page: bold crew names eligible for the Priorities counter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the Overview page's four Priorities tables (DataScore, Original Algorithm, Beta Tachyon, Gauntlet), render a crew member's name in bold when that row is eligible to advance the 5-row cutoff counter (level < 100, or equipment slots remaining < 0) — normal weight otherwise. No other page's crew table changes.

**Architecture:** Export the existing private eligibility predicate from `client/src/crew/priorityCutoff.ts` under a clear public name. Add one new optional boolean prop, `boldEligibleNames`, to the shared `CrewTable` component (`client/src/crew/CrewTable.tsx`); when true, the Name cell wraps the crew's name in a bold `Typography` for rows where the predicate is true. Wire `boldEligibleNames={true}` on exactly the four Priorities `<CrewTable>` call sites in `client/src/pages/OverviewPage.tsx` — every other `<CrewTable>` call site in the app leaves the prop unset (falsy), so its rendering is unchanged.

**Tech Stack:** React 19 + TypeScript strict, MUI (`Typography`), no test framework — verification via strict typecheck, lint, and a real-browser screenshot check against real player data.

## Global Constraints

- Eligibility predicate, exact logic (unchanged from the existing private `countsTowardLimit`): `crew.level < 100 || getEquipmentSlotsRemaining(crew) < 0`.
- Only the crew **name** text is bolded — not the row, not any other cell (Level, Items to equip, DataScore, Gauntlet Rank, Stars, Image).
- `CrewTable`'s new prop is optional and defaults to falsy — every existing call site outside `OverviewPage.tsx`'s four Priorities tables must render byte-for-byte identically to before this change.
- No change to `applyPriorityCutoff`'s behavior, the 5-row limit, or which crew appear in any table.
- No change to `CrewTableProps`' existing props or to any other column.

---

### Task 1: Export the eligibility predicate, add the bold-name prop to CrewTable, wire it into the four Priorities tables

**Files:**
- Modify: `client/src/crew/priorityCutoff.ts`
- Modify: `client/src/crew/CrewTable.tsx`
- Modify: `client/src/pages/OverviewPage.tsx`

**Interfaces:**
- Consumes: `CrewMember` (`client/src/types/crew.ts`), `getEquipmentSlotsRemaining` (`client/src/crew/getters.ts`) — both pre-existing, unchanged.
- Produces: `isPriorityCountEligible(crew: CrewMember): boolean`, exported from `client/src/crew/priorityCutoff.ts` — a new public export other code may import going forward. `CrewTableProps` gains one new optional field: `boldEligibleNames?: boolean`.

- [ ] **Step 1: Export the eligibility predicate under a public name**

In `client/src/crew/priorityCutoff.ts`, the file currently reads:

```ts
import type { CrewMember } from '../types/crew';
import { getEquipmentSlotsRemaining } from './getters';

const PRIORITY_COUNT_LIMIT = 5;

// A row "counts" toward the limit unless it's already fully leveled and
// equipped — level 100 with 0 equipment slots missing. Matches the user's
// worked example: "lvl 100 -0" rows are kept in the output but don't
// advance the counter that decides where the list stops.
function countsTowardLimit(crew: CrewMember): boolean {
  return crew.level < 100 || getEquipmentSlotsRemaining(crew) < 0;
}

export function applyPriorityCutoff(rankedCrew: CrewMember[], limit: number = PRIORITY_COUNT_LIMIT): CrewMember[] {
  const result: CrewMember[] = [];
  let counted = 0;
  for (const crew of rankedCrew) {
    result.push(crew);
    if (countsTowardLimit(crew)) {
      counted += 1;
      if (counted >= limit) break;
    }
  }
  return result;
}
```

Replace its full contents with:

```ts
import type { CrewMember } from '../types/crew';
import { getEquipmentSlotsRemaining } from './getters';

const PRIORITY_COUNT_LIMIT = 5;

// A row "counts" toward the limit unless it's already fully leveled and
// equipped — level 100 with 0 equipment slots missing. Matches the user's
// worked example: "lvl 100 -0" rows are kept in the output but don't
// advance the counter that decides where the list stops. Exported so
// CrewTable can bold a row's name when it counts (Overview page's
// Priorities tables only — see boldEligibleNames prop).
export function isPriorityCountEligible(crew: CrewMember): boolean {
  return crew.level < 100 || getEquipmentSlotsRemaining(crew) < 0;
}

export function applyPriorityCutoff(rankedCrew: CrewMember[], limit: number = PRIORITY_COUNT_LIMIT): CrewMember[] {
  const result: CrewMember[] = [];
  let counted = 0;
  for (const crew of rankedCrew) {
    result.push(crew);
    if (isPriorityCountEligible(crew)) {
      counted += 1;
      if (counted >= limit) break;
    }
  }
  return result;
}
```

- [ ] **Step 2: Add the `boldEligibleNames` prop to CrewTable and bold the name when eligible**

In `client/src/crew/CrewTable.tsx`, the top of the file currently reads:

```tsx
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import type { CrewMember } from '../types/crew';
import type { Collection } from '../types/collection';
import { getEquipmentSlotsRemaining } from './getters';
import { getCrewCollections } from '../collections/getters';
import { usePagination } from '../lib/usePagination';
import StarRating from './StarRating';
import Thumbnail from '../assets/Thumbnail';
import TablePaginationFooter from '../components/TablePaginationFooter';

export interface CrewTableProps {
  crew: CrewMember[];
  collections: Collection[];
  showCollectionsNames: boolean;
  uniquelyRetrievableArchetypeIds?: Set<number> | null;
  dataScoreByArchetypeId?: Map<number, number>;
  gauntletRankByArchetypeId?: Map<number, number>;
}
```

Replace it with:

```tsx
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type { CrewMember } from '../types/crew';
import type { Collection } from '../types/collection';
import { getEquipmentSlotsRemaining } from './getters';
import { isPriorityCountEligible } from './priorityCutoff';
import { getCrewCollections } from '../collections/getters';
import { usePagination } from '../lib/usePagination';
import StarRating from './StarRating';
import Thumbnail from '../assets/Thumbnail';
import TablePaginationFooter from '../components/TablePaginationFooter';

export interface CrewTableProps {
  crew: CrewMember[];
  collections: Collection[];
  showCollectionsNames: boolean;
  uniquelyRetrievableArchetypeIds?: Set<number> | null;
  dataScoreByArchetypeId?: Map<number, number>;
  gauntletRankByArchetypeId?: Map<number, number>;
  boldEligibleNames?: boolean;
}
```

A few lines further down, the function signature currently reads:

```tsx
function CrewTable({
  crew,
  collections,
  showCollectionsNames,
  uniquelyRetrievableArchetypeIds,
  dataScoreByArchetypeId,
  gauntletRankByArchetypeId,
}: CrewTableProps) {
```

Replace it with:

```tsx
function CrewTable({
  crew,
  collections,
  showCollectionsNames,
  uniquelyRetrievableArchetypeIds,
  dataScoreByArchetypeId,
  gauntletRankByArchetypeId,
  boldEligibleNames,
}: CrewTableProps) {
```

Finally, the Name cell in the row body currently reads:

```tsx
                <TableCell>{c.name}</TableCell>
```

Replace it with:

```tsx
                <TableCell>
                  {boldEligibleNames && isPriorityCountEligible(c) ? (
                    <Typography component="span" sx={{ fontWeight: 'bold' }}>
                      {c.name}
                    </Typography>
                  ) : (
                    c.name
                  )}
                </TableCell>
```

- [ ] **Step 3: Wire `boldEligibleNames={true}` into the four Priorities tables on the Overview page**

In `client/src/pages/OverviewPage.tsx`, there are four `<CrewTable ... />` call sites under the four `Priorities (...)` headings. Add `boldEligibleNames={true}` to each of these four (and only these four — no other `<CrewTable>` call site in this file or any other file changes).

The DataScore table currently reads:

```tsx
          <CrewTable
            crew={dataScorePriorityCrew}
            collections={collectionsList}
            showCollectionsNames={true}
            dataScoreByArchetypeId={dataScoreMap}
            gauntletRankByArchetypeId={gauntletRankMap}
          />
```

Replace it with:

```tsx
          <CrewTable
            crew={dataScorePriorityCrew}
            collections={collectionsList}
            showCollectionsNames={true}
            dataScoreByArchetypeId={dataScoreMap}
            gauntletRankByArchetypeId={gauntletRankMap}
            boldEligibleNames={true}
          />
```

The Original Algorithm table currently reads:

```tsx
            <CrewTable
              crew={originalAlgorithmCrew}
              collections={collectionsList}
              showCollectionsNames={true}
              dataScoreByArchetypeId={showCatalogData ? dataScoreMap : undefined}
              gauntletRankByArchetypeId={showCatalogData ? gauntletRankMap : undefined}
            />
```

Replace it with:

```tsx
            <CrewTable
              crew={originalAlgorithmCrew}
              collections={collectionsList}
              showCollectionsNames={true}
              dataScoreByArchetypeId={showCatalogData ? dataScoreMap : undefined}
              gauntletRankByArchetypeId={showCatalogData ? gauntletRankMap : undefined}
              boldEligibleNames={true}
            />
```

The Beta Tachyon table currently reads:

```tsx
            <CrewTable
              crew={betaTachyonCrew}
              collections={collectionsList}
              showCollectionsNames={true}
              dataScoreByArchetypeId={showCatalogData ? dataScoreMap : undefined}
              gauntletRankByArchetypeId={showCatalogData ? gauntletRankMap : undefined}
            />
```

Replace it with:

```tsx
            <CrewTable
              crew={betaTachyonCrew}
              collections={collectionsList}
              showCollectionsNames={true}
              dataScoreByArchetypeId={showCatalogData ? dataScoreMap : undefined}
              gauntletRankByArchetypeId={showCatalogData ? gauntletRankMap : undefined}
              boldEligibleNames={true}
            />
```

The Gauntlet table currently reads:

```tsx
          <CrewTable
            crew={gauntletPriorityCrew}
            collections={collectionsList}
            showCollectionsNames={true}
            dataScoreByArchetypeId={dataScoreMap}
            gauntletRankByArchetypeId={gauntletRankMap}
          />
```

Replace it with:

```tsx
          <CrewTable
            crew={gauntletPriorityCrew}
            collections={collectionsList}
            showCollectionsNames={true}
            dataScoreByArchetypeId={dataScoreMap}
            gauntletRankByArchetypeId={gauntletRankMap}
            boldEligibleNames={true}
          />
```

- [ ] **Step 4: Typecheck**

Run: `cd client && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Lint**

Run: `cd client && npx eslint src/crew/priorityCutoff.ts src/crew/CrewTable.tsx src/pages/OverviewPage.tsx`
Expected: no errors.

- [ ] **Step 6: Real-browser check**

Start the dev server if one isn't already running in this worktree (`npm run dev` from the repo root; check `ss -ltnp | grep node` for an already-listening vite port first — do not start a second instance). Using `playwright` (per this repo's `CLAUDE.md` — prefer the `playwright`/`chrome-devtools` MCP tools first, fall back to the raw `playwright` npm library):

1. Navigate to `/` (Overview page) against real player data.
2. In "Priorities (Original Algorithm)", locate "Critical Strike Picard" (level 100, 0 equipment slots remaining) and confirm the name renders normal weight (not bold). Locate "Jim Shimoda" (level 90) in the same table and confirm the name renders bold.
3. Spot-check "Priorities (DataScore)" and "Priorities (Beta Tachyon)": confirm at least one bold name and, if present, at least one non-bold (`100`, `0` remaining) name render correctly per the rule.
4. In "Priorities (Gauntlet)", confirm every visible row's name is bold.
5. Confirm every other cell in these tables (Level, Items to equip, Stars, DataScore, Gauntlet Rank) still renders normal weight — only the Name cell's text is affected.
6. Navigate to a different page that also renders `CrewTable` and does NOT get the new prop — e.g. "Missing Favorite Flag" (further down the same Overview page) or the Five Stars Crew page — and confirm every name there renders normal weight, unaffected by this change.

- [ ] **Step 7: Commit**

```bash
git add client/src/crew/priorityCutoff.ts client/src/crew/CrewTable.tsx client/src/pages/OverviewPage.tsx
git commit -m "Bold priority-eligible crew names on the Overview page's Priorities tables"
```

## Self-Review Notes

- Spec coverage: the spec's Design section (export predicate, add `boldEligibleNames` prop, bold the Name cell, wire into exactly the four Priorities call sites) is fully covered by this task's steps. The spec's non-goals (no change to cutoff behavior/limit, no change to other columns, no change to other `CrewTable` call sites, no new prop threading beyond the one boolean) are respected — no other file is touched, no other prop is added.
- Single task: all three file edits are tightly coupled (the new prop is meaningless without the predicate export, and the call sites are meaningless without the prop) and small enough that splitting would create an artificial review boundary — matches the granularity used for the two immediately-preceding Collections-page features' single-task plans.
- Type consistency: `isPriorityCountEligible` signature (`(crew: CrewMember): boolean`) matches its two call sites (`applyPriorityCutoff` internally, `CrewTable`'s row render) exactly. `boldEligibleNames?: boolean` matches its declaration in `CrewTableProps`, its destructuring in the component signature, and its four call-site usages.
