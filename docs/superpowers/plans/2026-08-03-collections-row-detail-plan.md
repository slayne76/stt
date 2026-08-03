# Collections Row Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add row number, curated rewards, progress/goal, and claimed-milestone-count columns to the Collections page's main collection rows, reorder collections by completion ratio instead of purely alphabetically, and remove the now-dead expand/collapse UI since rows are always expanded.

**Architecture:** Extend the `Collection` type with the raw fields these columns need (`progress`, `claimable_milestone_index`, `milestone.goal`/`rewards`/`buffs`), add two new small modules under `collections/` (`rewards.ts` for the curated-rewards extraction, `sorters.ts` for the completion-ratio comparator — mirroring the existing `crew/sorters.ts` pattern), then update the existing `CollectionsTable`/`CollectionsPage` to consume them. Two tasks: the data layer (types, extraction, sorting — verified against real data) first, then the UI layer (table/page changes) on top of it.

**Tech Stack:** Same as the existing client workspace — React 19, TypeScript (strict), MUI, no new dependencies.

## Global Constraints

- **Reward curation is a closed allowlist**, matched by `symbol` where possible (not display text):
  - `symbol === 'premium_10x_bundle'` → `10x Portal (${quantity})`
  - `symbol === 'premium_1x_bundle'` → `Portal (${quantity})`
  - `symbol === 'premium_purchasable'` → `Dilithium (${quantity})`
  - `type === 1` (crew reward) → `${full_name}` (e.g. "Lucille Davenport" — the actual crew name, not the internal `name` field "Janeway")
  - `symbol === 'niners_avatar'` → `The Niners Avatar`
  - `symbol === 'honorable_citation_quality5'` → `Legendary Honorable Citation`
  - Everything else (Chronitons, Merits, Federation Credits, Honor, Replicator Fuel, 10x Standard Shuttle Boost, any future unrecognized reward) is silently excluded.
- **"Core Skill" and "Skill Proficiency" rewards live in `milestone.buffs`, not `milestone.rewards`** — a real data-location correction found during design, not a typo. Matched by regex on `buff.name`:
  - `/^(.+) Core Skill \+\d+%$/` → `Skill: {captured name}`
  - `/^(.+) Skill Proficiency (?:Min|Max) \+\d+%$/` → `Proficiency: {captured name}`
  - Both must **deduplicate per skill** using a `Set` — Skill Proficiency buffs always come in a Min/Max pair for the same skill and must collapse to one `Proficiency: X` entry, not two. Verified against real data: "Their Royal Highnesses" grants Command's Min, Max, AND Core buffs together and must display exactly `Skill: Command, Proficiency: Command` (two entries, not three).
  - The percentage is never shown — verified every matching buff in the real sample is exactly `+1%`.
- **`Progress` column:** `${progress}/${goal}`, except `goal === 0` → `MAX`. 8 of 88 real collections are fully maxed out (all milestones claimed) and have `goal: 0` with empty `rewards`/`buffs` — this is common, not a hypothetical, and the divide-by-zero risk is real.
- **`Milestone` column:** `claimable_milestone_index` as a plain number. The "13 of 19 total" info the user described is **not retrievable from this JSON at all** — only the current next milestone and a claimed-count exist, confirmed by exhaustive search of the payload. Do not attempt to compute or guess a total.
- **Column order:** `# | Collection | Rewards | Progress | Milestone | Crew`.
- **Sort:** completion ratio descending, alphabetical tiebreak. `ratio = goal === 0 ? -1 : progress / goal` — the 8 maxed-out collections all get `-1` and sort as one block at the very bottom (below every partial-progress collection), alphabetical among themselves. This is a deliberate correction from an initial "top" instinct — maxed-out means nothing left to do, so it ranks last, not first.
- **Verified worked examples** (must reproduce exactly):
  - "First Year of Convergence": rewards `['10x Portal (1)']`, progress `211/220`, `claimable_milestone_index: 13`.
  - "Holodeck Enthusiasts": rewards `['Lucille Davenport']`.
  - "Their Royal Highnesses": rewards `['Portal (5)', 'Skill: Command', 'Proficiency: Command']`.
  - Sort top 3: "Convergence Day" (0.970), "First Year of Convergence" (0.959), "Ruthless Aggression" (0.950).
  - Sort bottom 8 (the maxed-out block, alphabetical): "Alluring Pheromones", "Cold Front", "Common Crew", "Curious Flora", "Rare Crew", "Story Time", "The Order of Things", "Uncommon Crew".
