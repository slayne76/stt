# Collections page: green "Upgradable" chip when Ready crew alone cover the gap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change the Collections page's "Upgradable" chip from always-blue to green when `Ready`-tier qualifying crew alone cover the collection's remaining progress, blue otherwise (matching today's behavior).

**Architecture:** Refactor `isCollectionUpgradable`'s remaining/eligible-count logic into a shared private helper in `client/src/collections/sorters.ts`, add a sibling `isCollectionUpgradableByReadyAlone` + `getReadyAloneCollectionIds`, thread a new `readyAloneIds: Set<number>` from `CollectionsPage.tsx` through `CollectionsTable.tsx`, and use it to pick the chip's MUI `color`.

**Tech Stack:** React 19 + TypeScript (strict) + MUI, Vite dev server. No test framework — verification via `tsc --noEmit` and a real-browser check with the `playwright` npm library.

## Global Constraints

- Chip label text stays `"Upgradable"` in both colors — only the MUI `color` prop changes (`'success'` for green, `'info'` for blue, exactly as today).
- Green rule: qualifying crew with `getCrewTier(crew, items) === 'ready'` count ≥ `remaining` (`collection.milestone.goal - collection.progress`). This must reuse the same `remaining`/counting shape as the existing `isCollectionUpgradable`, not reimplement it separately.
- No change to `getUpgradableCollectionIds`, `byUpgradableThenCompletionThenNameAsc`, or sort order — the combined Ready+4/4-Stars rule continues to gate chip visibility and continues to drive sorting. This feature only decides the chip's color among rows that already show it.
- No change to `getCrewTier`, `isReadyToImmortalize`, or `CollectionCrewList.tsx`'s existing per-crew `StatusChip` rendering.
- No change to `CollectionsTableProps`' existing props beyond adding the one new `readyAloneIds` prop.

---

### Task 1: Add the ready-alone predicate and wire it through to the chip

**Files:**
- Modify: `client/src/collections/sorters.ts`
- Modify: `client/src/pages/CollectionsPage.tsx`
- Modify: `client/src/collections/CollectionsTable.tsx`

**Interfaces:**
- Produces (from `sorters.ts`): `isCollectionUpgradableByReadyAlone(collection: Collection, qualifyingCrew: CrewMember[], items: OwnedItem[]): boolean` and `getReadyAloneCollectionIds(collections: Collection[], qualifyingCrewByCollection: Map<number, CrewMember[]>, items: OwnedItem[]): Set<number>` — both exported, same shapes as the existing `isCollectionUpgradable` / `getUpgradableCollectionIds` they sit beside.
- Consumes (in `CollectionsPage.tsx`): the two new exports above, plus the existing `getQualifyingCrewByCollection` result already computed there.
- Consumes (in `CollectionsTable.tsx`): a new `readyAloneIds: Set<number>` prop, used the same way the existing `upgradableIds: Set<number>` prop is used today.

- [ ] **Step 1: Refactor `isCollectionUpgradable` and add the ready-alone sibling in `sorters.ts`**

Current code (`client/src/collections/sorters.ts`, lines 25-33):

```ts
export function isCollectionUpgradable(collection: Collection, qualifyingCrew: CrewMember[], items: OwnedItem[]): boolean {
  const remaining = collection.milestone.goal - collection.progress;
  if (remaining <= 0) return false;
  const eligible = qualifyingCrew.filter((crew) => {
    const tier = getCrewTier(crew, items);
    return tier === 'ready' || tier === 'needsWork';
  }).length;
  return eligible >= remaining;
}
```

Replace with:

