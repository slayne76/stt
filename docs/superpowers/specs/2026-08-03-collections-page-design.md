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
combo (3/4, 4/5, 4/4). This page instead classifies **every owned crew
member close to being fully immortalized** into one of three tiers,
generalizing the existing Immortalization concepts to *any* `max_rarity`
rather than just 4 — but, per an explicit correction to the first draft
of this spec, "close" is bounded: a crew must be at most **one star**
below its ceiling to appear here at all. A 1/4 or 2/4 crew (2-3 stars
short) is excluded just like an already-Immortalized crew is — only 3/4
(exactly one star short) and 4/4 (at the ceiling) qualify. Same for any
other `max_rarity`: only `max_rarity - 1` and `max_rarity` qualify.

```ts
type CrewTier = 'ready' | 'needsWork' | 'leveling';

function getCrewTier(crew: CrewMember, items: OwnedItem[]): CrewTier | null {
  if (isImmortalized(crew)) return null;                    // done, excluded
  if (crew.rarity < crew.max_rarity - 1) return null;        // too far from max, excluded
  if (crew.rarity === crew.max_rarity - 1) return 'leveling'; // exactly one star short
  return isReadyToImmortalize(crew, items) ? 'ready' : 'needsWork'; // rarity === max_rarity
}
```

**No new business logic was needed for the ready/needsWork half of
this.** `isImmortalized` and `isReadyToImmortalize` (`crew/getters.ts`)
already check `crew.rarity === crew.max_rarity` generically — they were
never hardcoded to 4. The two existing "4/4" pages just happen to be the
only place today that pre-filters to `max_rarity === 4` before applying
them. The only genuinely new rule is the `leveling` bound: exactly one
star short, not "any lower rarity."

Verified against the real sample (`example-data.json`, 597 crew):
`leveling: 58, ready: 10, needsWork: 43`, with **486 excluded** (131
already-Immortalized + 355 more than one star from their ceiling).
Compare to the first draft's rule (any `rarity < max_rarity` counted as
leveling), which had `leveling: 413` — this correction cuts the leveling
bucket by nearly 90%, which is the intended effect: this page is about
"close to done," not "everything not yet done." One real edge case
confirms the generalization still works beyond 4/5 — a crew at `1/2`
(one star short of a `max_rarity` of 2) correctly classifies as
`leveling` (see "The Neutral Zone" example below). No `5/ready` or
`5/needsWork` crew exist in the current sample (all 131
currently-Immortalized crew happen to be 5/5), but the logic is verified
generic and will correctly classify one the moment such a crew exists.

`null` (Immortalized, or too far from max) is excluded outright —
consistent with every existing page, none of which display
already-Immortalized crew, now extended to also exclude crew that
aren't "close" by this page's one-star bound.

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

**Verified against two real examples.** The collection used in the first
draft of this spec, "Fully Functional," had 8 qualifying crew under the
old (any-lower-rarity) rule; under the corrected one-star bound it drops
to 2 — the other 6 were all two or more stars from their ceiling:

```
4/4 ready       Dr. Brown   (lvl 100, slots -1)
4/4 needsWork   Lal         (lvl 50,  slots -2)
```

A collection that still exercises all three tiers under the corrected
rule, **"The Neutral Zone"** (4 qualifying crew):

```
4/4 ready       Commander Sela         (lvl 100, slots -1)
4/4 needsWork   Reclamation Narissa    (lvl 70,  slots -1)
4/4 needsWork   Zhaban                 (lvl 30,  slots -1)
1/2 leveling    Telek R'Mor            (lvl 1,   slots -4)
```

Confirms: ready first; needs-work next, sorted by level desc (70 before
30, both `max_rarity` 4); leveling last — `Telek R'Mor` at `1/2` (exactly
one star short of a `max_rarity` of 2) correctly classifies as
`leveling`, proving the rule generalizes below `max_rarity` 4 as well as
above it.

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
handed to the table. Verified under the corrected rule: 25 of the 88
sample collections now have zero qualifying crew (up from 1 under the
first draft's looser rule — expected, since the subset is deliberately
much narrower now), and the largest has 21 — no pagination/truncation
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
  data's scale (max 21 qualifying crew for one collection).
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
- The tier-count breakdown above (`leveling: 58, ready: 10,
  needsWork: 43`, 486 excluded).
- "Fully Functional" shrinks to exactly the 2 crew shown above (Dr. Brown,
  Lal) — a direct check that the one-star bound is excluding, not just
  the ready/needsWork logic.
- "The Neutral Zone" matches the 4-crew order shown above exactly,
  including `Telek R'Mor` (`1/2`) correctly landing in `leveling`.
- Alphabetical collection ordering, and that a collection's row count
  matches `getCollectionCrew(...).length` for a couple of spot-checked
  collections.
