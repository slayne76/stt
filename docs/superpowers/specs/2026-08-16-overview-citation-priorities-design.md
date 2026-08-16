# Overview page: "Priorities (Original Algorithm)" & "Priorities (Beta Tachyon)" tables — Design

**Date:** 2026-08-16
**Status:** Approved

## Problem

datacore.app's Citation Optimized page (`/cite-opt/`) has two engines —
"Original Algorithm" and "Beta Tachyon Pulse (Experimental)" — that each
rank the user's owned crew by citation priority (who to level up/equip/cite
next). The user wants the same two rankings surfaced directly on STT
Tracker's Overview page as two new tables, capped with a specific
"keep-but-don't-count" cutoff rule (below), without having to open
datacore.app and wait for it to compute the list in the browser.

## Investigation

Cloned `https://github.com/stt-datacore/website` (MIT licensed) into a
scratchpad and traced `/cite-opt/` end to end:

- **No hidden backend endpoint.** Both engines are pure client-side
  computation, run in a Web Worker in the browser:
  - "Original Algorithm" → `Optimizer.assessCrewRoster(...)` chain in
    `src/workers/optimizer.js` (~914 lines), message type `citeOptimizer`.
  - "Beta Tachyon Pulse" → `BetaTachyon.scanCrew(config)` in
    `src/workers/betatachyon.ts` (~645 lines), message type `ironywrit`.
  - Neither touches `window`/`document`/`fetch` — confirmed by grep — so
    both are portable to Node as-is.
- **Both output a `crewToCite: PlayerCrew[]` array, already sorted**
  (best-first) — this is the exact list to render, before any cutoff is
  applied. Confirmed the final `.sort()` call in each worker and that
  `crewToCite` filters to `rarity !== max_rarity` (i.e. only crew that
  aren't already at max rarity — crew with `max_rarity === 1` never
  qualify, no separate rarity-scope filter is needed).
- **Every input is a public static JSON file**, same pattern already used
  for the crew catalog (`GET https://datacore.app/structured/<name>.json`):
  confirmed `crew.json` (200 OK, already fetched today but only a lean
  subset of its fields is cached — the full raw entry additionally has
  `base_skills`, `skill_data`, `ranks`, `collection_ids`,
  `unique_polestar_combos`, etc., which these algorithms read), `items.json`
  (200 OK, not currently fetched — needed by Beta Tachyon Pulse for
  equipment-demand scoring), `collections.json` (200 OK, not currently
  fetched — needed by Beta Tachyon Pulse for collection-bonus scoring).
- **`buffConfig`** (per-player stat multiplier table both algorithms need)
  is derived purely from fields already present in the player's own data
  export — `calculateBuffConfig()` in `src/utils/voyageutils.ts` reads only
  `crew_collection_buffs`, `starbase_buffs`, `captains_bridge_buffs` off
  `playerData.player.character`. No extra fetch — `server/data/player-cache.json`
  already has this.
- Confirmed `LICENSE` is MIT — porting is legally clean; the port will
  carry a comment crediting the upstream source/license.

## Design

### 1. Candidate roster

Both engines run over the user's owned crew, **excluding buyback-state
crew** (`in_buy_back_state`) — same established convention as every other
table (Gauntlet, Missing Favorite Flag, duplicate-crew pages). This
exclusion happens server-side, before the ported algorithm runs, so
buyback-state crew never appear in either engine's output at all. Any
`max_rarity` 2–5 qualifies (no 5★ restriction, per the user's choice) — in
practice enforced by the algorithms' own `rarity !== max_rarity` filter,
not a separate STT Tracker filter.

### 2. The cutoff rule (client-side, shared by both new tables)

Applied identically and independently to each engine's own ranked
`crewToCite` output. Restated precisely from the user's worked example:

> Walk the ranked list in order, keeping every row. A row **counts** toward
> the limit unless it's already fully leveled and equipped (`level === 100`
> and 0 equipment slots missing). Stop immediately after the 5th counted
> row — later "kept but not counted" rows are never pulled in past that
> point, and everything after the cutoff (counted or not) is dropped, not
> merely hidden.

