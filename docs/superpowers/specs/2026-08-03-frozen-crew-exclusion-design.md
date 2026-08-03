# Frozen Crew Exclusion — Design

## What this is

Excludes "frozen crew duplicates" from the Collections page's crew
lists, plus a small unrelated refactor bundled in because it touches the
same files: extracting a shared `isMaxedOut(collection)` predicate to
replace a duplicated `collection.milestone.goal === 0` check.

## The frozen-crew problem

STT lets a player fully immortalize a crew member and then "freeze" it —
store it elsewhere to free up active-roster inventory space. If the
player later re-pulls a duplicate of that same crew (a real, common
occurrence — the game keeps offering crew from its whole history), the
new copy starts fresh at low rarity/level. The Collections page currently
has no way to tell "this crew still needs work" apart from "this crew
already has a frozen, fully-completed twin, and this active copy is just
a re-pull" — both look identical from `crew.rarity`/`level` alone. The
user identified this by noticing collections they'd already fully
completed (i.e. all milestones claimed, `goal: 0` — see "Collection
completion sort" in `PROJECT_STATE.md`) still showed active,
not-yet-immortalized crew in their crew sub-list.

## Finding the pattern

`player.character.stored_immortals` — an array of
`{ id, quantity, qbits }` — is the frozen-crew list. `id` is the crew's
`archetype_id`: confirmed by cross-referencing against the active
roster's `archetype_id`s, which found exactly 12 archetypes present in
**both** lists. Every one of the 12 matches the reported symptom exactly
— a low-rarity or under-leveled active-roster crew whose archetype
already has a frozen, fully-immortalized twin:

| Crew | archetype_id | Active rarity/max | Level |
|---|---|---|---|
| Captain Janeway | 10 | 4/4 | 20 |
| Ensign Kim | 23 | 1/1 | 1 |
| First Maje Haron | 25 | 1/2 | 1 |
| Telek R'Mor | 55 | 1/2 | 1 |
| Idrin | 144 | 1/3 | 1 |
| Martia | 5175 | 1/4 | 1 |
| Festive Jadzia Dax | 6612 | 1/2 | 1 |
| Duelist Yar | 7206 | 1/4 | 1 |
| Fleet Commander Martok | 8630 | 1/2 | 1 |
| Indignant Seven | 9553 | 1/4 | 1 |
| Off-Duty Stamets | 9741 | 1/2 | 1 |
| Anxious Kirk | 15891 | 2/4 | 100 |

**Verified against real data, not guessed:** the two collections the
user specifically named as already-completed-but-still-showing-crew,
**"Common Crew"** and **"Uncommon Crew,"** go from 1→0 and 5→0
qualifying crew respectively once frozen duplicates are excluded —
matching the reported symptom exactly. Across the full 88-collection
set: 14 collections affected, total qualifying-crew entries drop from
368 to 343, and 2 collections become newly empty. "The Neutral Zone"
(used as a worked example in the row-detail feature) changes from 4
qualifying crew to 3 — `Telek R'Mor` is removed, since it's one of the
12 frozen duplicates. This is a real, expected consequence, not a
regression to guard against.

## Where the exclusion happens

`getCrewTier` (`crew/getters.ts`) is **not** touched — it's a general
"how close is this crew to immortalized" concept, reused by
`crew/sorters.ts`'s `byTierAsc` and `CollectionCrewList`'s "Ready" chip
display, not something specific to frozen-crew bookkeeping. The
exclusion is scoped entirely to `getCollectionCrew`
(`collections/getters.ts`), which gains a 4th parameter:

```ts
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

`CollectionsPage` computes `frozenArchetypeIds` once and passes it down
to `CollectionsTable`, which threads it into this call — same pattern as
`crew`/`items`/`collections` already flow through the component tree.

**Explicitly scoped to the Collections page only, per user decision:**
the 4 existing crew pages (3/4, 4/5, 4/4-ready, 4/4-needs-work) never
call `getCollectionCrew` and are completely unaffected — a crew like
Captain Janeway (4/4, level 20, frozen twin exists) still appears on the
"4/4 Stars crew" page as before. Broadening this to those pages was
raised and explicitly declined for now.

## Data layer

New narrow type, matching this project's "type only what you use"
discipline — `stored_immortals` entries have more fields in the real
payload (`quantity`, `qbits`), neither used here:

```ts
// types/storedImmortal.ts
export interface StoredImmortal {
  id: number; // crew archetype_id of a fully-immortalized, frozen crew member
}
```

New getter in `collections/getters.ts`, mirroring `getCollectionsList`'s
extraction style exactly (optional chaining + `Array.isArray` guard,
`[]`/empty-`Set` fallback rather than throwing):

```ts
export function getFrozenCrewArchetypeIds(data: PlayerData): Set<number> {
  const player = data.player as Record<string, unknown> | undefined;
  const character = player?.character as Record<string, unknown> | undefined;
  const storedImmortals = character?.stored_immortals;
  const list = Array.isArray(storedImmortals) ? (storedImmortals as StoredImmortal[]) : [];
  return new Set(list.map((s) => s.id));
}
```

## The `isMaxedOut` refactor (bundled in)

Unrelated to frozen crew, but touches the exact same two files this
feature is already modifying, so it ships together. Replaces the
duplicated `collection.milestone.goal === 0` check (one copy in
`collections/sorters.ts`, one in `collections/CollectionsTable.tsx`) with
a single named predicate:

```ts
export function isMaxedOut(collection: Collection): boolean {
  return collection.milestone.goal === 0;
}
```

`getCollectionCompletionRatio` and `CollectionsTable`'s `progressDisplay`
both switch to calling `isMaxedOut(collection)` instead of repeating the
raw comparison. Also folded in: a named constant and one-line comment
for the `-1` sort sentinel, since it's exactly the value that was
reversed once already during the row-detail feature's design (an
initial "rank complete collections first" instinct became "rank them
last") — worth documenting in code so a future reader doesn't
"helpfully" flip it back:

```ts
const MAXED_OUT_RATIO = -1; // sorts maxed-out collections to the bottom, deliberately — see PROJECT_STATE.md
```

## Error handling / edge cases

- `stored_immortals` missing or malformed: `getFrozenCrewArchetypeIds`
  returns an empty `Set`, same fail-closed convention as every other
  getter — no crew get excluded, matching current (pre-fix) behavior
  rather than erroring.
- A collection losing its only qualifying crew to this filter (2 real
  cases: "Common Crew," "Uncommon Crew") already has a defined empty
  state — the existing "No crew match." row — no new UI state needed.
- No change to how many collection *rows* render (all 88 collections
  still get a row, per the existing "every collection gets a row"
  guarantee) — only which crew appear inside a row's sub-list changes.

## Verification plan

Same throwaway-script-against-real-data pattern as every prior feature:
a `client/src/collections/__verify.ts`, run via `npx tsx`, deleted before
committing, confirming:
- `getFrozenCrewArchetypeIds` returns exactly the 12 archetype_ids listed
  above.
- "Common Crew" and "Uncommon Crew" both return 0 qualifying crew after
  the fix (were 1 and 5 before).
- "The Neutral Zone" returns exactly `['Commander Sela', 'Zhaban',
  'Reclamation Narissa']` (3 crew, `Telek R'Mor` removed).
- Total qualifying-crew entries across all 88 collections sums to 343
  (was 368).
