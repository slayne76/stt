# Collections Row Detail — Design

## What this is

Extends the Collections page's main collection rows (not the crew
sub-rows) with four new pieces of information — row number, curated
rewards, milestone progress, and claimed-milestone count — reorders
collections by completion instead of purely alphabetically, and removes
the now-dead expand/collapse UI since rows are always expanded.

## Reward curation

There is no clean single rule for "which rewards matter" — the real
payload mixes currencies, item bundles, and buffs, and the user's
requested set cuts across all three. The rule is an explicit allowlist,
matched by `symbol` (stable) rather than display text where possible:

| Include | Match | Display |
|---|---|---|
| 10x Portal | `reward.symbol === 'premium_10x_bundle'` | `10x Portal (quantity)` |
| Portal | `reward.symbol === 'premium_1x_bundle'` | `Portal (quantity)` |
| Dilithium | `reward.symbol === 'premium_purchasable'` | `Dilithium (quantity)` |
| Crew | `reward.type === 1` | `reward.full_name` (e.g. "Lucille Davenport" — the actual crew name, not the internal `name` field "Janeway") |
| The Niners Avatar | `reward.symbol === 'niners_avatar'` | `The Niners Avatar` |
| Legendary Honorable Citation | `reward.symbol === 'honorable_citation_quality5'` | `Legendary Honorable Citation` |
| Core Skill buffs | `buff.name` matches `/^(.+) Core Skill \+\d+%$/` | `Skill: {captured name}` |
| Skill Proficiency buffs | `buff.name` matches `/^(.+) Skill Proficiency (?:Min\|Max) \+\d+%$/` | `Proficiency: {captured name}` |

Explicitly excluded, verified present in the real data and confirmed by
the user not to matter here: Chronitons, Merits, Federation Credits,
Honor (63 of 88 collections — common, but still excluded), Replicator
Fuel, 10x Standard Shuttle Boost. Any reward type not in this table
(including ones that don't exist in today's sample) is silently
excluded — a safe default, since an unrecognized reward is more likely a
future addition than something worth surfacing sight-unseen.

**The two skill-buff categories need parsing, not substring matching,**
because the underlying data has a structure the display collapses:

- `milestone.rewards` never contains "Core Skill" or "Skill Proficiency"
  entries at all — they live in the sibling field `milestone.buffs`. This
  was the first thing verified against real data, since the user
  originally pointed at `rewards` for these.
- **Skill Proficiency buffs always come in a Min/Max pair** for the same
  skill (e.g. "Medicine Skill Proficiency Min +1%" and "...Max +1%"),
  confirmed across all 30 Core Skill and 60 Skill Proficiency buff
  entries in the sample. Both must collapse to a single
  `Proficiency: Medicine` entry, not two.
- **Core Skill buffs are always singular** per skill (no Min/Max split),
  collapsing to `Skill: Medicine`.
- **The percentage is never shown** — verified every one of the 78
  matching buff entries in the sample has `value: 0.01` (exactly 1%), so
  displaying it would be redundant noise, not information.
- A collection can grant both for the same skill: "Their Royal
  Highnesses" grants Command's Min, Max, *and* Core buffs together, and
  must display exactly `Skill: Command, Proficiency: Command` (not three
  raw buff lines). Verified against the real data — this is the case
  that proves the dedup-by-skill logic, not just the single-buff case.

Implementation: two `Set<string>` accumulators (skills-with-Core,
skills-with-Proficiency) built by regex-matching every buff name, then
rendered as one entry per set member — the `Set` is what makes the
Min/Max pair collapse to one entry for free.

**Verified worked examples** (from `example-data.json`):
- "First Year of Convergence" → `10x Portal (1)`.
- "Holodeck Enthusiasts" → `Lucille Davenport` (the one crew-type reward
  in the whole sample).
- "Their Royal Highnesses" → `Portal (5), Skill: Command, Proficiency: Command`.

## Row number, Progress, and Milestone columns

- **`#`** — `index + 1` in the (new, completion-sorted) row order. Plain
  integer, matching the convention `CrewTable` already uses.