```ts
// client/src/crew/priorityCutoff.ts
const PRIORITY_COUNT_LIMIT = 5;

// A row "counts" toward the limit unless it's already fully leveled and
// equipped — level 100 with 0 equipment slots missing. Matches the user's
// worked example: "lvl 100 -0" rows are kept in the output but don't
// advance the counter that decides where the list stops.
function countsTowardLimit(crew: CrewMember): boolean {
  return crew.level < 100 || getEquipmentSlotsRemaining(crew) < 0;
}

export function applyPriorityCutoff(
  rankedCrew: CrewMember[],
  limit: number = PRIORITY_COUNT_LIMIT
): CrewMember[] {
  const result: CrewMember[] = [];
  let counted = 0;
  for (const crew of rankedCrew) {
    result.push(crew);
    if (countsTowardLimit(crew)) {
      counted += 1;
      if (counted >= limit) break;
    }
  }
  return result;
}
```

`getEquipmentSlotsRemaining` is always ≤ 0 (0, or negative = that many
slots missing) — see `client/src/crew/getters.ts:25` — so `< 0` and `!== 0`
are equivalent here; written as `< 0` to match the existing convention used
by `filterGauntletPriority`. This function is a **stopping-count**, not a
filter — deliberately not named or shaped like `filterGauntletPriority`
even though the boolean expression is textually identical, since the two
serve different purposes (one removes rows, this one only decides where to
truncate an already-complete ranking).

Manually traced against the user's 14-row worked example: rows 1,3,4,7,8,10
kept-not-counted; rows 2,5,6,9,11 counted (reaching the limit at row 11);
row 11 included, row 12 onward dropped. Matches exactly.

### 3. Data architecture — server-side, cached

New server modules, mirroring the existing `catalogClient.ts`/`catalogCache.ts`
split (one fetch-and-shape module + one file-cache module per upstream
dataset, same 24h TTL, same "cache absent/old-shape → refetch live" guard):

- `citationCrewClient.ts` / `citationCrewCache.ts` — fetches
  `crew.json` a second time (independent of the lean `CatalogEntry` cache)
  and keeps only the fields the ported algorithms actually read
  (`base_skills`, `skill_data`, `ranks`, `collection_ids`,
  `unique_polestar_combos`, etc.). Kept **deliberately separate** from
  `CatalogEntry`/`catalogCache.ts` rather than widening that shared type —
  `CatalogEntry` is consumed by 8 other `CrewTable`-driven pages/sections
  that have no use for this much extra weight per entry.
- `collectionsClient.ts` / `collectionsCache.ts` — fetches and caches
  `collections.json`.
- **No `items.json` client/cache.** This design originally called for one
  (to feed Beta Tachyon Pulse's `coreItems`), but the port established that
  upstream's quipment block — the only consumer — is dead code at the pinned
  commit (see `betaTachyonPulse.ts` adaptation note 5). Rather than keep a
  32MB fetch/cache/parse pipeline alive for a provably unread argument, the
  parameter and both modules were dropped in the final-review fix round.
- `citation/originalAlgorithm.ts` — faithful port of `optimizer.js`.
- `citation/betaTachyonPulse.ts` — faithful port of `betatachyon.ts`, always
  invoked with datacore's own `DefaultBetaTachyonSettings` (no
  user-facing settings in STT Tracker).
- `citation/buffConfig.ts` — port of `calculateBuffConfig()`, reading the
  three buff arrays straight off the already-loaded player data.