- **The expand/collapse UI is removed entirely**, not just hidden — `useState`, the `IconButton`/arrow icons, and `Collapse` all go away since nothing can ever collapse a row anymore. Each collection still renders as a two-`TableRow` pair (main row + a `colSpan` row holding the crew sub-list), with the sub-row given a subtle `action.hover` background tint to keep the "belongs to parent" visual grouping.
- No changes to `CollectionCrewList`, `crew/getters.ts`, `crew/sorters.ts`, or the crew-tier/sort logic inside `CollectionsTable` — this plan only adds columns and changes collection-level sorting.
- `Collection.milestone.rewards` and `Collection.milestone.buffs` are typed as required (non-optional) arrays — confirmed always present (even if empty) on all 88 real collections, so no `?? []` guard is added, consistent with this project's convention of not guarding fields proven always-present.
- TypeScript strict mode stays on; no new dependencies.
- No test framework — verification via type-check, lint, a throwaway data-driven verification script (Task 1) against the real `example-data.json`, and manual dev-server checks (Task 2).

---

### Task 1: Collection type additions, curated rewards, and completion sort

**Files:**
- Modify: `client/src/types/collection.ts`
- Create: `client/src/collections/rewards.ts`
- Create: `client/src/collections/sorters.ts`

**Interfaces:**
- Consumes: `Collection` (`client/src/types/collection.ts`, extended by this task).
- Produces: `CollectionReward`, `CollectionBuff`, `CollectionMilestone` types (all new, `client/src/types/collection.ts`). `getCuratedRewards(collection: Collection): string[]` — new export from `client/src/collections/rewards.ts`. `getCollectionCompletionRatio(collection: Collection): number` and `byCompletionThenNameAsc(a: Collection, b: Collection): number` — new exports from `client/src/collections/sorters.ts`. Task 2 imports `getCuratedRewards` and `byCompletionThenNameAsc`.

- [ ] **Step 1: Extend `client/src/types/collection.ts`**

Replace the file's full contents with:

```ts
export interface CollectionReward {
  type: number;
  symbol: string;
  quantity: number;
  full_name: string;
}

export interface CollectionBuff {
  name: string;
}

export interface CollectionMilestone {
  goal: number;
  rewards: CollectionReward[];
  buffs: CollectionBuff[];
}

export interface Collection {
  id: number;
  name: string;
  traits: string[];
  extra_crew: number[];
  progress: number;
  claimable_milestone_index: number;
  milestone: CollectionMilestone;
}
```

- [ ] **Step 2: Create `client/src/collections/rewards.ts`**

```ts
import type { Collection } from '../types/collection';

const CORE_SKILL_PATTERN = /^(.+) Core Skill \+\d+%$/;
const SKILL_PROFICIENCY_PATTERN = /^(.+) Skill Proficiency (?:Min|Max) \+\d+%$/;

export function getCuratedRewards(collection: Collection): string[] {
  const rewards: string[] = [];

  for (const reward of collection.milestone.rewards) {
    if (reward.symbol === 'premium_10x_bundle') {
      rewards.push(`10x Portal (${reward.quantity})`);
    } else if (reward.symbol === 'premium_1x_bundle') {
      rewards.push(`Portal (${reward.quantity})`);
    } else if (reward.symbol === 'premium_purchasable') {
      rewards.push(`Dilithium (${reward.quantity})`);
    } else if (reward.type === 1) {
      rewards.push(reward.full_name);
    } else if (reward.symbol === 'niners_avatar') {
      rewards.push('The Niners Avatar');
    } else if (reward.symbol === 'honorable_citation_quality5') {
      rewards.push('Legendary Honorable Citation');
    }
  }

  const skillSet = new Set<string>();
  const proficiencySet = new Set<string>();

  for (const buff of collection.milestone.buffs) {
    const coreMatch = buff.name.match(CORE_SKILL_PATTERN);
    if (coreMatch) {
      skillSet.add(coreMatch[1]);
      continue;
    }
    const proficiencyMatch = buff.name.match(SKILL_PROFICIENCY_PATTERN);
    if (proficiencyMatch) {
      proficiencySet.add(proficiencyMatch[1]);
    }
  }

  for (const skill of skillSet) {
    rewards.push(`Skill: ${skill}`);
  }
  for (const skill of proficiencySet) {
    rewards.push(`Proficiency: ${skill}`);
  }

  return rewards;
}
```

- [ ] **Step 3: Create `client/src/collections/sorters.ts`**