- **Progress** — `${collection.progress}/${collection.milestone.goal}`
  (e.g. `211/220` for "First Year of Convergence," matching the user's
  worked example exactly), **except** when `goal === 0`. 8 of the 88
  sample collections (e.g. "Common Crew," "Curious Flora") are fully
  maxed out for this player — every milestone already claimed, verified
  by empty `rewards`/`buffs` arrays alongside `goal: 0` — and show `MAX`
  instead of a division.
- **Milestone** — `collection.claimable_milestone_index` as a plain
  number (e.g. `13`). **This is a hard data limitation, not an
  implementation gap:** the game's in-app UI shows a claimed/total pair
  (e.g. "13 of 19"), but this JSON payload only ever exposes the *current
  next* milestone (one `progress`/`goal`/`rewards`/`buffs` object) plus
  this claimed-count — there is no array of all milestones and no total
  count field anywhere in `player.character.cryo_collections` or
  elsewhere in the payload. The total isn't retrievable from this data
  source at all.
- **Column order:** `# | Collection | Rewards | Progress | Milestone | Crew`
  — identity first, new detail columns in the middle, crew-count last
  since it's what the always-visible sub-row expands on.

## Sort order

Collections were alphabetical-only; now completion ratio takes priority,
alphabetical as the tiebreak:

```ts
function collectionSortKey(collection: Collection): number {
  return collection.milestone.goal === 0 ? -1 : collection.progress / collection.milestone.goal;
}
```

Sorted descending by this key (closest to the next milestone first),
matching the user's `190/200` (0.95) ranks above `20/40` (0.5) example
exactly. The 8 maxed-out collections all get key `-1`, grouping them as
one block at the very bottom — below every partial-progress collection
regardless of how low its ratio is — per an explicit correction during
design (the first instinct was to rank "complete" collections at the
top; the user wants them at the bottom, since there's nothing left to do
there). Alphabetical order applies among ties, including within the
maxed-out block.

**Verified against real data:** top of the sort is "Convergence Day"
(32/33, 0.970), "First Year of Convergence" (211/220, 0.959), "Ruthless
Aggression" (114/120, 0.950). The bottom is exactly the 8 maxed-out
collections, alphabetical: "Alluring Pheromones," "Cold Front," "Common
Crew," "Curious Flora," "Rare Crew," "Story Time," "The Order of
Things," "Uncommon Crew."

## Removing the expand/collapse UI

Rows are always expanded now, so the toggle isn't being hidden — it's
dead code once nothing can ever collapse a row. `CollectionsTable` loses
its `useState` for expanded ids, the `IconButton`/`KeyboardArrowDown`/
`KeyboardArrowUp` toggle, and the `Collapse` wrapper entirely. Each
collection still renders as a two-`TableRow` pair — the main row (now
carrying all 6 columns) and a second row holding the crew sub-list via
`colSpan` — preserving the "sub-rows visually belong to the parent"
structure the user asked to keep. The sub-row gets a subtle background
tint (`theme.palette.action.hover`) to carry that visual grouping now
that there's no collapse affordance implicitly signaling it.

## Error handling / edge cases

- `goal === 0`: handled explicitly (see Progress column and sort key) —
  this is the one concrete divide-by-zero risk found in the real data,
  and it's a real, common state (8 of 88 collections), not a hypothetical.
- No new defensive guards needed on `progress`/`milestone`/
  `claimable_milestone_index` reads beyond what's already established —
  `milestone` is present (non-null) on all 88 sample collections, so a
  bare `collection.milestone.goal` read is consistent with this
  project's existing risk tolerance (fields confirmed always-present in
  real data don't get speculative optional-chaining).
- Reward/buff matching is a closed allowlist; anything unmatched is
  dropped silently, never throws.

## Verification plan

Same throwaway-script-against-real-data pattern as every prior feature: a
`client/src/collections/__verify.ts`, run via `npx tsx`, deleted before
committing, confirming:
- The three worked reward examples above, exactly.
- The full sort order's top 3 and the 8-collection maxed-out block at the
  bottom, alphabetical within it.
- `MAX` display for all 8 `goal === 0` collections, and a plain
  `progress/goal` string for every other collection.
