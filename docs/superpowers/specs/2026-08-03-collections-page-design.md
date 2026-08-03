# Collections Page — Design

## What this is

A new page, "Collections," showing every distinct collection as a
collapsible table row. Expanding a row reveals which of your owned crew
are linked to that collection — but only a curated subset (not every
owned crew that happens to match), grouped and highlighted by how close
each one is to being fully immortalized. This is the reverse direction of
the Collections count feature shipped earlier today: that feature asked
"how many collections does this crew belong to?"; this page asks "which
of my crew belong to this collection?"

## The crew subset and classification

Every existing crew page filters by a specific `rarity`/`max_rarity`
combo (3/4, 4/5, 4/4). This page instead classifies **every owned,
non-Immortalized crew member** into one of three tiers, generalizing the
existing Immortalization concepts to *any* `max_rarity` rather than just 4:

```ts
type CrewTier = 'ready' | 'needsWork' | 'leveling';

function getCrewTier(crew: CrewMember, items: OwnedItem[]): CrewTier | null {
  if (isImmortalized(crew)) return null;               // excluded entirely
  if (crew.rarity < crew.max_rarity) return 'leveling';
  return isReadyToImmortalize(crew, items) ? 'ready' : 'needsWork';
}
```

**No new business logic was needed for this.** `isImmortalized` and
`isReadyToImmortalize` (`crew/getters.ts`) already check
`crew.rarity === crew.max_rarity` generically — they were never
hardcoded to 4. The two existing "4/4" pages just happen to be the only
place today that pre-filters to `max_rarity === 4` before applying them.
`getCrewTier` is a three-line wrapper that applies the same predicates
across the whole roster instead.

Verified against the real sample (`example-data.json`, 597 crew):
`leveling: 413, ready: 10, needsWork: 43, excluded (Immortalized): 131`.
Broken down by `max_rarity`: `5/leveling: 304`, `4/ready: 10`,
`4/leveling: 103`, `4/needsWork: 42`, `2/leveling: 5`, `3/leveling: 1`,
and one real edge case confirming the generalization works beyond 4/5 —
**`1/needsWork: 1`**, a crew at its max rarity of 1 that isn't yet
level-100/fully-equipped. No `5/ready` or `5/needsWork` crew exist in the
current sample (all 131 currently-Immortalized crew happen to be 5/5),
but the logic is verified generic and will correctly classify one the
moment such a crew exists — this page doesn't special-case 5 the way the
existing pages special-case 4.

`null` (Immortalized) is excluded outright — consistent with every
existing page, none of which ever display already-Immortalized crew.

## Sorting

Two new single-key comparators added to `crew/sorters.ts`, composed with
the three that already exist — no new sorting architecture:

```ts
const TIER_ORDER: Record<CrewTier, number> = { ready: 0, needsWork: 1, leveling: 2 };

function byTierAsc(items: OwnedItem[]): Comparator<CrewMember> {
  return (a, b) => TIER_ORDER[getCrewTier(a, items)!] - TIER_ORDER[getCrewTier(b, items)!];
}

function byMaxRarityDesc(a: CrewMember, b: CrewMember): number {
  return b.max_rarity - a.max_rarity;
}
```

Full priority for a collection's crew list:
`byTierAsc(items), byMaxRarityDesc, byLevelDesc, byEquipmentSlotsRemainingDesc, byNameAsc`
— ready crew first (highest `max_rarity` first), then needs-work crew
(same), then leveling crew (same), ties broken by level, then equipment
completeness, then name.

**Verified against a real example** — the "Fully Functional" collection
(8 qualifying crew) sorts to exactly this order:

```
4/4 ready       Dr. Brown        (lvl 100, slots -1)
4/4 needsWork   Lal              (lvl 50,  slots -2)
1/5 leveling    The One, Lore    (lvl 100, slots  0)
1/5 leveling    2024 Picard      (lvl 20,  slots -1)
1/5 leveling    Age of Sail Data (lvl 20,  slots -1)
1/5 leveling    Ilia Probe       (lvl 20,  slots -1)
2/5 leveling    Fred             (lvl 10,  slots -2)
2/4 leveling    Friar Tuck Data  (lvl 30,  slots -1)
```

