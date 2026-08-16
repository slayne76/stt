# Overview page: "Priorities (Gauntlet)" table — Design

**Date:** 2026-08-16
**Status:** Approved

## Problem

The user wants a new Overview table surfacing which owned crew to prioritize
leveling/equipping next, ranked by their Gauntlet strength on datacore.app.
Specifically: owned 5★-max crew that are either under level 100 or missing
equipment items, sorted by the crew's Gauntlet rank (best first), capped to
the top 5.

## Investigation

The Gauntlet rank datacore.app displays as a "Gauntlet" column (`#13` etc.)
comes from `ranks.gauntletRank` on each entry of the upstream catalog
(`https://datacore.app/structured/crew.json`) — the same feed this app's
server already fetches for `CatalogEntry`. Confirmed directly against the
live upstream feed:

- All 1966 catalog entries have a `ranks.gauntletRank` value; no missing or
  null values.
- Values are the integers 1–1966 with **no duplicates** — matches the
  user's own statement that gauntlet ranks are never duplicated, so sorting
  by rank alone (no tiebreaker) is safe.
- Cross-checked by name against the user's own reported top 5 — exact
  match, both rank number and order:

  | Crew | `gauntletRank` |
  |---|---|
  | Eli Hollander | 5 |
  | Kurn | 8 |
  | Korath | 13 |
  | Primarch Ruhn | 15 |
  | Marooned Gorn | 17 |

