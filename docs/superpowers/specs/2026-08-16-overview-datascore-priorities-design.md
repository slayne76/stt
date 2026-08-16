# Overview page: "Priorities (DataScore)" table + Gauntlet Rank/DataScore
columns on all Priorities tables — Design

**Date:** 2026-08-16
**Status:** Approved

## Problem

The user wants a fourth Overview "Priorities" table, ranking owned crew by
their datacore.app DataScore (already cached as `CatalogEntry.data_score`)
instead of by an algorithm's output or a Gauntlet rank. Same "keep but
don't count" cutoff rule as the two Citation Priorities tables. Alongside
it, all four Priorities tables should gain two real value columns —
DataScore and Gauntlet Rank — in a fixed order, and the existing single
"Rank" column (Gauntlet-only today) renamed to "Gauntlet Rank". The four
tables' display order on the page also changes.

## Investigation

Verified the exact candidate/sort/cutoff rule against real data before
writing any code — fetched the live catalog (`data_score` per
archetype) and joined it against the real, live `player-cache.json`
roster (excluding buyback-state and fully-immortalized crew, sorted
descending by `data_score`, walked with the existing "keep but don't
count" stopping rule): the resulting top 9 are, in order, **Critical
Strike Picard, Victorious AGIMUS, Ubiquitous Borg Queen, Chances Taken
Kirk, Assimilated Georgiou, Talos IV J.M. Colt, Commodore Bochra, Bridge
Beverly Crusher, First Officer Raffi** — an exact match to the user's own
worked example, including which "Chances Taken Kirk" copy is excluded
(the fully-immortalized one) versus which is kept-but-not-counted (the
other, level 100 but not full rarity).

Confirmed `MissingCrewTable.tsx` already renders a "DataScore" column
(`align="right"`, `c.data_score.toFixed(2)`) — the new column on
`CrewTable` reuses this exact formatting for visual consistency across
the app.

Confirmed the existing `applyPriorityCutoff()` (`client/src/crew/priorityCutoff.ts`)
needs no changes — its stopping rule ("counts toward the limit unless
`level === 100` and 0 equipment slots missing") is identical to what's
being requested again here, so this new table reuses it directly rather
than introducing a second, parallel cutoff function.

## Design

### 1. Candidate roster, sort, and cutoff

New pure functions, following the established per-table pattern
(`filterGauntletPriority`/`byGauntletRankAsc` precedent):

```ts
// client/src/crew/filters.ts
export function filterDataScorePriority(
  crew: CrewMember[],
  dataScoreMap: Map<number, number>
): CrewMember[] {
  return crew.filter(
    (c) => !c.in_buy_back_state && !isImmortalized(c) && dataScoreMap.has(c.archetype_id)
  );
}
```

`isImmortalized` is already imported into `filters.ts` (used by
`filterNeedsWork`). No `max_rarity` restriction, per the user's explicit
"don't pay attention to rarity." Frozen crew need no separate exclusion —
they're never present in `crewList` (`getCrewList` only reads
`player.character.crew`, the active roster; frozen crew live in a
separate `stored_immortals` list this page doesn't otherwise touch).

```ts
// client/src/crew/sorters.ts
export function byDataScoreDesc(dataScoreMap: Map<number, number>): Comparator<CrewMember> {
  return combineComparators(
    (a, b) => (dataScoreMap.get(b.archetype_id) ?? 0) - (dataScoreMap.get(a.archetype_id) ?? 0),
    byNameAsc
  );
}
```

Unlike `byGauntletRankAsc` (which safely uses `!` because
`filterGauntletPriority` guarantees every passed-in crew has a map
entry), this uses `?? 0` defensively since `data_score` sorts descending
— a missing value sinks to the bottom, matching the established
sort-direction-aware-fallback lesson from the Gauntlet feature. In
practice every candidate has already been filtered through
`dataScoreMap.has()` by `filterDataScorePriority`, so this is a pure
defensive fallback, never actually exercised. A trailing `byNameAsc`
tiebreak is a new, deliberate addition — the user's spec doesn't define
tie behavior, and DataScore ties are plausible (unlike Gauntlet rank,
confirmed unique) — for deterministic output rather than relying on
input-array order.

Named `byDataScoreDesc` in `crew/sorters.ts` — distinct from the
existing `byDataScoreDesc` in `catalog/sorters.ts` (which operates on
`CatalogEntry[]`, used by the Missing 4 Stars tables). No actual
collision (different modules, different call sites import each by its
own path), but flagged here since the name is intentionally reused for
the analogous concept on the crew side.

```ts
// client/src/catalog/getters.ts
export function getDataScoreMap(catalog: CatalogEntry[]): Map<number, number> {
  if (!Array.isArray(catalog)) return new Map();
  return new Map(catalog.map((c) => [c.archetype_id, c.data_score]));
}
```

Cutoff: `applyPriorityCutoff(sortCrew(filterDataScorePriority(crewList, dataScoreMap), byDataScoreDesc(dataScoreMap)))` —
existing function, existing default limit of 5, no changes.

### 2. `CrewTable` gains a "DataScore" column, and "Rank" is renamed

```ts
export interface CrewTableProps {
  crew: CrewMember[];
  collections: Collection[];
  showCollectionsNames: boolean;
  uniquelyRetrievableArchetypeIds?: Set<number> | null;
  dataScoreByArchetypeId?: Map<number, number>;
  gauntletRankByArchetypeId?: Map<number, number>;
}
```

Header row, in this exact order (Name → DataScore → Gauntlet Rank →
Level): `<TableCell>Name</TableCell>`, then conditionally
`<TableCell align="right">DataScore</TableCell>` (only when
`dataScoreByArchetypeId !== undefined`), then conditionally
`<TableCell>Gauntlet Rank</TableCell>` (renamed from "Rank"; only when
`gauntletRankByArchetypeId !== undefined`), then the existing `Level`
cell.

Body row, same order: `{c.name}`, then conditionally
`{dataScoreByArchetypeId.get(c.archetype_id)?.toFixed(2) ?? '—'}`
(matching `MissingCrewTable`'s exact formatting), then conditionally the
existing `gauntletRankLabel(...)` cell (function name unchanged, only
the header text changes).

`TablePaginationFooter`'s `colSpan` gains
`+ (dataScoreByArchetypeId !== undefined ? 1 : 0)` alongside the existing
`gauntletRankByArchetypeId` term.

This is the third optional column on `CrewTable` (after Uniquely
Retrievable and Gauntlet Rank) — same undefined-hides-it convention.
Confirmed inert for every other `CrewTable` consumer that doesn't pass it
(the other Crew nav pages, Missing Favorite Flag).

### 3. All four Priorities tables pass both new maps

`OverviewPage.tsx` computes `dataScoreMap = catalog ? getDataScoreMap(catalog) : new Map()`
once, alongside the existing `gauntletRankMap`, and both are passed to
**all four** `<CrewTable>` Priorities instances (DataScore, Original
Algorithm, Beta Tachyon, Gauntlet) — Original Algorithm and Beta Tachyon
currently pass neither prop; they gain both here, with no other change
to their existing candidate/sort/cutoff logic (server-computed, untouched
by this feature).

### 4. New section + reordered page

New "Priorities (DataScore)" section, gated on `showCatalogData` (same
gate as Gauntlet — DataScore is catalog data, not citation-priorities
API data):

```tsx
{showCatalogData && (
  <>
    <Divider sx={{ my: 2 }} />
    <Typography variant="h5">Priorities (DataScore)</Typography>
    <CrewTable
      crew={dataScorePriorityCrew}
      collections={collectionsList}
      showCollectionsNames={true}
      dataScoreByArchetypeId={dataScoreMap}
      gauntletRankByArchetypeId={gauntletRankMap}
    />
  </>
)}
```

Page order (all still after "Player Info", before "Missing Crew recap"):
**Priorities (DataScore) → Priorities (Original Algorithm) → Priorities
(Beta Tachyon) → Priorities (Gauntlet)** — the existing three sections'
JSX blocks are reordered, not just the new one inserted; no change to
each section's own gating logic.

## Non-goals

- No change to Original Algorithm/Beta Tachyon/Gauntlet's own candidate
  filtering, sorting, or server-side logic — this feature only adds
  display columns to their existing output and reorders sections.
- No configurable limit — reuses `applyPriorityCutoff`'s existing fixed
  default of 5.
- No new upstream fetch — `data_score` is already cached in
  `CatalogEntry` (added well before this feature).

## Verification plan

- A throwaway script re-derives the exact filter→sort→cutoff pipeline
  against the real, live catalog and the real `player-cache.json`,
  confirming the 9-row real-data match recorded in the Investigation
  section above.
- Real-browser check: `/` (Overview) renders all four Priorities tables
  in the new order, each showing DataScore and "Gauntlet Rank" columns
  (in that order, right after Name) with correct values; the other 8
  `CrewTable` consumers are visually unaffected (no new columns appear
  where the props aren't passed).
