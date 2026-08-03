# Crew Collections Count — Design

## What this is

The game groups crew into "collections" (`cryo_collections` in the raw
payload) — themed sets like "Primal Instinct" or "The Wild West" that
unlock buffs/rewards as you immortalize members. This feature adds a
"Collections" column to all four existing crew pages, showing how many
collections each owned crew member belongs to, plus a new sort key. It
also lays the groundwork (without building it) for a future page that
looks at collections the other way around — for a given collection, which
owned crew belong to it.

## The membership rule (reverse-engineered and verified against real data)

There is no direct crew→collection reference in the payload. Instead, a
crew member belongs to a collection if **either** of two conditions holds:

1. **Trait overlap:** `collection.traits` intersects
   `crew.traits ∪ crew.traits_hidden`.
2. **Explicit inclusion:** `crew.archetype_id` appears in
   `collection.extra_crew`.

This was derived and verified against `example-data.json` using "Beach
Day Ransom" (`archetype_id: 31595`) as the worked example, which the user
had independently counted as belonging to 8 collections:

- 7 matched by trait overlap: `inspiring`→"To Boldly Go",
  `primal`→"Primal Instinct", `casual`→"As Usual", `brutal`→"Ruthless
  Aggression", `undercover_operative`→"Deep Cover", `festive`→"Joyful
  Times", `low`→"Animated".
- The 8th, **"Perils in Paradise"**, has `traits: []` and only matched
  because `31595` is listed in its `extra_crew` array. This is what
  revealed rule 2 — the initial trait-only hypothesis found only 7.

Further verification across the full sample (88 collections × 597 crew):

- 15 of the 88 collections have `traits: []` and rely entirely on
  `extra_crew` (thematic sets like "The Wild West," "Sherwood Forest,"
  "Convergence Day" — not trait-driven at all).
- No collection has both `traits: []` and `extra_crew: []` (i.e. nothing
  matches vacuously-empty rules).