- Ran the full candidate filter (below) against the real, live-refreshed
  `server/data/player-cache.json` joined to the live catalog feed: 221 owned
  5★-max crew are under level 100 or missing items; all 221 matched a
  catalog entry (no join misses); the top 5 by rank are exactly the five
  crew above, in that order; no duplicate `archetype_id` appears in the top
  20 (so de-duplication is a non-issue in practice, though the filter
  doesn't need to special-case it either way — each owned copy is scored
  independently by its shared archetype's rank). None of the current top
  candidates are in buyback state, so the buyback-exclusion rule below is
  currently a no-op but still the correct rule going forward.

## Design

### 1. `CatalogEntry` gains `gauntlet_rank: number`

Same pattern as `uniquely_retrievable`/`data_score`: extracted server-side
from the raw upstream `ranks.gauntletRank` field, added to `CatalogEntry` in
both `server/src/catalogClient.ts` and `client/src/types/catalogEntry.ts`
(independently declared, same shape by convention, as with every other
`CatalogEntry` field). No fallback/default needed — the raw field is always
present.

### 2. New catalog getter: `getGauntletRankMap`

`client/src/catalog/getters.ts`, alongside `getArchetypeMaxRarityMap`:

```ts
export function getGauntletRankMap(catalog: CatalogEntry[]): Map<number, number> {
  if (!Array.isArray(catalog)) return new Map();
  return new Map(catalog.map((c) => [c.archetype_id, c.gauntlet_rank]));
}
```

### 3. New filter: `filterGauntletPriority`

`client/src/crew/filters.ts`:

```ts
export function filterGauntletPriority(
  crew: CrewMember[],
  gauntletRankMap: Map<number, number>
): CrewMember[] {
  return crew.filter(
    (c) =>
      c.max_rarity === 5 &&
      !c.in_buy_back_state &&
      (c.level < 100 || getEquipmentSlotsRemaining(c) < 0) &&
      gauntletRankMap.has(c.archetype_id)
  );
}
```

Current rarity is intentionally ignored (any rarity 1–5 qualifies, only
`max_rarity` matters). Crew whose archetype has no catalog match (should
not happen in practice per the investigation above, but defensively
excluded rather than crashing) are filtered out via the `gauntletRankMap.has`
check.

### 4. New sorter: `byGauntletRankAsc`

`client/src/crew/sorters.ts`, alongside `byCollectionCountDesc`:

```ts
export function byGauntletRankAsc(gauntletRankMap: Map<number, number>): Comparator<CrewMember> {
  return (a, b) => gauntletRankMap.get(a.archetype_id)! - gauntletRankMap.get(b.archetype_id)!;
}
```

Safe to use `!` here because this comparator is only ever called on crew
already filtered by `filterGauntletPriority`, which guarantees a map hit —
same established pattern as the QP comparators' header comment in
`sorters.ts`.

In `OverviewPage.tsx`:

```ts
const GAUNTLET_PRIORITY_LIMIT = 5;
const gauntletRankMap = catalog ? getGauntletRankMap(catalog) : new Map<number, number>();
const gauntletPriorityCrew = catalog
  ? sortCrew(filterGauntletPriority(crewList, gauntletRankMap), byGauntletRankAsc(gauntletRankMap)).slice(
      0,
      GAUNTLET_PRIORITY_LIMIT
    )
  : [];
```

### 5. `CrewTable` gains a new optional "Rank" column

Same optional-prop pattern as `uniquelyRetrievableArchetypeIds` (undefined =
column hidden), but positioned **right after Name** (before Level), not
appended at the end:

```ts
export interface CrewTableProps {
  crew: CrewMember[];
  collections: Collection[];
  showCollectionsNames: boolean;
  uniquelyRetrievableArchetypeIds?: Set<number> | null;
  gauntletRankByArchetypeId?: Map<number, number>;
}
```

Header row: insert `<TableCell>Rank</TableCell>` between the `Name` and
`Level` cells, rendered only when `gauntletRankByArchetypeId !== undefined`.

Body row: insert a matching cell showing `#${rank}` (looked up by
`c.archetype_id`; falls back to `'—'` in the unreached case of a missing
entry, defensively, since the filter already guarantees a hit for this
table's actual usage).

`TablePaginationFooter`'s `colSpan` calculation gains the same
`+ (gauntletRankByArchetypeId !== undefined ? 1 : 0)` term already used for
the uniquely-retrievable column.

This is the only change to `CrewTable.tsx` — no other existing column,
prop, or consumer changes.

### 6. New Overview section, positioned right after "Player Info"

Depends on catalog data (`gauntlet_rank`), so it's gated the same way as
the existing "Missing 4 Stars (In Portal)" / Base Skill Bonus / Proficiency
Bonus block currently gated by the page's `showMissingTables` constant. That
constant is renamed to `showCatalogData` and reused for both this new
section and the existing catalog-gated block — resolving the Minor,
forward-looking note parked during feature 51's final review ("name a
repeated inline gate condition before a similar section arrives").

No search bar (fixed 5-row cap makes search low-value) and no count suffix
in the title (exact wording requested: "Priorities (Gauntlet)").

```tsx
{showCatalogData && (
  <>
    <Divider sx={{ my: 2 }} />
    <Typography variant="h5">Priorities (Gauntlet)</Typography>
    <CrewTable
      crew={gauntletPriorityCrew}
      collections={collectionsList}
      showCollectionsNames={true}
      gauntletRankByArchetypeId={gauntletRankMap}
    />
  </>
)}
```

While the catalog is still loading or errored, this section simply doesn't
render yet (matches the chosen "hide until catalog loads" behavior) — no
spinner placeholder, consistent with how "Missing 4 Stars" etc. already
behave.

## Non-goals

- No change to how Gauntlet rank is computed or displayed anywhere else in
  the app — this is a read-only display of the existing upstream value.
- No de-duplication logic for owned duplicate crew of the same archetype —
  not needed today (verified no duplicates appear in the top 20 candidates)
  and each copy is independently a valid leveling target regardless.
- No configurable limit — 5 is a fixed constant, matching the user's exact
  request.
- No pagination-specific behavior beyond what `CrewTable`'s existing
  `usePagination` already does for small lists (5 rows will not trigger
  pagination controls in practice).

## Verification plan

- A throwaway script against the real, live-refreshed
  `server/data/player-cache.json` and the live catalog feed independently
  re-derives `filterGauntletPriority` + `byGauntletRankAsc` output and
  confirms it matches the 5 real crew/ranks named above, in order.
- Real-browser check against the running dev server: `/` (Overview) renders
  "Priorities (Gauntlet)" immediately after "Player Info" (before "Missing
  Crew recap"), with a "Rank" column between Name and Level showing `#5`,
  `#8`, `#13`, `#15`, `#17` for the five real crew in that order, and the
  rest of the page (including the existing "Missing 4 Stars" sections still
  gated by the renamed `showCatalogData`) is unaffected.