```ts
function isRemainingCoveredByTiers(
  collection: Collection,
  qualifyingCrew: CrewMember[],
  items: OwnedItem[],
  tiers: ReadonlySet<CrewTier>
): boolean {
  const remaining = collection.milestone.goal - collection.progress;
  if (remaining <= 0) return false;
  const eligible = qualifyingCrew.filter((crew) => {
    const tier = getCrewTier(crew, items);
    return tier !== null && tiers.has(tier);
  }).length;
  return eligible >= remaining;
}

export function isCollectionUpgradable(collection: Collection, qualifyingCrew: CrewMember[], items: OwnedItem[]): boolean {
  return isRemainingCoveredByTiers(collection, qualifyingCrew, items, new Set(['ready', 'needsWork']));
}

// A stronger signal than isCollectionUpgradable: true only when crew already
// fully immortalize-ready (no combined-with-4/4-Stars help needed) cover the
// remaining progress on their own. Drives the "Upgradable" chip's color
// (green vs blue) on the Collections page — see PROJECT_STATE.md.
export function isCollectionUpgradableByReadyAlone(collection: Collection, qualifyingCrew: CrewMember[], items: OwnedItem[]): boolean {
  return isRemainingCoveredByTiers(collection, qualifyingCrew, items, new Set(['ready']));
}
```

This requires importing the `CrewTier` type. Current import line (line 4):

```ts
import { getCrewTier } from '../crew/getters';
```

Replace with:

```ts
import { getCrewTier, type CrewTier } from '../crew/getters';
```

- [ ] **Step 2: Add `getReadyAloneCollectionIds` beside `getUpgradableCollectionIds`**

Current code (`client/src/collections/sorters.ts`, lines 54-64):

```ts
export function getUpgradableCollectionIds(
  collections: Collection[],
  qualifyingCrewByCollection: Map<number, CrewMember[]>,
  items: OwnedItem[]
): Set<number> {
  return new Set(
    collections
      .filter((c) => isCollectionUpgradable(c, qualifyingCrewByCollection.get(c.id) ?? [], items))
      .map((c) => c.id)
  );
}
```

Add immediately after it (keep `getUpgradableCollectionIds` unchanged):

```ts
export function getReadyAloneCollectionIds(
  collections: Collection[],
  qualifyingCrewByCollection: Map<number, CrewMember[]>,
  items: OwnedItem[]
): Set<number> {
  return new Set(
    collections
      .filter((c) => isCollectionUpgradableByReadyAlone(c, qualifyingCrewByCollection.get(c.id) ?? [], items))
      .map((c) => c.id)
  );
}
```

- [ ] **Step 3: Run the typecheck to confirm `sorters.ts` compiles in isolation so far**

Run: `npx tsc --noEmit -p client`
Expected: FAIL (expected at this point) — `CollectionsTable.tsx` doesn't yet pass `readyAloneIds`, so this will only show errors once Steps 4-5 wire the prop through; if `sorters.ts` itself has a syntax/type error, fix it before continuing. (If your tsc setup reports success even now, that's fine too — just confirm no errors specifically in `sorters.ts`.)

- [ ] **Step 4: Compute `readyAloneIds` in `CollectionsPage.tsx` and pass it to `CollectionsTable`**

Current code (`client/src/pages/CollectionsPage.tsx`, lines 4-8):

```ts
import {
  byUpgradableThenCompletionThenNameAsc,
  getQualifyingCrewByCollection,
  getUpgradableCollectionIds,
} from '../collections/sorters';
```

Replace with:

```ts
import {
  byUpgradableThenCompletionThenNameAsc,
  getQualifyingCrewByCollection,
  getReadyAloneCollectionIds,
  getUpgradableCollectionIds,
} from '../collections/sorters';
```

Current code (line 24):

```ts
  const upgradableIds = getUpgradableCollectionIds(rawCollections, qualifyingCrewByCollection, items);
```

Replace with:

```ts
  const upgradableIds = getUpgradableCollectionIds(rawCollections, qualifyingCrewByCollection, items);
  const readyAloneIds = getReadyAloneCollectionIds(rawCollections, qualifyingCrewByCollection, items);
```

Current code (lines 49-55):

```tsx
      <CollectionsTable
        collections={filteredCollections}
        allCollections={collections}
        items={items}
        qualifyingCrewByCollection={qualifyingCrewByCollection}
        upgradableIds={upgradableIds}
      />
```

Replace with:

```tsx
      <CollectionsTable
        collections={filteredCollections}
        allCollections={collections}
        items={items}
        qualifyingCrewByCollection={qualifyingCrewByCollection}
        upgradableIds={upgradableIds}
        readyAloneIds={readyAloneIds}
      />
```