- `citation/computeCitationPriorities.ts` — orchestrator: reads
  `player-cache.json` (only when its memoized response is stale — see
  below), reads the two new caches above, folds frozen crew
  (`stored_immortals`, plus `c_stored_immortals` when upstream supplies it)
  into the roster, excludes buyback-state crew, runs both ported algorithms,
  and returns both ranked `crewToCite` lists as **owned-crew instance
  `id`s** (not full crew objects — the client already has full player crew
  data loaded; sending only `id`s avoids a duplicate, larger payload and
  keeps the player-data fetch the single source of truth, same principle
  `getGauntletRankMap` already follows for the catalog).
- `routes/citationPriorities.ts` — `GET /api/citation-priorities` → calls
  the orchestrator, returns:

  ```ts
  interface CitationPrioritiesResponse {
    originalAlgorithm: number[]; // owned crew `id`s, ranked best-first, capped to top 100
    betaTachyon: number[];
  }
  ```

  The top-100 cap is a safety bound on payload size, **not** the user-facing
  cutoff — the real cutoff (§2) runs client-side against whichever prefix
  it needs, which in practice will be far smaller than 100.

**Result freshness:** the two supporting datasets (`crew.json` subset,
`collections.json`) are cached with the same 24h TTL as the existing catalog
cache — they change roughly as often as datacore regenerates its own data.
This design originally called for recomputing the ranked lists on **every
request**, treating in-process computation as cheap and deferring
memoization as YAGNI. Measurement disproved that: the two algorithms take
~12-13s combined on the real roster. The shipped implementation therefore
memoizes the response on disk, keyed on the mtimes of **all three** files it
derives from — `player-cache.json`, `citation-crew-cache.json` and
`collections-cache.json`. A cached response is served only when all three
still match, so a result computed from superseded player data *or* from a
since-refreshed catalog/collections dataset is never served, while repeated
requests against unchanged inputs are near-instant. See §4's caveat for the
event-loop consequences of that 13s figure.

### 4. Client wiring

New hook `useCitationPriorities()` (mirrors `useCrewCatalog()`) backed by a
new `CitationPrioritiesContext`, fetching `GET /api/citation-priorities`
once and exposing `{ data, loading, error }`.

In `OverviewPage.tsx`:

```ts
const { data: citationPriorities, loading: citationLoading, error: citationError } = useCitationPriorities();

const crewById = new Map(crewList.map((c) => [c.id, c]));
const originalAlgorithmCrew = citationPriorities
  ? applyPriorityCutoff(
      citationPriorities.originalAlgorithm.map((id) => crewById.get(id)).filter((c): c is CrewMember => !!c)
    )
  : [];
const betaTachyonCrew = citationPriorities
  ? applyPriorityCutoff(
      citationPriorities.betaTachyon.map((id) => crewById.get(id)).filter((c): c is CrewMember => !!c)
    )
  : [];
```

Two new sections, positioned in this order: Player Info → **Priorities
(Gauntlet)** → **Priorities (Original Algorithm)** → **Priorities (Beta
Tachyon)** → Missing Crew recap. Same `CrewTable` component, same columns
as the Gauntlet table minus the "Rank" column (no external rank field to
show here — the table's existing `#` position column already conveys each
row's position in that engine's own ranking):

```tsx
{citationPriorities && (
  <>
    <Divider sx={{ my: 2 }} />
    <Typography variant="h5">Priorities (Original Algorithm)</Typography>
    <CrewTable crew={originalAlgorithmCrew} collections={collectionsList} showCollectionsNames={true} />
  </>
)}
{citationPriorities && (
  <>
    <Divider sx={{ my: 2 }} />
    <Typography variant="h5">Priorities (Beta Tachyon)</Typography>
    <CrewTable crew={betaTachyonCrew} collections={collectionsList} showCollectionsNames={true} />
  </>
)}
```

These two sections gate on player-data readiness (`!loading && !error &&
identity`, the same condition every other section on the page uses) **plus
their own** `citationPriorities` readiness — but not on `showCatalogData`,
so the rest of the Overview page (Player Info, Gauntlet table, Missing Crew
recap) still renders independently of a cold citation-priorities cache.
While `citationLoading` is true, each
section shows a short "Loading priorities…" placeholder rather than
staying invisible — this endpoint can take noticeably longer than the
catalog fetch on a cold cache (real algorithm computation, not just a
network fetch), so silently not rendering would read as broken rather than
loading. On `citationError`, the sections render an inline error message
(same visual treatment as the page's existing `catalogError`/`error`
alerts) rather than disappearing.

