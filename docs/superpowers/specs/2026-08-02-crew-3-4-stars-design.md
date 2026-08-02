# Crew Data Helpers + "3/4 Stars crew" Section — Design

Date: 2026-08-02

## Purpose

Introduce the first slice of crew (owned character) data handling: a
reusable, purpose-grouped library of pure helper functions for getting,
filtering, and sorting crew data, and the first concrete section built on
top of it — a page listing crew members who are one rarity level short of
maxing out at `max_rarity = 4` (i.e. `rarity = 3, max_rarity = 4`), sorted
alphabetically by name. This is the first of several planned crew-focused
sections; more filtering factors and table columns will be specified
incrementally in follow-up specs.

Grounded in a real sample payload the user provided (`example-data.json`,
gitignored — contains real personal game data, never commit it). Key
findings from that sample:

- Crew data lives at `player.character.crew`, an array (597 entries in the
  sample).
- Each crew object's `id` field (numeric) is unique across the whole array
  (verified: 597 unique ids for 597 entries) — this is the correct React
  list key / identifier. `symbol` is not safe alone (2 duplicates in the
  sample).
- `rarity` and `max_rarity` are plain top-level numeric fields on each crew
  object, exactly as described by the user.
- A full sample crew object (see `example-data.json` for the untruncated
  version) includes many more fields (`skills`, `equipment`, `traits`,
  `action`, `ship_battle`, portrait/icon file references, etc.) that
  aren't needed yet — later specs will type and use them incrementally as
  new factors are requested.

## Non-goals (this spec)

- Typing or exposing crew fields beyond `id`, `symbol`, `name`,
  `short_name`, `rarity`, `max_rarity` — everything else stays untyped
  until a future spec needs it.
- Any additional table columns beyond "Name" — deferred per the user's
  explicit request to add columns later.
- A generic/reusable rarity-filter UI (dropdown, form, etc.) — this is a
  single dedicated page for one specific rarity/max_rarity combination,
  not a general crew browser.
- A server-side `/api/crew` endpoint — the existing `GET /api/player`
  payload already contains everything needed; filtering happens
  client-side (see Architecture).
- Tests / CI — still deferred per the original foundational-slice spec's
  Non-goals, unchanged here (no non-trivial logic yet that would benefit
  from a test framework more than the existing type-check/lint/manual
  verification approach).

## Architecture: shared player-data context

Today, `usePlayerData()` (`client/src/hooks/usePlayerData.ts`) both owns
the fetch effect and exposes `{ data, loading, error, refresh }`. It's
called directly inside `OverviewPage`. Adding a second page that also
calls `usePlayerData()` would trigger a second independent fetch of the
same cached payload on every navigation between pages — wasteful and it
means two independent loading/error states for what is conceptually one
piece of app-wide data.

**Change:** introduce a `PlayerDataProvider` React Context that owns the
fetch effect once, at the app root. `usePlayerData()` keeps its exact
current return shape and call signature, but its implementation becomes a
`useContext` read instead of its own `useState`/`useEffect` fetch logic.

- New file `client/src/context/PlayerDataContext.tsx`:
  - A `PlayerDataContext` (React Context, default `undefined`).
  - A `PlayerDataProvider` component that contains the fetch/state logic
    currently in `usePlayerData.ts` (mount fetch via `fetchPlayer`,
    `refresh` via `refreshPlayer`, `{ data, loading, error }` state) and
    provides `{ data, loading, error, refresh }` via the context.
- Modify `client/src/hooks/usePlayerData.ts`: replace its body with a
  `useContext(PlayerDataContext)` read that throws a clear error if called
  outside the provider (defensive — a real misuse case, not speculative).
- Modify `client/src/App.tsx`: wrap the `<BrowserRouter>`'s `<Routes>` in
  `<PlayerDataProvider>` so every route shares one fetch.
- **`OverviewPage.tsx` requires zero changes** — it already calls
  `usePlayerData()` and destructures the same shape; the refactor is
  transparent to it.

## Crew types and helpers (grouped by purpose)

New directory `client/src/crew/`, plus one new type file. Functions are
grouped by *purpose* (getters together, filters together, sorters
together) rather than by *factor* (rarity, later others) — as more
factors are added, each grouped file grows rather than the codebase
sprouting a new file per factor.

- `client/src/types/crew.ts`:
  ```ts
  export interface CrewMember {
    id: number;
    symbol: string;
    name: string;
    short_name: string;
    rarity: number;
    max_rarity: number;
  }
  ```
  Deliberately narrow — only the fields this and the previous spec's work
  actually reads. The real crew object has many more fields (see
  `example-data.json`); they're added to this interface as future specs
  need them, not speculatively now.

- `client/src/crew/getters.ts`:
  ```ts
  export function getCrewList(data: PlayerData): CrewMember[]
  ```
  Defensively extracts `data.player.character.crew`, mirroring the
  existing `extractPlayerIdentity` helper's defensive style (narrows
  `unknown` step by step, returns `[]` if the path is missing or not an
  array, rather than throwing). `PlayerData` stays the existing loose
  `Record<string, unknown>` type — no change to the existing player type,
  keeping this feature's blast radius contained to new files plus the
  context refactor above.

- `client/src/crew/filters.ts`:
  ```ts
  export function filterByRarity(
    crew: CrewMember[],
    { rarity, maxRarity }: { rarity: number; maxRarity: number }
  ): CrewMember[]
  ```
  Exact-match filter (`c.rarity === rarity && c.max_rarity === maxRarity`).
  Parameterized rather than hardcoded to `(3, 4)` so a future dedicated
  page for a different combination can reuse it without duplicating logic
  — the parameterization is the one generalization made here, directly
  motivated by the user's own framing of the criteria as a reusable
  concept ("still need 1 rarity level to max out"), not speculative
  scope creep.

- `client/src/crew/sorters.ts`:
  ```ts
  export function sortByName(crew: CrewMember[]): CrewMember[]
  ```
  Returns a new array (does not mutate the input) sorted by `name` via
  `localeCompare`.

## New route: "3/4 Stars crew"

- New file `client/src/pages/ThreeFourStarsCrewPage.tsx`, following the
  same loading/error/data-table pattern as `OverviewPage.tsx`: spinner
  while `loading`, MUI `Alert` on `error`, table only when data is present
  and neither loading nor error.
- Data pipeline inside the page: `sortByName(filterByRarity(getCrewList(data), { rarity: 3, maxRarity: 4 }))`.
- MUI `Table` with a single "Name" column, one row per crew member, keyed
  by `id` (confirmed unique).
- Route path `/3-4-stars-crew`, added to `AppLayout`'s `NAV_ITEMS` array
  (`client/src/layout/AppLayout.tsx`) alongside the existing "Overview"
  entry, nav label "3/4 Stars crew". Added as a sibling `<Route>` under the
  same `<AppLayout>` parent route in `App.tsx`.

## Housekeeping

- `example-data.json` (the real sample payload used to ground this design)
  is added to the root `.gitignore` — it contains real personal game data
  and must never be committed.

## Open questions for later specs

- Additional table columns (rarity/max_rarity display, level, traits,
  etc.) — deferred until the user specifies them.
- Additional classification factors beyond rarity — deferred, to be
  specified one at a time as the user described.
- Whether future dedicated rarity-combination pages (if any) get their own
  routes/pages (matching this spec's pattern) or consolidate into a single
  filterable crew browser — not yet decided; `filterByRarity`'s
  parameterization keeps both paths open.
