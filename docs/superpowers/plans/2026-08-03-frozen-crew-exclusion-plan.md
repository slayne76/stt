# Frozen Crew Exclusion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exclude "frozen crew duplicates" (active-roster crew whose archetype has already been fully immortalized and frozen elsewhere) from the Collections page's crew lists, and extract a shared `isMaxedOut(collection)` predicate to replace a duplicated `goal === 0` check.

**Architecture:** A new narrow `StoredImmortal` type and a `getFrozenCrewArchetypeIds` getter extract the frozen-archetype set from `player.character.stored_immortals`. `getCollectionCrew` (the only place this needs to apply, per explicit scope decision) gains a 4th parameter and filters on it. `CollectionsPage` computes the frozen set once and threads it through `CollectionsTable` to the `getCollectionCrew` call site — the same "compute in the page, pass down" pattern `collections`/`crew`/`items` already use. Single task: this is small enough, and tightly coupled enough (the `getCollectionCrew` signature change touches its only call site in the same file that also needs the `isMaxedOut` swap), that splitting it would leave an intermediate broken build for no benefit.

**Tech Stack:** Same as the existing client workspace — React 19, TypeScript (strict), MUI, no new dependencies.

## Global Constraints

- **`stored_immortals[i].id` is the crew's `archetype_id`** — confirmed by cross-referencing against the active roster: exactly 12 archetype_ids appear in both lists in the real sample, all reproducing the reported symptom. The frozen set from the real sample must be exactly `{10, 23, 25, 55, 144, 5175, 6612, 7206, 8630, 9553, 9741, 15891}` (12 ids) — this is a subset check; the full set has 716 entries in the sample, only these 12 also happen to have an active-roster duplicate today.
- **The exclusion applies to `getCollectionCrew` only** — `getCrewTier` (`crew/getters.ts`) stays completely unmodified, since it's a general concept reused by `crew/sorters.ts` and `CollectionCrewList`. The 4 existing crew pages (3/4, 4/5, 4/4-ready, 4/4-needs-work) never call `getCollectionCrew` and must remain completely unaffected — this was an explicit scope decision, not an oversight.
- **Verified real-data impact, must reproduce exactly:**
  - "Common Crew": 0 qualifying crew (was 1).
  - "Uncommon Crew": 0 qualifying crew (was 5).
  - "The Neutral Zone": exactly `['Commander Sela', 'Reclamation Narissa', 'Zhaban']` (3 crew — `Telek R'Mor` removed, it's one of the 12 frozen duplicates).
  - Total qualifying-crew entries summed across all 88 collections: **343** (was 368).
- **`StoredImmortal` type stays narrow** — `{ id: number }` only; the real payload's `quantity`/`qbits` fields are unused.
- **`getFrozenCrewArchetypeIds` follows the exact defensive-extraction style** `getCollectionsList` already uses — optional chaining + `Array.isArray` guard, returns an empty `Set` (never throws) if `stored_immortals` is missing or malformed.
- **`isMaxedOut(collection)` replaces both existing `collection.milestone.goal === 0` checks** — one in `collections/sorters.ts` (`getCollectionCompletionRatio`), one in `collections/CollectionsTable.tsx` (`progressDisplay`). A named `MAXED_OUT_RATIO = -1` constant with a one-line comment replaces the bare `-1` literal in `getCollectionCompletionRatio`.
- No changes to `crew/getters.ts`, `crew/sorters.ts`, `collections/rewards.ts`, `CollectionCrewList.tsx`, or any of the 4 existing crew pages.
- TypeScript strict mode stays on; no new dependencies.
- No test framework — verification via type-check, lint, a throwaway data-driven verification script against the real `example-data.json`, and manual dev-server checks.

---

### Task 1: Frozen-crew data layer, `getCollectionCrew` exclusion, and `isMaxedOut` refactor

**Files:**
- Create: `client/src/types/storedImmortal.ts`
- Modify: `client/src/collections/getters.ts`
- Modify: `client/src/collections/sorters.ts`
- Modify: `client/src/collections/CollectionsTable.tsx`
- Modify: `client/src/pages/CollectionsPage.tsx`

**Interfaces:**
- Consumes: `PlayerData` (`client/src/types/player.ts`), `Collection`/`CrewMember`/`OwnedItem` (existing types), `crewBelongsToCollection`/`getCrewTier` (existing, unchanged), `getCollectionsList`/`getCuratedRewards`/`byCompletionThenNameAsc`/`getCrewList`/`getOwnedItems`/`usePlayerData` (existing, unchanged) — all pre-existing.
- Produces: `StoredImmortal` type (new, `client/src/types/storedImmortal.ts`). `getFrozenCrewArchetypeIds(data: PlayerData): Set<number>` (new export from `collections/getters.ts`). `getCollectionCrew(collection: Collection, crewList: CrewMember[], items: OwnedItem[], frozenArchetypeIds: Set<number>): CrewMember[]` (signature changed — 4th parameter added). `isMaxedOut(collection: Collection): boolean` (new export from `collections/sorters.ts`).

- [ ] **Step 1: Create `client/src/types/storedImmortal.ts`**

```ts
export interface StoredImmortal {
  id: number;
}
```

- [ ] **Step 2: Replace `client/src/collections/getters.ts`**

Replace the file's full contents with:

```ts
import type { PlayerData } from '../types/player';
import type { Collection } from '../types/collection';
import type { CrewMember } from '../types/crew';
import type { OwnedItem } from '../types/item';
import type { StoredImmortal } from '../types/storedImmortal';
import { getCrewTier } from '../crew/getters';

export function getCollectionsList(data: PlayerData): Collection[] {
  const player = data.player as Record<string, unknown> | undefined;
  const character = player?.character as Record<string, unknown> | undefined;
  const collections = character?.cryo_collections;
  return Array.isArray(collections) ? (collections as Collection[]) : [];
}

export function crewBelongsToCollection(crew: CrewMember, collection: Collection): boolean {
  const crewTraits = new Set([...(crew.traits ?? []), ...(crew.traits_hidden ?? [])]);
  const collectionTraits = collection.traits ?? [];
  const extraCrew = collection.extra_crew ?? [];
  return collectionTraits.some((trait) => crewTraits.has(trait)) || extraCrew.includes(crew.archetype_id);
}

export function getCrewCollections(crew: CrewMember, collections: Collection[]): Collection[] {
  return collections.filter((collection) => crewBelongsToCollection(crew, collection));
}

export function getCollectionCount(crew: CrewMember, collections: Collection[]): number {
  return getCrewCollections(crew, collections).length;
}

export function getFrozenCrewArchetypeIds(data: PlayerData): Set<number> {
  const player = data.player as Record<string, unknown> | undefined;
  const character = player?.character as Record<string, unknown> | undefined;
  const storedImmortals = character?.stored_immortals;
  const list = Array.isArray(storedImmortals) ? (storedImmortals as StoredImmortal[]) : [];
  return new Set(list.map((s) => s.id));
}

export function getCollectionCrew(
  collection: Collection,
  crewList: CrewMember[],
  items: OwnedItem[],
  frozenArchetypeIds: Set<number>
): CrewMember[] {
  return crewList.filter(
    (crew) =>
      crewBelongsToCollection(crew, collection) &&
      getCrewTier(crew, items) !== null &&
      !frozenArchetypeIds.has(crew.archetype_id)
  );
}
```

- [ ] **Step 3: Replace `client/src/collections/sorters.ts`**

Replace the file's full contents with:

```ts
import type { Collection } from '../types/collection';

export function isMaxedOut(collection: Collection): boolean {
  return collection.milestone.goal === 0;
}

const MAXED_OUT_RATIO = -1; // sorts maxed-out collections to the bottom, deliberately — see PROJECT_STATE.md

export function getCollectionCompletionRatio(collection: Collection): number {
  return isMaxedOut(collection) ? MAXED_OUT_RATIO : collection.progress / collection.milestone.goal;
}

export function byCompletionThenNameAsc(a: Collection, b: Collection): number {
  const ratioDiff = getCollectionCompletionRatio(b) - getCollectionCompletionRatio(a);
  if (ratioDiff !== 0) return ratioDiff;
  return a.name.localeCompare(b.name);
}
```

- [ ] **Step 4: Replace `client/src/collections/CollectionsTable.tsx`**

Replace the file's full contents with:

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
import { isMaxedOut } from './sorters';
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
  frozenArchetypeIds: Set<number>;
}

