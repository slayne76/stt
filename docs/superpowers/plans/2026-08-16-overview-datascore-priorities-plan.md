# Overview page: "Priorities (DataScore)" table + Gauntlet Rank/DataScore columns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fourth Overview "Priorities" table ranking owned crew by
datacore.app DataScore, give all four Priorities tables new "DataScore"
and "Gauntlet Rank" columns (renaming the existing "Rank" column), and
reorder the four sections on the page.

**Architecture:** Pure client-side change — three new small functions
(filter/sorter/getter) mirroring the existing Gauntlet-priority pattern,
two new optional columns on the shared `CrewTable` component, and
`OverviewPage.tsx` wiring/reordering. No server changes, no new upstream
data (DataScore is already cached in `CatalogEntry`).

**Tech Stack:** unchanged — Vite/React 19/TypeScript client only.

**Design spec:** `docs/superpowers/specs/2026-08-16-overview-datascore-priorities-design.md`

## Global Constraints

- No `max_rarity` restriction on the DataScore table's candidates, per
  the user's explicit "don't pay attention to rarity."
- The DataScore table's cutoff reuses the existing
  `applyPriorityCutoff()` (`client/src/crew/priorityCutoff.ts`) exactly
  as-is — no new cutoff function, no changes to that file.
- `isImmortalized(c)` (already imported into `crew/filters.ts`) excludes
  fully-immortalized crew from the DataScore table's candidates entirely
  — this is different from `filterGauntletPriority`'s rule and must not
  be confused with it.
- All four Priorities tables (DataScore, Original Algorithm, Beta
  Tachyon, Gauntlet) end up passing both `dataScoreByArchetypeId` and
  `gauntletRankByArchetypeId` to `<CrewTable>`. No other `CrewTable`
  consumer (the other 8 pages/sections) gains either prop.
- Column order on `CrewTable`, left to right: `#, Image, Stars, Name,
  DataScore, Gauntlet Rank, Level, Items to equip, Total
  collections/Collections, [Collections names], [Uniquely Retrievable]`.
- The existing "Rank" header text becomes "Gauntlet Rank" — the prop
  name `gauntletRankByArchetypeId` and the helper function
  `gauntletRankLabel` are unchanged, only the rendered header string
  changes.
- Page order for the four Priorities sections: DataScore → Original
  Algorithm → Beta Tachyon → Gauntlet. No section's own gating condition
  (`showCatalogData` for DataScore/Gauntlet; `citationPriorities`-based
  for Original Algorithm/Beta Tachyon) changes.
- `DataScore` column values render via `.toFixed(2)`, right-aligned —
  matching `MissingCrewTable.tsx`'s existing DataScore formatting
  exactly, for visual consistency.

---

### Task 1: DataScore priority filter, sorter, and catalog getter

**Files:**
- Modify: `client/src/crew/filters.ts`
- Modify: `client/src/crew/sorters.ts`
- Modify: `client/src/catalog/getters.ts`

**Interfaces:**
- Produces: `filterDataScorePriority(crew, dataScoreMap)`,
  `byDataScoreDesc(dataScoreMap)` (crew/sorters.ts — distinct from the
  existing catalog-entry-scoped `byDataScoreDesc` in `catalog/sorters.ts`,
  no actual naming collision since they're different modules with
  different import paths, but both are named the same by design, matching
  the analogous concept), `getDataScoreMap(catalog)`
- Consumed by: Task 2's `OverviewPage.tsx` wiring

- [ ] **Step 1: Add `filterDataScorePriority` to `client/src/crew/filters.ts`**

Append (the file already imports `isImmortalized` from `./getters` for
`filterNeedsWork` — no new import needed):

```ts
export function filterDataScorePriority(
  crew: CrewMember[],
  dataScoreMap: Map<number, number>
): CrewMember[] {
  return crew.filter(
    (c) => !c.in_buy_back_state && !isImmortalized(c) && dataScoreMap.has(c.archetype_id)
  );
}
```

- [ ] **Step 2: Add `byDataScoreDesc` to `client/src/crew/sorters.ts`**

Append (the file already imports `combineComparators` and declares
`byNameAsc` above this point):

