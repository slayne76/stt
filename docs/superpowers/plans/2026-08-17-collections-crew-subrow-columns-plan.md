# Collections page: crew subrow "Total Collections" / "Other Collections" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Total Collections" and "Other Collections" inline values (plus a `Level:` label rename) to each crew row in the Collections page's expanded per-collection crew list.

**Architecture:** Thread a new, distinctly-named `allCollections` prop (the full, unfiltered, sorted collections list `CollectionsPage.tsx` already computes) down through `CollectionsTable.tsx` into `CollectionCrewList.tsx`, which reuses the existing `getCrewCollections` getter to compute both values per crew row. No new getters, no header row, no change to the existing search-filtered `collections` prop's role (top-level row pagination only).

**Tech Stack:** React 19 + TypeScript strict, MUI (`Typography`), no test framework — verification via a throwaway `tsx` script against real data plus a real-browser check.

## Global Constraints

- Reuse `getCrewCollections` from `client/src/collections/getters.ts` as-is — no new data-fetching or filtering logic.
- `CollectionCrewList` stays a flex-row list with no header row — the two new values are inline `Label: value` `Typography` elements, matching the existing `Items: {n}` style exactly (`color="text.secondary"`).
- `Total Collections` = the crew's real total collection count (current collection included). `Other Collections` = the same list with the current collection excluded, comma-separated names, `.join(', ')` — matches `CrewTable.tsx`'s existing `crewCollections.map((col) => col.name).join(', ')` formatting, including rendering as an empty string when there are no other collections (no placeholder text).
- `Lv {c.level}` is renamed to `Level: {c.level}` — same `sx`, same position, label text only.
- The existing `collections` prop on `CollectionsTable` (search-filtered, used only for `usePagination`) must NOT be reused for the new per-crew collection-membership computation — it must come from the new `allCollections` prop (the full, unfiltered, sorted list `CollectionsPage.tsx` already computes before its `useSearch` call).
- Single call site for `CollectionCrewList` (inside `CollectionsTable.tsx`'s per-collection `.map`) — no other consumer of this component exists.

---

### Task 1: Add Total Collections / Other Collections / Level rename to the Collections crew subrow

**Files:**
- Modify: `client/src/collections/CollectionCrewList.tsx`
- Modify: `client/src/collections/CollectionsTable.tsx`
- Modify: `client/src/pages/CollectionsPage.tsx`

**Interfaces:**
- Consumes: `getCrewCollections(crew: CollectionMatchable, collections: Collection[]): Collection[]` from `client/src/collections/getters.ts` (already exported, unchanged).
- Produces: no new exports — this task only changes existing component prop shapes and render output. `CollectionCrewListProps` gains `allCollections: Collection[]` and `currentCollectionId: number`. `CollectionsTableProps` gains `allCollections: Collection[]`.

- [ ] **Step 1: Update `CollectionCrewList.tsx` — new props, two new values, label rename**

Read the current file first (`client/src/collections/CollectionCrewList.tsx`) to confirm you're editing the live version — it should look like this before your change:

```tsx
import { Box, Typography } from '@mui/material';
import type { CrewMember } from '../types/crew';
import type { OwnedItem } from '../types/item';
import { getCrewTier, getEquipmentSlotsRemaining } from '../crew/getters';
import StarRating from '../crew/StarRating';
import StatusChip from '../components/StatusChip';
import { STRIPE_COLOR } from '../theme';

export interface CollectionCrewListProps {
  crew: CrewMember[];
  items: OwnedItem[];
}

function CollectionCrewList({ crew, items }: CollectionCrewListProps) {
  return (
    <Box sx={{ py: 1 }}>
      {crew.map((c, i) => {
        const tier = getCrewTier(c, items);
        const isReady = tier === 'ready';
        const isNeedsWork = tier === 'needsWork';
        return (
          <Box
            key={c.id}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              py: 0.5,
              // Cancels parent TableCell's 16px padding so each stripe reaches the cell edges
              px: 2,
              mx: -2,
              bgcolor: i % 2 === 1 ? STRIPE_COLOR : 'transparent',
            }}
          >
            <StarRating rarity={c.rarity} maxRarity={c.max_rarity} />
            <Typography sx={{ fontWeight: isReady ? 'bold' : 'normal' }}>{c.name}</Typography>
            {isReady && <StatusChip label="Ready" color="success" />}
            {isNeedsWork && <StatusChip label={`${c.max_rarity}/${c.max_rarity} Stars`} color="warning" />}
            <Typography color="text.secondary" sx={{ ml: 'auto' }}>
              Lv {c.level}
            </Typography>
            <Typography color="text.secondary" sx={{ minWidth: 80, textAlign: 'right' }}>
              Items: {getEquipmentSlotsRemaining(c)}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

export default CollectionCrewList;
```

Replace it with:

```tsx
import { Box, Typography } from '@mui/material';
import type { CrewMember } from '../types/crew';
import type { Collection } from '../types/collection';
import type { OwnedItem } from '../types/item';
import { getCrewTier, getEquipmentSlotsRemaining } from '../crew/getters';
import { getCrewCollections } from './getters';
import StarRating from '../crew/StarRating';
import StatusChip from '../components/StatusChip';
import { STRIPE_COLOR } from '../theme';

export interface CollectionCrewListProps {
  crew: CrewMember[];
  items: OwnedItem[];
  allCollections: Collection[];
  currentCollectionId: number;
}

function CollectionCrewList({ crew, items, allCollections, currentCollectionId }: CollectionCrewListProps) {
  return (
    <Box sx={{ py: 1 }}>
      {crew.map((c, i) => {
        const tier = getCrewTier(c, items);
        const isReady = tier === 'ready';
        const isNeedsWork = tier === 'needsWork';
        const crewCollections = getCrewCollections(c, allCollections);
        const otherCollections = crewCollections.filter((col) => col.id !== currentCollectionId);
        return (
          <Box
            key={c.id}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              py: 0.5,
              // Cancels parent TableCell's 16px padding so each stripe reaches the cell edges
              px: 2,
              mx: -2,
              bgcolor: i % 2 === 1 ? STRIPE_COLOR : 'transparent',
            }}
          >
            <StarRating rarity={c.rarity} maxRarity={c.max_rarity} />
            <Typography sx={{ fontWeight: isReady ? 'bold' : 'normal' }}>{c.name}</Typography>
            {isReady && <StatusChip label="Ready" color="success" />}
            {isNeedsWork && <StatusChip label={`${c.max_rarity}/${c.max_rarity} Stars`} color="warning" />}
            <Typography color="text.secondary" sx={{ ml: 'auto' }}>
              Level: {c.level}
            </Typography>
            <Typography color="text.secondary" sx={{ minWidth: 80, textAlign: 'right' }}>
              Items: {getEquipmentSlotsRemaining(c)}
            </Typography>
            <Typography color="text.secondary">Total Collections: {crewCollections.length}</Typography>
            <Typography color="text.secondary">
              Other Collections: {otherCollections.map((col) => col.name).join(', ')}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

export default CollectionCrewList;
```

- [ ] **Step 2: Update `CollectionsTable.tsx` — thread `allCollections` through, pass `currentCollectionId`**

Current relevant sections (`client/src/collections/CollectionsTable.tsx`):

```ts
export interface CollectionsTableProps {
  collections: Collection[];
  items: OwnedItem[];
  qualifyingCrewByCollection: Map<number, CrewMember[]>;
  upgradableIds: Set<number>;
}

function CollectionsTable({ collections, items, qualifyingCrewByCollection, upgradableIds }: CollectionsTableProps) {
```

and, inside the `.map`:

```tsx
                    {qualifyingCrew.length === 0 ? (
                      <Typography color="text.secondary" sx={{ py: 1 }}>
                        No crew match.
                      </Typography>
                    ) : (
                      <CollectionCrewList crew={qualifyingCrew} items={items} />
                    )}
```

Change the interface and function signature to:

```ts
export interface CollectionsTableProps {
  collections: Collection[];
  allCollections: Collection[];
  items: OwnedItem[];
  qualifyingCrewByCollection: Map<number, CrewMember[]>;
  upgradableIds: Set<number>;
}

function CollectionsTable({
  collections,
  allCollections,
  items,
  qualifyingCrewByCollection,
  upgradableIds,
}: CollectionsTableProps) {
```

Change the `CollectionCrewList` call site to:

```tsx
                    {qualifyingCrew.length === 0 ? (
                      <Typography color="text.secondary" sx={{ py: 1 }}>
                        No crew match.
                      </Typography>
                    ) : (
                      <CollectionCrewList
                        crew={qualifyingCrew}
                        items={items}
                        allCollections={allCollections}
                        currentCollectionId={collection.id}
                      />
                    )}
```

(`collection` is already in scope here — it's the `.map` callback's parameter, from `pageItems.map((collection, index) => { ... })`.) Do not change anything else in this file — the existing `collections` prop keeps its current role (`usePagination(collections)` for the top-level collection rows) unchanged.

- [ ] **Step 3: Update `CollectionsPage.tsx` — pass the full, unfiltered list as `allCollections`**

Current call site (`client/src/pages/CollectionsPage.tsx`):

```tsx
      <CollectionsTable
        collections={filteredCollections}
        items={items}
        qualifyingCrewByCollection={qualifyingCrewByCollection}
        upgradableIds={upgradableIds}
      />
```

Change to:

```tsx
      <CollectionsTable
        collections={filteredCollections}
        allCollections={collections}
        items={items}
        qualifyingCrewByCollection={qualifyingCrewByCollection}
        upgradableIds={upgradableIds}
      />
```

(`collections` — the full, sorted, pre-search local variable — already exists earlier in this file: `const collections = data ? [...rawCollections].sort(byUpgradableThenCompletionThenNameAsc(upgradableIds)) : [];`. Do not use `rawCollections` directly — `collections` is the correctly-typed, already-computed full list.)

- [ ] **Step 4: Typecheck**

Run: `cd client && npx tsc --noEmit`
Expected: no errors. This is a strict-TypeScript project with no test framework — a clean typecheck plus the verification script in Step 5 are the pass/fail signal for this task.

- [ ] **Step 5: Verify against real data with a throwaway script**

Create a scratch script (anywhere outside the repo's tracked source, e.g. `/tmp/verify-collections-columns.mjs` — do not commit it) that:
1. Reads the real `server/data/player-cache.json`.
2. Extracts `player.character.cryo_collections` as the full collections list and `player.character.crew` as the crew list.
3. Picks any crew member belonging to 2+ collections (via the same trait/extra_crew matching `crewBelongsToCollection` in `client/src/collections/getters.ts` uses — either re-implement the same two-line matching logic in the script, or read the file to copy it exactly).
4. For one of those collections treated as "current", confirms: total count matches the crew's full collection membership count, and the "other" list matches that same set minus the current collection's name.

Run it with `node` (plain JS, no build step needed — this is a throwaway data-shape check, not a TS import of the actual app modules). Confirm the counts and name lists match by hand for at least one crew member. Delete the script when done (or leave it in `/tmp`, which is git-ignored/outside the repo either way).

- [ ] **Step 6: Real-browser check**

Start the dev server if not already running (`npm run dev` from the repo root, or check what's already running). Using `playwright` (per this repo's `CLAUDE.md` browser-automation guidance — prefer the `playwright`/`chrome-devtools` MCP tools first, fall back to the raw `playwright` npm library):
1. Navigate to `/collections`.
2. Expand a collection whose crew list includes a member known (from Step 5) to belong to 2+ collections.
3. Confirm that crew's row shows `Level: {n}`, `Items: {n}`, `Total Collections: {n}`, and `Other Collections: {comma-separated names, current collection excluded}` — in that order, after the existing status chip.
4. Type a search query into the page's search box that filters out one of that crew's *other* collections from the top-level list (but leaves the currently-expanded collection visible). Confirm the `Total Collections:` count and `Other Collections:` list for that crew do **not** change — this proves the full, unfiltered `allCollections` list is driving the values, not the search-filtered one.

- [ ] **Step 7: Commit**

```bash
git add client/src/collections/CollectionCrewList.tsx client/src/collections/CollectionsTable.tsx client/src/pages/CollectionsPage.tsx
git commit -m "Add Total/Other Collections and rename Level on Collections crew subrow"
```

## Self-Review Notes

- Spec coverage: all three spec sections (CollectionCrewList, CollectionsTable, CollectionsPage) are covered by this single task's three edit steps; the spec's non-goals (no CrewTable change, no new getter, no header row, no pagination/search behavior change) are respected — this plan touches no other file and adds no new exported function.
- This is intentionally a single task, not three: the three files change together to keep the tree compiling at every commit (splitting the prop-threading across separate tasks/commits would leave an intermediate state where `CollectionsTable` requires a prop `CollectionsPage` doesn't yet pass, breaking the build). A task is the smallest independently-testable, independently-reviewable unit — here that unit spans all three files.
