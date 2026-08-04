# STT Tracker — Project State

Last updated: 2026-08-04. This document is the durable, in-depth record of
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
    collection.ts              Collection interface (see "The collections membership logic")
    storedImmortal.ts          StoredImmortal interface (see "Frozen crew and duplicate exclusion")
  crew/                         All crew-related pure logic + shared components
    getters.ts                 Data extraction + derived single-crew values
    filters.ts                 Array-in-array-out crew filtering (incl. filterFrozenDuplicates)
    sorters.ts                 Composable comparators (see "Sorting design")
    CrewTable.tsx               Shared table renderer (#/Stars/Name/Level/Items-to-equip/Collections)
    StarRating.tsx              Gold star icons, driven by rarity/max_rarity props
  collections/                  Crew↔collection logic + the Collections page's own components
    getters.ts                 getCollectionsList, crewBelongsToCollection, getCrewCollections,
                                getCollectionCount, getCollectionCrew (reverse direction),
                                getFrozenCrewArchetypeIds
    rewards.ts                 getCuratedRewards — the reward/buff display allowlist
    sorters.ts                 isMaxedOut, getCollectionCompletionRatio, byCompletionThenNameAsc
    CollectionsTable.tsx        Main collections table (#/Collection/Rewards/Progress/Milestone/Crew)
    CollectionCrewList.tsx      Per-collection qualifying-crew sub-list (tier-highlighted)
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
// collections/getters.ts
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
sorting. `FrozenDuplicatesPage.tsx` itself does import from
`collections/getters.ts` (for `getFrozenCrewArchetypeIds` and
`getCollectionsList`), which is unremarkable — every crew page already
imports `getCollectionsList` for `byCollectionCountDesc` — but see the
deferred-issues entry below: this is the first page with nothing to do
with collections that needs a `collections/` import, which is exactly
the condition a prior review flagged as the point where
`getFrozenCrewArchetypeIds`'s placement would start to matter.

**Spec/plan:** `docs/superpowers/specs/2026-08-03-frozen-duplicates-pages-design.md`,
`docs/superpowers/plans/2026-08-03-frozen-duplicates-pages-plan.md`.

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
out of `crew/sorters.ts` since it operates on a different type entirely
and has exactly one consumer (`CollectionsPage`), so there's no shared
`combineComparators`-style composition need here — YAGNI against
building generality nobody's asked for.

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

## Current routes / nav (in order)

| Nav label | Path | Filter |
|---|---|---|
| Overview | `/` | player identity, not crew |
| 3/4 Stars crew | `/3-4-stars-crew` | rarity=3, max_rarity=4 |
| 4/5 Stars crew | `/4-5-stars-crew` | rarity=4, max_rarity=5 |
| 4/4 Stars crew (ready) | `/4-4-stars-crew-ready` | rarity=4, max_rarity=4, ready to immortalize |
| 4/4 Stars crew | `/4-4-stars-crew` | rarity=4, max_rarity=4, needs work |
| Collections | `/collections` | one row per collection, reverse (collection→crew) view |
| 4 Stars Duplicates | `/4-stars-duplicates` | max_rarity=4, archetype has a frozen twin |
| 5 Stars Duplicates | `/5-stars-duplicates` | max_rarity=5, archetype has a frozen twin |

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

- **Cross-page refresh UX inconsistency:** `OverviewPage` has a header
  "Refresh" button but no retry-on-error in its `Alert`; the crew pages
  have retry-on-error but no header refresh button. Predates the crew
  pages; nobody has unified it yet.
- **Page-shell duplication — the deferred threshold has now been
  crossed:** all crew pages (`ThreeFourStarsCrewPage`,
  `FourFiveStarsCrewPage`, `FourFourStarsCrewReadyPage`,
  `FourFourStarsCrewPage`) repeat the same `usePlayerData()` +
  loading/error/empty-state/title scaffolding, differing only in filter
  composition and copy strings. `CollectionsPage` and now
  `FrozenDuplicatesPage` bring this to **6** pages sharing the identical
  shell (parameterization kept the two Duplicates routes from being a
  7th independent copy) — well past the trigger multiple prior reviews
  named for finally extracting it. Still not done; still deliberately
  deferred. Recommendation unchanged: extract a shared
  `RarityCrewPage`/`CrewListPage` component or a `usePageData(...)` hook
  covering the `usePlayerData` + loading/error/empty/title pattern (the
  filter/sort composition itself varies too much across pages to fold
  into the same abstraction — only the shell repeats identically).
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
- **`getFrozenCrewArchetypeIds` lives in `collections/getters.ts` but
  reads crew-domain data — the friction this was flagged as hypothetical
  for has now actually arrived.** It takes `PlayerData` and knows
  nothing about collections, structurally a sibling of `getCrewList`/
  `getOwnedItems` in `crew/getters.ts`. Still doesn't threaten the
  acyclicity constraint above (it only needs `PlayerData` and a type, no
  import from `crew/`), and still not urgent — but `FrozenDuplicatesPage`
  (see "Frozen duplicates pages" above) is now the first page with
  nothing to do with collections that imports from `collections/getters.ts`
  purely for this getter. Cheap to move to `crew/getters.ts` whenever
  it's next touched; not worth a standalone diff just for this.

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
decide keep-vs-trash in-game — and most recently the Collections
needsWork tier label, a small follow-up giving the Collections page's
crew sub-list a third visual signal (amber "4/4 Stars" chip) alongside
the existing "Ready" chip, so `needsWork` crew are distinguishable from
`leveling` crew at a glance. Nothing is currently in flight. Plausible
next asks, roughly by how directly they follow from what's already
built: another classification factor (skills? traits?), finally tackling
the page-shell duplication (6 pages now share the identical shell, well
past the threshold every prior review named), reconsidering whether
frozen-crew exclusion should broaden to the 4 crew pages now that its
correctness is proven rather than merely plausible, moving
`getFrozenCrewArchetypeIds` to `crew/getters.ts` now that the placement
friction has actually triggered rather than staying hypothetical, or a
`docs/PROJECT_STATE.md`-adjacent housekeeping pass if this document
itself starts lagging again after a burst of features.