```ts
// Unlike byGauntletRankAsc (which safely uses `!` because
// filterGauntletPriority guarantees a map hit for every crew passed in),
// this uses `?? 0` defensively — data_score sorts descending, so a
// missing value sinks to the bottom rather than looking best (the
// opposite of the gauntlet_rank lesson, where `?? 0` on an ascending
// sort would have looked best). In practice this fallback is never
// exercised: filterDataScorePriority's dataScoreMap.has() guard already
// filters out any crew without a map entry before this comparator ever
// runs. A trailing byNameAsc tiebreak gives deterministic output when
// two crew share a DataScore, which — unlike gauntlet_rank, confirmed
// unique — is plausible for this field.
export function byDataScoreDesc(dataScoreMap: Map<number, number>): Comparator<CrewMember> {
  return combineComparators(
    (a, b) => (dataScoreMap.get(b.archetype_id) ?? 0) - (dataScoreMap.get(a.archetype_id) ?? 0),
    byNameAsc
  );
}
```

- [ ] **Step 3: Add `getDataScoreMap` to `client/src/catalog/getters.ts`**

Append, mirroring `getGauntletRankMap` immediately above it:

```ts
export function getDataScoreMap(catalog: CatalogEntry[]): Map<number, number> {
  if (!Array.isArray(catalog)) return new Map();
  return new Map(catalog.map((c) => [c.archetype_id, c.data_score]));
}
```

- [ ] **Step 4: Verify against real data**

Throwaway `tsx` script (not committed): fetch the live catalog, read the
real `server/data/player-cache.json`, run
`sortCrew(filterDataScorePriority(crewList, dataScoreMap), byDataScoreDesc(dataScoreMap))`
through `applyPriorityCutoff()`, and confirm the result's first 9 names,
in order, are exactly: Critical Strike Picard, Victorious AGIMUS,
Ubiquitous Borg Queen, Chances Taken Kirk, Assimilated Georgiou, Talos IV
J.M. Colt, Commodore Bochra, Bridge Beverly Crusher, First Officer Raffi
— the same real-data result recorded in the design spec's Investigation
section. Confirm the excluded "Chances Taken Kirk" copy really is the
fully-immortalized one (rarity === max_rarity, not just level 100).

- [ ] **Step 5: Commit**

```bash
git add client/src/crew/filters.ts client/src/crew/sorters.ts client/src/catalog/getters.ts
git commit -m "Add DataScore priority filter, sorter, and catalog getter"
```

---

### Task 2: `CrewTable` columns + `OverviewPage` new section and reorder

**Files:**
- Modify: `client/src/crew/CrewTable.tsx`
- Modify: `client/src/pages/OverviewPage.tsx`

**Interfaces:**
- Consumes: `filterDataScorePriority`, `byDataScoreDesc`,
  `getDataScoreMap` (Task 1); `applyPriorityCutoff` (existing, unchanged)
- Produces: `CrewTable`'s new `dataScoreByArchetypeId?: Map<number,
  number>` prop and renamed "Gauntlet Rank" header

- [ ] **Step 1: `CrewTable.tsx` — add the DataScore column, rename the Rank header**

Add to `CrewTableProps`:

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

Add a label helper alongside `gauntletRankLabel`:

```ts
function dataScoreLabel(archetypeId: number, scores: Map<number, number>): string {
  const score = scores.get(archetypeId);
  return score !== undefined ? score.toFixed(2) : '—';
}
```

Destructure the new prop in the component signature, alongside the
existing ones.

Header row — insert the DataScore cell between Name and the (renamed)
Gauntlet Rank cell:

```tsx
<TableCell>Name</TableCell>
{dataScoreByArchetypeId !== undefined && <TableCell align="right">DataScore</TableCell>}
{gauntletRankByArchetypeId !== undefined && <TableCell>Gauntlet Rank</TableCell>}
```

(This replaces the existing `<TableCell>Name</TableCell>` +
`{gauntletRankByArchetypeId !== undefined && <TableCell>Rank</TableCell>}`
pair — same conditional, just the DataScore cell inserted between them
and "Rank" renamed to "Gauntlet Rank".)

Body row — same insertion point:

```tsx
<TableCell>{c.name}</TableCell>
{dataScoreByArchetypeId !== undefined && (
  <TableCell align="right">{dataScoreLabel(c.archetype_id, dataScoreByArchetypeId)}</TableCell>
)}
{gauntletRankByArchetypeId !== undefined && (
  <TableCell>{gauntletRankLabel(c.archetype_id, gauntletRankByArchetypeId)}</TableCell>
)}
```

`TablePaginationFooter`'s `colSpan`:

```tsx
colSpan={
  (showCollectionsNames ? 8 : 7) +
  (uniquelyRetrievableArchetypeIds !== undefined ? 1 : 0) +
  (dataScoreByArchetypeId !== undefined ? 1 : 0) +
  (gauntletRankByArchetypeId !== undefined ? 1 : 0)
}
```

No other change to `CrewTable.tsx` — confirm the other 8 consumers
(every page/section that doesn't pass `dataScoreByArchetypeId`) are
unaffected by reading their call sites, not just assuming it from the
`undefined` check.

- [ ] **Step 2: `OverviewPage.tsx` — wire the new table, pass new props everywhere, reorder**

`OverviewPage.tsx` already has `import { byDataScoreDesc } from
'../catalog/sorters';` (used by the Missing 4 Stars sections). Task 1's
`crew/sorters.ts` export is also named `byDataScoreDesc` (not renamed —
per the design spec, the reused name is deliberate), so importing both
into the same file needs an alias on one of them. Add, as its own import
statement (don't merge it into the pre-existing `catalog/sorters.ts`
import line — they're different modules):

```ts
import { byDataScoreDesc as byCrewDataScoreDesc } from '../crew/sorters';
```

Also add `filterDataScorePriority` to the existing `crew/filters` import,
and `getDataScoreMap` to the existing `catalog/getters` import. Use the
aliased `byCrewDataScoreDesc` at the call site below; the unaliased
`byDataScoreDesc` keeps referring to the pre-existing `catalog/sorters.ts`
import used by the Missing 4 Stars sections, unchanged.

Add the computed values, alongside the existing `gauntletRankMap`/`gauntletPriorityCrew`:

```ts
const dataScoreMap = catalog ? getDataScoreMap(catalog) : new Map<number, number>();
const dataScorePriorityCrew = catalog
  ? applyPriorityCutoff(sortCrew(filterDataScorePriority(crewList, dataScoreMap), byCrewDataScoreDesc(dataScoreMap)))
  : [];
