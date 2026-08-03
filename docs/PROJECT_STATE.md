# STT Tracker — Project State

Last updated: 2026-08-03. This document is the durable, in-depth record of
what has been built, why, and how the trickier pieces of logic work. It's
meant to let a fresh session (or a fresh person) get back up to speed
without re-deriving anything from scratch. For phase-by-phase rationale,
the full spec/plan trail is in `docs/superpowers/specs/` and
`docs/superpowers/plans/`, one pair per feature, in chronological order —
this document is the synthesized summary, those are the detailed record.

## What this is

A local (single-user, run-on-your-own-machine) web app that tracks
player/character data for the game *Star Trek Timelines* (STT). It reads a
JSON payload from the game's official API (`app.startrektimelines.com`)
and presents various views over your own crew roster — which characters
you own, their rarity/level/equipment progress, and specifically which
ones are close to being fully maxed out ("Immortalized").

## Architecture

npm workspaces monorepo:

```
stt/
  server/   Node 24 + Express + TypeScript — proxies & caches the game API
  client/   Vite 8 + React 19 + TypeScript + MUI — the UI
  docs/     specs, plans, and this file
```

**Why a backend exists at all:** the game API doesn't send CORS headers,
so a browser can't call it directly. The Express server holds your session
cookie, calls the game API server-side, and caches the raw response to
disk (`server/data/player-cache.json`, gitignored). It exposes exactly two
endpoints:
- `GET /api/player` — serves the cache if present, else fetches live and
  caches it.
- `POST /api/player/refresh` — always fetches live and overwrites the
  cache.

Auth failures (expired/missing `STT_SESSION_COOKIE` in `server/.env`, or
upstream 401/403) come back as `502` with
`{ error: string, code: 'UPSTREAM_AUTH_FAILED' | 'UPSTREAM_ERROR' }` — this
is deterministic and reproducible without needing a real session cookie,
which is what let almost every feature in this project be verified
end-to-end without live credentials.

**Client-side data flow:** the *entire* raw player JSON is fetched once by
a `PlayerDataProvider` React Context at the app root
(`client/src/context/PlayerDataContext.tsx`) and shared by every page via
`usePlayerData()` (`client/src/hooks/usePlayerData.ts`, now just a
`useContext` read). Filtering/sorting/deriving happens entirely
client-side in JS — no server-side query logic, no per-view API endpoints.
This was a deliberate choice (see
`docs/superpowers/specs/2026-08-02-crew-3-4-stars-design.md`): the payload
was already being fetched whole for the Overview page, so continuing that
pattern was simpler than standing up bespoke server endpoints per view.

## Repo map (as of now)

```
client/src/
  App.tsx                       Routes + PlayerDataProvider wiring
  main.tsx                      React root
  context/PlayerDataContext.tsx Shared fetch state (data/loading/error/refresh)
  hooks/usePlayerData.ts        Thin context-read hook, same shape as before the refactor
  api/playerApi.ts              fetchPlayer/refreshPlayer, PlayerApiError
  layout/AppLayout.tsx          AppBar + Drawer nav shell
  lib/extractPlayerIdentity.ts  Overview page's player-identity extraction
  types/
    player.ts                  PlayerData = Record<string, unknown> (deliberately loose)
    crew.ts                    CrewMember interface (see below)
    item.ts                    OwnedItem interface (see below)
  crew/                         All crew-related pure logic + shared components
    getters.ts                 Data extraction + derived single-crew values
    filters.ts                 Array-in-array-out crew filtering
    sorters.ts                 Composable comparators (see "Sorting design")
    CrewTable.tsx               Shared table renderer (Name/Stars/Level/Items-to-equip)
    StarRating.tsx              Gold star icons, driven by rarity/max_rarity props
  pages/
    OverviewPage.tsx            Player identity (Player ID, DBID) — the very first page
    ThreeFourStarsCrewPage.tsx  rarity=3, max_rarity=4
    FourFiveStarsCrewPage.tsx   rarity=4, max_rarity=5
    FourFourStarsCrewReadyPage.tsx  rarity=4, max_rarity=4, "ready to immortalize"
    FourFourStarsCrewPage.tsx      rarity=4, max_rarity=4, "needs work"

server/src/
  index.ts, config.ts, errors.ts, cache.ts, sttClient.ts, routes/player.ts
```

