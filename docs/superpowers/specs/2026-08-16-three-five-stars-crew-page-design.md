# "3/5 Stars Crew" page + modular "Uniquely Retrievable" column — Design

**Date:** 2026-08-16
**Status:** Approved

## Problem

The user wants a new Crew nav page, "3/5 Stars Crew" — crew at rarity=3,
max_rarity=5 — matching the existing family of rarity-locked crew pages
("3/4 Stars crew", "4/5 Stars crew"). It should also carry a new
"Uniquely Retrievable" column as its last column, showing whether each
crew member's archetype is datacore's "Yes (Uniquely Retrievable)"
retrieval status — but built as a reusable, opt-in column any other
`CrewTable`-based page could add later, not something specific to this
one page.

## Prior investigation (same session, immediately before this feature)

Confirmed via a shallow clone of `stt-datacore/website` and a direct fetch
of the live `https://datacore.app/structured/crew.json` (the exact URL
this app's server already fetches for the crew catalog):

- `printPortalStatus()` (`src/utils/crewutils.ts`) is the source of the
  four-state string. The user's target boolean —
  "Yes (Uniquely Retrievable)" — is exactly:
  ```
  isUniquelyRetrievable = crew.in_portal && (crew.unique_polestar_combos?.length ?? 0) > 0
  ```
- Verified against all 4 of the user's example crew (live upstream data):
  Countess Regina Bartholomew (`in_portal: true`, 3 combos → true), Lt.
  Commander Spock (`in_portal: true`, 0 combos → false, "< 100%
  Retrieval"), Determined Worf (`in_portal: false`, `obtained:
  "BossBattle"` → "Never"), Beach Day Spock (`in_portal: false`,
  `obtained: "Mega"` → "No (Mega)"). All 4 match exactly.
- **Both fields (`in_portal`, `unique_polestar_combos`) live in the same
  `crew.json` this app's server already fetches** — no new upstream call
  needed, just widen what `catalogClient.ts` extracts from the response
  it already gets.
- **Coverage: 1302/1302 (100%)** of the user's real owned+frozen
  `archetype_id`s resolved in the live catalog data.

## Real-data verification for this specific feature

Confirmed against `server/data/player-cache.json`: exactly **5** owned
crew currently have rarity=3, max_rarity=5 — matching what "3/5 Stars
Crew" will show:

| Crew | `in_portal` | combos | Uniquely Retrievable |
|---|---|---|---|
| Holo-Engineer Zimmerman | true | 9 | **Yes** |
| Lt. Commander Spock | true | 0 | No |
| Minooki Freeman | true | 17 | **Yes** |
| Countess Regina Bartholomew | true | 3 | **Yes** |
| Determined Worf | false | — | No |

## Design

### 1. New page: `client/src/pages/ThreeFiveStarsCrewPage.tsx`

Title/nav label "3/5 Stars Crew", positioned in `routes.tsx`'s Crew group
immediately after "5 Stars Crew" (before "3/4 Stars crew"). Filter:
`filterByRarity(crew, { rarity: 3, maxRarity: 5 })` — the same existing
function `ThreeFourStarsCrewPage`/`FourFiveStarsCrewPage` already use, no
new filter needed.

**Sort: `defaultCrewComparator`** (Level desc, Items-to-equip desc,
Collections-count desc, Name asc) — matching the two other rarity-locked
sibling pages, not "5 Stars Crew"'s own comparator (which swaps the
Collections-count tiebreak for a Rarity tiebreak that varies on that page
but would always be a no-op tie here, since every row on this new page
shares rarity=3). Confirmed with the user during brainstorming — this was
an explicit choice, not an oversight.

**Columns: same as "5 Stars Crew"** — `CrewTable` with
`showCollectionsNames={true}` (# / Image / Stars / Name / Level / Items to
equip / Total collections / Collections names), **plus the new "Uniquely
Retrievable" column as the last column** (see below).

**Catalog gating:** uses `usePageData(catalogLoading)` (the existing hook
parameter, same mechanism `FrozenCrewPage` already uses) so the whole page
waits for both player data and catalog before rendering rows — the
Uniquely Retrievable column can never show a transiently-wrong value. On a
catalog **error** (not loading), the page still renders with real crew
rows — the Uniquely Retrievable column shows `"Unavailable"` per cell
instead of Yes/No, matching the Overview page's existing catalog-error
convention (`CircularProgress`/`'Unavailable'` inline, never blocking the
rest of the page).

### 2. Server: widen what the catalog client extracts (no new upstream call)

`server/src/catalogClient.ts` already fetches
`https://datacore.app/structured/crew.json` in full — `RawCatalogEntry`
gains one more field:

```ts
interface RawCatalogEntry {
  // ...existing fields...
  unique_polestar_combos?: string[][];
}
```

`CatalogEntry` gains a **precomputed boolean**, not the raw array — keeps
the cache lean (matches this project's existing "type only what's used"
discipline, already applied to `data_score`):

```ts
export interface CatalogEntry {
  // ...existing fields...
  uniquely_retrievable: boolean;
}
```

Computed in `fetchCrewCatalog()`'s mapping step:
`e.in_portal && (e.unique_polestar_combos?.length ?? 0) > 0`.

### 3. Client: mirror the type, add a getter

`client/src/types/catalogEntry.ts` mirrors the same `uniquely_retrievable:
boolean` field. New function in `client/src/catalog/getters.ts`:

```ts
export function getUniquelyRetrievableArchetypeIds(catalog: CatalogEntry[]): Set<number> {
  if (!Array.isArray(catalog)) return new Set();
  return new Set(catalog.filter((c) => c.uniquely_retrievable).map((c) => c.archetype_id));
}
```

Same style as the existing `getArchetypeMaxRarityMap`.

### 4. `CrewTable.tsx`: one new optional prop, opt-in per page

```ts
export interface CrewTableProps {
  crew: CrewMember[];
  collections: Collection[];
  showCollectionsNames: boolean;
  uniquelyRetrievableArchetypeIds?: Set<number>; // new
}
```

Deliberately **optional**, unlike `showCollectionsNames` (required today)
— presence of the prop renders the new last column (header "Uniquely
Retrievable", cell `crew.archetype_id` looked up in the Set → `"Yes"`/`"No"`);
absence (every existing caller, unchanged) renders nothing extra. This
means the other 5 pages using `CrewTable` need zero changes for this
feature, and enabling the column on any of them later is a one-line prop
addition at that page's `<CrewTable ... />` call site — the "modular,
reusable" requirement the user explicitly asked for.

`TablePaginationFooter`'s `colSpan` becomes conditional on both existing
and new toggles: `(showCollectionsNames ? 8 : 7) + (uniquelyRetrievableArchetypeIds ? 1 : 0)`.

## Non-goals

- No change to the other 5 existing `CrewTable`-consuming pages — the new
  column stays off for them, per the "modular, opt-in" design; the user
  said they'd decide separately where else (if anywhere) to enable it.
- No change to the four-state datacore string ("Never", "No (Mega)",
  etc.) — only the boolean the user explicitly asked for.
- No new upstream fetch, no new caching mechanism — reuses the existing
  `/api/crew-catalog` cache/TTL infrastructure unchanged.

## Verification plan

- A throwaway script against the real, live-refreshed
  `server/data/player-cache.json` + a freshly-refreshed
  `server/data/crew-catalog-cache.json` (the cache must be refreshed to
  pick up the new `uniquely_retrievable` field — a stale cache predating
  this feature won't have it) independently re-derives the 5-row table
  above and confirms each Yes/No matches.
- Real-browser check against the running dev server: the Crew nav flyout
  shows "3/5 Stars Crew" directly under "5 Stars Crew"; the page renders
  exactly the 5 real rows above, in the sorted order `defaultCrewComparator`
  produces, with the "Uniquely Retrievable" column reading the correct
  Yes/No per row; confirm the other 5 `CrewTable`-based pages are
  visually unaffected (no stray extra column).