```

Add `dataScoreByArchetypeId={dataScoreMap}` and
`gauntletRankByArchetypeId={gauntletRankMap}` to **all four** Priorities
`<CrewTable>` elements — the existing Gauntlet table already passes
`gauntletRankByArchetypeId` (add `dataScoreByArchetypeId` to it); the
existing Original Algorithm and Beta Tachyon tables currently pass
neither (add both to each).

Reorder the four Priorities JSX blocks to: DataScore (new), Original
Algorithm, Beta Tachyon, Gauntlet (moved from first to last) — all
between the existing "Player Info" `TableContainer` and the "Missing
Crew recap" `TableContainer`, unchanged from today. The new DataScore
block:

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

No section's own gating condition changes — only which block comes
first/last in the JSX.

- [ ] **Step 3: Real-browser verification**

Per `CLAUDE.md`'s house convention (fresh `mcp__playwright__*`/
`mcp__chrome-devtools__*` session first, `playwright` npm library
fallback): start the dev server, navigate to `/`, and confirm:
1. Section order top-to-bottom is Player Info → Priorities (DataScore) →
   Priorities (Original Algorithm) → Priorities (Beta Tachyon) →
   Priorities (Gauntlet) → Missing Crew recap.
2. All four Priorities tables show "DataScore" and "Gauntlet Rank"
   columns, in that order, immediately after Name.
3. Priorities (DataScore)'s rows match Task 1's verified real-data order
   (first 9 names).
4. Any one other `CrewTable`-driven page (e.g. "5 Stars Crew") shows no
   DataScore or Gauntlet Rank column — confirming the new props are
   correctly inert when omitted.

- [ ] **Step 4: Commit**

```bash
git add client/src/crew/CrewTable.tsx client/src/pages/OverviewPage.tsx
git commit -m "Add Priorities (DataScore) table and Gauntlet Rank/DataScore columns to all Priorities tables"
```

---

## Final whole-branch review focus areas

- Confirm the two same-named `byDataScoreDesc` exports (`crew/sorters.ts`
  vs. `catalog/sorters.ts`) are correctly disambiguated wherever both are
  imported in the same file, with no accidental shadowing.
- Confirm `filterDataScorePriority`'s `!isImmortalized(c)` exclusion is
  genuinely different from `filterGauntletPriority`'s
  `(level < 100 || equipRemaining < 0)` inclusion rule, and that this
  difference is intentional (per the design spec) rather than an
  inconsistency worth flagging.
- Confirm all 8 non-Priorities `CrewTable` consumers are unaffected
  (read each call site, not just the `undefined` check in isolation).
- Re-derive the DataScore table's real-data output independently,
  cross-checked against the design spec's recorded 9-row result.