```ts
import type { Collection } from '../types/collection';

export function getCollectionCompletionRatio(collection: Collection): number {
  return collection.milestone.goal === 0 ? -1 : collection.progress / collection.milestone.goal;
}

export function byCompletionThenNameAsc(a: Collection, b: Collection): number {
  const ratioDiff = getCollectionCompletionRatio(b) - getCollectionCompletionRatio(a);
  if (ratioDiff !== 0) return ratioDiff;
  return a.name.localeCompare(b.name);
}
```

- [ ] **Step 4: Verify against real data**

`example-data.json` (gitignored, real personal game data) is at the repo root. Create a throwaway script at `client/src/collections/__verify.ts` (deleted in Step 5, never committed):

```ts
import { readFileSync } from 'node:fs';
import { getCollectionsList } from './getters';
import { getCuratedRewards } from './rewards';
import { byCompletionThenNameAsc, getCollectionCompletionRatio } from './sorters';

const raw = JSON.parse(readFileSync('example-data.json', 'utf-8')) as Record<string, unknown>;
const collections = getCollectionsList(raw);

const fyc = collections.find((c) => c.name === 'First Year of Convergence');
if (fyc) {
  console.log('First Year of Convergence rewards:', getCuratedRewards(fyc));
  console.log('First Year of Convergence progress/goal:', `${fyc.progress}/${fyc.milestone.goal}`);
  console.log('First Year of Convergence claimable_milestone_index:', fyc.claimable_milestone_index);
}

const holodeck = collections.find((c) => c.name === 'Holodeck Enthusiasts');
if (holodeck) {
  console.log('Holodeck Enthusiasts rewards:', getCuratedRewards(holodeck));
}

const royalHighnesses = collections.find((c) => c.name === 'Their Royal Highnesses');
if (royalHighnesses) {
  console.log('Their Royal Highnesses rewards:', getCuratedRewards(royalHighnesses));
}

const sorted = [...collections].sort(byCompletionThenNameAsc);
console.log('top 3:', sorted.slice(0, 3).map((c) => `${c.name} (${getCollectionCompletionRatio(c).toFixed(3)})`));
console.log('bottom 8 (maxed, alphabetical):', sorted.slice(-8).map((c) => c.name));
```

Run from the **repo root**: `npx tsx client/src/collections/__verify.ts`

Expected output:
- `First Year of Convergence rewards: [ '10x Portal (1)' ]`
- `First Year of Convergence progress/goal: 211/220`
- `First Year of Convergence claimable_milestone_index: 13`
- `Holodeck Enthusiasts rewards: [ 'Lucille Davenport' ]`
- `Their Royal Highnesses rewards: [ 'Portal (5)', 'Skill: Command', 'Proficiency: Command' ]`
- `top 3: [ 'Convergence Day (0.970)', 'First Year of Convergence (0.959)', 'Ruthless Aggression (0.950)' ]`
- `bottom 8 (maxed, alphabetical): [ 'Alluring Pheromones', 'Cold Front', 'Common Crew', 'Curious Flora', 'Rare Crew', 'Story Time', 'The Order of Things', 'Uncommon Crew' ]`

If any of these don't match, do not proceed — re-check the reward-matching or sort logic against this plan's Global Constraints before moving on.

- [ ] **Step 5: Delete the throwaway verification script**

```bash
rm client/src/collections/__verify.ts
```

- [ ] **Step 6: Build and lint check**

Run: `npm run build -w client`
Expected: exits 0.

Run: `npm run lint -w client`
Expected: exits 0, no errors.

- [ ] **Step 7: Commit**

```bash
git add client/src/types/collection.ts client/src/collections/rewards.ts client/src/collections/sorters.ts
git commit -m "Add Collection milestone fields, curated rewards, and completion sort"
```

---

### Task 2: Row detail columns, completion-based sort wiring, and expand/collapse removal

**Files:**
- Modify: `client/src/collections/CollectionsTable.tsx`
- Modify: `client/src/pages/CollectionsPage.tsx`

**Interfaces:**
- Consumes: `getCuratedRewards` (`client/src/collections/rewards.ts`, Task 1), `byCompletionThenNameAsc` (`client/src/collections/sorters.ts`, Task 1) — plus pre-existing `getCollectionCrew`, `getCollectionsList`, `getCrewList`, `getOwnedItems`, `usePlayerData`, the crew sort comparators, `CollectionCrewList`, all unchanged.

- [ ] **Step 1: Replace `client/src/collections/CollectionsTable.tsx`**

Replace the full file contents with:

