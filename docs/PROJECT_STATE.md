# STT Tracker — Project State

Last updated: 2026-08-06. This document is the durable, in-depth record of
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
  api/assetsApi.ts               refreshAssets (see "Asset cache proxy")
  layout/AppLayout.tsx          AppBar + Drawer nav shell; the app's two topbar controls, "Refresh"
                                 (player data, see "Topbar Refresh button" below) and "Refresh assets"
                                 (image cache, see "Asset cache proxy" below) — its first non-page
                                 `usePlayerData()` consumer
  layout/NavGroupItem.tsx        Generic hover/focus-triggered flyout submenu (see "Ships pages")
  lib/extractPlayerIdentity.ts  Overview page's player-identity extraction
  lib/comparator.ts             Comparator<T>/combineComparators — domain-neutral sort
                                 composition, extracted from crew/sorters.ts (see
                                 "Sorting design")
  types/
    player.ts                  PlayerData = Record<string, unknown> (deliberately loose)
    crew.ts                    CrewMember interface (see below; `portrait?` added for the image column)
    item.ts                    OwnedItem interface (see below; `quantity?` added for Ships)
    collection.ts              Collection interface (see "The collections membership logic")
    storedImmortal.ts          StoredImmortal interface (see "Frozen crew and duplicate exclusion")
    ship.ts                    Ship interface (see "Ships pages"; `icon?` added for the image column)
    asset.ts                   DatacoreAsset interface (see "Crew/ship image column")
  assets/                        Asset-URL logic + the shared Thumbnail component (see "Crew/ship image column")
    config.ts                  ASSET_BASE_URL = '/api/assets' (repointed at the local proxy — see "Asset cache proxy")
    getAssetUrl.ts              DatacoreAsset -> full image URL, agnostic over any {file} shape
    Thumbnail.tsx                40x40 image-or-placeholder renderer, shared by CrewTable/ShipsTable
  crew/                         All crew-related pure logic + shared components
    getters.ts                 Data extraction + derived single-crew values
    filters.ts                 Array-in-array-out crew filtering (incl. filterFrozenDuplicates)
    sorters.ts                 Composable comparators (see "Sorting design";
                                Comparator<T>/combineComparators now live in
                                lib/comparator.ts)
    CrewTable.tsx               Shared table renderer (#/Image/Stars/Name/Level/Items-to-equip/Collections)
    StarRating.tsx              Gold star icons, driven by rarity/max_rarity props
  collections/                  Crew↔collection logic + the Collections page's own components
    getters.ts                 getCollectionsList, crewBelongsToCollection, getCrewCollections,
                                getCollectionCount, getCollectionCrew (reverse direction)
    rewards.ts                 getCuratedRewards — the reward/buff display allowlist
    sorters.ts                 isMaxedOut, getCollectionCompletionRatio, byCompletionThenNameAsc,
                                isCollectionUpgradable, byUpgradableThenCompletionThenNameAsc
    CollectionsTable.tsx        Main collections table (#/Collection/Rewards/Progress/Milestone/Crew)
    CollectionCrewList.tsx      Per-collection qualifying-crew sub-list (tier-highlighted)
  ships/                         All ship-related pure logic + the Ships pages' table (see "Ships pages")
    getters.ts                 getShipList, isShipMaxed, getShipSchematicsOwned,
                                getShipDisplayLevel, getShipSchematicsDisplay,
                                getShipSchematicsProgress
    filters.ts                 filterIncompleteShipsByRarity
    sorters.ts                 byLevelDesc, byLevelProgressDesc, byMissingSchematicsAsc,
                                byNameAsc, sortShips (reuses lib/comparator.ts's Comparator/combineComparators)
    ShipsTable.tsx               Shared table renderer (#/Image/Ship/Level/Schematics)
  pages/
    OverviewPage.tsx            Player identity (Player ID, DBID) — the very first page
    ThreeFourStarsCrewPage.tsx  rarity=3, max_rarity=4
    FourFiveStarsCrewPage.tsx   rarity=4, max_rarity=5
    FourFourStarsCrewReadyPage.tsx  rarity=4, max_rarity=4, "ready to immortalize"
    FourFourStarsCrewPage.tsx      rarity=4, max_rarity=4, "needs work"
    CollectionsPage.tsx             one row per collection, reverse (collection→crew) view
    FrozenDuplicatesPage.tsx        internal, parameterized (maxRarity/title) — see below
    FourStarsDuplicatesPage.tsx     thin wrapper: FrozenDuplicatesPage maxRarity=4
    FiveStarsDuplicatesPage.tsx     thin wrapper: FrozenDuplicatesPage maxRarity=5
    ShipsPage.tsx                    internal, parameterized (rarity/title) — see "Ships pages"
    FiveStarsShipsPage.tsx           thin wrapper: ShipsPage rarity=5
    FourStarsShipsPage.tsx           thin wrapper: ShipsPage rarity=4

server/src/
  index.ts, config.ts, errors.ts, cache.ts, sttClient.ts, routes/player.ts
  assetCache.ts, assetClient.ts, routes/assets.ts   Image cache/proxy (see "Asset cache proxy")
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

## Crew tier classification (ready / needsWork / leveling)

Built for the Collections page (below), but lives in `crew/getters.ts`
alongside `isImmortalized`/`isReadyToImmortalize` because it's a
generalization of them, not a collections-specific concept:

```ts
export type CrewTier = 'ready' | 'needsWork' | 'leveling';

export function getCrewTier(crew: CrewMember, items: OwnedItem[]): CrewTier | null {
  if (isImmortalized(crew)) return null;
  if (crew.rarity < crew.max_rarity - 1) return null;
  if (crew.rarity === crew.max_rarity - 1) return 'leveling';
  return isReadyToImmortalize(crew, items) ? 'ready' : 'needsWork';
}
```

**No new business logic was needed for `ready`/`needsWork`** —
`isImmortalized`/`isReadyToImmortalize` already check
`rarity === max_rarity` generically, never hardcoded to 4. The 4/4 pages
just happen to be the only place that pre-filters to `max_rarity === 4`
before applying them; `getCrewTier` applies the same predicates across
the whole roster instead. The one genuinely new rule is `leveling`'s
**one-star bound**: `rarity === max_rarity - 1` exactly, not "any lower
rarity." This was an explicit user correction mid-design — a first draft
counted any `rarity < max_rarity` as `leveling` (413 of 597 sample crew);
the corrected rule narrows it to 58, on the reasoning that "close to
immortalized" means one star short, not "anywhere on the leveling path."
Crew more than one star from their ceiling get `null` (excluded), same
bucket as already-Immortalized crew.

Verified against the real sample: `leveling: 58, ready: 10, needsWork: 43`,
`486` excluded. A real edge case proves the generalization holds outside
4/5: a crew at `1/2` (`max_rarity` 2) correctly classifies as `leveling`.

## The collections membership logic

The game groups crew into thematic "collections" (`cryo_collections` in
the raw payload — 88 of them in the sample) that unlock buffs/rewards as
you immortalize members. There is **no direct crew→collection reference**
in the payload — this had to be reverse-engineered and verified against
real data before implementing it.

### `Collection` (deliberately narrow, same discipline as `CrewMember`/`OwnedItem`)

```ts
interface Collection {
  id: number;
  name: string;
  traits: string[];
  extra_crew: number[];   // archetype_ids, NOT owned-instance ids — see below
  progress: number;
  claimable_milestone_index: number;
  milestone: CollectionMilestone;
}

interface CollectionMilestone {
  goal: number;
  rewards: CollectionReward[];
  buffs: CollectionBuff[];
}
```

Started narrower — `id`/`name`/`traits`/`extra_crew` only, on the
reasoning that a future collections-eye-view page would only need those
for display and matching. That page arrived (the Collections page, see
feature history below) and needed real milestone data too, so the type
grew to match — still "type only what you use," just what's used grew.
`CollectionReward`/`CollectionBuff` are themselves narrow (`type`/
`symbol`/`quantity`/`full_name` and `name` respectively) — see "Curated
collection rewards" below for why.

### The membership rule

A crew belongs to a collection if **either** condition holds, OR'd:

1. **Trait overlap:** `collection.traits` intersects
   `crew.traits ∪ crew.traits_hidden`.
2. **Explicit inclusion:** `crew.archetype_id` appears in
   `collection.extra_crew`.

**This was not obvious from a single example.** The worked-out case was
"Beach Day Ransom" (`archetype_id: 31595`), which the user had
independently counted as belonging to 8 collections. A trait-only
hypothesis found only 7 — the 8th, **"Perils in Paradise,"** has
`traits: []` and only matched because `31595` is listed in its
`extra_crew` array. That's what revealed rule 2 exists at all. Verified
further across the full sample (88 collections × 597 crew):
- 15 of the 88 collections have `traits: []` and rely **entirely** on
  `extra_crew` (thematic non-trait sets like "The Wild West," "Sherwood
  Forest," "Convergence Day").
- `extra_crew` arrays list `archetype_id`s (the crew *type*, shared across
  every player who owns that crew) — **never** the per-owned-instance
  `id` (large, unique to this player's copy). Confirmed: of 525 total
  `extra_crew` entries in the sample, only 110 matched an archetype this
  player actually owns; the rest are crew this player doesn't have, which
  is expected since the field describes the collection game-wide, not
  this player's roster.
- No collection has both `traits: []` and `extra_crew: []` (nothing
  matches vacuously).
- No crew×collection pair matched both rules simultaneously in the
  sample (not structurally guaranteed, but doesn't matter — see dedup
  below).
- Two crew owned in duplicate (same `archetype_id`, two separate owned
  copies) produced identical collection counts, as expected — the rule
  depends only on `archetype_id`/traits, never per-instance data.
- Full distribution across all 597 sample crew: 8 own zero collections,
  up to a max of 11 (`0:8, 1:23, 2:76, 3:135, 4:155, 5:112, 6:56, 7:21,
  8:9, 9:1, 11:1`).

**`crewBelongsToCollection(crew, collection)`** (`collections/getters.ts`)
is the single predicate implementing both conditions — everything else in
the module is built on top of it:

```ts
export function crewBelongsToCollection(crew: CrewMember, collection: Collection): boolean {
  const crewTraits = new Set([...(crew.traits ?? []), ...(crew.traits_hidden ?? [])]);
  const collectionTraits = collection.traits ?? [];
  const extraCrew = collection.extra_crew ?? [];
  return collectionTraits.some((trait) => crewTraits.has(trait)) || extraCrew.includes(crew.archetype_id);
}
```

`getCrewCollections(crew, collections)` filters the full list down to
matches; `getCollectionCount(crew, collections)` is just that result's
`.length` — the value shown in the "Collections" table column and used by
the `byCollectionCountDesc` sort key.

**Why the predicate is factored out on its own:** it was originally
shaped to support a reverse direction — for a given collection, which
owned crew belong to it — without new matching logic. That reverse page
now exists (the Collections page), and its getter proves the payoff:

```ts
export function getCollectionCrew(collection: Collection, crewList: CrewMember[], items: OwnedItem[]): CrewMember[] {
  return crewList.filter(
    (crew) => crewBelongsToCollection(crew, collection) && getCrewTier(crew, items) !== null
  );
}
```

Reuses `crewBelongsToCollection` unmodified, arguments just held the
other way around, plus the tier filter (see "Crew tier classification"
above) to narrow down to the same "close to immortalized" subset the
crew pages show. **Deliberately returns unsorted** — sorting is composed
at the call site (`CollectionsTable.tsx`), not inside this getter. This
wasn't a stylistic choice: `crew/sorters.ts` already imports
`getCollectionCount` from `collections/getters.ts`, so if this getter
also imported sort comparators from `crew/sorters.ts`, it would create a
cycle (`collections/getters.ts` → `crew/sorters.ts` →
`collections/getters.ts`). **This is a load-bearing constraint for
future work, not just history: `crew/getters.ts` must stay import-free of
`collections/` — the whole graph stays acyclic only because it does.**

**Dedup is a non-issue by construction:** membership is computed by
filtering the single `collections` array with an OR'd predicate, not by
merging two separately-collected result sets, so a collection cannot
appear twice in a result regardless of which rule(s) matched.

**Guards:** follows the same fail-closed convention as
`getMissingEquipmentArchetypeIds`'s `equipment_slots` guard — every field
read off an unvalidated cast (`collection.traits`, `collection.extra_crew`,
`crew.traits`, `crew.traits_hidden`) gets `?? []`, so a malformed entry
contributes zero matches rather than throwing. One asymmetry a final
review flagged and explicitly ruled acceptable: `crew.archetype_id` (a
scalar, not an array) has no `?? -1` fallback in the `extraCrew.includes(...)`
check — `Array.prototype.includes(undefined)` returns `false` either way,
so it fails closed regardless; the ruling was to leave it as-shipped
rather than deviate from the approved plan for a purely stylistic gain.

**Spec/plan:** `docs/superpowers/specs/2026-08-03-crew-collections-count-design.md`,
`docs/superpowers/plans/2026-08-03-crew-collections-count-plan.md`.

## Curated collection rewards

The Collections page shows a "Rewards" summary per collection, but not
every reward the game grants — only a hand-picked subset the user
actually cares about, everything else silently dropped. This is an
explicit allowlist in `collections/rewards.ts` (`getCuratedRewards`), not
a general-purpose reward formatter:

| Include | Match | Display |
|---|---|---|
| 10x Portal | `reward.symbol === 'premium_10x_bundle'` | `10x Portal (quantity)` |
| Portal | `reward.symbol === 'premium_1x_bundle'` | `Portal (quantity)` |
| Dilithium | `reward.symbol === 'premium_purchasable'` | `Dilithium (quantity)` |
| Crew | `reward.type === 1` | `reward.full_name` |
| The Niners Avatar | `reward.symbol === 'niners_avatar'` | as-is |
| Legendary Honorable Citation | `reward.symbol === 'honorable_citation_quality5'` | as-is |
| Core Skill buffs | `buff.name` matches `/^(.+) Core Skill \+\d+%$/` | `Skill: {captured name}` |
| Skill Proficiency buffs | `buff.name` matches `/^(.+) Skill Proficiency (?:Min\|Max) \+\d+%$/` | `Proficiency: {captured name}` |

Excluded (verified present, deliberately not shown): Chronitons, Merits,
Federation Credits, Honor (common — 63 of 88 collections — but still
excluded per explicit confirmation), Replicator Fuel, 10x Standard
Shuttle Boost. Anything unrecognized in the future is silently dropped —
a safe default, since a new reward type is more likely worth a deliberate
add than a sight-unseen surface.

**Matched by `symbol`, not display `name`, wherever possible** — symbols
are stable identifiers, display text is what changes if the game's
copywriting does. `full_name` (not `name`) is used for the crew reward
specifically because they differ: the one crew-reward example in the
sample has `name: "Janeway"` but `full_name: "Lucille Davenport"` — the
actual crew's proper name.

**The two skill-buff categories needed parsing, not substring matching,
and this is the part worth remembering if it's ever touched again:**
- **"Core Skill" and "Skill Proficiency" live in `milestone.buffs`, never
  `milestone.rewards`** — verified across all 88 collections, zero
  matches in `rewards`. This was a real correction during design; the
  user originally pointed at the wrong field.
- **Skill Proficiency buffs always come in a Min/Max pair** for the same
  skill (e.g. "Medicine Skill Proficiency Min +1%" and "...Max +1%") and
  must collapse to **one** `Proficiency: Medicine` entry, not two. Two
  `Set<string>` accumulators (one for Core-Skill skill names, one for
  Proficiency skill names) do this for free — the regex strips the
  Min/Max suffix before insertion, so both variants produce the same
  `Set` key.
- **The percentage is never displayed** — every matching buff in the real
  sample is exactly `+1%`, confirmed exhaustively, so showing it would be
  redundant, not informative.
- **Verified worked example** — "Their Royal Highnesses" grants Command's
  Min, Max, *and* Core buffs together, and must produce exactly
  `['Portal (5)', 'Skill: Command', 'Proficiency: Command']` (3 entries,
  not 4) — this is the case that actually proves the dedup works, not
  just the more common single-buff case.

**Spec:** `docs/superpowers/specs/2026-08-03-collections-row-detail-design.md`.

## Collection completion sort

The Collections page's row order changed from purely alphabetical to
completion-ratio-first, alphabetical as the tiebreak — "which collection
is closest to its next milestone" (`collections/sorters.ts`):

```ts
export function isMaxedOut(collection: Collection): boolean {
  return collection.milestone.goal === 0;
}

const MAXED_OUT_RATIO = -1; // sorts maxed-out collections to the bottom, deliberately — see below

export function getCollectionCompletionRatio(collection: Collection): number {
  return isMaxedOut(collection) ? MAXED_OUT_RATIO : collection.progress / collection.milestone.goal;
}

export function byCompletionThenNameAsc(a: Collection, b: Collection): number {
  const ratioDiff = getCollectionCompletionRatio(b) - getCollectionCompletionRatio(a);
  if (ratioDiff !== 0) return ratioDiff;
  return a.name.localeCompare(b.name);
}
```

**`isMaxedOut` was extracted after shipping** — the row-detail feature
originally inlined `collection.milestone.goal === 0` separately in both
`getCollectionCompletionRatio` and `CollectionsTable`'s progress display,
flagged as a deferred duplication risk, then folded into the very next
feature that happened to touch both files (frozen-crew exclusion, below)
rather than left to rot. The `MAXED_OUT_RATIO` constant and its comment
exist because the `-1` value is exactly the decision that got reversed
once already (see next paragraph) — worth documenting in code, not just
in this file, so a future reader doesn't "helpfully" flip it back.

**`goal === 0` is a real, common state, not a hypothetical edge case:** 8
of the 88 sample collections are fully maxed out for this player (every
milestone already claimed — confirmed by empty `rewards`/`buffs`
alongside `goal: 0`), and a bare `progress / goal` division would produce
`Infinity`/`NaN` for them. **These sort to the very bottom** (`-1`, below
every partial-progress collection regardless of how low its ratio is) —
this was an explicit user correction from an initial "rank complete
collections first" instinct to "rank them last, since there's nothing
left to do there." The `Progress` column shows `MAX` for these instead of
a division.

**A hard data limitation, not an implementation gap:** the game's UI
shows a claimed/total milestone pair (e.g. "13 of 19"), but this payload
only ever exposes the *current next* milestone (`progress`/`goal`) plus a
running claimed-count (`claimable_milestone_index`) — there is no array
of all milestones and no total-count field anywhere in
`player.character.cryo_collections` or elsewhere in the payload,
confirmed by exhaustive search. The `Milestone` column shows
`claimable_milestone_index` alone; the total isn't retrievable from this
data source at all, by anyone, ever — not something a future getter could
extract with more effort.

## The "Upgradable" chip and upgradable-first sort

A follow-up to the needsWork tier label (above): a collection gets a blue
"Upgradable" `Chip` next to its name when the crew still needed to reach
its *next* milestone can already be fully covered by crew the player owns
but hasn't finished immortalizing yet. The math (`collections/sorters.ts`):

```ts
export function isCollectionUpgradable(collection: Collection, qualifyingCrew: CrewMember[], items: OwnedItem[]): boolean {
  const remaining = collection.milestone.goal - collection.progress;
  if (remaining <= 0) return false;
  const eligible = qualifyingCrew.filter((crew) => {
    const tier = getCrewTier(crew, items);
    return tier === 'ready' || tier === 'needsWork';
  }).length;
  return eligible >= remaining;
}
```

`remaining = goal - progress` is the same arithmetic the Progress column
already displays (see "Collection completion sort" above); `eligible`
counts the collection's already-filtered qualifying crew (`getCollectionCrew`'s
output, so frozen-archetype duplicates and non-close-to-immortalized crew
are already excluded) at `ready` or `needsWork` tier. Upgradable iff
`eligible >= remaining`.

**No explicit `isMaxedOut` guard, deliberately** — the `remaining <= 0`
check alone excludes maxed-out collections. Verified against real data
both at design time and independently by the final reviewer: all 8
maxed-out collections (`goal === 0`) retain non-zero `progress` from their
last claimed milestone (values `27/62/91/12/10/10/10/13` in the sample),
so `remaining` is always strictly negative for them — never zero, never
positive. Zero collections have `remaining === 0` at all. Adding a
redundant guard for a case the real data proves can't occur was raised
and explicitly declined during brainstorming.

**`isCollectionUpgradable` takes the already-filtered `qualifyingCrew` as
a parameter — it does not call `getCollectionCrew` itself.** This mirrors
`byTierAsc`/`byMaxRarityDesc` in `crew/sorters.ts`, which also operate on
a pre-filtered list rather than re-deriving it.

**Verified against `example-data.json`, independently re-derived twice**
(task review and final review, each from raw data rather than by calling
the shipped function): exactly 5 of 88 collections are upgradable —
Delphic Expanse (7/8, remaining 1, eligible 1), Our Man Bashir (2/3, 1,
1), Ruthless Aggression (114/120, 6, 6), Class A Dress (13/14, 1, 2),
Perils in Paradise (2/3, 1, 2). Notable: every eligible crew across all 5
is `needsWork` tier — the `ready`-tier half of the `||` is real code but
untested by the current sample's data (not a defect; just not yet
exercised).

**Sort order: upgradable-first, ahead of completion ratio.** Explicit
user request, not just a visual tag. The naive implementation — a
comparator calling `isCollectionUpgradable`/`getCollectionCrew` from
*inside* the per-comparison function — would run an O(597)-crew filter
roughly `n log n` times (~1,100+ calls for 88 collections) instead of
once, a real performance defect this project specifically designed around
rather than discovered after the fact:

```ts
export function byUpgradableThenCompletionThenNameAsc(
  collections: Collection[],
  crewList: CrewMember[],
  items: OwnedItem[],
  frozenArchetypeIds: Set<number>
): Comparator<Collection> {
  const upgradableIds = new Set(
    collections
      .filter((c) => isCollectionUpgradable(c, getCollectionCrew(c, crewList, items, frozenArchetypeIds), items))
      .map((c) => c.id)
  );
  return combineComparators(
    (a, b) => Number(upgradableIds.has(b.id)) - Number(upgradableIds.has(a.id)),
    byCompletionThenNameAsc
  );
}
```

The `Set` is precomputed once (88 `getCollectionCrew` calls, at factory
call time) and the returned comparator does only O(1) lookups. **The
final reviewer proved this empirically, not just by reading the
structure:** 100,000 calls to the returned comparator completed in
8.91ms (~0.09µs/call) — several orders of magnitude faster than a single
`getCollectionCrew` call would be, confirming the expensive filter really
is outside the hot path. The reviewer also brute-forced all 3,828
collection pairs and found **zero** pairs compare equal, meaning the sort
produces a strict total order — no flicker risk from
`Array.prototype.sort`'s stability characteristics being incidentally
relied upon. Real timing measured three times independently (design-time
dry run, implementer, task reviewer) landed consistently in the same
range: ~29-31ms steady-state, ~40-79ms on a cold/first call (JIT
warm-up) — higher than the `byCollectionCountDesc` precedent (~12ms,
"Sorting design" below) because this factory's precompute step does 88
fresh crew-list filters rather than one cheap per-crew lookup, but still
a one-time per-render cost, imperceptible during a page load/refresh.

**Architecture change, not a silent one:** `collections/sorters.ts` was
previously import-free besides the `Collection` type, and this file
explicitly documented that as deliberate (see "Sorting design" below,
which this feature makes partially inaccurate — corrected there too). It
now imports `combineComparators`/`Comparator` from `crew/sorters.ts` and
`getCollectionCrew` from `collections/getters.ts`. Checked and confirmed
acyclic by two independent reviewers reading the actual import lists:
`crew/getters.ts` imports only types; `collections/getters.ts` imports
`crew/getters.ts`; `crew/sorters.ts` imports `collections/getters.ts`
(pre-existing, for `getCollectionCount`) — nothing imports back into
`collections/sorters.ts`, so the new edges
(`collections/sorters.ts → crew/sorters.ts → collections/getters.ts →
crew/getters.ts`, and `collections/sorters.ts → collections/getters.ts`
directly) form a DAG. **Historical note:** the `collections/sorters.ts →
crew/sorters.ts` edge described here no longer exists — the 2026-08-06
comparator extraction (see "Sorting design" below) moved
`combineComparators`/`Comparator` to `lib/comparator.ts`, so
`collections/sorters.ts` now imports that instead. The DAG conclusion
still holds; this paragraph is left as-written because it's an accurate
record of the reasoning at the time, not a claim about today's import
graph.

**Chip:** `<Chip label="Upgradable" size="small" color="info" sx={{ ml: 1 }} />`,
rendered inline immediately after the collection name in the same
`Collection` table cell (`CollectionsTable.tsx`) — the third distinct
chip color on this page, after `success` (green, "Ready") and `warning`
(amber, "4/4 Stars" — see needsWork tier label above), each tier/state
getting its own color, no collision.

**Accepted duplication, reasoned about explicitly, not an oversight:**
`getCollectionCrew` now runs once more per collection at the page level
(`CollectionsPage.tsx`, for the sort's upgradable set) in addition to
`CollectionsTable`'s existing per-row call (for rendering) — 176 total
calls per page render instead of 88. This project already accepts
comparable per-render filtering costs elsewhere (`byCollectionCountDesc`'s
~12ms precedent). **A real consistency risk flagged at final review,
parked as a deferred minor, not fixed in this feature:** the two
computations agree today only because `CollectionsPage.tsx` passes
`CollectionsTable` the same `crew`/`items`/`frozenArchetypeIds` the sort
factory received — if those inputs ever diverge (e.g. the table gains its
own filter), a row could show a chip that didn't sort to the top, or vice
versa. The clean fix, deferred: have `byUpgradableThenCompletionThenNameAsc`
expose its `upgradableIds` Set as a return value, thread it into
`CollectionsTable` as a prop, and delete the per-row `isCollectionUpgradable`
call — this would both halve the `getCollectionCrew` calls (176→88) and
remove the dual-source-of-truth risk in one move. See "Deferred issues"
below.

**Spec/plan:** `docs/superpowers/specs/2026-08-04-collections-upgradable-chip-design.md`,
`docs/superpowers/plans/2026-08-04-collections-upgradable-chip-plan.md`.

## Frozen crew and duplicate exclusion

STT lets a player fully immortalize a crew member and then "freeze" it —
store it elsewhere to free up active-roster inventory space. If the
player later re-pulls a duplicate of that same crew archetype, the new
copy starts fresh at low rarity/level. Before this feature, the
Collections page's crew lists had no way to tell "this crew genuinely
needs attention" apart from "this is a fresh re-pull of an archetype
that's already been fully completed once via its frozen twin" — both
look identical from the active-roster crew object alone. The user caught
this by noticing collections they'd already fully completed (see
`isMaxedOut` above — "Common Crew," "Uncommon Crew," the "immortalize
every N-star crew" collections) still showed active, not-yet-immortalized
crew in their sub-list.

**`player.character.stored_immortals`** — an array of `{ id, quantity,
qbits }` — is the frozen-crew list. `id` is the crew's `archetype_id`:

```ts
// types/storedImmortal.ts
export interface StoredImmortal {
  id: number;
}
```

```ts
// crew/getters.ts — moved here 2026-08-07, see "Deferred issues" below
export function getFrozenCrewArchetypeIds(data: PlayerData): Set<number> {
  const player = data.player as Record<string, unknown> | undefined;
  const character = player?.character as Record<string, unknown> | undefined;
  const storedImmortals = character?.stored_immortals;
  const list = Array.isArray(storedImmortals) ? (storedImmortals as StoredImmortal[]) : [];
  return new Set(list.map((s) => s.id));
}
```

**This was reverse-engineered from nothing** — the field's meaning isn't
documented anywhere. First evidence: 716 ids in `stored_immortals`, and
exactly 12 of them also appear as an active-roster `archetype_id`, every
one matching the reported symptom (a low-rarity/under-leveled duplicate
of an archetype with a frozen twin — e.g. Captain Janeway at 4/4 level
20, Telek R'Mor at 1/2 level 1). That overlap was suggestive but not
proof on its own. **The proof came from a reconciliation, done during
final review:** 15 of the 88 collections are defined purely by
`extra_crew` (no trait matching at all — see "The collections membership
logic" above), which means the game's own `progress` field for those 15
is a ground-truth count this project can independently predict:

```
ownedImmortalArchetypes = archetype_ids in stored_immortals
                         ∪ archetype_ids of active crew where isImmortalized(crew)
predictedProgress = |collection.extra_crew ∩ ownedImmortalArchetypes|
```

**Result: 15/15 exact match against the real `progress` values, with the
frozen set included. 0/15 match with it excluded.** This isn't
correlation — it proves the game itself computes collection progress by
archetype over *(frozen ∪ active-immortalized)*, which means an active,
non-immortalized duplicate of a frozen archetype can never advance a
collection. The exclusion this feature makes is therefore provably
correct, not a display preference that merely looks right on inspection.

**The exclusion is scoped to `getCollectionCrew` only** — `getCrewTier`
(`crew/getters.ts`) stays completely untouched, since it's a general
"how close to immortalized" concept reused by `crew/sorters.ts`'s
`byTierAsc` and `CollectionCrewList`'s "Ready" chip, not something
specific to frozen-crew bookkeeping:

```ts
export function getCollectionCrew(
  collection: Collection,
  crewList: CrewMember[],
  items: OwnedItem[],
  frozenArchetypeIds: Set<number>
): CrewMember[] {
  return crewList.filter(
    (crew) =>
      crewBelongsToCollection(crew, collection) &&
      getCrewTier(crew, items) !== null &&
      !frozenArchetypeIds.has(crew.archetype_id)
  );
}
```

Since `getCrewTier` already returns `null` for already-immortalized
crew, the frozen-set clause can only ever narrow an already-partial
result further — there's no path where a legitimately-finished crew gets
hidden by it, and no path where `CollectionCrewList`/`byTierAsc` ever see
an unfiltered crew list (both are fed exclusively by this getter's
output).

**Deliberately scoped to the Collections page only** — the 4 existing
crew pages (3/4, 4/5, 4/4-ready, 4/4-needs-work) never call
`getCollectionCrew` and remain completely unaffected; a crew like
Captain Janeway still appears on "4/4 Stars crew" as needing work.
Broadening this to those pages was raised explicitly during design and
declined for now.

**Real-data impact, verified:** 14 of 88 collections affected, total
qualifying-crew entries drop from 368 to 343 across the whole set. Only
**7** of the 12 overlapping archetypes actually change any collection's
crew list (Captain Janeway, Ensign Kim, First Maje Haron, Festive Jadzia
Dax, Telek R'Mor, Off-Duty Stamets, Fleet Commander Martok) — the other
5 (Idrin, Martia, Duelist Yar, Indignant Seven, Anxious Kirk) were
already excluded by `getCrewTier`'s one-star bound before this feature
existed, since they're more than one star from their ceiling.

**Spec/plan:** `docs/superpowers/specs/2026-08-03-frozen-crew-exclusion-design.md`,
`docs/superpowers/plans/2026-08-03-frozen-crew-exclusion-plan.md`.

## Frozen duplicates pages (surfacing, not hiding)

**The deliberate opposite of "Frozen crew and duplicate exclusion"
above** — that feature *hides* frozen-archetype duplicates from the
Collections page because they can never advance a collection; this one
*surfaces* them explicitly, on two new pages ("4 Stars Duplicates," "5
Stars Duplicates"), so the user can look at each short list and decide,
in the game itself, whether to keep leveling a duplicate or dismiss/fuse
it. Both features read the same `getFrozenCrewArchetypeIds` set; they
just do opposite things with membership in it. If a future session sees
both filters and assumes one must be a mistake given the other exists —
it isn't. They serve different questions ("what still needs my
attention toward a collection?" vs. "what active crew are redundant
copies I should decide about?").

```ts
// crew/filters.ts
export function filterFrozenDuplicates(crew: CrewMember[], frozenArchetypeIds: Set<number>, maxRarity: number): CrewMember[] {
  return crew.filter((c) => frozenArchetypeIds.has(c.archetype_id) && c.max_rarity === maxRarity);
}
```

**No completion-state filtering, by explicit user decision** — every
active-roster crew whose archetype is frozen and whose `max_rarity`
matches shows up, regardless of the duplicate's own level/equipment/
rarity. The frozen twin itself is never a double-counting risk:
`stored_immortals` entries aren't part of `player.character.crew` at
all. **Two things worth knowing if this page ever looks "wrong":**
- **The "5 Stars Duplicates" page is empty in the sample data, and that's
  a data fact, not a bug.** Of the 12 archetypes with a frozen twin, the
  `max_rarity` distribution is `{1:1, 2:5, 3:1, 4:5, 5:0}` — none happen
  to be 5-star, despite 435 owned 5-star crew in the sample. A future
  session seeing this page empty next to a large 5-star roster should
  check the actual overlap before assuming something's broken.
- **None of the 12 overlapping archetypes is itself already-immortalized
  on the active roster in the sample**, so the "no completion-state
  filtering" decision has never actually been exercised by real data yet.
  If a listed duplicate is ever leveled all the way to Immortalized, it
  will *still* appear on these pages — that's the intended, explicitly-
  decided behavior, not something to "fix" if it's noticed later.

`FrozenDuplicatesPage` (internal, not itself routed) takes `maxRarity`/
`title` props; `FourStarsDuplicatesPage`/`FiveStarsDuplicatesPage` are
thin wrappers (7 lines each, zero logic) rendering it with fixed values
— chosen specifically because the two pages differ by exactly one
number, without touching the broader page-shell duplication tracked
below (adding two routes cost one shell copy, not two).

**`filterFrozenDuplicates` takes the frozen-id `Set` as a plain
parameter** rather than importing `getFrozenCrewArchetypeIds` itself —
`crew/filters.ts` stays oblivious to where the set came from, same
module-boundary discipline as `getCollectionCrew`'s call-site-composed
sorting. **At the time this feature shipped**, `FrozenDuplicatesPage.tsx`
imported both `getFrozenCrewArchetypeIds` and `getCollectionsList` from
`collections/getters.ts` — unremarkable on its own (every crew page
already imports `getCollectionsList` for `byCollectionCountDesc`), but
this was the first page with nothing to do with collections that needed
a `collections/` import at all, which a prior review had flagged as the
condition where `getFrozenCrewArchetypeIds`'s placement would start to
matter. **It did — see "Deferred issues" below: `getFrozenCrewArchetypeIds`
moved to `crew/getters.ts` on 2026-08-07**, so `FrozenDuplicatesPage.tsx`
now imports it from there instead, alongside `getCollectionsList` still
from `collections/getters.ts`.

**Spec/plan:** `docs/superpowers/specs/2026-08-03-frozen-duplicates-pages-design.md`,
`docs/superpowers/plans/2026-08-03-frozen-duplicates-pages-plan.md`.

## Sorting design

Started as one named function per sort combination (`sortByName`, then
`sortByLevelThenName`), and this was explicitly refactored to composable
comparators once a third sort factor arrived, specifically to stop
accumulating dead/unused named functions (`sortByName` was already unused
by the time it was noticed). Current design:

```ts
// lib/comparator.ts — extracted 2026-08-06, see below
type Comparator<T> = (a: T, b: T) => number;
combineComparators<T>(...comparators): Comparator<T>   // short-circuits on first non-zero

// crew/sorters.ts
byLevelDesc, byEquipmentSlotsRemainingDesc, byNameAsc    // single-key comparators, self-contained on one CrewMember
byCollectionCountDesc(collections): Comparator<CrewMember>  // factory — needs external context, see below
sortCrew(crew, comparator): CrewMember[]                 // non-mutating apply
```

Every page composes the same four-key order:
`combineComparators(byLevelDesc, byEquipmentSlotsRemainingDesc, byCollectionCountDesc(collections), byNameAsc)`
— level first (highest first), then equipment-completeness (closer to
done first), then collection count (more collections first), then name
(alphabetical) as the final tiebreaker.

**`byCollectionCountDesc` is the first *factory* comparator in this file**
— every other comparator is a plain `(a, b) => number` because level and
equipment-slots are self-contained on a single `CrewMember`. Collection
count needs the `collections` list as external context to compute (via
`getCollectionCount`, see "The collections membership logic" above), so
it's shaped as a function that takes that context and returns a
comparator — the smallest change that fits the existing
`combineComparators` composition model. Deliberately not backed by a
precomputed `Map<archetype_id, count>`: at 597 crew × 88 collections,
computing membership inline per comparison is fast enough (measured
~12ms for a full-page sort at real page sizes during final review) that a
lookup-map would be optimizing before it's needed.

**Two more `crew/sorters.ts` comparators, added for the Collections page's
crew sub-lists:** `byTierAsc(items)` (another factory — needs `items` to
compute each crew's tier, see "Crew tier classification" above) orders
`ready` before `needsWork` before `leveling`; `byMaxRarityDesc` is a
plain comparator ordering higher `max_rarity` first. `CollectionsTable`
composes `byTierAsc(items), byMaxRarityDesc, byLevelDesc,
byEquipmentSlotsRemainingDesc, byNameAsc` for each collection's crew
sub-list — same five-key shape as the crew pages, with tier/max_rarity
replacing collection-count as the leading keys. **`byTierAsc` assumes
every crew it's given already has a non-`null` tier** (uses a non-null
assertion on `getCrewTier(...)` for this reason) — it's only ever called
on `getCollectionCrew`'s already-filtered output, never on a raw crew
list.

**`collections/sorters.ts` is a separate, smaller module** for sorting
*collections themselves* (not crew) — `getCollectionCompletionRatio`/
`byCompletionThenNameAsc`, see "Collection completion sort" above. Kept
out of `crew/sorters.ts` since it operates on a different type entirely.

**Update, Upgradable chip feature:** the claim above ("no shared
composition need") no longer holds and is kept here only as history, not
current fact. `collections/sorters.ts` now has two consumers
(`CollectionsPage` *and* `CollectionsTable`, the latter for
`isCollectionUpgradable`) and uses `combineComparators` to compose
`byUpgradableThenCompletionThenNameAsc` with the existing
`byCompletionThenNameAsc` (see "The 'Upgradable' chip and
upgradable-first sort" above for the full deep-dive, including why this
is still acyclic).

**Fixed 2026-08-06 — `combineComparators`/`Comparator<T>` moved to
`lib/comparator.ts`.** Both were fully generic and domain-neutral, but
lived in `crew/sorters.ts`, which forced every non-crew consumer
(`collections/sorters.ts`, `collections/CollectionsTable.tsx`, and later
`ships/sorters.ts` — three consumers by the time this was finally done)
to import from a crew-domain module just to reuse them, and pre-empted a
real cycle risk: `crew/sorters.ts` already imports
`collections/getters.ts`, so the day anything in `crew/sorters.ts` needed
something from `collections/sorters.ts`, that would have been a genuine
cycle, not just a smell. `crew/sorters.ts` now imports only the
`Comparator` *type* from `lib/comparator.ts` (still needed by
`byCollectionCountDesc`/`byTierAsc`/`sortCrew`'s own signatures) and does
not re-export `combineComparators` — every consumer imports it from
`lib/comparator.ts` directly. Zero behavior change, a pure move — see
`docs/superpowers/specs/2026-08-06-comparator-extraction-design.md` and
`docs/superpowers/plans/2026-08-06-comparator-extraction-plan.md`.

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
`Items to equip`, `Collections`) — no configurable-columns API was built,
on the reasoning that with only 2-4 real consumers, a column-config
system would be speculative generality nobody has asked for yet.
`CrewTable` takes a required `collections: Collection[]` prop (added
alongside the `Collections` column) — the same "pass the extra data list
as context" pattern `isReadyToImmortalize` already used for `items`.

**The Collections page has its own parallel rendering layer**
(`CollectionsTable.tsx`, `CollectionCrewList.tsx`) rather than reusing
`CrewTable` — the two tables show fundamentally different row shapes
(one row per collection vs. one row per crew), so sharing would have
meant threading collection-specific columns through a component built
for crew rows. `CollectionsTable` renders one MUI `TableRow` pair per
collection (`#`/`Collection`/`Rewards`/`Progress`/`Milestone`/`Crew` on
the main row, a `colSpan`-ed row below holding that collection's
`CollectionCrewList`) — the standard MUI "collapsible table row" recipe,
except **the collapse half was removed entirely**, not hidden. Rows were
originally individually expand/collapsible (`useState` tracking expanded
ids, an `IconButton` toggle); once the user confirmed rows should always
stay expanded, that whole state/toggle became genuinely dead code and was
deleted rather than left unreachable — `useState`, `IconButton`, both
arrow icons, and `Collapse` are all gone from the file. The sub-row keeps
a subtle `action.hover` background tint so it still visually reads as
"belonging to" its parent row without the collapse affordance doing that
job implicitly. `CollectionCrewList` highlights `tier === 'ready'` crew
with a bold name plus a small "Ready" `Chip`, and (added in the
Collections needsWork tier label feature, see Feature history #14)
`tier === 'needsWork'` crew with a normal-weight name plus an amber
`color="warning"` `Chip` reading `` `${max_rarity}/${max_rarity} Stars` ``
(e.g. "4/4 Stars") — mirroring "Ready," one visual signal per tier, so a
collection's crew sub-list reads at a glance as three groups (green
chip → amber chip → no chip, matching `byTierAsc`'s
ready-before-needsWork-before-leveling sort). `tier === 'leveling'` and
`tier === null` (unreachable at this call site, since `getCollectionCrew`
already filters `null` out) both render neither chip nor bold — no
explicit branch needed, since `isReady`/`isNeedsWork` are each computed
directly from a single `getCrewTier(...)` call, hoisted once per row into
a local `tier` variable specifically to avoid calling it twice (it chains
into `isReadyToImmortalize` → `areAllMissingItemsOwned`, an
`items.some(...)` scan per missing slot — worth avoiding at ~343 rendered
rows). The chip text intentionally says "4/4 Stars" rather than the
literal `max_rarity` alone ("4 Stars") specifically to match this app's
own existing "4/4 Stars crew" page name for the same tier, and to avoid
colliding with the unrelated "4 Stars Duplicates" page (frozen-archetype
duplicates, a different concept entirely) — this wording was corrected
during final review, after the plan had specified the literal
`${max_rarity} Stars` form verbatim.

## Page shell extraction

The longest-standing deferred-issues entry in this project — first
flagged at the 4th crew page, re-flagged at every subsequent page's
final review, "well past the threshold" by 7 pages — is closed. All 7
pages sharing the identical loading/error/empty/title JSX shell
(`ThreeFourStarsCrewPage`, `FourFiveStarsCrewPage`,
`FourFourStarsCrewReadyPage`, `FourFourStarsCrewPage`,
`FrozenDuplicatesPage`, `CollectionsPage`, `ShipsPage`) now share one
new component, `PageShell` (`layout/PageShell.tsx`) — the same category
as `AppLayout.tsx`/`NavGroupItem.tsx`, shared structural UI, alongside
`CrewTable`/`StarRating`'s precedent above of extracting once real reuse
arrives rather than up front.

**`PageShell` is a pure presentational component, deliberately decoupled
from `PlayerData`/data-fetching entirely:**

```ts
export interface PageShellProps {
  title: string;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  loaded: boolean;
  count: number;
  emptyMessage: string;
  children: ReactNode;
}
```

Each page still calls `usePlayerData()` itself, does all of its own
data-fetching/filtering/sorting, computes `loaded` itself
(`!loading && !error && !!data`), and passes its table component as
`children` — only the render shell moved. `loaded` is a caller-computed
boolean rather than `PageShell` inferring it from a `data` prop
specifically so the component stays reusable for anything with a
loading/error/loaded shape, not coupled to this app's specific hook;
`onRetry` takes a plain `() => void` for the same reason (each page still
does its own `onRetry={() => void refresh()}` wrapping).

**Verification went well beyond the spec's own plan, and is worth
recording as a technique, not just a result:** rather than relying on
argument-from-code-reading for equivalence, the final review ran a live
A/B DOM diff — the pre-branch code was still serving on one port, the
post-branch code on another — captured each of the 9 routes'
(7 pages, 2 of them rarity-parameterized into 2 routes each)
`outerHTML`, normalized emotion's per-build `css-xxxx` hashes, and
SHA-256'd the result. **Byte-identical rendered DOM on all 9 routes**,
across all 4 states (loading, error, loaded-with-data, loaded-empty —
`/5-stars-duplicates` genuinely renders empty in the real sample, so
this wasn't argued, it was observed live pre/post). Clicking Retry in
the error state fired exactly one `/api/player/refresh` call on both
sides, confirming the `onRetry` indirection introduces no behavioral
drift. This is a stronger equivalence proof than a unit-test suite would
have given for a pure zero-behavior-change refactor, since it asserts
the actual property under test (rendered output) rather than a proxy for
it.

**One JSX subtlety the extraction had to get right, and did:** the
original title JSX was one line
(`` {title}{loaded ? ` (${count})` : ''} ``); `PageShell`'s is two,
for readability. JSX strips whitespace-only text nodes containing a
newline, so this doesn't introduce an extra text node or a stray space
— confirmed live (`" (50)"` renders with its leading space intact, from
the template literal, not from JSX formatting), not just assumed safe.

**Deliberately not extracted, and this is why the backlog entry below is
marked resolved, not "closed with nothing left":** the original
recommendation named two options — "extract a shared
`RarityCrewPage`/`CrewListPage` component **or** a `usePageData(...)`
hook covering the `usePlayerData` + loading/error/empty/title pattern."
This shipped the first half (the JSX shell) only. `usePlayerData()`
itself, and the one-line `loaded` computation, still repeat 7×; more
strikingly, `combineComparators(byLevelDesc,
byEquipmentSlotsRemainingDesc, byCollectionCountDesc(collections),
byNameAsc)` — the crew-page default sort order — is now a byte-identical
5-way copy across every crew-shaped page, a duplication the shell
extraction *exposed* rather than *caused*, since it always existed
alongside the shell it was tangled up with. See "Deferred issues" below
— this is deliberately scoped out, not missed.

**Spec/plan:**
`docs/superpowers/specs/2026-08-07-page-shell-extraction-design.md`,
`docs/superpowers/plans/2026-08-07-page-shell-extraction-plan.md`.

## Topbar Refresh button

**Update, Asset cache proxy feature:** the topbar now has two buttons, not
one — this section describes the original (player-data) "Refresh" button
only; the second, "Refresh assets," is a separate, independent control
added later (see "Asset cache proxy" below) and does not touch anything
described in this section.

The "Refresh" control used to live only in `OverviewPage.tsx`'s own
header. It now lives in `AppLayout.tsx`'s `Toolbar` — the app's
persistent topbar, rendered on every route — right-aligned, green
(`color="success"`) instead of the default blue, with a small
`CircularProgress` spinner while loading:

```tsx
<Button
  variant="contained"
  color="success"
  onClick={() => void refresh()}
  disabled={loading}
  startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined}
  sx={{
    ml: 'auto',
    '&.Mui-disabled': { bgcolor: 'success.dark', color: 'common.white' },
  }}
>
  Refresh
</Button>
```

**Zero new plumbing, by construction, not by extra effort.** `refresh()`
already lived in `PlayerDataContext` as one function shared by every page
via `usePlayerData()` — there was never a per-page fetch or per-page
cache, just one `data`/`loading`/`error`/`refresh` in the whole app.
`AppLayout` is rendered inside `PlayerDataProvider` in the component tree
(`App.tsx`: `PlayerDataProvider` wraps `BrowserRouter`, which contains the
`AppLayout` route), so `AppLayout` can call `usePlayerData()` directly,
exactly like every page already does. This was verified directly, not
assumed, by the final reviewer reading `App.tsx`'s actual provider
nesting — it's the one claim the whole feature depends on. The practical
effect: clicking Refresh from any page updates the one shared `data`
value, and whatever page is currently rendered re-renders off that same
updated value — no page-specific wiring needed.

**`color="inherit"` on the spinner doesn't mean what the button's disabled
styling makes it look like — this cost a fix-loop round, worth
remembering.** MUI's contained-`Button` disabled state (`Mui-disabled`)
overrides `color` entirely with theme greys (`action.disabled`/
`action.disabledBackground`), regardless of the button's own `color`
prop. Since `disabled={loading}` and `loading` is `true` during every
refresh **and on every app start** (`PlayerDataContext`'s `loading` state
initializes to `true`), the button spent all of its "working" time
rendered as ~1.5:1-contrast grey-on-blue, with the spinner — meant to be
the app-wide loading signal this feature was specifically asked to add —
nearly invisible. Caught only at final review (the task-level review,
which checks diff-vs-plan fidelity, had no way to catch a bug that was
baked into the plan's own visual assumption, not a deviation from it).
Fixed with a `&.Mui-disabled` `sx` override forcing white-on-dark-green
specifically during the disabled state — the snippet above is the
corrected, shipped version, not the plan's original.

**Re-render behavior, checked and confirmed a non-issue at this app's
scale:** giving `AppLayout` a `usePlayerData()` call means it now
re-renders on every `loading`/`data` transition (previously it didn't,
protected by React's children-as-prop bail-out — `PlayerDataProvider`
received a stable `children` element from `App`, so only actual context
consumers below re-rendered). The added cost is one AppBar + two
`Toolbar`s + one `Typography` + one `Button` + the `Drawer`'s 8
`ListItemButton`s re-rendering per refresh (~15 elements, all producing
identical output so React diffs them to zero DOM mutations) — a fraction
of what the crew/Collections pages' own hundred-plus-row re-renders
already cost on the exact same state transitions. No `useMemo` added to
`PlayerDataContext`'s provider value for this — flagged as a reasonable
general hygiene improvement, not a problem this feature needs to fix.

**Overview's own button was removed, not duplicated** — explicit,
considered decision, not an oversight. `OverviewPage.tsx`'s title reverted
to a plain `Typography variant="h4"`, matching every other page's header
pattern; the `Stack direction="row"` wrapper that existed only to
position the old button is gone. Overview's error `Alert` still has no
in-page "Retry" action (unlike the crew/Collections pages, which pair
theirs with one) — by design, since the always-visible topbar button
already covers it; noted so the asymmetry doesn't read as an oversight
later.

**Spec/plan:** `docs/superpowers/specs/2026-08-04-topbar-refresh-button-design.md`,
`docs/superpowers/plans/2026-08-04-topbar-refresh-button-plan.md`.

## Ships pages

Two new pages, "5 Stars Ships" and "4 Stars Ships," reachable via a new
"Ships" flyout group in the sidebar — the first domain in this app that
isn't crew or collections, and the first nested/flyout nav item. Each
lists the player's ships at that rarity that are **not yet fully
leveled**, one row per ship, sorted so the ships closest to completion
rise to the top.

**Data source:** `player.character.ships` (128 ships in the sample) — a
sibling array to `player.character.crew`, never previously read by this
app.

### Verified facts about the ship data

- `max_level` is 1:1 with `rarity`: rarity 1→`max_level` 5, 2→6, 3→7,
  4→8, 5→9. **Every rarity-1/2/3 ship in the sample already has `level
  === max_level`** — confirmed, which is why only two pages exist (18
  incomplete 4★ ships, 55 incomplete 5★ ships in the sample).
- **The game's on-screen level is the raw JSON value plus one, out of
  `max_level` plus one** — `getShipDisplayLevel(ship)` returns
  `` `${ship.level + 1}/${ship.max_level + 1}` ``. Confirmed against two
  independent real examples the user gave from memory: H.M.S. Bounty is
  `level: 9, max_level: 9` in the JSON, described as "10/10"; U.S.S.
  Reliant is `level: 8, max_level: 9`, described as "9/10." Both match
  `display = raw + 1` exactly.
- **Current schematics owned live in `player.character.items`, not on the
  ship object** — `type: 8` entries whose `archetype_id` equals the
  ship's own `schematic_id`. `getShipSchematicsOwned(ship, items)` does
  `items.find(item => item.archetype_id === ship.schematic_id)?.quantity
  ?? 0`. Verified: U.S.S. Reliant (`schematic_id: 8176`) has a matching
  item with `quantity: 1755`; its `schematic_gain_cost_next_level` is
  `1800` — 1755/1800 toward next level. **5 of 73 incomplete ships in the
  sample have no matching item at all** (all `level: 0`, zero schematics
  collected yet) — the `?? 0` fallback is what handles this, not an error
  case.
- `schematic_gain_cost_next_level` is `-1` for every already-maxed ship in
  the sample (0 exceptions) and a real positive number for every
  incomplete one (0 exceptions) — a clean sentinel. `getShipSchematicsDisplay`
  does not special-case this sentinel (would render e.g. `"0/-1"` for a
  maxed ship) — a deliberately accepted gap, since the only call site
  (`ShipsTable`, fed by `filterIncompleteShipsByRarity`'s output) never
  calls it on a maxed ship in practice. See "Deferred issues" below.
- `OwnedItem` (`types/item.ts`) gained one optional field —
  `quantity?: number` — the only change to an existing type this feature
  made. This closes a deferred-issues backlog entry that had anticipated
  exactly this trigger ("`OwnedItem` doesn't track `quantity`").

### Sort order

`combineComparators(byLevelDesc, byLevelProgressDesc,
byMissingSchematicsAsc(items), byNameAsc)` (`ships/sorters.ts`, reusing
`Comparator<T>`/`combineComparators` imported from `crew/sorters.ts`
as-is at the time this feature shipped — not extracted to a shared module
then, an explicit decision reaffirmed during this feature; both were
later moved to `lib/comparator.ts` by the 2026-08-06 comparator
extraction, see "Sorting design" above) — level first (higher first), then
level-completion fraction (`level / max_level`, closer to its own ceiling
first), then remaining schematics (fewer first), then name as the final
tiebreak.

**Documented, not a defect:** `max_level` is 1:1 with `rarity`, and each
page only ever shows one rarity, so `byLevelProgressDesc` can never
actually change an ordering `byLevelDesc` alone wouldn't already produce
on this app's current pages — a level tie is already a progress-fraction
tie within a page. Implemented anyway, exactly as the user specified,
because it's correct general logic that would matter the moment a page
ever mixed rarities. Same category as `isCollectionUpgradable`'s
documented-but-currently-unexercised `||` branch. **A related latent gap
flagged at final review:** `ships/sorters.ts`'s comparators silently
assume their input has already been filtered to non-maxed ships (a maxed
ship's `-1` sentinel would sort it to the very top of both
`byMissingSchematicsAsc` and `byLevelProgressDesc`) — true today only
because `ShipsPage` always filters first, not enforced by the module
itself. See "Deferred issues" below.

### Table and pages

`ShipsTable` columns: `#`, `Ship` (name), `Level` (right-aligned,
`getShipDisplayLevel`), `Schematics` (right-aligned,
`getShipSchematicsDisplay`). **No Stars/rarity column** — every row on a
given page shares the same rarity already stated in the page title,
unlike the crew pages where rarity varies row-to-row.

`ShipsPage` (internal, not routed) takes `rarity`/`title` props, the same
pairing pattern `FrozenDuplicatesPage` established;
`FiveStarsShipsPage`/`FourStarsShipsPage` are thin wrappers. Empty-state
copy: "No incomplete ships at this rarity." Routes: `/5-stars-ships`,
`/4-stars-ships`.

### The nav flyout

The app's first nested nav item. `AppLayout.tsx`'s `NAV_ITEMS` is now a
mix of flat `NavLink`s and one `NavGroup` (`{ label, children: NavLink[]
}`), discriminated by an `isNavGroup` type guard. "Ships" is appended at
the end, its two children ordered "5 Stars Ships" then "4 Stars Ships" —
**explicit user choice, overriding this project's usual "lower number
first" nav-ordering convention, for this group only.**

New `NavGroupItem` component (`layout/NavGroupItem.tsx`) renders the
"Ships" row (`cursor: default`, no `onClick`/route — it's a group label,
not a page) plus an MUI `Popper` anchored to it, `placement="right-start"`.
**Portal-based deliberately, not `disablePortal`** — the `Drawer`'s paper
has `overflow-y: auto`, which would clip an inline flyout.

Open/close state: entering or focusing *either* the trigger or the panel
opens it and cancels any pending close; leaving or blurring *either*
schedules a close on a cancelable ~150ms timer. **A final-review finding
proved this is more robust than it looks:** because the `Popper` is a
JSX child of the trigger `div` in the React tree (even though portaled
elsewhere in the DOM), React's enter/leave event synthesis computes the
lowest-common-ancestor over the *fiber* tree, not the DOM tree — so
diagonal mouse movement from the trigger straight into the panel never
even fires the trigger's `onMouseLeave`. The 150ms timer is real
belt-and-braces for the pixel-gap case, not the only thing preventing
flicker-close.

**Keyboard accessibility required a fix round after the initial task
review.** The first implementation relied on native Tab order to carry
focus from the trigger into the portaled panel — but `Popper` mounts its
content as the *last child of `document.body`*, so Tab order follows DOM
order, not visual/component order. On any real page with focusable
content in the main area, tabbing off "Ships" moved focus into the page
instead of into the panel, which then closed. (The bug shipped past its
own task's interactive Playwright test because that test happened to run
against the Overview page's session-cookie-missing error state, which has
zero focusable elements — Tab wrapped around and landed on the panel for
the wrong reason.) Fixed with explicit keyboard handling: `ArrowDown`/
`Enter` on the trigger opens the panel and moves focus to its first item
(via a callback ref, since `Popper`'s content mounts on a delay a plain
`useEffect` would race); `Escape` inside the panel closes it and returns
focus to the trigger, guarded against immediately reopening itself via
the trigger's own `onFocus`. Re-verified on `/5-stars-ships` (a page with
a real focusable "Retry"-style control), not the page that hid the
original bug.

**Fixed 2026-08-06 — see "NavGroupItem Escape/ARIA/max-height follow-up"
below.** (Kept here, struck through in spirit, as a pointer for anyone
who remembers this entry from before — the fix is real, not just noted.)
Originally: no ARIA menu semantics, and `Escape` only closed the panel
when focus was already inside it, not when focus was still on the
trigger.

**Spec/plan:** `docs/superpowers/specs/2026-08-04-ships-pages-design.md`,
`docs/superpowers/plans/2026-08-04-ships-pages-plan.md`.

## Crew nav group and schematics progress bar

Two small, unrelated UI changes shipped together.

**Nav restructure:** the six crew-related drawer entries (the four crew
pages plus "4 Stars Duplicates"/"5 Stars Duplicates") now live inside a
new "Crew" flyout group, the same shape as "Ships" above. Top-level drawer
order is now **Overview / Crew / Ships / Collections** — "Overview" and
"Collections" stay flat single items (no reason to group either). Within
"Crew," item order is unchanged from the original flat list, just nested.
**This is a pure `NAV_ITEMS` data change** — `NavGroupItem` (see "The nav
flyout" above) needed zero modification to support a second group with 3×
the children, which is the concrete proof its "generic, reusable"
design claim from the Ships feature actually holds. **A real ceiling this
group size ran into, fixed 2026-08-06:** `NavGroupItem`'s panel originally
had no `max-height`/scroll fallback, so six default-height
`ListItemButton`s (~304px) would have clipped on a sub-450px-tall
viewport — see "NavGroupItem Escape/ARIA/max-height follow-up" below.

**Schematics progress bar:** the Ships pages' "Schematics" column gained a
thin blue `LinearProgress` bar stacked above the existing `"owned/needed"`
text. New getter in `ships/getters.ts`:

```ts
export function getShipSchematicsProgress(ship: Ship, items: OwnedItem[]): number {
  const needed = ship.schematic_gain_cost_next_level;
  if (!Number.isFinite(needed)) return 0; // missing/malformed data — fail closed, not "maxed"
  if (needed <= 0) return 100; // legitimate already-maxed sentinel (verified: always exactly -1)
  return Math.min(100, (getShipSchematicsOwned(ship, items) / needed) * 100);
}
```

`color="primary"` renders MUI's default blue without any theme change
(this app has no custom MUI theme). The wrapping `Box` needs
`minWidth: 100` — without it, an `inline-block` wrapper shrinks to the
text's natural width and the bar (which fills 100% of its container)
would render at an inconsistent width per row. **Both the bar and the
existing text read from the same `getShipSchematicsOwned`/
`schematic_gain_cost_next_level` values, so they cannot disagree** — no
second source of truth was introduced. (This got slightly weaker once the
missing-field guard below shipped: the bar now fails closed to 0% on
malformed data, but `getShipSchematicsDisplay`'s text does not have the
same guard — see the new deferred-issues entry below.)

**Fixed 2026-08-06 — see `docs/superpowers/specs/2026-08-06-ship-schematics-progress-guard-design.md`
and `docs/superpowers/plans/2026-08-06-ship-schematics-progress-guard-plan.md`.** The
`needed <= 0` guard originally only caught a non-positive value, not a
genuinely *missing* one. `getShipList` casts unvalidated JSON, so if the
API ever omitted `schematic_gain_cost_next_level` entirely, `undefined <=
0` was `false` and the function fell through to `(owned / undefined) *
100`, which is `NaN` — MUI renders that as an invalid `translateX(NaN%)`
transform, silently dropped by the browser, so the bar would have
rendered as if 100% full for a ship that isn't. Never observed in the
real sample (the field is always present, verified with zero exceptions
across all 128 ships) — this was always a defensive fix for a shape real
data doesn't contain, not a live bug. **The fix returns `0`, not `100`,
for the missing/invalid case** — a deliberate reversal of this backlog
entry's own original one-line suggestion (`if (!(needed > 0)) return
100;`), reconsidered during brainstorming as more consistent with this
project's fail-closed instinct elsewhere (e.g. the equipment-slot guards
in `crew/getters.ts`): folding "can't evaluate" into "definitely maxed"
would have looked identical to the correctly-maxed case, defeating the
point of the guard. Verified via a throwaway script that ran an inlined
copy of the old logic against the new logic across all 128 real ships
(identical output for every one, proving the fix is a pure addition for
real data) plus hand-constructed `undefined`/`NaN` cases the real sample
doesn't contain — see the plan for the exact script.

**Spec/plan:** `docs/superpowers/specs/2026-08-04-crew-nav-group-and-schematics-bar-design.md`,
`docs/superpowers/plans/2026-08-04-crew-nav-group-and-schematics-bar-plan.md`.

## NavGroupItem Escape/ARIA/max-height follow-up

Three previously-deferred `NavGroupItem` gaps, closed in one pass — see
"Ships pages" and "Crew nav group and schematics progress bar" above for
where each was originally flagged.

**Escape now closes the flyout from the trigger, not just from inside the
panel.** The old `Escape` handler lived only on the portaled `Paper`, so
it never fired if focus was still on the trigger (the most common state
right after opening via hover, or via `ArrowDown`/`Enter` without tabbing
further). Handling is now consolidated on the wrapper `div`'s `onKeyDown`
— the `Popper`'s content is portaled elsewhere in the DOM but stays a
React child of the wrapper, so keydowns from both the trigger and every
panel item already bubble there (same fiber-vs-DOM-tree fact the
open/close hover logic already relied on). A
`document.activeElement !== triggerRef.current` guard skips the
refocus-and-suppress dance when focus was already on the trigger.

**Full ARIA menu semantics, including arrow-key navigation:** the trigger
gained `aria-haspopup="true"`/`aria-expanded={open}`; the panel gained
`role="menu"` with `aria-label={label}` (added after final review — a
`role="menu"` with no accessible name announces as an unlabeled "menu, N
items"); each item gained `role="menuitem"` with `ArrowUp`/`ArrowDown`
(wrapping at both ends) and `Home`/`End` moving focus between them.
**A real MUI internals risk, checked and confirmed safe:** `ListItemButton`
is built on `ButtonBase`, which defaults non-native-button components to
`role="button"` — the final reviewer traced MUI 6.5.0's source
(`ButtonBase.js`) and confirmed the caller's explicit `role="menuitem"`
prop is spread *after* that default, so it wins; live-verified in the DOM
as well. **Also added after final review:** activating an item (`Enter`
or click) now returns focus to the trigger before closing, rather than
letting `navigate()` unmount the focused item and drop focus to
`<body>` — a real WCAG 2.4.3 regression the ArrowDown→Enter keyboard flow
this feature adds would otherwise hit on every single use.

**Max-height + scroll**, closing the "six items would clip on a
sub-450px-tall viewport" gap: the panel's `Paper` caps at
`calc(100vh - 32px)` with `overflowY: auto`. **The `32px` figure isn't
"16px top + 16px bottom" evenly split, despite reading that way at a
glance** — MUI's `Popper` clamps the panel's bottom edge into the
viewport, so in practice all the slack ends up above the panel and none
below; the final reviewer measured this directly (a 300px-tall viewport
produced a panel bottom flush with the viewport edge, `scrollHeight`
304 > `clientHeight` 268, genuinely scrollable). The cap works — Popper's
clamping is what makes a viewport-relative height sufficient without
knowing the anchor's own position — the original one-line rationale
just described the wrong mechanism.

**Verification:** this project has no automated test framework or CI
browser harness — verified via `tsc`/`eslint` plus interactive checks
against a real dev server using the `playwright` MCP tooling (the same
tooling that became available this session, per "Browser-based visual
verification" above): reproduced the Escape-from-trigger bug on the
unfixed code first, then confirmed the fix on both the 6-item "Crew" and
2-item "Ships" groups — Escape from both focus states, arrow-key
wraparound in both directions, Home/End, the max-height/scroll fallback
at a genuinely-overflowing viewport height, and the click-to-navigate
regression path. The final reviewer independently re-derived the
keyboard/focus state machine rather than trusting the report — in
particular confirming `suppressTriggerFocusOpenRef` is consumed exactly
once on every path that sets it, and that a stale `scheduleClose` timer
racing against an `Escape`-triggered `setOpen(false)` can't reopen a
closed panel (every reopen path calls `cancelClose()` first via
`openNow()`).

**Known, deliberately-deferred gaps (all Minor at final review):** no
roving `tabindex` (the WAI-ARIA APG menu pattern expects exactly one
tabbable item at a time, with `Tab` exiting the menu entirely — here
every item is independently `Tab`-reachable, which degrades gracefully
but isn't the full pattern); `handleTriggerFocus` (the wrapper's
`onFocus`) is a slightly misleading name since it also fires for
panel-item focus, not just the trigger's; `focusFirstItemRef` could
theoretically be stranded `true` forever if `items` were ever empty
(unreachable today — `NAV_ITEMS` is a fixed module constant). See
"Deferred issues" below.

**Spec/plan:** `docs/superpowers/specs/2026-08-06-navgroupitem-keyboard-aria-design.md`,
`docs/superpowers/plans/2026-08-06-navgroupitem-keyboard-aria-plan.md`.

## Crew/ship image column (Phase 1 of 2 — frontend only)

**Update: Phase 2 has since shipped — see "Asset cache proxy" below.**
Everything in this section describes Phase 1 as originally built and is
kept as history; the one detail it no longer gets right is `ASSET_BASE_URL`'s
literal value, called out inline below.

Every crew page and every ship page gained a 40x40px thumbnail "Image"
column, second column from the left (right after `#`) — crew portraits on
the crew pages, ship preview art on the ship pages. This is Phase 1 of a
two-phase feature: images were hotlinked directly from the public asset host
`assets.datacore.app` at first. Phase 2 (a Node-backend caching proxy so the
browser stops hitting that host directly on every page view) was the
deliberately-deferred next step — see "Asset cache proxy" below for how it
actually turned out.

**The original ask assumed the image URL would need to be predicted from
the crew/ship's display name via some slugification scheme — this turned
out to be unnecessary.** Both crew and ship objects in the real payload
already carry the exact asset path under a `{file}` object:

```
crew.portrait.file === "/crew_portraits/cm_pike_amand_rauth_sm"
ship.icon.file      === "/ship_previews/fed_arctic_one"
```

— which map directly to the real asset URLs
(`crew_portraits_cm_pike_amand_rauth_sm.png`,
`ship_previews_fed_arctic_one.png`) by stripping the leading `/`, replacing
internal `/` with `_`, and appending `.png`. **Re-verified against the full
reference dataset for this doc update, not just the handful of examples
used at design time:** all 597/597 crew have a `portrait.file`, all
128/128 ships have an `icon.file` — no missing-data case exists in the
sample at all (the `Thumbnail` placeholder path is real code, just not yet
exercised by this particular dataset).

**New top-level `assets/` module** (sibling to `crew/`, `collections/`,
`ships/`), deliberately asset-type-agnostic per explicit user request for
future reuse (items/rewards icons, etc.):

```ts
// assets/config.ts — this was the Phase 1 value; since Phase 2 shipped,
// ASSET_BASE_URL is '/api/assets' instead (see "Asset cache proxy" below)
export const ASSET_BASE_URL = 'https://assets.datacore.app';

// assets/getAssetUrl.ts
export function getAssetUrl(asset: DatacoreAsset | undefined): string | undefined {
  if (!asset?.file) return undefined;
  const path = asset.file.replace(/^\//, '').replace(/\//g, '_');
  return `${ASSET_BASE_URL}/${path}.png`;
}
```

`getAssetUrl` doesn't special-case crew vs. ships at all — it just turns
any `{file: string}` object into a URL. This was checked against the
hardest real case during final review: item objects in the payload carry
`icon: {file: "/items/components/casing_compon"}`, a three-segment path,
deeper than crew/ship assets — `getAssetUrl`'s global `/`→`_` replace
handles it with zero changes needed, confirming the agnostic-design claim
is real rather than aspirational.

**Shared `Thumbnail` component** (`assets/Thumbnail.tsx`), used by both
`CrewTable` and `ShipsTable`:

```tsx
function Thumbnail({ asset, alt }: ThumbnailProps) {
  const [failed, setFailed] = useState(false);
  const url = getAssetUrl(asset);
  if (!url || failed) {
    return <Box sx={{ width: 40, height: 40, bgcolor: 'action.hover', borderRadius: 1 }} />;
  }
  return (
    <Box component="img" src={url} alt={alt} loading="lazy" decoding="async"
      onError={() => setFailed(true)}
      sx={{ width: 40, height: 40, borderRadius: 1, objectFit: 'cover' }} />
  );
}
```

Two distinct failure modes — "no `{file}` data at all" and "URL present
but the image failed to load" (e.g. a renamed/removed upstream asset) —
deliberately collapse to the exact same placeholder rendering path, not two
different ones; this is also the single point where a real placeholder
image (planned, not yet supplied by the user) will replace the grey `Box`.
`loading="lazy"`/`decoding="async"` were added in the final whole-branch
review, not the original plan — neither `CrewTable` nor `ShipsTable`
paginates or virtualizes, so every filtered row renders at once, and
without lazy-loading a page navigation would fire a burst of parallel
requests at the third-party host for rows mostly below the fold. This is
an independent mitigation, not a substitute for the Phase 2 caching proxy.

**No security issue in constructing a URL from unvalidated payload data:**
verified at final review — `getAssetUrl` prefixes a hard-coded scheme and
authority and strips every `/` from the payload-supplied segment, so a
hostile `file` value cannot inject a scheme, escape the path, or manipulate
the authority; worst case is a same-host 404, and the result is only ever
rendered as an `<img src>`, never as script.

**Column placement:** inserted immediately after `#`, before every other
existing column, on both `CrewTable` (`#, Image, Stars, Name, Level, Items
to equip, Collections`) and `ShipsTable` (`#, Image, Ship, Level,
Schematics`). Both tables are the single shared rendering layer for all 6
crew pages and 2 ship pages (see "The shared rendering layer" above), so
the entire feature was two component edits plus two type edits (`portrait?`
on `CrewMember`, `icon?` on `Ship`) — every page picked up the column
automatically, zero per-page changes, the same reuse story as every prior
`CrewTable`/`ShipsTable` feature.

**Verification, this project's usual pattern:** a throwaway
`assets/__verify.ts` script (deleted before commit) asserted `getAssetUrl`
against real known-good examples (Amand Rauth Pike, Bold Boimler, Arctic
One, Alternate Probability Cerritos), all matching exactly, plus a
missing-portrait count across the full crew list (0/597). Full
browser-based visual verification was deferred at the time (this sandbox
had no working headless-browser tooling) but has since been completed —
see the "Browser-based visual verification (2026-08-06)" note at the end
of the "Asset cache proxy" section below, which closes out this gap for
both Phase 1 and Phase 2.

**Spec/plan:**
`docs/superpowers/specs/2026-08-05-crew-ship-image-column-design.md`,
`docs/superpowers/plans/2026-08-05-crew-ship-image-column.md`.

## Asset cache proxy

Phase 2 of the crew/ship image feature above: crew and ship thumbnails now
load from the local Express server instead of hotlinking
`assets.datacore.app` directly on every page view. `ASSET_BASE_URL`
(`assets/config.ts`) — the one-constant seam Phase 1 was specifically built
around — is now `/api/assets`; `getAssetUrl.ts` and `Thumbnail.tsx` were not
touched at all, proving that seam worked exactly as designed.

**Server-side cache** (`server/src/assetCache.ts`), a flat-file cache
mirroring the existing `cache.ts`'s style for `player-cache.json`:

```ts
const CACHE_DIR = 'data/assets';
// getCachedAssetPath, isKnownMissing, writeAssetCache, markAssetMissing, clearAssetCache
```

One real file per cached image (e.g.
`data/assets/crew_portraits_cm_pike_amand_rauth_sm.png`), one empty
`<filename>.missing` marker per confirmed-absent asset — both flat, both
under the existing `server/data/` gitignore entry, nothing new to ignore.

**The one piece of real logic — confirmed-404 vs. transient failure —
is enforced at the type level, not just by convention**
(`server/src/assetClient.ts`):

```ts
export async function fetchAsset(filename: string): Promise<Buffer | null> {
  // ...
  if (response.status === 404) return null;       // confirmed absent
  if (!response.ok) throw new UpstreamError(...);  // transient — never cached as missing
  // ...
}
```

`null` is the only path that reaches `markAssetMissing` in the route
handler; a thrown `UpstreamError` (network failure, a 5xx, anything that
isn't a genuine 404) can't reach it structurally, not just by care — this
was independently re-verified at final review by reading the call graph,
not by trusting the implementer's report.

**The proxy route** (`server/src/routes/assets.ts`,
`GET /api/assets/:filename` + `POST /api/assets/refresh`) mirrors
`routes/player.ts`'s factory shape and 502/`UPSTREAM_ERROR` envelope.
Branch order: filename-pattern validation → cache hit (serve, no upstream
call) → known-missing (404, no upstream call) → fetch-and-classify. Both
"no upstream call" branches were independently re-verified at final review
by reading the code (both paths `return` before `fetchAsset` is ever
reached), not just by the task-level curl evidence.

**`:filename` validation is a real security boundary, verified against
both adversarial input and the full real dataset:**
`/^[A-Za-z0-9_-]+\.png$/` is checked before the value touches the
filesystem or the upstream URL. At final review this was checked directly
against a battery of bypass attempts (`../../etc/passwd`, embedded `%2F`,
null bytes, CRLF, wrong extensions, Unicode lookalikes) — all correctly
rejected — and, separately, against every real asset path in
`example-data.json` to confirm the pattern never rejects legitimate
traffic. **Re-verified independently for this doc update, not just copied
from the final review:** running the same transform over all 1322 real
asset paths (597 crew portraits + 597 crew full-body images + 128 ship
icons) produces zero pattern failures.

**Cache-hit-avoids-refetch was proven with a real mechanism, not
inference:** the task-level verification captured a cached file's mtime,
made a second request, and confirmed the mtime was unchanged — a re-fetch
would necessarily have rewritten the file and moved it, so an unchanged
mtime is direct evidence the second request never called `fetchAsset`.

**"Refresh assets" button** (`AppLayout.tsx`), independent of the existing
player-data "Refresh" button — separate loading state, separate error
handling, neither triggers the other. Went through one fix round after its
own task-level review: the first version had no `catch`, so a failed
refresh silently vanished with zero user feedback.
The reviewer flagged this as a plan-mandated Important finding (the gap was
in the plan's own code, not an implementer deviation), it was surfaced to
the user rather than auto-fixed, and the user chose "fix now" — the shipped
version adds an `assetsError` state surfaced via an MUI `Snackbar`/`Alert`,
which is actually a strict improvement over the pattern it was compared
against (the existing player-data error only renders on `OverviewPage`;
the new asset error is app-wide since `AppLayout` hosts it on every route).

**Verification, this project's usual pattern, extended for a
backend-and-network feature:** Task 1 (cache primitives + fetch client) had
a throwaway `__verify-assets.ts` script exercising real filesystem writes
and a real network call against `assets.datacore.app` (outbound internet
access was independently confirmed available in this environment before
the task was dispatched, rather than assumed). Task 2 (the route) was
verified with a full curl sequence against the real running dev server —
cache-miss-then-hit, 404-then-memoized-404, malformed-filename rejection,
and cache-clearing, each with literal HTTP status codes and file-existence
checks, not summarized claims. Task 3 (the client wiring) again hit this
sandbox's known missing-headless-browser-tooling gap (same as Phase 1) and
fell back to curl through the client's Vite proxy, which is real evidence
of correct HTTP wiring even without pixels. The final reviewer explicitly
named this as a gap in *rendering* confidence, not in the correctness of
anything the branch adds, since every server behavior in the spec's
error-handling table has direct HTTP-level evidence. **This gap is now
closed — see the next note.**

**Browser-based visual verification (2026-08-06):** the sandbox's
headless-browser tooling was fixed in an earlier session (missing
`libnspr4`/`libnss3`/`libasound2t64` shared libraries), and this session
got the `playwright`/`chrome-devtools` MCP servers actually working
against it — both were configured (by `claude mcp add` defaults) to
launch a system Chrome at `/opt/google/chrome/chrome`, which doesn't
exist in this container; re-pointing both at the already-working bundled
Playwright Chromium (`~/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
via `--executable-path`/`--executablePath`) and reconnecting (`/mcp`) got
real browser tooling working for the first time in this project. With it,
both the crew image column (`/3-4-stars-crew`) and the ship image column
(`/5-stars-ships`) were loaded against the real dev servers (already
running with cached `player-cache.json`/asset-cache data) and visually
confirmed: every row rendered a real portrait/ship-preview thumbnail, not
the grey placeholder, closing the one check both Phase 1 and Phase 2 final
reviews flagged as never completed.

Two things surfaced during this pass, both confirming existing design
rather than finding a defect:
- One ship thumbnail (U.S.S. Glenn, a 1024×1024/546KB source image)
  appeared blank in a screenshot taken immediately after navigation, then
  rendered correctly on a later screenshot of the same page — a
  `decoding="async"` paint-timing artifact of screenshotting very shortly
  after load, not a rendering bug.
- One ship thumbnail (The Serene Squall) hit a real transient 502 from
  the asset proxy on first load; the `Thumbnail` component's `onError`
  fallback correctly rendered the grey placeholder `Box` for it (verified
  via DOM inspection — no `<img>` present, exactly the fail-closed path
  documented above), and a page reload immediately recovered it to a real
  `<img>` — direct, live confirmation that the "502/`UPSTREAM_ERROR` is
  transient, never cached as missing" design (see above) behaves correctly
  under a real upstream hiccup, not just by code-reading.

**Known, deliberately-accepted gaps (all Minor at final review, none
looped into the branch):** cache writes aren't atomic (`writeFileSync` in
place rather than write-temp-then-rename, so a concurrent request for the
same uncached filename during the write window could theoretically serve a
truncated image — self-healing on reload) — **resolved 2026-08-07, see the
Asset cache proxy follow-ups fix wave below.**; no in-flight de-duplication
for concurrent misses of the same filename (correct outcome, just
occasionally wasteful); `res.sendFile` has no error callback, so deleting a
file between the cache-check and the send (e.g. clicking "Refresh assets"
while a thumbnail-heavy page is still loading) falls through to Express's
default error handler instead of a clean 404 — **resolved 2026-08-07, see
the Asset cache proxy follow-ups fix wave below.**; `.missing` markers
accumulate with no eviction/TTL; `POST /api/assets/refresh` is
unauthenticated — explicitly judged acceptable and *not* worth fixing,
since the proxy has a fixed upstream host and no path control (no
SSRF/open-relay surface), and this is strictly less sensitive than the
pre-existing unauthenticated `/api/player`/`/api/player/refresh` endpoints
already on this server; if that trust boundary is ever revisited, binding
the server to `127.0.0.1` would harden all of these at once, not just this
route. See "Deferred issues" below.

**Asset cache proxy follow-ups (2026-08-07):** a fix wave addressing four
items from the gaps above and the client-side gaps noted in "Deferred
issues" below — atomic cache writes (`writeAssetCache` now writes to a
`.tmp-<uuid>` file and `renameSync`s it into place), a `sendFile` error
callback on the proxy route (answers a clean 404 instead of falling through
to Express's default handler), `Thumbnail`'s `alt` text changed to `alt=""`
(the image is decorative next to its own text label; also moots the
placeholder-`aria-label` gap since an unlabeled decorative placeholder is
correct), and a success `Snackbar` on "Refresh assets" (mirroring the
existing error one). A final whole-branch review of that fix wave then
found one more Important bug — the new 404's JSON body was served under
`Content-Type: image/png` because `res.type('image/png')` ran before
`res.json()` and Express's `res.json()` only sets `Content-Type` if none is
already present — fixed by an explicit `.type('application/json')` before
the `.json()` call, plus one cheap, closely-related Minor fix folded in:
`clearAssetCache` now passes `{ force: true }` to `rmSync` so a `.tmp-*`
file vanishing mid-clear (raced away by a concurrent `writeAssetCache`)
can't throw `ENOENT` and turn `POST /api/assets/refresh` into a 500.
Spec/plan: `docs/superpowers/specs/2026-08-06-asset-cache-proxy-follow-ups-design.md`,
`docs/superpowers/plans/2026-08-06-asset-cache-proxy-follow-ups-plan.md`.

**Spec/plan:**
`docs/superpowers/specs/2026-08-05-asset-cache-proxy-design.md`,
`docs/superpowers/plans/2026-08-05-asset-cache-proxy.md`.

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
9. **Crew collections count** (`2026-08-03-crew-collections-count`) — the
   crew↔collection membership rule (deep-dive above), `Collection` type,
   new `collections/getters.ts` module, a "Collections" column (last,
   right-aligned) on all 4 crew pages, and a new `byCollectionCountDesc`
   sort key inserted between equipment-slots and name. First feature to
   add a new top-level module (`collections/`) alongside `crew/`, and the
   first factory-shaped comparator in `sorters.ts`.
10. **Collections page** (`2026-08-03-collections-page`) — the reverse
    direction of #9: for each of the 88 collections, which owned crew
    belong to it. `getCrewTier` (deep-dive above, generalizing
    Immortalization across every `max_rarity`), `getCollectionCrew`
    (reuses `crewBelongsToCollection` unmodified, kept unsorted to avoid
    a circular import), new `CollectionsTable`/`CollectionCrewList`
    components, new `/collections` route. First feature where a
    circular-import risk was caught and resolved *during planning*
    rather than discovered at review time.
11. **Collections row detail** (`2026-08-03-collections-row-detail`) —
    extended the Collections page's main rows with row number, curated
    rewards (deep-dive above), progress/goal, and claimed-milestone-count
    columns; changed collection ordering from alphabetical to
    completion-ratio-first (deep-dive above); removed the expand/collapse
    UI entirely since rows are always expanded. Both task-level reviews
    came back with zero findings — first feature in the project where an
    implementer's diff matched its brief closely enough that no Minor
    findings surfaced until the final whole-branch review.
12. **Frozen crew and duplicate exclusion** (`2026-08-03-frozen-crew-exclusion`)
    — reverse-engineered `stored_immortals` as the frozen-crew archetype
    list (deep-dive above), excluded frozen-archetype duplicates from
    `getCollectionCrew`'s output (Collections page only, by explicit
    scope decision), and bundled in the `isMaxedOut` extraction the
    row-detail feature had deferred. First feature where the final
    review didn't just re-confirm the spec's claim but independently
    strengthened it — the `extra_crew`-collection `progress` reconciliation
    proves the exclusion correct rather than merely plausible.
13. **Frozen duplicates pages** (`2026-08-03-frozen-duplicates-pages`) —
    the deliberate opposite of #12 (deep-dive above): two new pages
    surfacing frozen-archetype duplicates by `max_rarity` instead of
    hiding them, via a new `filterFrozenDuplicates` and one parameterized
    `FrozenDuplicatesPage` reused by two thin wrappers. Final review
    independently re-derived the headline claim through a code path that
    never called the shipped filter or sort functions at all, and got an
    identical result — the strongest form of verification this project
    has done yet.
14. **Collections needsWork tier label** (`2026-08-04-collections-needs-work-label`)
    — a small, single-file rendering-only addition to `CollectionCrewList`
    (deep-dive in "The shared rendering layer" above): crew at the
    `needsWork` tier (max rarity, but not level 100 and/or not fully
    equipped) now get an amber "4/4 Stars"-style chip, mirroring the
    existing green "Ready" chip for the `ready` tier — so a collection's
    crew sub-list visually distinguishes all three tiers at a glance
    instead of just singling out `ready`. No new getters, filters, types,
    or business logic; `getCrewTier` already computed the distinction,
    this only surfaces it. First feature with no spec doc (brainstormed,
    then went straight to a plan, by explicit user choice for a
    single-file change) and first feature where the final whole-branch
    review's finding changed shipped copy after the fact: the plan
    specified the chip text as the literal `${max_rarity} Stars`
    ("4 Stars"), but final review flagged that this collided with the
    unrelated "4 Stars Duplicates" page name and suggested matching the
    app's own "4/4 Stars crew" page name instead; the user was asked and
    chose "4/4 Stars," which shipped as a one-line post-review fix with
    its own scoped re-review, not a plan-vs-review case the controller
    could resolve unilaterally.
15. **Collections "Upgradable" chip** (`2026-08-04-collections-upgradable-chip`)
    — deep-dive above ("The 'Upgradable' chip and upgradable-first sort").
    A collection gets a blue "Upgradable" chip and sorts to the top when
    its remaining-to-milestone crew count is already covered by its
    `ready`/`needsWork` crew. First feature with a proper design spec
    since the needsWork label feature skipped one (this one spans three
    files and a real architecture change, judged to warrant it). First
    feature where the controller pre-validated the plan's exact code by
    applying it directly on `main` and running build/lint/the real
    verification script *before* dispatching any implementer — caught and
    corrected an inaccurate performance claim in the plan (guessed "well
    under ~12ms," measured ~29-31ms steady-state) before it could cause a
    false failure downstream. First feature where a final-review finding
    was adjudicated by the controller against the review's own
    recommendation: the reviewer marked the `PROJECT_STATE.md` staleness
    "Important — must fix before merge," but the controller recognized
    this conflicts with the project's own established, repeatedly-confirmed
    workflow (doc updates land as a separate commit *after* merge+push,
    not inside the feature branch) and parked it for the standard
    post-merge follow-up instead of looping a fix into the branch — the
    same category of judgment call as the earlier `-4..0` sign-convention
    override, just about process timing rather than business logic.
16. **Topbar Refresh button** (`2026-08-04-topbar-refresh-button`) —
    deep-dive above. Moved the "Refresh" control from `OverviewPage`'s own
    header into `AppLayout`'s persistent topbar, recolored green, added a
    loading spinner. First feature that touched `AppLayout.tsx` itself
    (previously untouched by any feature) and the first non-page
    `usePlayerData()` consumer. First feature with a real bug caught only
    at final review that traced back to an incorrect assumption in the
    *spec itself*, not an implementation deviation — `color="inherit"` on
    the spinner was assumed to render white-on-green, but MUI's
    disabled-button styling overrides `color` entirely, so the button
    rendered near-invisible grey-on-blue during every loading state
    (including every app start) until a `&.Mui-disabled` `sx` override
    fixed it in a one-round fix loop. Also the second feature (after the
    Upgradable chip) where a final-review `PROJECT_STATE.md`-staleness
    finding was adjudicated as a post-merge follow-up rather than a
    branch fix, for the same established-workflow reason as before.
17. **Ships pages** (`2026-08-04-ships-pages`) — deep-dive above. Two new
    pages ("5 Stars Ships," "4 Stars Ships") reading a previously-untouched
    part of the payload (`player.character.ships`), the first domain
    module that isn't crew or collections, and a new hover/focus flyout
    "Ships" nav group — the app's first nested nav item. First feature
    with a genuine multi-round fix loop at the task level (not just final
    review): the initial `NavGroupItem` implementation passed its own
    task's interactive Playwright test but only because that test ran
    against a page with zero focusable content, masking a real keyboard-
    Tab-order bug caused by `Popper`'s portal mounting outside the
    visual DOM order; caught by task review, fixed, and re-verified on a
    page that actually exercised the bug. First feature where the
    controller found and patched a gap in its own plan text *before*
    dispatching any implementer (the `byLevelProgressDesc` comparator's
    "not dead code" rationale lived in the design spec's prose but not in
    the Global Constraints block task reviewers actually see — added
    during the required pre-flight scan, avoiding a predictable
    false-positive review finding). Third feature (after the Upgradable
    chip and the Refresh button) where a final-review
    `PROJECT_STATE.md`-staleness finding was adjudicated as a post-merge
    follow-up rather than a branch fix.
18. **Crew nav group and schematics progress bar**
    (`2026-08-04-crew-nav-group-and-schematics-bar`) — deep-dive above.
    Two small, independent changes: the six crew-related drawer entries
    regrouped under a new "Crew" flyout (reusing `NavGroupItem` completely
    unmodified — the concrete proof of its "generic, reusable" design
    claim from the Ships feature), reordering the top-level drawer to
    Overview / Crew / Ships / Collections; and a thin blue `LinearProgress`
    bar added above the Ships pages' existing "owned/needed" schematics
    text. First feature since Ships where the final whole-branch review
    returned **zero** Critical or Important findings — only five Minors,
    all deferred — and the first time a final reviewer independently
    identified the `PROJECT_STATE.md`-staleness item as a correctly
    out-of-scope post-merge follow-up on its own, rather than flagging it
    "must fix before merge" and needing the controller to override it (as
    happened for the two prior features).
19. **Crew/ship image column, Phase 1** (`2026-08-05-crew-ship-image-column`)
    — deep-dive above. A 40x40 "Image" column added to all 6 crew pages and
    both ship pages, sourced directly from `crew.portrait`/`ship.icon`
    fields already present in the real payload (no name-based URL
    prediction needed, unlike what the original request assumed), via a
    new asset-type-agnostic `assets/` module (`getAssetUrl`, `Thumbnail`).
    First feature explicitly split into two phases at the brainstorming
    stage (frontend hotlinking now, a backend caching proxy later) rather
    than designed as one spec. First feature where full browser-based
    visual verification was attempted but genuinely unavailable in the
    sandbox (missing headless-Chromium system library, no `chromium-cli`),
    so the controller substituted independent data-shape re-verification
    and close static reading of the JSX/MUI usage in its place — flagged
    explicitly rather than silently treated as equivalent to a real visual
    check. Final whole-branch review added one fix
    (`loading="lazy"`/`decoding="async"`, an independent performance
    mitigation given both tables render every filtered row unpaginated)
    and parked the `PROJECT_STATE.md`-staleness finding per the
    now-well-established convention from features #15-18.
20. **Asset cache proxy, Phase 2** (`2026-08-05-asset-cache-proxy`) — deep
    dive above. A Node-backend proxy/cache (`GET /api/assets/:filename`,
    `POST /api/assets/refresh`) so crew/ship thumbnails load from the local
    server instead of hotlinking `assets.datacore.app` on every view;
    `ASSET_BASE_URL` repointed, `getAssetUrl.ts`/`Thumbnail.tsx` untouched,
    proving the Phase 1 seam worked exactly as designed. First feature
    whose one piece of real logic (confirmed-404-vs-transient-failure) was
    designed to be structurally unrepresentable-if-wrong (a typed
    `Buffer | null` return vs. a thrown error) rather than merely
    convention-correct. First feature with a plan-mandated Important
    finding from a *task-level* review (not just final review, as in the
    Ships-pages precedent) — the Refresh-assets button's original
    try/finally-without-catch came straight from the plan's own code, was
    surfaced to the user rather than silently fixed or dismissed per the
    established plan-mandated-finding rule, and the user chose to fix it
    in a one-round fix loop. First feature since Ships with a real,
    concretely-scoped multi-task fix loop, and the first time a controller
    independently re-verified a final reviewer's most load-bearing
    numeric claim (1322 real asset paths, zero filename-pattern
    rejections) for a doc update rather than copying it verbatim. Final
    whole-branch review returned zero Critical/Important findings and
    explicitly recommended *against* fixing one of its own Minor findings
    (unauthenticated `/api/assets/refresh`) rather than reflexively listing
    it as a gap — reasoning that it doesn't widen this server's existing
    trust boundary, since `/api/player` was already unauthenticated too.

## Current routes / nav (in order)

| Nav label | Path | Filter |
|---|---|---|
| Overview | `/` | player identity, not crew |
| Crew → 3/4 Stars crew | `/3-4-stars-crew` | rarity=3, max_rarity=4 |
| Crew → 4/5 Stars crew | `/4-5-stars-crew` | rarity=4, max_rarity=5 |
| Crew → 4/4 Stars crew (ready) | `/4-4-stars-crew-ready` | rarity=4, max_rarity=4, ready to immortalize |
| Crew → 4/4 Stars crew | `/4-4-stars-crew` | rarity=4, max_rarity=4, needs work |
| Crew → 4 Stars Duplicates | `/4-stars-duplicates` | max_rarity=4, archetype has a frozen twin |
| Crew → 5 Stars Duplicates | `/5-stars-duplicates` | max_rarity=5, archetype has a frozen twin |
| Ships → 5 Stars Ships | `/5-stars-ships` | ship rarity=5, not yet fully leveled |
| Ships → 4 Stars Ships | `/4-stars-ships` | ship rarity=4, not yet fully leveled |
| Collections | `/collections` | one row per collection, reverse (collection→crew) view |

Top-level drawer order: **Overview / Crew / Ships / Collections**. "Crew"
and "Ships" are both hover/focus flyout groups (see "The nav flyout" and
"Crew nav group and schematics progress bar" above) — neither is itself a
route. "Overview" and "Collections" are the only remaining flat,
directly-clickable drawer entries.

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
- **`EnterWorktree` branches from `origin/main`**, not local `main` — for
  every feature through the Collections one, no remote push had ever
  happened, so `origin/main` was permanently stale and the immediate next
  step after creating a worktree was always `git merge main` inside it to
  pull in the real local history. **As of the Collections feature, `main`
  has been pushed to GitHub for the first time** (`git push origin main`,
  42 commits, clean fast-forward), so `origin/main` is now current — but
  the same staleness will return the moment local commits accumulate
  again without a follow-up push. Keep doing the `git merge main` step in
  new worktrees regardless; it's a no-op when `origin/main` is already
  current and the safety net when it isn't. Also still `cp
  .../example-data.json .../worktree/` (it's gitignored, so it never
  comes along on its own) before `npm install`.
- **Pushing to GitHub requires a fine-grained PAT with `Contents:
  Read and write` explicitly granted** for this repo — fine-grained
  tokens default to no access, unlike classic tokens' scope checkboxes.
  A 403 "Permission ... denied" on push (after auth already succeeded)
  means the token's repository permissions need fixing, not the
  credentials themselves. If `credential.helper store` already cached a
  bad token, clear it (`sed -i '/github.com/d' ~/.git-credentials`)
  before retrying with a corrected token.
- **`example-data.json`** (real personal game data, gitignored, lives at
  the repo root) is the ground-truth reference for every crew- and
  collections-related feature. Every non-trivial getter/filter has been
  verified against it — usually via a throwaway `client/src/crew/__verify.ts`
  or `client/src/collections/__verify.ts` script, run via `npx tsx`,
  deleted before committing. Reviewers have repeatedly independently
  re-derived these numbers rather than trusting the implementer's report,
  and this has caught real things (e.g. confirming the `-4..0` sign
  convention wasn't a bug, hand-constructing a 4-missing-slot test case
  the real data didn't naturally contain, and independently re-deriving
  all 88 collections' tier/reward/sort numbers during the Collections
  row-detail final review rather than trusting the implementer's report).
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

- **Upgradable-status dual computation (new, from the Upgradable chip
  feature):** `CollectionsPage.tsx`'s sort factory and `CollectionsTable.tsx`'s
  per-row chip check each independently call `getCollectionCrew` and
  `isCollectionUpgradable` for the same collection — 176 total calls per
  page render instead of 88, and correct today only because both receive
  identical `crew`/`items`/`frozenArchetypeIds`. If those inputs ever
  diverge, a row's chip and its sort position could disagree. Fix:
  `byUpgradableThenCompletionThenNameAsc` should expose its precomputed
  `upgradableIds: Set<number>` as a return value (or a second output),
  threaded into `CollectionsTable` as a prop, deleting the per-row
  `isCollectionUpgradable` call entirely — halves the `getCollectionCrew`
  calls and removes the dual-source-of-truth risk in one move.
- **`combineComparators`/`Comparator<T>` living in `crew/sorters.ts` —
  resolved 2026-08-06, see "Sorting design" above.** (Kept here, struck
  through in spirit, as a pointer for anyone who remembers this entry
  from before — the fix is real, not just noted.) The shipped location is
  `lib/comparator.ts`, not the `types/comparator.ts` this entry
  originally suggested — see "Sorting design" above for why `lib/` fits
  this project's conventions better.
- **`isCollectionUpgradable`'s eligible-crew count assumes no duplicate
  `archetype_id`s among a collection's eligible crew (new, from the
  Upgradable chip feature):** if a player ever holds two un-immortalized
  copies of the same max-rarity archetype, both would count toward
  `eligible` even though only one could actually complete a milestone
  slot. Verified currently zero risk (no archetype appears more than once
  among any collection's non-null-tier crew in the sample), so this is
  latent, not live. Same category of accepted gap as `OwnedItem` not
  tracking `quantity`, below.
- **Cross-page refresh UX inconsistency — resolved by the Topbar Refresh
  button feature, see deep-dive below.** (Kept here, struck through in
  spirit, as a pointer for anyone who remembers this entry from before —
  the fix is real, not just noted.) Every page now has an always-visible
  refresh/retry path via the topbar, including Overview's error state,
  which previously had none. The crew pages' own per-`Alert` "Retry"
  buttons remain as harmless duplication, not removed.
- **Page-shell duplication — resolved 2026-08-07 for the JSX half, see
  "Page shell extraction" above.** (Kept here, struck through in spirit,
  as a pointer for anyone who remembers this entry from before — the fix
  is real, not just noted.) **Partially closed, not fully:** the shared
  `PageShell` component closed the loading/error/empty/title JSX
  duplication across all 7 pages, but the original recommendation's other
  half — a `usePageData(...)` hook covering `usePlayerData()` itself and
  the `loaded` computation — was deliberately not built. See the next
  entry for what the extraction newly exposed.
- **`usePlayerData()`/`loaded` and the default crew-page sort composition
  still repeat across pages (new, surfaced by the Page shell extraction,
  not caused by it):** every one of the 7 pages still calls
  `usePlayerData()` and computes
  `const loaded = !loading && !error && !!data;` itself — 7 identical
  copies. More strikingly, `combineComparators(byLevelDesc,
  byEquipmentSlotsRemainingDesc, byCollectionCountDesc(collections),
  byNameAsc)` — the crew-page default sort order — is now a byte-identical
  5-way copy across `ThreeFourStarsCrewPage`, `FourFiveStarsCrewPage`,
  `FourFourStarsCrewPage`, `FourFourStarsCrewReadyPage`, and
  `FrozenDuplicatesPage`. This duplication always existed; the shell
  extraction just made it visible by removing the JSX that was tangled
  up with it. A `usePageData(...)` hook (the option the original
  recommendation named but this branch didn't build) and/or a
  `DEFAULT_CREW_COMPARATOR(collections)` helper would be the natural next
  increment.
- **Nav active-state:** the nav `ListItemButton`s don't show which page is
  currently selected (no `selected` prop / `useLocation` check). Cosmetic.
- **`NAV_ITEMS` and `<Routes>` are hand-synced lists** in two different
  files (`AppLayout.tsx`, `App.tsx`) — adding a page means editing both,
  with no compile-time check they stay consistent. **Correction, made at
  the Page shell extraction's final review:** an earlier version of this
  entry predicted this would be resolved by that refactor. It wasn't, and
  couldn't have been — `PageShell` is a presentational component with no
  bearing on route registration; `App.tsx` and `AppLayout.tsx` are
  untouched by that branch, correctly so. Still open.
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
- **Collections whose only rewards are excluded types render a blank
  Rewards cell:** 5 real collections ("The Wild West," "Sherwood
  Forest," "Set Sail!," "Our Man Bashir," "Perils in Paradise") only
  grant Chronitons/Merits/Honor/Credits — all excluded by design — so
  their curated-rewards column is empty. Spec-correct, but an empty cell
  can read as "failed to load" rather than "nothing notable here."
  Considered but not resolved: an em-dash or similar placeholder.
- **`Milestone` and `Progress` can look redundant side by side:** for
  collections whose milestone lands at every crew count, `progress`
  numerically equals `claimable_milestone_index` (e.g. "Class A Dress" →
  `13/14` and `13`). The columns are correct and represent different
  things (current-milestone progress vs. total-claimed-count), but a
  bare number under "Milestone" invites misreading as a second progress
  figure. A header tooltip or relabeling to "Claimed" was suggested but
  not acted on.
- **`getFrozenCrewArchetypeIds` lived in `collections/getters.ts` but
  read crew-domain data — resolved 2026-08-07, see the "Frozen crew and
  duplicate exclusion" deep-dive above (code block now labeled
  `crew/getters.ts`).** (Kept here, struck through in spirit, as a
  pointer for anyone who remembers this entry from before — the fix is
  real, not just noted.) It now lives in `crew/getters.ts`, alongside
  its structural siblings `getCrewList`/`getOwnedItems`, and
  `collections/getters.ts` does not re-export it — both consumers
  (`CollectionsPage.tsx`, `FrozenDuplicatesPage.tsx`) import it directly
  from `crew/getters.ts`. See
  `docs/superpowers/specs/2026-08-07-frozen-crew-archetype-ids-move-design.md`
  and `docs/superpowers/plans/2026-08-07-frozen-crew-archetype-ids-move-plan.md`.
- **`combineComparators`/`Comparator<T>` cross-domain reliance — resolved
  2026-08-06, see "Sorting design" above.** (Kept here, struck through in
  spirit, as a pointer for anyone who remembers this entry from before —
  the fix is real, not just noted.) `ships/sorters.ts` being the third
  consumer of the crew-housed utility (alongside `collections/sorters.ts`
  and `collections/CollectionsTable.tsx`) is exactly what tipped this
  from "worth noting" to "worth doing."
- **`ships/sorters.ts`'s comparators assume pre-filtered (non-maxed) input
  (new, from the Ships pages feature):** `byMissingSchematicsAsc` and
  `byLevelProgressDesc` both silently rely on being called only on
  incomplete ships — a maxed ship's `schematic_gain_cost_next_level: -1`
  sentinel would sort it to the very top of `byMissingSchematicsAsc`
  (`-1 - owned` is a large negative number), and `byLevelProgressDesc`
  returns exactly `1.0` for any maxed ship. True today only because
  `ShipsPage` always calls `filterIncompleteShipsByRarity` first, not
  enforced by the sorters module itself. Same category as
  `getShipSchematicsDisplay`'s unhandled `"0/-1"` case, immediately
  below. Fix: a one-line file-header comment stating the assumption; no
  behavior change needed.
- **`getShipSchematicsDisplay` renders `"0/-1"` for an already-maxed ship
  (new, from the Ships pages feature):** the getter doesn't special-case
  the `-1` sentinel. Unreachable today — the only call site
  (`ShipsTable`) only ever receives `filterIncompleteShipsByRarity`'s
  output — but latent for the same reason as the item above.
- **`NavGroupItem`'s `Escape` key only closes the flyout when focus is
  already inside the panel — resolved 2026-08-06, see "NavGroupItem
  Escape/ARIA/max-height follow-up" above.** (Kept here, struck through
  in spirit, as a pointer for anyone who remembers this entry from
  before — the fix is real, not just noted.)
- **`NavGroupItem` has no ARIA menu semantics — resolved 2026-08-06, see
  "NavGroupItem Escape/ARIA/max-height follow-up" above.** (Kept here,
  struck through in spirit, as a pointer for anyone who remembers this
  entry from before — the fix is real, not just noted.) Also fixed as
  part of the same branch, caught at its final review rather than
  planned up front: activating a menu item used to drop focus to
  `<body>` (now returns it to the trigger first), and the `role="menu"`
  had no accessible name (now `aria-label={label}`).
- **`NavGroupItem`'s panel items have no roving `tabindex` (new, from the
  Escape/ARIA/max-height follow-up):** every item is independently
  `Tab`-reachable rather than the WAI-ARIA APG menu pattern's "one
  tabbable item, `Tab` exits the menu" convention. Degrades gracefully —
  not a defect, just the remaining distance from the full pattern.
- **`NavGroupItem`'s `handleTriggerFocus`/`focusFirstItemRef` naming and
  edge-case robustness (new, from the Escape/ARIA/max-height
  follow-up):** `handleTriggerFocus` is the wrapper's `onFocus` and also
  fires for panel-item focus, not just the trigger's — correct today only
  because the suppress flag is set and consumed synchronously, but the
  name doesn't say so. Separately, `focusFirstItemRef` could in principle
  be stranded `true` forever if a group's `items` were ever empty
  (unreachable today — `NAV_ITEMS` is a fixed module constant). Both
  cosmetic/robustness, not live bugs.
- **`NavGroupItemProps.items` duplicates `AppLayout.tsx`'s `NavLink` shape
  (new, from the Ships pages feature):** both independently declare
  `{ label: string; path: string }`. Exporting `NavLink` from one file and
  importing it in the other would remove the duplication — zero behavior
  change.
- **`getShipSchematicsProgress`'s guard doesn't catch a missing
  `schematic_gain_cost_next_level` — resolved 2026-08-06, see the
  "Schematics progress bar" deep-dive above.** (Kept here, struck through
  in spirit, as a pointer for anyone who remembers this entry from
  before — the fix is real, not just noted.) The shipped fix returns `0`
  for missing/invalid data, not the `100` this entry originally
  suggested — see the deep-dive above for why that reversal is correct.
- **Sibling readers of `schematic_gain_cost_next_level` remain unguarded
  (new, from the schematics-progress-guard fix):** the fix above is
  scoped to `getShipSchematicsProgress` only, by explicit design-spec
  decision. Two other readers of the same field have no equivalent guard:
  `getShipSchematicsDisplay` (`ships/getters.ts`) would render
  `"1755/undefined"` rather than fail closed, and `ships/sorters.ts`'s
  `byMissingSchematicsAsc` comparator would compute `needed - owned` as
  `NaN`, which `Array.prototype.sort` treats as an inconsistent
  comparator (unspecified resulting order, not a throw). Both are latent,
  not live — never observed in the real 128-ship sample. Worth revisiting
  together if this field's validation is ever centralized, rather than
  guarding each reader independently.
- **`getShipSchematicsProgress`'s guard fails closed on a numeric-*string*
  value too, not just genuinely missing data (new, from the
  schematics-progress-guard fix):** `Number.isFinite("1800")` is `false`,
  so a hypothetical stringified-number API response would now return `0`
  where the old coercing division would have produced the correct
  percentage. Vanishingly unlikely from this API's real shape (every
  observed value is a genuine `number`); recorded so a future reader
  doesn't mistake this for a regression bug rather than an accepted,
  intentional trade-off of the fail-closed design.
- **The Schematics progress bar has no accessible label (new, from the
  Crew nav group / schematics bar feature):** MUI's determinate
  `LinearProgress` emits an unlabeled `role="progressbar"` immediately
  followed by `Typography` stating the same figure more precisely —
  redundant for screen readers ("97 percent" then "1755/1800"). Fix:
  `aria-hidden` on the `LinearProgress`, making it purely decorative and
  leaving the text as the single announcement. Low priority for a
  single-user local tool.
- **No vertical gap between the progress bar and its text (new, from the
  Crew nav group / schematics bar feature):** `Typography`'s default
  `margin: 0` puts the 4px bar flush against the digits below it. Matches
  the spec exactly as written, so not a defect — just the first thing
  likely to want a small `sx={{ mb: 0.5 }}` once seen against real data
  with the user's own session cookie.
- **`NavGroupItem`'s flyout panel had no `max-height`/scroll fallback —
  resolved 2026-08-06, see "NavGroupItem Escape/ARIA/max-height
  follow-up" above.** (Kept here, struck through in spirit, as a pointer
  for anyone who remembers this entry from before — the fix is real, not
  just noted.)
- **Phase 2 of the image column — resolved by the Asset cache proxy
  feature, see deep-dive above.** (Kept here, struck through in spirit, as
  a pointer for anyone who remembers this entry from before — the fix is
  real, not just noted.) `ASSET_BASE_URL` is now `/api/assets`; images load
  from the local server's cache, fetching from `assets.datacore.app` only
  on a genuine miss.
- **`Thumbnail`'s placeholder box has no `aria-label`/`role`, and its `alt`
  text may be the wrong semantic choice — resolved by the Asset cache
  proxy follow-ups fix wave, see deep-dive above.** (Kept here, struck
  through in spirit, as a pointer for anyone who remembers this entry from
  before — the fix is real, not just noted.) Originally two items (a
  screen reader announcing a portrait's `alt={crew.name}`/`alt={ship.name}`
  redundantly alongside the adjacent Name/Ship text cell, and the
  placeholder box having no `aria-label`/`role` at all), always understood
  to be one semantic decision. The shipped fix is `alt=""` (the `alt` prop
  was removed from `ThumbnailProps` entirely, hardcoded in
  `Thumbnail.tsx`) — correct for a decorative thumbnail next to its own
  text label, and it moots the placeholder item too: an unlabeled
  decorative placeholder is exactly right once the image itself is
  decorative.
- **`getAssetUrl`'s `.png` extension is hard-coded (new, from the Crew/ship
  image column feature):** correct for every asset kind seen in the real
  payload (crew portraits/icons/full-body, ship previews/schematics), but
  it's the one assumption that would break the "fully agnostic" design if
  a future asset kind isn't a PNG. Worth a one-line comment next time this
  file is touched; not worth a parameter today.
- **`Thumbnail`'s `failed` state doesn't reset if its `asset` prop changes
  (new, from the Crew/ship image column feature):** currently unreachable
  — rows are keyed by stable entity id and route changes remount the whole
  table — so this is robustness, not a live bug.
- **No `referrerPolicy` on the `<img>` — now fully moot, not just
  deferred (originally from the Crew/ship image column feature):** this
  only mattered while Phase 1 hotlinked `assets.datacore.app` directly.
  Since the Asset cache proxy feature repointed `ASSET_BASE_URL` at the
  local server, every image request's referrer is same-origin — there is
  no longer a third-party host to leak a referrer to. No action needed,
  ever, for this one.
- **A stray trailing blank line in `CrewTable.tsx` (new, from the Crew/ship
  image column feature):** purely cosmetic, caught at final review, not
  worth a standalone diff.
- **This sandbox's missing headless-browser tooling — resolved 2026-08-06,
  see below.** (Kept here, struck through in spirit, as a pointer for
  anyone who remembers this entry from before — the fix is real, not just
  noted.) Originally: no `chromium-cli`, Playwright's headless Chromium
  binary missing a system library (`libnspr4.so`), and an `react-dom/server`
  SSR fallback hit a JSX-transform resolution issue. This affected
  verification depth for both halves of the crew/ship image feature (see
  the deep-dives above, which are left as-written — they're an accurate
  record of what verification was actually possible at the time, not
  something to retroactively rewrite).

  **Root cause, found via `systematic-debugging`:** `ldd` against the real
  binary (`~/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell`
  — note the actual on-disk path/binary name differs from what earlier
  entries assumed, `chrome-linux/headless_shell`; that was itself stale
  info from an older Playwright layout) showed four missing shared
  libraries: `libnspr4.so`, `libnss3.so`, `libnssutil3.so` (shipped inside
  the `libnss3` package), and `libasound.so.2` (provided by
  `libasound2t64` on Ubuntu 24.04's post-time64-transition package
  naming). `apt-cache policy` confirmed all were available in the standard
  Ubuntu repos but simply not installed — a real system-package gap, not a
  Playwright or project config issue.

  **Fix:** `sudo apt-get install -y libnspr4 libnss3 libasound2t64`, run by
  the user (needs an interactive sudo password, which this sandbox's `sudo`
  requires — confirmed `sudo -n true` fails non-interactively, so this
  can't be automated from a Bash tool call; the user ran it themselves).

  **Verification:** `ldd` on both `chrome-headless-shell` and the full
  `chrome` binary (`chromium-1234/chrome-linux64/chrome`) now resolve every
  dependency (zero "not found" lines), and an actual Playwright
  `chromium.launch()` → new page → `setContent` → `textContent` → `close`
  round trip completed successfully end-to-end. Headless-browser
  verification is available again for any future feature that needs it —
  no need to re-diagnose this from scratch.
- **Asset cache writes are not atomic — resolved by the Asset cache proxy
  follow-ups fix wave, see deep-dive above.** (Kept here, struck through in
  spirit, as a pointer for anyone who remembers this entry from before —
  the fix is real, not just noted.) `writeAssetCache`
  (`server/src/assetCache.ts`) now writes to a `.tmp-<uuid>` file and
  `renameSync`s it into place, closing the window where a concurrent
  request for the same uncached filename could theoretically read a
  partially-written file.
- **No in-flight de-duplication for concurrent asset-cache misses (new,
  from the Asset cache proxy feature):** two near-simultaneous requests
  for the same uncached filename both fetch upstream and both write.
  Correct outcome, just occasionally wasteful — explicitly judged
  acceptable at this app's scale (a handful of concurrent requests, not a
  high-traffic server).
- **`res.sendFile` in the asset proxy route had no error callback —
  resolved by the Asset cache proxy follow-ups fix wave, see deep-dive
  above.** (Kept here, struck through in spirit, as a pointer for anyone
  who remembers this entry from before — the fix is real, not just noted.)
  The originally-identified concrete trigger: clicking "Refresh assets"
  while a thumbnail-heavy page is still loading races `clearAssetCache`'s
  file deletion against an in-flight `sendFile` call, producing an ENOENT
  that fell through to Express's default error handler (a stack trace /
  500) instead of a clean 404. The shipped fix passes a callback to
  `sendFile` answering 404 on error; a follow-up final review then caught
  that the 404's JSON body was served under `Content-Type: image/png`
  (since `res.type('image/png')` ran before `res.json()`), fixed by an
  explicit `.type('application/json')` before the `.json()` call — see the
  Asset cache proxy follow-ups fix wave above for both fixes together.
- **`.missing` markers accumulate with no eviction or TTL (new, from the
  Asset cache proxy feature):** every unique nonexistent-but-well-formed
  filename ever requested costs one inode forever, until "Refresh assets"
  clears everything. Bounded and tiny for legitimate traffic (~1300 real
  asset paths), only a nuisance vector for junk requests — not worth
  engineering around today.
- **`POST /api/assets/refresh` is unauthenticated (new, from the Asset
  cache proxy feature) — explicitly judged acceptable, not a gap to
  close on its own.** This server already has two unauthenticated
  endpoints more sensitive than this one (`GET /api/player` returns real
  player data, `POST /api/player/refresh` spends the session cookie
  upstream), and the asset proxy has a fixed upstream host with no path
  control, so there's no SSRF/open-relay surface either. If this trust
  boundary is ever revisited, binding the server to `127.0.0.1`
  (`app.listen(PORT, '127.0.0.1')` in `server/src/index.ts`) would harden
  all three endpoints in one line, rather than adding auth to just this one.
- **Success feedback on "Refresh assets" — resolved by the Asset cache
  proxy follow-ups fix wave, see deep-dive above.** (Kept here, struck
  through in spirit, as a pointer for anyone who remembers this entry from
  before — the fix is real, not just noted.) A successful click used to
  produce only a sub-100ms spinner flicker with no confirmation; the
  shipped fix adds a success `Snackbar` (`AppLayout.tsx`, `assetsSuccess`
  state) reusing the existing error `Snackbar`'s pattern.
- **`writeAssetCache`'s `renameSync` can throw `ENOENT` if a concurrent
  `POST /api/assets/refresh` deletes the temp file first (new, from the
  Asset cache proxy follow-ups fix wave):** the atomic-write fix above
  writes to `.tmp-<uuid>` then `renameSync`s it into place, but if
  `clearAssetCache` deletes that same `.tmp-*` file in the window between
  `writeFileSync` and `renameSync`, the request answers 502 instead of 200.
  Self-healing on reload; same category of accepted race as the other
  deferred items in this route.
- **No cleanup of a `.tmp-<uuid>` file if the process crashes or
  `renameSync` throws between write and rename (new, from the Asset cache
  proxy follow-ups fix wave):** hygiene only — a `.tmp-*` file can never be
  served (`FILENAME_PATTERN` rejects it) and gets swept up by the next
  `POST /api/assets/refresh`.
- **The error and success `Snackbar`s in `AppLayout.tsx` share MUI's
  default `anchorOrigin` (new, from the Asset cache proxy follow-ups fix
  wave):** a click that fails within ~6 seconds of a prior success could
  theoretically show both stacked briefly during the exit transition.
  Cosmetic, rare.

## Likely next steps

The user has been building this up feature-by-feature, each explicitly
brainstormed and reviewed before implementation — level, equipment slots,
collections count, the collections-eye-view page (which the
collections-count feature deliberately shaped its predicate to support),
a follow-up pass adding rewards/progress/milestone detail to it, frozen-
crew duplicate exclusion (caught by the user noticing stale data on
collections they'd already completed, then reverse-engineered and proven
correct via the `extra_crew`-progress reconciliation), and most recently
its deliberate opposite — the two Frozen Duplicates pages, surfacing
exactly what the exclusion feature hides so the user can review and
decide keep-vs-trash in-game; the Collections needsWork tier label, a
small follow-up giving the Collections page's crew sub-list a third
visual signal (amber "4/4 Stars" chip) alongside the existing "Ready"
chip; and most recently the Collections "Upgradable" chip, surfacing
which collections' next milestone is already within reach given the
player's ready/needsWork crew, with an upgradable-first sort so those
collections rise to the top of the table; the topbar Refresh button,
unifying what was previously an Overview-only control into an
always-visible, app-wide green button in `AppLayout`'s topbar — which
also closed the long-standing "cross-page refresh UX inconsistency"
deferred item; and most recently the Ships pages, the first non-crew/
collections domain (`player.character.ships`) and the first nested nav
item — two new pages surfacing not-yet-fully-leveled 4★/5★ ships via a
hover/focus flyout "Ships" nav group, which needed a keyboard-
accessibility fix round after its own task's interactive test initially
passed for the wrong reason (see "Ships pages" above); and most recently
the Crew nav group and schematics progress bar — regrouping the six
crew-related drawer entries under their own "Crew" flyout (proving
`NavGroupItem`'s reusability with a second, larger group, zero component
changes needed) and adding a blue `LinearProgress` bar to the Ships
pages' Schematics column; then the crew/ship image column, Phase 1 — a
40x40 "Image" thumbnail column on all 6 crew pages and both ship pages,
sourced directly from `crew.portrait`/`ship.icon` fields already present
in the real payload, via a new asset-type-agnostic `assets/` module
designed up front to support future asset kinds (items/rewards icons) with
zero changes; and most recently its Phase 2, the Asset cache proxy —
a Node-backend proxy/cache so those thumbnails load from the local server
instead of hotlinking `assets.datacore.app` directly, closing the loop
Phase 1's `ASSET_BASE_URL` seam was built to support, plus an independent
"Refresh assets" button. Nothing is currently in flight.

**Plausible next asks, roughly by how directly they follow from what's
already built:** with the `getShipSchematicsProgress` guard, the
`NavGroupItem` Escape/ARIA/max-height follow-up, the
`combineComparators`/`Comparator<T>` extraction, all four Asset cache
proxy follow-ups, and the `getFrozenCrewArchetypeIds` move all now
shipped (2026-08-06 through 2026-08-07), the freshest remaining
small-scoped items are the ones those features left behind —
`NavGroupItem`'s roving-`tabindex` gap and its
`handleTriggerFocus`/`focusFirstItemRef` naming/robustness notes, the
sibling-reader/numeric-string notes on the schematics guard, and the
asset-cache-proxy fixes' own residual notes (a
`renameSync`-can-throw-on-concurrent-refresh race, no temp-file cleanup
on failure, the two `Snackbar`s sharing a default anchor position — all
above); beyond those, unifying the dual upgradable-status computation
between the Collections sort and chip, another crew classification
factor (skills? traits?), building the `usePageData(...)` hook /
`DEFAULT_CREW_COMPARATOR` helper the Page shell extraction's own final
review surfaced as its natural next increment, reconsidering whether
frozen-crew exclusion should broaden to the 4 crew pages now that its
correctness is proven rather than merely plausible, extending the image
column to a new asset kind
now that two features have proven the design (items? rewards?), or
binding the server to `127.0.0.1` as a standalone hardening pass
covering all three currently-unauthenticated endpoints at once. The
sandbox's headless-browser tooling gap (fixed 2026-08-06, see the deferred-
issues entry above) no longer constrains any of these — real browser-based
visual verification is available again if a future feature's risk profile
warrants it.
