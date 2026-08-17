# Collections page: green "Upgradable" chip when Ready crew alone cover the gap — Design

**Date:** 2026-08-17
**Status:** Approved

## Problem

The Collections page's "Upgradable" chip (blue, `color="info"`) appears on a
collection row when its qualifying crew's `Ready` + `4/4 Stars` counts
combined are enough to cover the collection's remaining progress
(`milestone.goal - progress`). This tells you the collection is
theoretically reachable, but doesn't distinguish the stronger case where
`Ready` crew **alone** already cover the gap — i.e. the collection is one
immortalization away from advancing, not dependent on crew that still need
leveling/equipping work.

Worked examples:
- **Convergence Day**: progress `32/33`, remaining `1`. Qualifying crew:
  "Klingon Quark" (`Ready`), "Human Q" (`4/4 Stars`). `Ready` alone (`1`)
  already covers the remaining `1` → chip should be **green**.
- **Heh Cho'mruak tah**: progress `57/60`, remaining `3`. Qualifying crew
  includes only 1 `Ready` ("Klingon Quark") plus others at `4/4 Stars`.
  `Ready` alone (`1`) doesn't cover remaining `3`, even though `Ready` +
  `4/4 Stars` combined might → chip stays **blue**. If two more crew
  ("Klingon O'Brien", "Dahar Master Kor") later reach `Ready`, giving 3
  `Ready` crew for remaining `3`, the chip flips to **green**.

## Design

Chip color rule, evaluated only for rows that already show the chip today
(i.e. already "upgradable" by the existing combined-tier rule):

- **Green** (`color="success"`) — count of qualifying crew in `Ready` tier
  alone ≥ `remaining`.
- **Blue** (`color="info"`, current behavior) — upgradable by the existing
  combined rule, but `Ready` alone falls short of `remaining`.
- **No chip** — not upgradable at all (unchanged).

The label text stays `"Upgradable"` in both cases — only the color changes.

### `client/src/collections/sorters.ts`

`isCollectionUpgradable` currently computes `remaining` and counts
qualifying crew whose `getCrewTier` is `'ready'` or `'needsWork'`:

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

Refactor the shared "does this many qualifying crew (by tier) cover the
remaining progress" logic into a small private helper, then add a sibling
exported function that applies the same shape but counts only `'ready'`:

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

export function isCollectionUpgradableByReadyAlone(collection: Collection, qualifyingCrew: CrewMember[], items: OwnedItem[]): boolean {
  return isRemainingCoveredByTiers(collection, qualifyingCrew, items, new Set(['ready']));
}
```

`getUpgradableCollectionIds` (used for sorting, via
`byUpgradableThenCompletionThenNameAsc`) is unchanged — it continues to use
`isCollectionUpgradable` (the combined rule), so sort order is unaffected
by this feature (confirmed: color-only change, no reordering).

Add a parallel helper for the chip-color Map, mirroring
`getUpgradableCollectionIds`'s shape:

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

### `client/src/pages/CollectionsPage.tsx`

Alongside the existing `upgradableIds` computation, compute
`readyAloneIds = getReadyAloneCollectionIds(rawCollections, qualifyingCrewByCollection, items)`
and pass it down to `CollectionsTable` as a new prop.

### `client/src/collections/CollectionsTable.tsx`

Add `readyAloneIds: Set<number>` to `CollectionsTableProps`. In the row
render, alongside the existing `upgradable` lookup, compute
`readyAlone = readyAloneIds.has(collection.id)` and change:

```tsx
{upgradable && <Chip label="Upgradable" size="small" color="info" sx={{ ml: 1 }} />}
```

to:

```tsx
{upgradable && (
  <Chip label="Upgradable" size="small" color={readyAlone ? 'success' : 'info'} sx={{ ml: 1 }} />
)}
```

## Non-goals

- No change to `getUpgradableCollectionIds` or `byUpgradableThenCompletionThenNameAsc`
  — sort order is unaffected; this is a pure color change within the
  already-upgradable group (explicitly confirmed).
- No change to which collections show a chip at all (the existing combined
  Ready+4/4-Stars rule still gates chip visibility).
- No change to the chip's label text (`"Upgradable"` in both colors).
- No change to `getCrewTier`, `isReadyToImmortalize`, or any other
  crew/collection classification logic.
- No change to `CollectionCrewList.tsx`'s existing per-crew "Ready" /
  "4/4 Stars" `StatusChip` rendering.

## Verification plan

- `tsc --noEmit` clean.
- Real-browser check against `/collections` with real player data:
  confirm "Convergence Day" (or whichever real collection currently
  matches the pattern: remaining fully covered by `Ready` crew alone)
  renders a **green** "Upgradable" chip. Confirm a collection that's
  upgradable only via the combined Ready+4/4-Stars count renders a
  **blue** chip. Confirm a non-upgradable collection still shows no chip.
  Confirm sort order (upgradable collections still bumped to the top,
  green/blue mixed within that group) is unchanged from before this
  feature.
