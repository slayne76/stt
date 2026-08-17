# Overview page: bold crew names eligible for the Priorities counter — Design

**Date:** 2026-08-17
**Status:** Approved

## Problem

The Overview page's four "Priorities" tables (DataScore, Original
Algorithm, Beta Tachyon, Gauntlet) each list up to 5 crew that "count"
toward a cutoff — a row counts unless it's already fully done (level 100
with 0 equipment slots remaining). Rows that don't count are still shown
(e.g. a `100/0` crew member appears in the list) but don't advance the
counter, so a table can show more than 5 rows total. There's currently no
visual way to tell, at a glance, which displayed crew actually advanced
the counter and which were "free" rows.

Worked example (Priorities (Original Algorithm)): "Critical Strike
Picard" is `100/0` — already done, doesn't count, name stays normal
weight. "Jim Shimoda" is level 90 — counts toward the limit, name should
be bold. The Gauntlet table's query already excludes `100/0` crew before
this list is built, so every row there counts and every name in that
table will always render bold — confirmed as intentional/coherent with
the rule.

## Design

The eligibility rule already exists as a private, unexported function in
`client/src/crew/priorityCutoff.ts`:

```ts
function countsTowardLimit(crew: CrewMember): boolean {
  return crew.level < 100 || getEquipmentSlotsRemaining(crew) < 0;
}
```

This is exactly the "eligible for increasing the counter" rule described
above. Rather than duplicate this logic anywhere, export it under a
clearer public name so `CrewTable` can reuse it directly:

```ts
export function isPriorityCountEligible(crew: CrewMember): boolean {
  return crew.level < 100 || getEquipmentSlotsRemaining(crew) < 0;
}
```

(`applyPriorityCutoff`'s internal call site is updated to use the new
exported name; no behavior change there.)

`CrewTable` (`client/src/crew/CrewTable.tsx`) — shared by the four
Priorities tables and by several other pages (Four/Five-Star crew pages,
Missing Favorite Flag, etc.) where this bolding must **not** apply — gets
one new optional prop:

```ts
export interface CrewTableProps {
  // ...existing props...
  boldEligibleNames?: boolean;
}
```

Default `undefined` (falsy) preserves today's rendering everywhere the
prop isn't passed. When `true`, each row's Name cell computes
`isPriorityCountEligible(c)` and, when true, renders the crew's name (only
the name — not the whole row, not the star rating or other cells) with
`fontWeight: 'bold'` via a `<Typography>`/`sx` wrapper (matching the bold
technique already used elsewhere in this app, e.g.
`CollectionCrewList.tsx`'s `isReady` bold-name treatment).

`OverviewPage.tsx` passes `boldEligibleNames={true}` on exactly the four
Priorities `<CrewTable>` call sites (DataScore, Original Algorithm, Beta
Tachyon, Gauntlet). No other `<CrewTable>` call site in the app is
touched, so no other page's rendering changes.

## Non-goals

- No change to `applyPriorityCutoff`'s cutoff behavior, the 5-row limit,
  or which crew appear in any of the four tables — this is a pure
  presentational addition (bold or not) to rows already being shown.
- No change to any other column (Level, Items to equip, DataScore,
  Gauntlet Rank, etc.) or to row background/striping.
- No change to `CrewTable`'s other 8+ call sites (Four/Five-Star crew
  pages, Missing Favorite Flag, etc.) — `boldEligibleNames` stays unset
  (falsy) there, so their rendering is byte-for-byte unchanged.
- No new prop threading beyond the one boolean — `CrewTable` computes
  eligibility itself from the crew object it already receives; no new
  data needs to reach it from `OverviewPage`.

## Verification plan

- `tsc --noEmit` clean.
- Real-browser check against `/` (Overview page) with real player data:
  confirm "Critical Strike Picard" (`100/0`) renders with a normal-weight
  name in Priorities (Original Algorithm), and "Jim Shimoda" (level 90)
  renders bold, in the same table. Spot-check the DataScore and Beta
  Tachyon tables similarly. Confirm every row in Priorities (Gauntlet) is
  bold. Confirm no other page's `CrewTable` (e.g. Missing Favorite Flag,
  a Four/Five-Star crew page) changed — names there stay normal weight.