function CollectionsTable({ collections, crew, items, frozenArchetypeIds }: CollectionsTableProps) {
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
              getCollectionCrew(collection, crew, items, frozenArchetypeIds),
              combineComparators(
                byTierAsc(items),
                byMaxRarityDesc,
                byLevelDesc,
                byEquipmentSlotsRemainingDesc,
                byNameAsc
              )
            );
            const rewards = getCuratedRewards(collection);
            const progressDisplay = isMaxedOut(collection)
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

- [ ] **Step 5: Replace `client/src/pages/CollectionsPage.tsx`**

Replace the file's full contents with:

```tsx
import { Alert, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { usePlayerData } from '../hooks/usePlayerData';
import { getCrewList, getOwnedItems } from '../crew/getters';
import { getCollectionsList, getFrozenCrewArchetypeIds } from '../collections/getters';
import { byCompletionThenNameAsc } from '../collections/sorters';
import CollectionsTable from '../collections/CollectionsTable';

function CollectionsPage() {
  const { data, loading, error, refresh } = usePlayerData();

  const collections = data
    ? [...getCollectionsList(data)].sort(byCompletionThenNameAsc)
    : [];
  const crew = data ? getCrewList(data) : [];
  const items = data ? getOwnedItems(data) : [];
  const frozenArchetypeIds = data ? getFrozenCrewArchetypeIds(data) : new Set<number>();

  const loaded = !loading && !error && data;

  return (
    <Stack spacing={2}>
      <Typography variant="h4">Collections{loaded ? ` (${collections.length})` : ''}</Typography>

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
        collections.length === 0 ? (
          <Typography color="text.secondary">No collections found.</Typography>
        ) : (
          <CollectionsTable
            collections={collections}
            crew={crew}
            items={items}
            frozenArchetypeIds={frozenArchetypeIds}
          />
        )
      )}
    </Stack>
  );
}

export default CollectionsPage;
```

