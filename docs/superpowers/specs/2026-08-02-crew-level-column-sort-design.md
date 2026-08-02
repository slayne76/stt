# 3/4 Stars crew: Level column + level/name sort — Design

Date: 2026-08-02

## Purpose

Extend the existing "3/4 Stars crew" page (`/3-4-stars-crew`) with a second
column showing each crew member's `level`, and change the sort order from
name-only to level (descending) then name (ascending) as a tie-breaker.

## Non-goals

- No changes to the rarity filter (still `rarity=3, max_rarity=4`).
- No changes to any other page.
- No generic multi-key sort utility — this is a single, purpose-built
  sorter function, consistent with the existing sorters file's style.

## Design

- `CrewMember` (`client/src/types/crew.ts`): add `level: number` — the raw
  crew object already has this field (confirmed in the original sample
  payload inspection), no defensive handling needed beyond what
  `getCrewList` already does for the array as a whole.
- `client/src/crew/sorters.ts`: add
  `sortByLevelThenName(crew: CrewMember[]): CrewMember[]`, returning a new
  array (non-mutating), sorted by `level` descending first, then `name`
  ascending (`localeCompare`) as the tie-breaker. `sortByName` stays
  unchanged (still used nowhere else currently, but not removed — no
  reason to delete a working, independently useful export).
- `client/src/pages/ThreeFourStarsCrewPage.tsx`:
  - Swap `sortByName(...)` for `sortByLevelThenName(...)` in the existing
    filter/sort composition.
  - Add a `<TableHead>` with two `<TableCell>` headers, "Name" and
    "Level" — the table gains a header now that there are two columns
    (the single-column version didn't strictly need one; two unlabeled
    columns would be confusing).
  - Add a second `<TableCell>{c.level}</TableCell>` per row.

## Open questions

None — this is fully scoped by the user's request.