(Ready and needs-work both happened to be `max_rarity` 4 here since no
5/5 example exists in the sample; the leveling group correctly puts all
four `max_rarity`-5 crew before the one `max_rarity`-4 crew, with level,
then slots, then name breaking remaining ties.)

## Reverse-direction getter

New function in `collections/getters.ts` — the exact function the
earlier Collections-count feature's design anticipated and built
`crewBelongsToCollection` to support without new matching logic:

```ts
function getCollectionCrew(collection: Collection, crewList: CrewMember[], items: OwnedItem[]): CrewMember[] {
  const qualifying = crewList.filter(
    (crew) => crewBelongsToCollection(crew, collection) && getCrewTier(crew, items) !== null
  );
  return sortCrew(
    qualifying,
    combineComparators(byTierAsc(items), byMaxRarityDesc, byLevelDesc, byEquipmentSlotsRemainingDesc, byNameAsc)
  );
}
```

Collections themselves are sorted alphabetically by name before being
handed to the table. Verified: only 1 of the 88 sample collections has
zero qualifying crew, and the largest has 119 — no pagination/truncation
needed at this scale.

## Components and page

- **`client/src/collections/CollectionsTable.tsx`** (new) — mirrors
  `CrewTable`'s role for this page. Takes `collections: Collection[]`,
  `crew: CrewMember[]`, `items: OwnedItem[]`. Renders one summary
  `TableRow` per collection — name, qualifying-crew count, an
  expand/collapse `IconButton` — followed by a second `TableRow`
  containing `<Collapse in={expanded}>` wrapping that collection's crew
  list, spanning the table's full width. This is MUI's standard
  "collapsible table row" recipe (a `TableRow` pair per item, the second
  holding the `Collapse`), chosen over an `Accordion`-based list because
  it reads as an actual table with expandable rows, matching what was
  asked for. Per-row expanded state is local (`useState` holding the set
  of expanded collection ids), **initialized to all rows expanded**.
- **`client/src/collections/CollectionCrewList.tsx`** (new) —
  presentational only. Takes one collection's already-sorted qualifying
  crew and renders each as: `StarRating` + name + level + items-to-equip,
  as lightweight list rows (not a nested `<Table>` with its own header —
  it's one repeating record shape, not a grid needing column headers).
  A `tier === 'ready'` crew gets its name **bold**, plus a small MUI
  `Chip` reading "Ready" next to it.
- **`client/src/pages/CollectionsPage.tsx`** (new) — same
  `usePlayerData()` + loading/error/empty-state/title scaffolding every
  other page already uses. Fetches `getCrewList`, `getOwnedItems`,
  `getCollectionsList`, sorts collections alphabetically, passes
  everything to `CollectionsTable`.
- **Route/nav:** new path `/collections`, nav label "Collections," added
  to both `NAV_ITEMS` (`AppLayout.tsx`) and `<Routes>` (`App.tsx`) — the
  existing hand-synced-lists pattern (a known, not-yet-addressed
  deferred issue; unaffected by this feature).

## Error handling / edge cases

- A collection with `traits: []` and `extra_crew: []` (none currently
  exist, but not assumed) simply produces zero qualifying crew — the same
  empty-state row as any other collection with no matches, no special
  case needed.
- Crew belonging to zero collections never appear in any row — a natural
  consequence of the filter, nothing to guard.
- No pagination/truncation — YAGNI, confirmed unnecessary at the real
  data's scale (max 119 qualifying crew for one collection).
- Whole-page empty state (no collections at all) follows the same
  "loaded but empty" `Typography` pattern every other page uses.
- No new defensive guards needed beyond what already exists in
  `getCollectionsList`, `crewBelongsToCollection`, `isImmortalized`, and
  `isReadyToImmortalize` — this feature only composes already-guarded
  functions; it introduces no new raw-JSON field access.

## Verification plan

Same throwaway-script-against-real-data pattern as every prior feature:
a `client/src/collections/__verify.ts`, run via `npx tsx`, deleted before
committing, confirming:
- The tier-count breakdown above (`leveling: 413, ready: 10,
  needsWork: 43`, 131 excluded), including the `1/needsWork: 1` edge case.
- The "Fully Functional" collection's `getCollectionCrew` result matches
  the 8-crew order shown above, exactly.
- Alphabetical collection ordering, and that a collection's row count
  matches `getCollectionCrew(...).length` for a couple of spot-checked
  collections.
