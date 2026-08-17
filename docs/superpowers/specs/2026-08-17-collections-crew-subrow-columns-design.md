# Collections page: crew subrow "Total Collections" / "Other Collections" — Design

**Date:** 2026-08-17
**Status:** Approved

## Problem

On the Collections page, expanding a collection row shows a per-crew subrow
list (`CollectionCrewList.tsx`) with Star Rating, Name, a status chip,
level, and remaining items to equip. The user wants two more pieces of
info per crew row: how many collections that crew belongs to in total, and
the names of the other collections it belongs to (excluding the one the
subrow is nested under) — the same underlying data the Crew pages already
show via `CrewTable`'s "Total collections" / "Collections names" columns,
reusing the same getter.

## Investigation

`CollectionCrewList` is a flex-row list (`Box` per crew), not an HTML
`<table>` — there is no header row and nothing literally labeled
"Progress". Confirmed with the user: the two new values should be added
the same way the existing `Items: {n}` value is shown — an inline
`Label: value` pair, no table header.

`CrewTable.tsx` already computes this exact data per row via
`getCrewCollections(c, collections)` (`collections/getters.ts`) — filters
the full `Collection[]` list down to the ones a given crew belongs to. This
getter is reused as-is; no new data logic is introduced.

`CollectionsTable.tsx` currently receives a `collections` prop that is
**already search-filtered** (`CollectionsPage.tsx` passes
`filteredCollections`) — it exists only to paginate the top-level collection
rows shown on the page. Using that filtered list to compute a crew's total
collection count would be wrong: a crew could belong to a collection that
the user's search text filtered out of view, silently undercounting.
`CollectionsPage.tsx` already computes an unfiltered, full, sorted
`collections` list (before the `useSearch` call) — that variable is the
correct source and needs to be threaded down as a new, distinctly-named
prop.

## Design

### 1. `CollectionCrewList.tsx` — two new inline items, one rename

```ts
export interface CollectionCrewListProps {
  crew: CrewMember[];
  items: OwnedItem[];
  allCollections: Collection[];
  currentCollectionId: number;
}
```

Per crew row, using the existing `getCrewCollections` getter
(`collections/getters.ts`, already imported by `CrewTable.tsx`):

```ts
const crewCollections = getCrewCollections(c, allCollections);
const otherCollections = crewCollections.filter((col) => col.id !== currentCollectionId);
```

Rendered after the existing `Items: {n}` `Typography`, in the same
`color="text.secondary"` style, no header:

```tsx
<Typography color="text.secondary">
  Total Collections: {crewCollections.length}
</Typography>
<Typography color="text.secondary">
  Other Collections: {otherCollections.map((col) => col.name).join(', ')}
</Typography>
```

`Total Collections` is the real total (current collection included).
`Other Collections` is the same list with the current collection excluded
— a comma-separated list of names, matching `CrewTable`'s existing
`crewCollections.map((col) => col.name).join(', ')` formatting exactly
(including rendering as an empty string when a crew belongs to no other
collections — no placeholder text, consistent with how `CrewTable` already
handles zero collections).

Existing `Lv {c.level}` `Typography` is renamed to `Level: {c.level}`, for
label consistency with `Items:` and the two new items. No other change to
that element (same `sx`, same position).

### 2. `CollectionsTable.tsx` — thread the full collections list through

New prop, additive (existing `collections` prop, used only for
`usePagination(collections)` on the top-level rows, is unchanged and stays
search-filtered):

```ts
export interface CollectionsTableProps {
  collections: Collection[];
  allCollections: Collection[];
  items: OwnedItem[];
  qualifyingCrewByCollection: Map<number, CrewMember[]>;
  upgradableIds: Set<number>;
}
```

The existing `<CollectionCrewList crew={qualifyingCrew} items={items} />`
call site (inside the per-collection `.map`, where `collection.id` is
already in scope) becomes:

```tsx
<CollectionCrewList
  crew={qualifyingCrew}
  items={items}
  allCollections={allCollections}
  currentCollectionId={collection.id}
/>
```

### 3. `CollectionsPage.tsx` — pass the full list

The full, sorted (but not search-filtered) `collections` local variable
already exists (computed before the `useSearch` call). Pass it straight
through as the new prop, alongside the existing filtered
`filteredCollections`:

```tsx
<CollectionsTable
  collections={filteredCollections}
  allCollections={collections}
  items={items}
  qualifyingCrewByCollection={qualifyingCrewByCollection}
  upgradableIds={upgradableIds}
/>
```

## Non-goals

- No change to `CrewTable.tsx` or the Crew pages — this only touches the
  Collections page's expanded crew subrow.
- No new getter or data-fetching logic — reuses `getCrewCollections`
  as-is.
- No header row added to `CollectionCrewList` — it stays a flex-row list,
  consistent with its existing design; the two new values are inline
  `Label: value` pairs like `Items:`.
- No pagination or search-filtering behavior change to the top-level
  collections list.

## Verification plan

- Throwaway script (or direct reasoning against a fixture) confirming
  `Total Collections` counts every collection a sample multi-collection
  crew belongs to, while `Other Collections` lists all of those minus the
  one currently expanded.
- Real-browser check: `/collections`, expand a collection whose qualifying
  crew includes at least one member belonging to 2+ collections — confirm
  `Total Collections:`, `Other Collections:`, and `Level:` all render
  correctly per row, and that typing a search query which filters out one
  of that crew's other collections does **not** change the count shown
  (proves the full, unfiltered list is being used).
- Confirm no other `CollectionCrewList` call site exists that would break
  from the new required props (only one call site, in
  `CollectionsTable.tsx`).
