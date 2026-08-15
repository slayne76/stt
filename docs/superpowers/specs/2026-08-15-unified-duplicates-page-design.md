# Unified "Duplicates" page — Design

**Date:** 2026-08-15
**Status:** Approved

## Problem

The app has two separate duplicate-crew pages, "4 Stars Duplicates"
(`/4-stars-duplicates`) and "5 Stars Duplicates" (`/5-stars-duplicates`),
both rendering the same shared `FrozenDuplicatesPage` component with a
different `maxRarity` prop. Both only cover `max_rarity` 4 and 5 — crew at
`max_rarity` 1, 2, or 3 are silently excluded, even though the same
"you have a frozen copy of this archetype, and also an active spare"
situation applies to them too. The user wants one unified page covering
every rarity, aggregating the two existing pages.

Additionally, each row currently represents exactly one owned crew
*instance*, not a deduplicated concept — if a player has 2+ active spare
copies of the same archetype, today's pages would (coincidentally, not by
any intentional dedup logic) tend to show them as separate rows. The user
wants one row per group of "identical" spares, with a new "Total Owned"
column showing how many collapsed into it.

## Real-data verification

Confirmed live against `server/data/player-cache.json` (fresher than
`example-data.json`, per this project's established convention): applying
the design below produces exactly **15 rows** (from 30 raw active
duplicate-candidate crew instances) — 3 at 4★ (all singletons, Total Owned
1 each — Anxious Kirk, Indignant Seven, Captain Janeway), 12 at 3★ (Total
Owned 2 or 3 each; **Tribunal Pike → 2**, matching the user's own example
exactly), 0 at 5★/2★/1★ today. Every 3★ duplicate group in the current data
happens to consist of identical fresh copies (rarity 1, level 1,
items-to-equip -4) — the "split into separate rows because progress
differs" case doesn't occur naturally in this data today, but the design
supports it per the user's explicit rule (see below).

## Design

### 1. Navigation and routing

Remove:
- `client/src/pages/FrozenDuplicatesPage.tsx` (shared component)
- `client/src/pages/FourStarsDuplicatesPage.tsx`
- `client/src/pages/FiveStarsDuplicatesPage.tsx`
- The "4 Stars Duplicates" (`/4-stars-duplicates`) and "5 Stars
  Duplicates" (`/5-stars-duplicates`) entries in `client/src/routes.tsx`'s
  `NAV_ITEMS`.

Add:
- `client/src/pages/DuplicatesPage.tsx`, nav label **"Duplicates"**, route
  `/duplicates`, in the same position in the `Crew` nav group (between
  "4/4 Stars crew" and "QPs").

### 2. Grouping logic — `getDuplicateCrewGroups`

New function in `client/src/crew/getters.ts`:

```ts
export interface DuplicateCrewGroup {
  crew: CrewMember;
  totalOwned: number;
}

function duplicateGroupKey(crew: CrewMember): string {
  return `${crew.archetype_id}|${crew.rarity}|${crew.level}|${getEquipmentSlotsRemaining(crew)}`;
}

export function getDuplicateCrewGroups(
  crew: CrewMember[],
  frozenArchetypeIds: Set<number>
): DuplicateCrewGroup[] {
  const candidates = crew.filter((c) => frozenArchetypeIds.has(c.archetype_id) && !c.in_buy_back_state);
  const groups = new Map<string, DuplicateCrewGroup>();
  for (const c of candidates) {
    const key = duplicateGroupKey(c);
    const existing = groups.get(key);
    if (existing) {
      existing.totalOwned += 1;
    } else {
      groups.set(key, { crew: c, totalOwned: 1 });
    }
  }
  return [...groups.values()];
}
```

Behavior:
- A crew instance is a **duplicate candidate** if its archetype has a
  frozen/stored copy (`getFrozenCrewArchetypeIds`, already rarity-agnostic
  — unchanged) and it is not in buyback state (`!c.in_buy_back_state`,
  matching feature 45's established exclusion). No `max_rarity` filter —
  every rarity is included, unlike today's two rarity-scoped pages.
- Candidates are grouped by **archetype + rarity + level + items-to-equip**
  (`getEquipmentSlotsRemaining`, the same value already shown in the
  "Items to equip" column) — the user's explicit rule: two owned copies of
  the same crew only collapse into one row if they match on *all four* of
  these. A 1-rarity-higher copy that's otherwise identical is a genuinely
  different row, not a rounding error — the user gave this as an explicit
  example during brainstorming (level 1 / items -4 / rarity 1 vs. the same
  crew at level 1 / items -4 / rarity 2 are two different rows).
- Each group produces one `{ crew, totalOwned }` — `crew` is any member of
  the group (doesn't matter which; see below), `totalOwned` is the group's
  size. This is exactly "the count of the duplicated (active, non-frozen,
  non-buyback) ones" the user asked for — the officially frozen/stored
  copy was never in the `crew` array to begin with, so it was never
  eligible for counting in the first place; an already-immortalized
  *active* duplicate is intentionally still counted (the user's explicit
  choice — "Total Owned" is a raw count of matching active copies,
  regardless of whether one of them happens to already be maxed).
- **Why "any member" is safe as the representative:** all four grouping
  fields (archetype, rarity, level, items-to-equip) are identical within a
  group by construction. The remaining displayed fields — `portrait`
  (image), `name`, and Collections membership — are all pure functions of
  `archetype_id`/traits (confirmed from `crewBelongsToCollection`'s
  source: it only reads `archetype_id`, `traits`, `traits_hidden`, none of
  which vary with level/rarity/equipment), so they're also guaranteed
  identical across the group. There is no field displayed on this page
  that could differ between two members of the same group.

### 3. Sorting

Groups are sorted by `max_rarity` (of the representative `crew`) descending
first — 5★ on top, 1★ on bottom, per the user's explicit ask — then by the
existing `defaultCrewComparator` (level desc, items-to-equip desc,
collections desc, name asc) as a secondary/tie-break, reusing the existing
`byMaxRarityDesc` and `combineComparators` — no new sorter function needed:

```ts
const sortedGroups = [...groups].sort((a, b) =>
  combineComparators(byMaxRarityDesc, defaultCrewComparator(collections))(a.crew, b.crew)
);
```

### 4. `DuplicatesTable.tsx` — new dedicated component

A new component, not a `CrewTable` extension — `CrewTable` operates on
`CrewMember[]` (one row per instance), and this page's rows are
`DuplicateCrewGroup[]`, a genuinely different shape. Columns:

| # | Image | Stars | Name | Level | Items to equip | Collections | Total Owned |
|---|---|---|---|---|---|---|---|

- `#`, `Image`, `Stars`, `Name`, `Level`, `Items to equip`, `Collections`
  render exactly as `CrewTable` renders them today, reading from
  `group.crew`. `Collections` is count-only (no names column) — matching
  the old duplicate pages' `showCollectionsNames={false}` style; this page
  has no toggle for it since it's no longer a shared component serving
  multiple configurations.
- **`Total Owned`** (new, last column, right-aligned) — `group.totalOwned`.
- Paginated via the existing `usePagination`/`TablePaginationFooter`
  pattern, `colSpan={8}` (8 columns total).

### 5. `DuplicatesPage.tsx`

Same shape as the page it replaces: `usePageData()`, `getCollectionsList`,
`getFrozenCrewArchetypeIds`, `getCrewList`, the new `getDuplicateCrewGroups`
+ sort above, `useSearch` over `(g) => [g.crew.name]` (unchanged search
behavior — still name-only), `PageShell` with title **"Duplicates"**,
`emptyMessage` updated to `"No duplicate crew."` (dropping "at this
rarity," which no longer applies since the page spans all rarities).

### 6. Cleanup

`filterFrozenDuplicates` (`client/src/crew/filters.ts`) is deleted — it has
exactly one call site today (`FrozenDuplicatesPage.tsx`, itself being
deleted) and its rarity-scoped, non-grouping logic is fully superseded by
`getDuplicateCrewGroups`.

## Non-goals

- No change to `CrewTable.tsx` itself — it keeps serving its existing 5
  pages unmodified.
- No change to search behavior (still name-only substring match) or to
  `getFrozenCrewArchetypeIds`/buyback-state exclusion semantics.
- No change to how Collections membership is computed.

## Verification plan

- A throwaway script against the real, live-refreshed
  `server/data/player-cache.json` independently re-derives the grouped
  rows and confirms the counts in the "Real-data verification" section
  above (15 rows, Tribunal Pike → 2, etc.) match `getDuplicateCrewGroups`'s
  actual output.
- Real-browser check against the running dev server: `/duplicates` renders
  with 5★ groups first and 1★ last (today's data only exercises
  4★-then-3★, so the check should also confirm empty rarities simply
  don't appear as empty sections — there's no per-rarity heading, just one
  flat sorted table), "Total Owned" as the last column, and at least one
  spot-checked row (Tribunal Pike, Total Owned 2) read directly from the
  DOM.