**Caveat on "renders independently" (added after the final whole-branch
review).** That independence is a *client-side* property only. The two
citation algorithms are synchronous and CPU-bound (~12-13s combined on the real
roster), so while one runs it blocks the server's single event loop and every
other request — `/api/player`, `/api/catalog` — queues behind it. Two
mitigations narrow, but do not eliminate, this: the computation is kicked off
in the background immediately after a player-data sync (`routes/player.ts`,
fire-and-forget after `writePlayerCache`), so the cost lands while the user is
already waiting on a sync rather than on the next Overview load; and a
single-flight guard in `computeCitationPriorities()` ensures concurrent
callers share one run instead of stacking two. The honest guarantee is
therefore: the rest of the page loads independently of citation-priorities
**except** in the window right after a player-data sync, when the background
precompute may still be occupying the event loop. Moving the computation to a
`worker_thread` is the real fix and remains a non-goal for this branch.

## Non-goals

- No settings UI for Beta Tachyon Pulse's tunable weights/presets — fixed
  at datacore's own defaults.
- No configurable cutoff limit — 5 is a fixed constant in
  `applyPriorityCutoff`, matching the user's exact request (same as
  `GAUNTLET_PRIORITY_LIMIT`).
- ~~No memoization of the computed result by player-data mtime — deferred
  per §3 until proven necessary.~~ **Superseded — see §3.** Real runtime
  (~12-13s combined) proved this necessary; the shipped implementation
  memoizes the response on disk, keyed on the mtimes of all three files it
  derives from.
- No change to the existing lean `CatalogEntry`/`catalogCache.ts` — the
  richer per-crew data this feature needs lives in its own, separate cache.
- No de-duplication logic beyond what "owned crew instance `id`" naturally
  gives — each owned copy of an archetype is scored and ranked
  independently, as datacore itself does.

## Open risk

Beta Tachyon Pulse's scoring function (`scoreCrew` in `betatachyon.ts`) is
a substantial weighted formula spanning ~13 different sub-scores (gauntlet
strength, voyage rank, skill-order rarity, retrieval score, quipment score,
antimatter seating, collection contribution, portal/never flags, etc.),
each pulling from different pre-computed fields on the crew object
(`ranks.scores.*`, `voyagesImproved`, `collectionsIncreased`, etc.) that
are themselves computed earlier in `scanCrew`'s ~600 lines. This is a much
larger, more intricate port than the Original Algorithm. The implementation
plan should budget real verification time here — matching the ported
output's top results against live datacore.app Beta Tachyon Pulse output,
not just trusting a line-for-line transcription — since a subtle formula
error would be easy to miss by inspection alone.

## Verification plan

- A throwaway script proves `applyPriorityCutoff` against the user's own
  14-row worked example (§2), confirming rows 1–11 are kept and rows 12+
  are dropped, with the correct counted/not-counted classification at each
  row.
- Real-browser check against the live datacore.app `/cite-opt/`: run both
  engines with default settings, record the current top ~10 results for
  each, and diff by name/order against the ported server's
  `/api/citation-priorities` response (mapped back to crew names) run
  against the same cached `player-cache.json` — expect an exact or
  near-exact match (allowing for any upstream data drift between the two
  checks, e.g. if datacore's cache refreshed between the two lookups).
- Real-browser check against the running STT Tracker dev server: `/`
  (Overview) renders both new sections in the specified order, with the
  correct titles, correct row counts per the cutoff rule, and the rest of
  the page (Gauntlet table, Missing Crew recap, etc.) is unaffected and
  does not wait on the citation-priorities fetch.