## The crew data model (as understood from the real game payload)

Grounded against a real player export the user provided
(`example-data.json`, gitignored, never committed — contains real personal
game data; 597 crew, 897 owned items in the sample used during
development).

Path into the raw payload: `player.character.crew` (array of owned
character objects) and `player.character.items` (array of owned inventory
items). Both are accessed defensively (`getCrewList`, `getOwnedItems` in
`crew/getters.ts`) because the server returns the full untyped JSON and
nothing validates its shape at the boundary — `PlayerData` stays
`Record<string, unknown>` on purpose, and every getter walks it with
optional chaining + `Array.isArray` guards, returning `[]` rather than
throwing if a path is missing.

### `CrewMember` (the fields this app actually uses — deliberately narrow)

```ts
interface CrewMember {
  id: number;                                    // unique per owned crew instance (verified 597 unique/597)
  symbol: string;                                 // NOT safe as a unique key (2 duplicates found in sample)
  name: string;
  short_name: string;
  rarity: number;                                 // current star rating, 1..max_rarity
  max_rarity: number;                             // the crew's ceiling (1..5 typically)
  level: number;                                  // 1..100
  equipment: [number, number][];                  // FILLED slots only: [slotIndex, itemArchetypeId]
  equipment_slots: { level: number; archetype: number }[]; // ALWAYS exactly 4 entries — what's REQUIRED per slot
}
```

### `OwnedItem` (also deliberately narrow)

```ts
interface OwnedItem {
  archetype_id: number;   // matches CrewMember.equipment_slots[i].archetype
}
```

Real owned-item objects have many more fields (name, icon, rarity,
quantity, bonuses...) — only `archetype_id` is used, matching this
project's consistent "type only what you use" discipline (see
`CrewMember` itself, and `PlayerData` above).

### The equipment/slots logic — this is the part worth understanding carefully

**The core confusion this logic resolves:** a crew member always has
exactly 4 equipment slots (`equipment_slots.length === 4` held for
all 597 crew in the sample — confirmed, not assumed). `equipment` lists
only the slots that are *currently filled*, as `[slotIndex, itemId]`
pairs. So:

- `equipment: [[0,26208],[1,3903],[2,26212],[3,724]]` → all 4 filled.
- `equipment: [[0,31784]]` → only slot 0 filled, slots 1/2/3 empty.
- `equipment: []` → nothing equipped.
- Filled slot indices are **not necessarily contiguous from 0** — one real
  crew had `equipment: [[1,...],[3,...]]` (slots 0 and 2 empty). The logic
  below never assumes contiguity; it always diffs against the full
  `{0,1,2,3}` index set.

**`getEquipmentSlotsRemaining(crew)`** (`crew/getters.ts:12-14`) — the
first, simplest derived value:

```ts
return (crew.equipment?.length ?? 0) - 4;
```

Returns a value from **-4** (nothing equipped) to **0** (fully equipped).
This is an intentional sign convention the user specified explicitly —
"-4 is none equipped, 0 is all equipped" — not a bug, even though a
"positive count of missing items" convention might look more natural at a
glance. **This came up for reconsideration during the later
Stars-column/CrewTable-refactor final review, where an automated reviewer
flagged it as a likely sign-inversion bug** (suggesting `4 - length`
instead). It is not a bug — it was independently re-verified against real
data in the original equipment-slots feature (52 crew at rarity 3/max 4,
sort order confirmed `-1` before `-4` correctly), and the controller
(this session) corrected that reviewer's finding rather than "fixing" it,
because "fixing" it would have inverted the sign the user explicitly
asked for. **If a future session or reviewer flags this again, check this
document and the original spec
(`docs/superpowers/specs/2026-08-03-crew-equipment-slots-design.md`)
before touching it — it is deliberate.**

