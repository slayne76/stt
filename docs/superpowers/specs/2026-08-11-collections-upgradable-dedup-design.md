# Collections Upgradable-Status Dedup — Design Spec

Closes the "Upgradable-status dual computation" deferred backlog item in
`docs/PROJECT_STATE.md`: `CollectionsPage.tsx`'s sort factory and
`CollectionsTable.tsx`'s per-row rendering each independently derive a
collection's qualifying crew and upgradable status, correct today only
because both receive identical `crew`/`items`/`frozenArchetypeIds` inputs.

## Goal

Compute each collection's sorted qualifying-crew list exactly once, at the
page level, and have both the sort order (upgradable-first) and the
table's row rendering (crew count, crew sub-list, "Upgradable" chip) read
from that single precomputed source — eliminating the dual-source-of-truth
risk and the duplicate `getCollectionCrew`/`isCollectionUpgradable` work.

## Non-goals

- No visible behavior change: sort order, chip presence, crew counts, and
  the crew sub-list's contents/order must be identical to today for every
  real collection.
- No change to `getCollectionCrew` (`collections/getters.ts`) or
  `isCollectionUpgradable` (`collections/sorters.ts`) themselves — both
  keep their current signatures and logic; only *how often* and *from
  where* they're called changes.
- No memoization (`useMemo`) added — this codebase's crew/collections
  pages are deliberately unmemoized elsewhere (see `FiveStarsCrewPage`'s
  already-deferred memoization backlog item), and adding it here would be
  a separate, unrelated improvement.
- No change to pagination (`usePagination` inside `CollectionsTable`) or
  search (`useSearch` inside `CollectionsPage`) — both keep operating on
  the same `Collection[]` shape as today.

## Design

### `collections/sorters.ts` — two new exports, one changed signature

```ts
export function getQualifyingCrewByCollection(
  collections: Collection[],
  crewList: CrewMember[],
  items: OwnedItem[],
  frozenArchetypeIds: Set<number>
): Map<number, CrewMember[]> {
  const result = new Map<number, CrewMember[]>();
  for (const collection of collections) {
    result.set(
      collection.id,
      sortCrew(
        getCollectionCrew(collection, crewList, items, frozenArchetypeIds),
        combineComparators(byTierAsc(items), byMaxRarityDesc, byLevelDesc, byEquipmentSlotsRemainingDesc, byNameAsc)
      )
    );
  }
  return result;
}

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

// Changed signature — was (collections, crewList, items, frozenArchetypeIds)
export function byUpgradableThenCompletionThenNameAsc(upgradableIds: Set<number>): Comparator<Collection> {
  return combineComparators(
    (a, b) => Number(upgradableIds.has(b.id)) - Number(upgradableIds.has(a.id)),
    byCompletionThenNameAsc
  );
}
```

`getQualifyingCrewByCollection` absorbs the exact sort composition
(`byTierAsc`, `byMaxRarityDesc`, `byLevelDesc`,
`byEquipmentSlotsRemainingDesc`, `byNameAsc`) currently inlined in
`CollectionsTable.tsx`'s row renderer — moving it here means it's computed
once per collection instead of once per visible row. `sortCrew`,
`combineComparators`, and the four crew comparators need new imports at
the top of `sorters.ts` (from `../crew/sorters` and `../lib/comparator`),
mirroring what `CollectionsTable.tsx` currently imports.

`getUpgradableCollectionIds` replaces `byUpgradableThenCompletionThenNameAsc`'s
old internal `.filter(...)` — it no longer calls `getCollectionCrew` itself;
it reuses whatever `getQualifyingCrewByCollection` already computed. Reusing
the *sorted* list here instead of a fresh unsorted filter doesn't change the
eligibility count `isCollectionUpgradable` derives from it — order doesn't
affect a `.filter(...).length` count.