- [ ] **Step 6: Verify against real data**

`example-data.json` (gitignored, real personal game data) is at the repo root. Create a throwaway script at `client/src/collections/__verify.ts` (deleted in Step 7, never committed):

```ts
import { readFileSync } from 'node:fs';
import { getCrewList, getOwnedItems } from '../crew/getters';
import { getCollectionsList, getCollectionCrew, getFrozenCrewArchetypeIds } from './getters';

const raw = JSON.parse(readFileSync('example-data.json', 'utf-8')) as Record<string, unknown>;
const crew = getCrewList(raw);
const items = getOwnedItems(raw);
const collections = getCollectionsList(raw);
const frozenArchetypeIds = getFrozenCrewArchetypeIds(raw);

console.log('frozen archetype id count:', frozenArchetypeIds.size);
const expectedSample = [10, 23, 25, 55, 144, 5175, 6612, 7206, 8630, 9553, 9741, 15891];
console.log('expected sample all present:', expectedSample.every((id) => frozenArchetypeIds.has(id)));

function qualifyingNames(name: string): string[] {
  const collection = collections.find((c) => c.name === name);
  if (!collection) return [];
  return getCollectionCrew(collection, crew, items, frozenArchetypeIds)
    .map((c) => c.name)
    .sort();
}

console.log('Common Crew qualifying:', qualifyingNames('Common Crew').length);
console.log('Uncommon Crew qualifying:', qualifyingNames('Uncommon Crew').length);
console.log('The Neutral Zone qualifying:', qualifyingNames('The Neutral Zone'));

let total = 0;
for (const collection of collections) {
  total += getCollectionCrew(collection, crew, items, frozenArchetypeIds).length;
}
console.log('total qualifying crew across all collections:', total);
```

Run from the **repo root**: `npx tsx client/src/collections/__verify.ts`

Expected output:
- `frozen archetype id count: 716`
- `expected sample all present: true`
- `Common Crew qualifying: 0`
- `Uncommon Crew qualifying: 0`
- `The Neutral Zone qualifying: [ 'Commander Sela', 'Reclamation Narissa', 'Zhaban' ]`
- `total qualifying crew across all collections: 343`

If any of these don't match, do not proceed — re-check the frozen-set extraction and `getCollectionCrew` filter against this plan's Global Constraints before moving on.

- [ ] **Step 7: Delete the throwaway verification script**

```bash
rm client/src/collections/__verify.ts
```

- [ ] **Step 8: Build and lint check**

Run: `npm run build -w client`
Expected: exits 0.

Run: `npm run lint -w client`
Expected: exits 0, no errors.

- [ ] **Step 9: Manual dev-server check**

With `server/.env` absent, start `npm run dev -w server` and `npm run dev -w client` in the background (use alternate ports if the defaults are occupied by an unrelated process, and fully revert any temporary port edits before committing).

Run: `curl -s http://localhost:5173/api/player` (or your alternate port) — expect the same 502 `UPSTREAM_AUTH_FAILED` JSON as before, confirming nothing in the server/proxy chain is affected by this purely client-side change.

Run: `curl -s http://localhost:5173/` — expect `id="root"` in the response, confirming the client still serves its shell with the updated code compiled in.

Stop both background processes afterward.

- [ ] **Step 10: Commit**

```bash
git add client/src/types/storedImmortal.ts client/src/collections/getters.ts client/src/collections/sorters.ts client/src/collections/CollectionsTable.tsx client/src/pages/CollectionsPage.tsx
git commit -m "Exclude frozen-crew duplicates from Collections page; extract isMaxedOut"
```

**Manual follow-up (requires your real credentials, not part of this task):** with a real `STT_SESSION_COOKIE` set, open `/collections` and confirm "Common Crew"/"Uncommon Crew" now show "No crew match." and that crew you know you've frozen no longer appear as active-duplicate entries elsewhere on the page.