```tsx
import { Fragment } from 'react';
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
import type { OwnedItem } from '../types/item';
import { getCollectionCrew } from './getters';
import { getCuratedRewards } from './rewards';
import {
  byEquipmentSlotsRemainingDesc,
  byLevelDesc,
  byMaxRarityDesc,
  byNameAsc,
  byTierAsc,
  combineComparators,
  sortCrew,
} from '../crew/sorters';
import CollectionCrewList from './CollectionCrewList';

export interface CollectionsTableProps {
  collections: Collection[];
  crew: CrewMember[];
  items: OwnedItem[];
}

function CollectionsTable({ collections, crew, items }: CollectionsTableProps) {
  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Collection</TableCell>
            <TableCell>Rewards</TableCell>
            <TableCell align="right">Progress</TableCell>
            <TableCell align="right">Milestone</TableCell>
            <TableCell align="right">Crew</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {collections.map((collection, index) => {
            const qualifyingCrew = sortCrew(
              getCollectionCrew(collection, crew, items),
              combineComparators(
                byTierAsc(items),
                byMaxRarityDesc,
                byLevelDesc,
                byEquipmentSlotsRemainingDesc,
                byNameAsc
              )
            );
            const rewards = getCuratedRewards(collection);
            const progressDisplay =
              collection.milestone.goal === 0
                ? 'MAX'
                : `${collection.progress}/${collection.milestone.goal}`;
            return (
              <Fragment key={collection.id}>
                <TableRow>
                  <TableCell>{index + 1}</TableCell>
                  <TableCell>{collection.name}</TableCell>
                  <TableCell>{rewards.join(', ')}</TableCell>
                  <TableCell align="right">{progressDisplay}</TableCell>
                  <TableCell align="right">{collection.claimable_milestone_index}</TableCell>
                  <TableCell align="right">{qualifyingCrew.length}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ bgcolor: 'action.hover' }} colSpan={6}>
                    {qualifyingCrew.length === 0 ? (
                      <Typography color="text.secondary" sx={{ py: 1 }}>
                        No crew match.
                      </Typography>
                    ) : (
                      <CollectionCrewList crew={qualifyingCrew} items={items} />
                    )}
                  </TableCell>
                </TableRow>
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default CollectionsTable;
```

- [ ] **Step 2: Update the sort call in `client/src/pages/CollectionsPage.tsx`**

Change:

```tsx
import { Alert, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { usePlayerData } from '../hooks/usePlayerData';
import { getCrewList, getOwnedItems } from '../crew/getters';
import { getCollectionsList } from '../collections/getters';
import CollectionsTable from '../collections/CollectionsTable';

function CollectionsPage() {
  const { data, loading, error, refresh } = usePlayerData();

  const collections = data
    ? [...getCollectionsList(data)].sort((a, b) => a.name.localeCompare(b.name))
    : [];
```

to:

```tsx
import { Alert, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { usePlayerData } from '../hooks/usePlayerData';
import { getCrewList, getOwnedItems } from '../crew/getters';
import { getCollectionsList } from '../collections/getters';
import { byCompletionThenNameAsc } from '../collections/sorters';
import CollectionsTable from '../collections/CollectionsTable';

function CollectionsPage() {
  const { data, loading, error, refresh } = usePlayerData();

  const collections = data
    ? [...getCollectionsList(data)].sort(byCompletionThenNameAsc)
    : [];
```

Everything else in the file (the rest of the component body, JSX, and export) stays exactly as it is.

- [ ] **Step 3: Build and lint check**

Run: `npm run build -w client`
Expected: exits 0.

Run: `npm run lint -w client`
Expected: exits 0, no errors.

- [ ] **Step 4: Manual dev-server check**

With `server/.env` absent, start `npm run dev -w server` and `npm run dev -w client` in the background (use alternate ports if the defaults are occupied by an unrelated process, and fully revert any temporary port edits before committing).

Run: `curl -s http://localhost:5173/api/player` (or your alternate port) — expect the same 502 `UPSTREAM_AUTH_FAILED` JSON as before, confirming nothing in the server/proxy chain is affected by this purely client-side change.

Run: `curl -s http://localhost:5173/` — expect `id="root"` in the response, confirming the client still serves its shell with the updated table/page compiled in.

Stop both background processes afterward.

- [ ] **Step 5: Commit**

```bash
git add client/src/collections/CollectionsTable.tsx client/src/pages/CollectionsPage.tsx
git commit -m "Add row detail columns and completion sort to Collections page"
```

**Manual follow-up (requires your real credentials, not part of this task):** with a real `STT_SESSION_COOKIE` set, open `/collections` and confirm the rewards, progress, milestone counts, and sort order match what you expect against your own roster.