This value is displayed as the "Items to equip" table column and used as
a secondary sort key (`byEquipmentSlotsRemainingDesc` — see "Sorting
design" below).

**`getMissingEquipmentArchetypeIds(crew)`** (`crew/getters.ts:23-28`) —
the piece that figures out *which specific items* are needed, not just
*how many*:

```ts
export function getMissingEquipmentArchetypeIds(crew: CrewMember): number[] {
  const filledSlots = new Set(crew.equipment.map(([slot]) => slot));
  const missingIndices = [0, 1, 2, 3].filter((i) => !filledSlots.has(i));
  const slots = crew.equipment_slots ?? [];
  return missingIndices.map((i) => slots[i]?.archetype ?? -1);
}
```

Algorithm: build the set of filled slot indices from `equipment`'s first
tuple element → the complement against `{0,1,2,3}` is the missing slot
indices → look up each missing index in `equipment_slots` to get the
*required archetype id* for that slot. Verified against all 1760
`equipment` entries across all 597 crew in the sample: `equipment[i][1]`
(the item id actually equipped) always equals
`equipment_slots[thatSlotIndex].archetype` (the item that *should* be
there) — i.e. when a slot IS filled, it's always filled with the
"correct" archetype for that slot. This gives confidence the slot-index →
archetype mapping used for *missing* slots is the same mapping that
governs *filled* slots, not a coincidental parallel structure.

**Defensive guard (added after a final-review finding):** the
`crew.equipment_slots ?? []` and `slots[i]?.archetype ?? -1` guards were
added specifically because `getCrewList` casts unvalidated JSON to
`CrewMember[]` with zero field-level validation, and
`noUncheckedIndexedAccess` is NOT enabled in the client's `tsconfig` — so
`crew.equipment_slots[i].archetype` would have thrown a `TypeError` on any
malformed crew (and with no error boundary anywhere in the app, that would
white-screen the *entire* app, not just one table row). The fix **fails
closed**: an unresolvable slot returns the sentinel `-1` (never a real
archetype id) rather than being silently dropped from the array — dropping
would make the "all missing items owned" check below vacuously ignore that
slot's requirement, which could wrongly mark an incomplete crew as
"ready."

**`areAllMissingItemsOwned(crew, items)`** (`crew/getters.ts:30-33`):

```ts
const missingArchetypeIds = getMissingEquipmentArchetypeIds(crew);
return missingArchetypeIds.every((archetypeId) => items.some((item) => item.archetype_id === archetypeId));
```

`.every(...)` — **every** missing item must be owned, not just some.
Ownership is presence-in-array only (no `quantity` check — the real data
never had a zero-quantity entry, but this is a known, accepted latent gap,
see "Deferred issues" below).

**`isImmortalized(crew)`** (`crew/getters.ts:35-37`) — the terminal state
this whole feature is oriented around:

```ts
return crew.rarity === crew.max_rarity && crew.level === 100 && crew.equipment.length === 4;
```

Three conditions, all must hold: maxed rarity, level 100, all 4 slots
physically equipped (not just owned — *equipped*).

**`isReadyToImmortalize(crew, items)`** (`crew/getters.ts:39-46`) — "one
step away, and that step is just clicking equip, not crafting":

```ts
return (
  crew.rarity === crew.max_rarity &&
  crew.level === 100 &&
  getEquipmentSlotsRemaining(crew) < 0 &&
  areAllMissingItemsOwned(crew, items)
);
```

**The subtle design decision here:** `< 0`, not `=== -1`. Initially the
spec was written for the narrow case (exactly 1 slot missing). During spec
review the user clarified the real intent: "ready" should be defined by
**ownership completeness of whatever is missing**, not by how many slots
are missing — a crew missing all 4 slots but already owning all 4 required
items still counts as ready ("I have all conditions to do it, I'm just
choosing not to for my own reasons"). `< 0` admits any non-zero missing
count (1 to 4); `.every()` inside `areAllMissingItemsOwned` does the actual
completeness check regardless of count. `< 0` rather than `<= 0` is what
correctly excludes the already-Immortalized case (`0` missing) — that's
`isImmortalized`'s job, not this function's.

**The ready/needs-work partition** (`crew/filters.ts`):

```ts
export function filterReadyToImmortalize(crew: CrewMember[], items: OwnedItem[]): CrewMember[] {
  return crew.filter((c) => isReadyToImmortalize(c, items));
}

export function filterNeedsWork(crew: CrewMember[], items: OwnedItem[]): CrewMember[] {
  return crew.filter((c) => !isImmortalized(c) && !isReadyToImmortalize(c, items));
}
```

This partition was proven (not just tested) to be **disjoint and
exhaustive** during the final review of that feature:
- *Disjoint by construction:* being in both sets would require
  `isReadyToImmortalize && !isReadyToImmortalize` — a logical
  contradiction, impossible for any data shape.
- *Exhaustive by construction:* "in neither set" reduces algebraically to
  `isImmortalized && !isReadyToImmortalize`, and `isImmortalized` implies
  `equipment.length === 4` implies `getEquipmentSlotsRemaining() === 0`
  implies `!(< 0)` implies `!isReadyToImmortalize` — so "in neither" is
  exactly "is Immortalized," which is the intended third bucket, not a
  logic gap.
- Empirically confirmed across every populated rarity bucket in the real
  data (not just the 4/4 bucket that motivated the feature): counts always
  summed to `ready + needsWork + immortalized === total` for that bucket.
  Notably, the 4/4 bucket itself contained **zero** already-Immortalized
  crew at review time (all 131 Immortalized crew in the sample happened to
  be at 5/5), so the "exclude Immortalized" branch of `filterNeedsWork` was
  never actually exercised by that bucket alone — the reviewer caught this
  vacuous-pass risk and separately confirmed the exclusion logic against
  the 5/5 bucket (`ready=0, needsWork=0, immortalized=131`, correct).

**Known real examples used throughout development/verification** (from
`example-data.json`, at rarity 4 / max_rarity 4, level 100):
- **Verad Dax** — `equipment: [[1,1756],[2,664],[3,21712]]` (slot 0
  missing), `equipment_slots[0].archetype === 21706`, and the player owns
  an item with `archetype_id: 21706` ("Verad Dax's Outfit") → **ready**.
- **Tribble Spock** — also missing exactly 1 slot, but the required item
  is **not** owned → **not ready**, correctly falls into `needsWork` (this
  was the explicitly-resolved edge case: "level 100, missing 1 slot, item
  not owned" was ambiguous in the original request and the user confirmed
  it belongs on the "needs work" page, not a third bucket).

**A caveat worth remembering:** `getMissingEquipmentArchetypeIds` reads
`equipment_slots`, which describes the crew's *current level band*, not
necessarily its endgame band — e.g. a level-80 crew's `equipment_slots`
show levels `[70,73,76,80]`, while a level-100 crew's show `[90,93,96,99]`.
The shipped pages are unaffected (`isReadyToImmortalize` gates on
`level === 100` first, so this only ever evaluates the final band in
practice), but if a future feature calls this getter directly for a
sub-100 crew (e.g. a hypothetical "what should I craft next?" page), it
would return "what's missing in the *current* band," not "what's needed
to fully immortalize" — the function name doesn't currently signal this
distinction. Flagged in the final review as a Minor/naming concern, not
yet acted on.

## Sorting design

Started as one named function per sort combination (`sortByName`, then
`sortByLevelThenName`), and this was explicitly refactored to composable
comparators once a third sort factor arrived, specifically to stop
accumulating dead/unused named functions (`sortByName` was already unused
by the time it was noticed). Current design, entirely in
`crew/sorters.ts`:

```ts
type Comparator<T> = (a: T, b: T) => number;
combineComparators<T>(...comparators): Comparator<T>   // short-circuits on first non-zero
byLevelDesc, byEquipmentSlotsRemainingDesc, byNameAsc    // single-key comparators
sortCrew(crew, comparator): CrewMember[]                 // non-mutating apply
```

Every page composes the same three-key order:
`combineComparators(byLevelDesc, byEquipmentSlotsRemainingDesc, byNameAsc)`
— level first (highest first), then equipment-completeness (closer to
done first), then name (alphabetical) as the final tiebreaker.

## The shared rendering layer

`CrewTable` (`crew/CrewTable.tsx`) and `StarRating` (`crew/StarRating.tsx`)
were extracted specifically so a second/third/fourth rarity-based page
could reuse table rendering without copy-pasting JSX. This was explicitly
validated, not just assumed: when the 4/5 Stars page was added, `git`
confirmed **byte-identical blob hashes** for `CrewTable.tsx`,
`StarRating.tsx`, and all three crew helper files between before and after
— literally zero lines touched to add the second page. `StarRating` is
driven entirely by each row's own `rarity`/`max_rarity` props (not a
page-level constant), so it renders correctly for any combination without
modification.

**Column set is intentionally fixed** (`#`, `Stars`, `Name`, `Level`,
`Items to equip`) — no configurable-columns API was built, on the
reasoning that with only 2-4 real consumers, a column-config system would
be speculative generality nobody has asked for yet.

## Feature history (chronological)

Each entry has a paired spec (`docs/superpowers/specs/`) and plan
(`docs/superpowers/plans/`) with the same date/topic — specs explain the
"why," plans have the literal code that was written.

1. **Foundational slice** (`2026-08-02-stt-tracker-overview`) — monorepo
   scaffolding, Express proxy/cache server, Overview page (Player ID /
   DBID key-value table). First-ever exercise of the whole
   brainstorm→spec→plan→subagent-driven-development→merge pipeline.
2. **3/4 Stars crew** (`2026-08-02-crew-3-4-stars`) — first crew page:
   `getCrewList`, `filterByRarity`, `sortByName`, a shared
   `PlayerDataProvider` context (replacing the original per-page fetch).
3. **Level column + sort** (`2026-08-02-crew-level-column-sort`) — added
   `level` to `CrewMember`, sort by level then name.
4. **Equipment slots** (`2026-08-03-crew-equipment-slots`) — added
   `equipment` to `CrewMember`, `getEquipmentSlotsRemaining`, the
   `-4..0` sign convention (see deep-dive above), "Items to equip" column,
   third sort key.
5. **Count + row number** (`2026-08-03-crew-count-and-row-number`) — title
   shows total count, `#` column added as first column.
6. **Stars column + CrewTable refactor** (`2026-08-03-crew-stars-column-table-refactor`)
   — added the visual `StarRating` component and extracted `CrewTable` as
   a reusable shared component, explicitly to prepare for more
   rarity-based pages.
7. **4/5 Stars crew page** (`2026-08-03-crew-four-five-stars-page`) — first
   real proof that `CrewTable`/`StarRating` reuse actually works
   (confirmed via identical git blob hashes, zero lines touched).
8. **Immortalization + two 4/4 pages** (`2026-08-03-crew-immortalization-4-4-pages`)
   — the "Immortalized"/"ready to immortalize" concepts (deep-dive above),
   `OwnedItem` type, `isImmortalized`/`isReadyToImmortalize`/
   `filterReadyToImmortalize`/`filterNeedsWork`, two new pages
   ("4/4 Stars crew (ready)" and "4/4 Stars crew").

## Current routes / nav (in order)

| Nav label | Path | Filter |
|---|---|---|
| Overview | `/` | player identity, not crew |
| 3/4 Stars crew | `/3-4-stars-crew` | rarity=3, max_rarity=4 |
| 4/5 Stars crew | `/4-5-stars-crew` | rarity=4, max_rarity=5 |
| 4/4 Stars crew (ready) | `/4-4-stars-crew-ready` | rarity=4, max_rarity=4, ready to immortalize |
| 4/4 Stars crew | `/4-4-stars-crew` | rarity=4, max_rarity=4, needs work |

## How this project is worked on (process notes for a future session)

- Every feature goes through **Superpowers**: `brainstorming` (clarifying
  questions, design presented in sections, approval) → written spec in
  `docs/superpowers/specs/` → `writing-plans` → written plan in
  `docs/superpowers/plans/` → user picks execution mode.
- Execution mode has consistently been **subagent-driven-development**:
  an isolated git worktree per feature (via the native `EnterWorktree`
  tool), a fresh implementer subagent per task, a task-scoped reviewer
  subagent per task (independently re-verifying data-driven claims against
  the real `example-data.json`, not just trusting the implementer's
  report), then a final whole-branch reviewer on the most capable model,
  then `finishing-a-development-branch` (build+lint as the test-suite
  substitute, since this project deliberately has no automated test
  framework yet, then fast-forward merge to `main`, then worktree/branch
  cleanup).
- **`EnterWorktree` branches from stale `origin/main`** every time (no
  remote push has happened), so after creating a worktree the immediate
  next step is always `git merge main` inside it to pull in the real
  local history, then `cp .../example-data.json .../worktree/` (it's
  gitignored, so it never comes along on its own) before `npm install`.
- **`example-data.json`** (real personal game data, gitignored, lives at
  the repo root) is the ground-truth reference for every crew-related
  feature. Every non-trivial getter/filter has been verified against it —
  usually via a throwaway `client/src/crew/__verify.ts` script, run via
  `npx tsx`, deleted before committing. Reviewers have repeatedly
  independently re-derived these numbers rather than trusting the
  implementer's report, and this has caught real things (e.g. confirming
  the `-4..0` sign convention wasn't a bug, hand-constructing a
  4-missing-slot test case the real data didn't naturally contain).
- **No automated test framework** — a deliberate, repeatedly-reaffirmed
  project-wide choice. Verification is TypeScript strict mode + ESLint +
  data-driven throwaway scripts against real data + manual dev-server curl
  checks. This has been explicitly revisited by reviewers each time and
  upheld each time.
- The user reviews specs and plans closely and has caught real ambiguities
  before implementation (e.g. the ready/needs-work edge case, the
  missing-slot-count generalization) — brainstorming questions are taken
  seriously, not rubber-stamped.

## Deferred issues / recommendations backlog (not yet acted on)

Collected across final reviews, roughly in the order they'd become worth
doing:

- **Cross-page refresh UX inconsistency:** `OverviewPage` has a header
  "Refresh" button but no retry-on-error in its `Alert`; the crew pages
  have retry-on-error but no header refresh button. Predates the crew
  pages; nobody has unified it yet.
- **Page-shell duplication:** all crew pages (`ThreeFourStarsCrewPage`,
  `FourFiveStarsCrewPage`, `FourFourStarsCrewReadyPage`,
  `FourFourStarsCrewPage` — 4 files now) repeat the same
  `usePlayerData()` + loading/error/empty-state/title scaffolding, differing
  only in their filter composition and copy strings. Recommendation from
  multiple reviews: extract a shared `RarityCrewPage`/`CrewListPage`
  component or a `useRarityCrew(...)` hook **once a 5th such page
  appears** — deliberately not done preemptively.
- **Nav active-state:** the nav `ListItemButton`s don't show which page is
  currently selected (no `selected` prop / `useLocation` check). Cosmetic.
- **`NAV_ITEMS` and `<Routes>` are hand-synced lists** in two different
  files (`AppLayout.tsx`, `App.tsx`) — adding a page means editing both,
  with no compile-time check they stay consistent. Would be resolved by
  the same shared-page-shell refactor above.
- **`getFilledSlotIndices` not extracted:** `isImmortalized` checks slot
  fullness via `equipment.length === 4` (a count), while
  `getMissingEquipmentArchetypeIds` checks it via a `Set` of indices — they
  currently agree only because real data never has duplicate/out-of-range
  equipment slot indices (verified true for all 597 sample crew, but not
  structurally guaranteed). A shared primitive would remove this
  data-dependent assumption.
- **`OwnedItem` doesn't track `quantity`:** ownership is presence-in-array
  only. A transient `quantity: 0` entry (not observed in the sample) would
  count as owned; two crew both needing the same single-copy item would
  both show as "ready" even though only one could actually be completed.
  Accepted as a known latent gap, weighed against keeping the type
  minimal.
- **`getMissingEquipmentArchetypeIds` is level-band-relative:** see the
  caveat in the deep-dive above — the function name doesn't currently
  signal that it answers "what's missing right now" rather than "what's
  needed to fully immortalize."
- **No visual "item owned" indicator column** was requested and explicitly
  declined for now (the page split itself was judged sufficient) — could
  be revisited if the user finds themselves wanting it.
- **`react-refresh/only-export-components` ESLint warning** in
  `PlayerDataContext.tsx` (exports both a non-component context object and
  the `PlayerDataProvider` component from one file) — pre-existing since
  the context refactor, never an error, never blocked a merge.
- **`npm audit`** flags a `react-router` RSC-mode CSRF advisory
  (GHSA-qwww-vcr4-c8h2) — doesn't apply, this app is a plain
  client-side-rendered SPA with no RSC usage. Worth `npm audit fix` next
  time dependencies are touched anyway.

## Likely next steps

The user has been adding crew-classification factors one at a time
("I'll list them step by step" was the original framing). Nothing is
currently in flight. The natural next asks, based on the pattern so far,
would be either: another classification factor (skills? traits? a
different completion metric?), another rarity-bucket page reusing
`CrewTable`, or finally tackling one of the deferred items above (most
likely the page-shell duplication, once one more page makes it a clear
pattern).