- `extra_crew` arrays list `archetype_id`s (the crew *type* — small,
  shared across all players who own that crew), not the per-owned-instance
  `id` (large, unique to this player's copy). Confirmed: of 525 total
  `extra_crew` entries, only 110 matched an archetype this player actually
  owns — the rest are crew this player doesn't have, which is expected
  since `extra_crew` describes the collection game-wide, not this
  player's roster.
- No crew×collection pair matched both rules simultaneously in the
  sample (not structurally guaranteed, but doesn't matter — see
  "Dedup" below).
- Two crew owned in duplicate (same `archetype_id`, two separate owned
  copies) produced identical collection counts, as expected since the
  rule depends only on `archetype_id`/traits, not per-instance data.
- Full distribution across all 597 crew: 8 own zero collections, up to a
  max of 11; no obviously wrong outliers (0:8, 1:23, 2:76, 3:135, 4:155,
  5:112, 6:56, 7:21, 8:9, 9:1, 11:1).

**Dedup is a non-issue by construction:** membership is computed by
filtering the single `collections` array with an OR'd predicate, not by
merging two separately-collected result sets — so a collection can only
appear once in the result regardless of how many rules it matched by.

## Data model

New `client/src/types/collection.ts`:

```ts
export interface Collection {
  id: number;
  name: string;
  traits: string[];
  extra_crew: number[];
}
```

`CrewMember` (`client/src/types/crew.ts`) gains three fields not
currently modeled, all needed for the membership rule:

```ts
archetype_id: number;
traits: string[];
traits_hidden: string[];
```

Both types stay in this project's established "narrow — type only what
you use" discipline. `Collection` omits `image`, `description`,
`progress`, `claimable_milestone_index`, and `milestone` — none are used
by this feature or its planned successor (the collections-view page only
needs `id`/`name` for display and `traits`/`extra_crew` for matching).

## Core module

New `client/src/collections/getters.ts`, mirroring the shape and
defensiveness of `crew/getters.ts`:

```ts
function getCollectionsList(data: PlayerData): Collection[]
function crewBelongsToCollection(crew: CrewMember, collection: Collection): boolean
function getCrewCollections(crew: CrewMember, collections: Collection[]): Collection[]
function getCollectionCount(crew: CrewMember, collections: Collection[]): number
```

- `getCollectionsList` reads `player.character.cryo_collections` with the
  same optional-chaining + `Array.isArray` guard as `getCrewList`/
  `getOwnedItems`, returning `[]` if the path is missing or malformed.
- `crewBelongsToCollection` is the single source of truth for the
  membership rule above — implements both conditions, OR'd.
- `getCrewCollections` filters the full collections list down to the ones
  a given crew belongs to (the crew's-eye view this feature needs).
- `getCollectionCount` is `getCrewCollections(...).length` — a thin,
  named wrapper kept for symmetry with `getEquipmentSlotsRemaining`
  (a self-contained single-crew derived value) and because it's what the
  table column and sort comparator both actually call.

**Why `crewBelongsToCollection` is factored out on its own:** the planned
future collections-view page needs the *reverse* direction — for a given
collection, which owned crew belong to it. That reduces to
`crewList.filter((c) => crewBelongsToCollection(c, collection))`, reusing
the exact same predicate with the arguments held fixed the other way.
Keeping the predicate as its own function means the future page adds zero
new matching logic — only a new page and a trivial reverse-filter call.
**Not building that page now** — this spec covers only the crew-eye-view
column and sort key; the collections page is a separate future spec.

## Table + sorter integration

`crew/CrewTable.tsx` gains a required `collections: Collection[]` prop
and a new column, added last (after "Items to equip"):

| # | Stars | Name | Level | Items to equip | Collections |

Rendered per row as `getCollectionCount(c, collections)`, right-aligned
like the other numeric columns.

`crew/sorters.ts` gains:

```ts
function byCollectionCountDesc(collections: Collection[]): Comparator<CrewMember> {
  return (a, b) => getCollectionCount(b, collections) - getCollectionCount(a, collections);
}
```

This is the first **factory** comparator in the file — every existing
comparator (`byLevelDesc`, `byEquipmentSlotsRemainingDesc`, `byNameAsc`)
is a plain `(a, b) => number` because level and equipment-slots are
self-contained on a single `CrewMember`. Collection count needs the
collections list as external context to compute, so it's shaped as a
function that takes that context and returns a comparator — the smallest
change that fits the existing `combineComparators` composition model
without altering it.

Chosen over precomputing a `Map<archetype_id, count>` first: at 597 crew
× 88 collections, computing membership inline is trivially fast, and a
precomputed map would be a second concept introduced purely for
performance headroom nothing here currently needs — consistent with this
project's repeatedly-reaffirmed no-premature-optimization stance (see
"No automated test framework" and sorting-refactor history in
`PROJECT_STATE.md`).

## Page wiring

All four existing crew pages (`ThreeFourStarsCrewPage`,
`FourFiveStarsCrewPage`, `FourFourStarsCrewReadyPage`,
`FourFourStarsCrewPage`) get the identical edit:

1. Fetch `getCollectionsList(data)` alongside the existing
   `getCrewList`/`getOwnedItems` calls.
2. Pass `collections` to `<CrewTable>`.
3. Insert `byCollectionCountDesc(collections)` into the composed
   comparator at the requested priority — level, then equipment slots,
   then collection count, then name:

```ts
combineComparators(byLevelDesc, byEquipmentSlotsRemainingDesc, byCollectionCountDesc(collections), byNameAsc)
```

This is a mechanical, identical 3-line change per page — the same kind of
repetition already flagged as the "page-shell duplication" deferred issue
in `PROJECT_STATE.md`. Not addressed here (out of scope for this
feature), but worth noting this is now the 4th page-level concern
(loading/error scaffolding, `usePlayerData`, filter composition, and now
this) that a future shared-page-shell refactor would collapse.

## Error handling / defensive guards

Follows this project's existing "fail closed, never throw" discipline
(the same reasoning as the `equipment_slots` guard in
`getMissingEquipmentArchetypeIds`, since `CrewMember`/`PlayerData` are
unvalidated casts over raw JSON and there's no error boundary anywhere in
the app):

- `getCollectionsList` returns `[]` if `cryo_collections` is missing or
  not an array.
- `crewBelongsToCollection` guards `collection.traits ?? []` and
  `collection.extra_crew ?? []` — a malformed collection entry
  contributes zero matches rather than throwing.
- `crew.traits ?? []` / `crew.traits_hidden ?? []` guarded the same way,
  consistent with every other field read off `CrewMember`.

## Verification plan

Same pattern as every prior feature in this project: a throwaway
`client/src/collections/__verify.ts`, run via `npx tsx` against the real
`example-data.json`, deleted before committing. It should independently
re-derive (not just call the new functions and trust them):

- Beach Day Ransom's 8 collections, by name, matching the list above.
- The full-sample distribution table (0–11 range, 8 crew at zero).
- That the two duplicate-`archetype_id` crew get matching counts.

No automated test framework is being introduced — consistent with the
project-wide, repeatedly-reaffirmed choice documented in
`PROJECT_STATE.md`.
