# Collections "Upgradable" Chip — Design

## What this is

A new visual indicator on the Collections page: a collection whose
remaining crew-count to its next milestone can already be fully covered by
crew the player owns and hasn't finished yet (either `ready` or
`needsWork` tier — see `docs/PROJECT_STATE.md`'s "Crew tier
classification" and "Collections needsWork tier label" sections) gets an
"Upgradable" chip next to its name, and collections in this state sort to
the top of the table.

**Motivating example, verified against the real `example-data.json`:**
"Ruthless Aggression" shows `114/120` in the Progress column — 6 crew
still needed to reach the next milestone. That collection's qualifying
crew (the same list already shown in its sub-list, via `getCollectionCrew`)
contains 0 `ready` and 6 `needsWork` crew — exactly enough to cover the
remaining 6. This collection should get the "Upgradable" chip.

## The core computation

The Progress column already shows `${collection.progress}/${collection.milestone.goal}`
(see "Collection completion sort" in `docs/PROJECT_STATE.md`). The number
of crew still needed for the next milestone is:

```
remaining = collection.milestone.goal - collection.progress
```

If `remaining <= 0` (already at/past the next milestone, or maxed out —
see "Maxed-out is handled for free" below), the collection is never
upgradable. Otherwise, count how many of the collection's qualifying crew
(`getCollectionCrew`'s output — already excludes frozen-archetype
duplicates and crew more than one star from their ceiling, see
"The collections membership logic" and "Frozen crew and duplicate
exclusion" in `docs/PROJECT_STATE.md`) are at tier `ready` or `needsWork`:

```
eligible = qualifyingCrew.filter((crew) => {
  const tier = getCrewTier(crew, items);
  return tier === 'ready' || tier === 'needsWork';
}).length
```

The collection is upgradable iff `eligible >= remaining`.

**New predicate, `collections/sorters.ts`** (alongside `isMaxedOut`, which
already lives there and is already imported directly by
`CollectionsTable.tsx` for rendering — same shape of "predicate used both
by a comparator and directly by the table" precedent):

```ts
export function isCollectionUpgradable(
  collection: Collection,
  qualifyingCrew: CrewMember[],
  items: OwnedItem[]
): boolean {
  const remaining = collection.milestone.goal - collection.progress;
  if (remaining <= 0) return false;
  const eligible = qualifyingCrew.filter((crew) => {
    const tier = getCrewTier(crew, items);
    return tier === 'ready' || tier === 'needsWork';
  }).length;
  return eligible >= remaining;
}
```

It takes the collection's **already-filtered** qualifying-crew list — the
same list `CollectionsTable` already computes per row via
`getCollectionCrew` — rather than re-deriving it internally. This mirrors
how `byTierAsc`/`byMaxRarityDesc` in `crew/sorters.ts` already operate on
a pre-filtered crew list rather than re-filtering.

**Maxed-out is handled for free, not as a special case.** Verified against
real data: all 8 maxed-out collections (`isMaxedOut(collection)`, i.e.
`milestone.goal === 0`) in the sample retain a non-zero `progress` value
from their last claimed milestone, so `remaining = 0 - progress` is always
negative for them — never zero, never positive. The `remaining <= 0` guard
excludes them without needing an explicit `isMaxedOut` check. This was a
deliberate decision (see brainstorming discussion): rely on the arithmetic
as specified, don't add a redundant guard for a case the real data
confirms can't currently occur.

**Verified against `example-data.json` — must reproduce exactly:** exactly
5 collections are upgradable:

| Collection | Progress | Remaining | Eligible (ready+needsWork) |
|---|---|---|---|
| Delphic Expanse | 7/8 | 1 | 1 |
| Our Man Bashir | 2/3 | 1 | 1 |
| Ruthless Aggression | 114/120 | 6 | 6 |
| Class A Dress | 13/14 | 1 | 2 |
| Perils in Paradise | 2/3 | 1 | 2 |

## Chip rendering (`CollectionsTable.tsx`)

The main row already computes `qualifyingCrew` per collection (for the
sub-list and the `Crew` count column). Reuse it — no new crew filtering
here:

```tsx
const qualifyingCrew = sortCrew(getCollectionCrew(collection, crew, items, frozenArchetypeIds), comparator); // existing
const upgradable = isCollectionUpgradable(collection, qualifyingCrew, items); // new
```

Rendered inline, immediately after the collection name in the same
`Collection` column cell (per explicit user preference — same pattern as
how the "Ready"/"4/4 Stars" chips sit right after a crew name in
`CollectionCrewList`, not a separate column):

```tsx
<TableCell>
  {collection.name}
  {upgradable && <Chip label="Upgradable" size="small" color="info" sx={{ ml: 1 }} />}
</TableCell>
```

`color="info"` (MUI blue) — the third distinct chip color on this page
now, after `success` (green, "Ready") and `warning` (amber, "4/4 Stars"),
each tier/state getting its own color.

## Sort order: upgradable-first (`collections/sorters.ts` + `CollectionsPage.tsx`)

Explicit user request: upgradable collections should sort to the top,
ahead of the existing completion-ratio-first order, not just be visually
tagged in place.

**The naive approach is a real performance trap, not a style
preference.** A comparator that calls `isCollectionUpgradable` — which
needs `qualifyingCrew`, itself requiring a fresh `getCollectionCrew` scan
over all 597 crew — from *inside* the comparator function would run that
scan roughly `n log n` times during `Array.prototype.sort` (~1,100+ calls
for 88 collections), not once. That is meaningfully more expensive than
this project's existing measured-safe patterns (e.g. `byCollectionCountDesc`
was measured at ~12ms for a full-page crew sort using a much cheaper
per-comparison lookup — see "Sorting design" in `docs/PROJECT_STATE.md`).

**The fix: precompute the upgradable set once, before sorting**, then use
an O(1) lookup inside the actual comparator (the "decorate then sort"
pattern):

```ts
export function byUpgradableThenCompletionThenNameAsc(
  collections: Collection[],
  crewList: CrewMember[],
  items: OwnedItem[],
  frozenArchetypeIds: Set<number>
): Comparator<Collection> {
  const upgradableIds = new Set(
    collections
      .filter((c) => isCollectionUpgradable(c, getCollectionCrew(c, crewList, items, frozenArchetypeIds), items))
      .map((c) => c.id)
  );
  return combineComparators(
    (a, b) => Number(upgradableIds.has(b.id)) - Number(upgradableIds.has(a.id)),
    byCompletionThenNameAsc
  );
}
```

This calls `getCollectionCrew` exactly 88 times (once per collection,
inside the factory, before any comparison happens), not per comparison.
Ties (both upgradable, or both not) fall through to the existing
`byCompletionThenNameAsc` order, unchanged.

**Architecture note — this is a deliberate, documented change, not a
silent one.** `collections/sorters.ts` was previously import-free (besides
the `Collection` type) and explicitly called out in `docs/PROJECT_STATE.md`
as "kept out of `crew/sorters.ts`... no shared `combineComparators`-style
composition need here." This feature ends that: `collections/sorters.ts`
now imports `combineComparators`/`Comparator` from `crew/sorters.ts` and
`getCollectionCrew` from `collections/getters.ts`. The dependency graph
stays acyclic — checked explicitly: `crew/sorters.ts` already imports
`collections/getters.ts` (for `getCollectionCount`), which imports
`crew/getters.ts`; neither of those imports back into
`collections/sorters.ts`, so the new edges (`collections/sorters.ts` →
`crew/sorters.ts` → `collections/getters.ts` → `crew/getters.ts`, and
`collections/sorters.ts` → `collections/getters.ts` directly) form a DAG,
not a cycle. `docs/PROJECT_STATE.md`'s "Sorting design" section should be
updated to reflect this after implementation — it currently states the
opposite as a settled fact.

**Accepted tradeoff, not a regression:** this means `getCollectionCrew`
now runs once more per collection at the page level (for computing the
sort's upgradable set) in addition to `CollectionsTable`'s existing
per-row call (for rendering) — 176 total calls instead of 88 for a full
page render. This project already accepts comparable per-render filtering
costs at this data scale elsewhere (see the `byCollectionCountDesc`
precedent above). Real timing should be measured during implementation
rather than assumed, and reported in the plan's verification step.

## Wiring (`CollectionsPage.tsx`)

`collections` is currently sorted with `byCompletionThenNameAsc` before
`crew`/`items`/`frozenArchetypeIds` are computed. This needs reordering —
compute the crew-domain values first, then sort with the new comparator:

```tsx
const rawCollections = data ? getCollectionsList(data) : [];
const crew = data ? getCrewList(data) : [];
const items = data ? getOwnedItems(data) : [];
const frozenArchetypeIds = data ? getFrozenCrewArchetypeIds(data) : new Set<number>();
const collections = data
  ? [...rawCollections].sort(byUpgradableThenCompletionThenNameAsc(rawCollections, crew, items, frozenArchetypeIds))
  : [];
```

## Scope

Three files touched, all within the existing Collections feature:
- `client/src/collections/sorters.ts` — new `isCollectionUpgradable`,
  new `byUpgradableThenCompletionThenNameAsc` (composed via
  `combineComparators` + the existing `byCompletionThenNameAsc`).
- `client/src/collections/CollectionsTable.tsx` — render the new chip,
  import `Chip` (not currently imported there) and `isCollectionUpgradable`.
- `client/src/pages/CollectionsPage.tsx` — reorder declarations, use the
  new comparator.

No other page is touched. No changes to `getCollectionCrew`,
`getCrewTier`, `CollectionCrewList.tsx`, or any crew page. No new types.

## Out of scope / explicitly declined

- No explicit `isMaxedOut` guard in `isCollectionUpgradable` — the
  `remaining <= 0` arithmetic already excludes maxed-out collections in
  the real data (see above); adding a redundant guard for a case that
  can't currently occur was explicitly declined during brainstorming.
- No change to any crew page (3/4, 4/5, 4/4 ready, 4/4 needs work) — this
  is scoped to the Collections page exactly like the needsWork tier label
  feature before it.
- No numeric detail on the chip (e.g. "6 needed") — plain "Upgradable"
  text only, matching the literal request.