`isCollectionUpgradable` itself is untouched (still takes a precomputed
`qualifyingCrew` array, doesn't call any getter itself).

### `client/src/pages/CollectionsPage.tsx`

```tsx
const qualifyingCrewByCollection = getQualifyingCrewByCollection(rawCollections, crew, items, frozenArchetypeIds);
const upgradableIds = getUpgradableCollectionIds(rawCollections, qualifyingCrewByCollection, items);
const collections = data
  ? [...rawCollections].sort(byUpgradableThenCompletionThenNameAsc(upgradableIds))
  : [];
```

Both new calls run over `rawCollections` (all of them, before search
filtering) — sorting must account for every collection regardless of what
search later hides, exactly as today.

`<CollectionsTable>` gains `qualifyingCrewByCollection` and `upgradableIds`
props and drops `crew`/`frozenArchetypeIds` — `items` stays (still needed
by `CollectionCrewList`, the sub-list renderer, independent of any
collection).

### `client/src/collections/CollectionsTable.tsx`

```tsx
export interface CollectionsTableProps {
  collections: Collection[];
  items: OwnedItem[];
  qualifyingCrewByCollection: Map<number, CrewMember[]>;
  upgradableIds: Set<number>;
}
```

Inside the row renderer, replace:

```tsx
const qualifyingCrew = sortCrew(getCollectionCrew(collection, crew, items, frozenArchetypeIds), combineComparators(...));
const upgradable = isCollectionUpgradable(collection, qualifyingCrew, items);
```

with:

```tsx
const qualifyingCrew = qualifyingCrewByCollection.get(collection.id) ?? [];
const upgradable = upgradableIds.has(collection.id);
```

The `?? []` fallback is defensive only — `qualifyingCrewByCollection` is
always built from the same `rawCollections` superset `collections` (the
paginated/filtered prop) is drawn from, so every lookup should hit. Matches
this codebase's existing defensive-guard convention rather than assuming
it can never fire.

Drops from this file: the `getCollectionCrew` import (`./getters`), the
`isCollectionUpgradable` import (`./sorters` — `isMaxedOut` stays), and the
`byEquipmentSlotsRemainingDesc`/`byLevelDesc`/`byMaxRarityDesc`/`byNameAsc`/
`byTierAsc`/`sortCrew`/`combineComparators` imports — none of that sorting
logic is needed here anymore.

### Honest cost trade-off

Today, `CollectionsTable`'s filter+sort only runs for the currently
*visible* page (`usePagination` slices `collections` before the `.map()`
that calls `getCollectionCrew`/`sortCrew`) — lazy, paginated work. After
this change, `getQualifyingCrewByCollection` runs for all 88 real
collections on every render, regardless of pagination or which page is
showing. Net effect: strictly fewer *distinct* filter+sort operations in
the worst case (a fixed 88, vs. today's up-to-176 if a page size shows all
88 collections on one page — this is exactly where the backlog's "176
instead of 88" framing comes from), but every one of those 88 is now the
"full" computation rather than today's mix of a cheap unsorted eligibility
filter (all 88) plus an expensive filter+sort (only the visible page). At
this app's real data scale (88 collections, single user, local, no
`useMemo` used anywhere in this codebase's crew/collections pages today),
this is a wash-to-modest-win, not a guaranteed universal speedup — stated
plainly rather than oversold.

## Testing / verification plan

No automated test framework exists in this project (deliberate, repeated
choice). Because all 88 real collections fit in the seeded
`example-data.json`, verification here should cover all of them, not a
sample — matching this project's strongest precedent (independently
re-deriving all 88 collections' tier/reward/sort numbers during the
Collections row-detail final review).

A throwaway `client/src/collections/__verify.ts` script (run via `npx
tsx`, deleted before committing — this project's established pattern),
comparing the OLD computation path (reconstructed directly from the
still-unchanged `getCollectionCrew`/`isCollectionUpgradable` primitives,
the way `CollectionsPage.tsx`/`CollectionsTable.tsx` compute them today)
against the NEW path (`getQualifyingCrewByCollection` +
`getUpgradableCollectionIds` + the new `byUpgradableThenCompletionThenNameAsc`
signature), asserting exact equality across all 88 collections for:

- **Sort order:** the full ordered list of collection IDs after
  `.sort(byUpgradableThenCompletionThenNameAsc(...))` must be identical,
  old vs. new.
- **Upgradable set:** the set of collection IDs judged upgradable must be
  identical.
- **Qualifying-crew lists:** for every collection, the ordered list of
  crew IDs in its qualifying-crew list must be identical (this is what
  drives both the "Crew" count column and the `CollectionCrewList`
  sub-list's contents/order).

Beyond the data-driven script, a real-browser check on `/collections`
confirming: the same collections show the "Upgradable" chip as before the
change, the "Crew" column counts are unchanged, and expanding a few
collections' crew sub-lists shows the same names in the same order.

Build (`npm run build -w client`) / lint (`npm run lint -w client`) clean,
as with every prior feature — with particular attention to the dropped
imports in `CollectionsTable.tsx` (an unused-import lint error there would
indicate the removal was incomplete or something is still using the old
signature elsewhere).
