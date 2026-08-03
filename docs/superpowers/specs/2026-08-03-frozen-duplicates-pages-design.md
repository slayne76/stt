# Frozen Duplicates Pages — Design

## What this is

Two new pages, "4 Stars Duplicates" and "5 Stars Duplicates," that
surface active-roster crew whose `archetype_id` already has a frozen,
fully-immortalized twin (see `docs/PROJECT_STATE.md`'s "Frozen crew and
duplicate exclusion" for the underlying data — `stored_immortals`),
filtered to a specific `max_rarity`. This is the deliberate opposite of
the frozen-crew-exclusion feature: that feature *hides* these duplicates
from the Collections page because they can never advance a collection;
this feature *surfaces* them explicitly so the user can review each one
and decide, in-game, whether to keep leveling it or dismiss/fuse it.
Scoped to 4- and 5-star crew specifically, on the reasoning that
lower-rarity duplicates are rarely worth a keep-or-trash decision, while
a duplicate of a 4- or 5-star crew represents a real investment choice.

## The filter

New function in `crew/filters.ts`, matching `filterByRarity`'s
array-in-array-out shape exactly:

```ts
export function filterFrozenDuplicates(crew: CrewMember[], frozenArchetypeIds: Set<number>, maxRarity: number): CrewMember[] {
  return crew.filter((c) => frozenArchetypeIds.has(c.archetype_id) && c.max_rarity === maxRarity);
}
```

**No completion-state filtering** — every active-roster crew whose
archetype is frozen and whose `max_rarity` matches shows up, regardless
of the duplicate's own level/equipment/rarity. Confirmed explicitly: the
frozen twin itself is never a concern here, since `stored_immortals`
entries aren't part of `player.character.crew` at all — there's no
double-counting risk to guard against.

`frozenArchetypeIds` is passed in as a plain `Set<number>` parameter
(computed via `getFrozenCrewArchetypeIds`, already shipped in
`collections/getters.ts`) rather than imported — this keeps `crew/`
oblivious to where the frozen set came from, consistent with the
project's existing module boundaries (`crew/filters.ts` has never
imported from `collections/`, and this change doesn't start).

**Verified against real data:** "4 Stars Duplicates" would show exactly
5 crew in the current sample — Captain Janeway (4/4, level 20), Anxious
Kirk (2/4, level 100), Indignant Seven (1/4, level 30), Martia (1/4,
level 1), Duelist Yar (1/4, level 1). "5 Stars Duplicates" is empty in
this sample (no frozen archetype in the current sample has `max_rarity`
5) — a correct, expected empty state, not a bug to chase.

## Components, pages, and routes

- **`client/src/pages/FrozenDuplicatesPage.tsx`** (new, internal —
  not directly routed) — takes `maxRarity: number` and `title: string`
  props. Same `usePlayerData()` + loading/error/empty-state/title
  scaffold every existing crew page uses. Composes
  `filterFrozenDuplicates(getCrewList(data), getFrozenCrewArchetypeIds(data), maxRarity)`
  with the standard 4-key sort
  (`combineComparators(byLevelDesc, byEquipmentSlotsRemainingDesc, byCollectionCountDesc(collections), byNameAsc)`)
  and renders the existing `CrewTable`.
- **`client/src/pages/FourStarsDuplicatesPage.tsx`** /
  **`FiveStarsDuplicatesPage.tsx`** (new, thin) — each renders
  `<FrozenDuplicatesPage maxRarity={4|5} title="4|5 Stars Duplicates" />`.
  Chosen over two fully independent page files specifically because
  these two differ by exactly one number — a small parameterized
  internal component avoids copy-pasting a whole page file for that,
  without touching the older 5 pages' still-deferred page-shell
  duplication (out of scope here, unrelated).
- **Routes:** `/4-stars-duplicates`, `/5-stars-duplicates`; nav labels
  "4 Stars Duplicates," "5 Stars Duplicates," added to the existing
  hand-synced `NAV_ITEMS` (`AppLayout.tsx`) / `<Routes>` (`App.tsx`)
  lists.
- Empty state: "No duplicate crew at this rarity." — the same pattern
  every other crew page's empty state already uses, just distinct copy.

## Error handling / edge cases

- No new defensive guards needed — `filterFrozenDuplicates` composes two
  already-guarded primitives (`getCrewList`'s cast, `getFrozenCrewArchetypeIds`'s
  fail-closed extraction) and does a plain `Set.has`/`===` check, neither
  of which can throw.
- An empty `frozenArchetypeIds` (e.g. `stored_immortals` missing or
  malformed) correctly produces an empty duplicates list on both pages —
  same fail-closed behavior as the rest of this feature family.

## Verification plan

Same throwaway-script-against-real-data pattern as every prior feature:
a `client/src/crew/__verify.ts`, run via `npx tsx`, deleted before
committing, confirming:
- "4 Stars Duplicates" returns exactly these 5 crew, in this order:
  `Anxious Kirk` (lvl 100, slots -2, 2 collections), `Indignant Seven`
  (lvl 30, slots -2, 2 collections), `Captain Janeway` (lvl 20, slots -1,
  4 collections), `Martia` (lvl 1, slots -4, 3 collections), `Duelist
  Yar` (lvl 1, slots -4, 2 collections) — level desc is the dominant key
  here; `Martia`/`Duelist Yar` tie on level and slots, broken by
  collection count (3 vs 2).
- "5 Stars Duplicates" returns an empty array.