- [ ] **Step 5: Add the `readyAloneIds` prop and use it for chip color in `CollectionsTable.tsx`**

Current code (`client/src/collections/CollectionsTable.tsx`, lines 23-32):

```ts
export interface CollectionsTableProps {
  // `collections` is search-filtered and drives only the top-level pagination; `allCollections` is the
  // full, unfiltered list needed for correct per-crew collection-membership counts (using the filtered
  // list there would silently undercount when the current search hides one of a crew's other collections).
  collections: Collection[];
  allCollections: Collection[];
  items: OwnedItem[];
  qualifyingCrewByCollection: Map<number, CrewMember[]>;
  upgradableIds: Set<number>;
}
```

Replace with:

```ts
export interface CollectionsTableProps {
  // `collections` is search-filtered and drives only the top-level pagination; `allCollections` is the
  // full, unfiltered list needed for correct per-crew collection-membership counts (using the filtered
  // list there would silently undercount when the current search hides one of a crew's other collections).
  collections: Collection[];
  allCollections: Collection[];
  items: OwnedItem[];
  qualifyingCrewByCollection: Map<number, CrewMember[]>;
  upgradableIds: Set<number>;
  // A collection in this set is also in `upgradableIds` (Ready-alone coverage implies
  // combined coverage) — drives the "Upgradable" chip's color (green), not its visibility.
  readyAloneIds: Set<number>;
}
```

Current code (lines 34-40):

```ts
function CollectionsTable({
  collections,
  allCollections,
  items,
  qualifyingCrewByCollection,
  upgradableIds,
}: CollectionsTableProps) {
```

Replace with:

```ts
function CollectionsTable({
  collections,
  allCollections,
  items,
  qualifyingCrewByCollection,
  upgradableIds,
  readyAloneIds,
}: CollectionsTableProps) {
```

Current code (lines 58-60):

```tsx
          {pageItems.map((collection, index) => {
            const qualifyingCrew = qualifyingCrewByCollection.get(collection.id) ?? [];
            const upgradable = upgradableIds.has(collection.id);
```

Replace with:

```tsx
          {pageItems.map((collection, index) => {
            const qualifyingCrew = qualifyingCrewByCollection.get(collection.id) ?? [];
            const upgradable = upgradableIds.has(collection.id);
            const readyAlone = readyAloneIds.has(collection.id);
```

Current code (line 71):

```tsx
                    {upgradable && <Chip label="Upgradable" size="small" color="info" sx={{ ml: 1 }} />}
```

Replace with:

```tsx
                    {upgradable && (
                      <Chip label="Upgradable" size="small" color={readyAlone ? 'success' : 'info'} sx={{ ml: 1 }} />
                    )}
```

- [ ] **Step 6: Run the typecheck**

Run: `npx tsc --noEmit -p client`
Expected: PASS, no errors.

- [ ] **Step 7: Real-browser check**

Using the `playwright` npm library (per this repo's CLAUDE.md — headless
`chromium.launch()`), against the running dev app's `/collections` route,
with real player data loaded:

1. Find a collection where `Ready`-tier qualifying crew alone cover
   `milestone.goal - progress` (e.g. a collection matching "Convergence
   Day"'s pattern from the design spec: remaining fully covered by Ready
   crew alone) — confirm its "Upgradable" chip renders with the green
   (`success`) color, not blue.
2. Find a collection that's upgradable only via the combined Ready+4/4-Stars
   count (Ready alone falls short) — confirm its chip renders blue
   (`info`), matching today's pre-feature color.
3. Confirm a non-upgradable collection (remaining not covered even by the
   combined count) still shows no chip at all.
4. Confirm the page's row order (upgradable collections — any color —
   still bumped above non-upgradable ones, both groups then by completion
   then name) is unchanged from before this feature.

- [ ] **Step 8: Commit**

```bash
git add client/src/collections/sorters.ts client/src/pages/CollectionsPage.tsx client/src/collections/CollectionsTable.tsx
git commit -m "Color the Upgradable chip green when Ready crew alone cover the gap"
```
