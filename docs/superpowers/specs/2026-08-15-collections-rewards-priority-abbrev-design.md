# Collections page: prioritize + abbreviate Skill/Proficiency rewards — Design

**Date:** 2026-08-15
**Status:** Approved

## Problem

The Collections page's "Rewards" column (`CollectionsTable.tsx`, sourced
from `getCuratedRewards` in `client/src/collections/rewards.ts`) currently
lists a collection's item rewards (Portal, Dilithium, etc.) before its
Skill/Proficiency buff rewards, and spells the skill name out in full
(e.g. `"Skill: Command"`). The user wants Skill/Proficiency rewards moved
to the front of the joined string, and the skill name abbreviated using
the shared `SKILL_ABBREVIATIONS` map (`client/src/crew/skillLabels.ts`,
built for the QPs page's "Skills" column feature) — e.g. `"Skill: CMD"`.

## Real-data verification

Confirmed live against `server/data/player-cache.json`:

- **"Heh Cho'mruak tah"** (the user's own example): rewards = `[10x
  Portal bundle]`, buffs = `[Command Core Skill]`. Current output:
  `"10x Portal (1), Skill: Command"`. New output: **`"Skill: CMD, 10x
  Portal (1)"`** — matches the user's stated target exactly.
- **"Their Royal Highnesses"** (a second real collection with both a
  Skill buff and a Proficiency buff, plus an item reward — exercises the
  Skill/Proficiency-relative-order case the first example doesn't):
  rewards = `[Portal (1x) bundle]`, buffs = `[Command Core Skill, Command
  Skill Proficiency]`. Current output: `"Portal (1), Skill: Command,
  Proficiency: Command"`. New output: **`"Skill: CMD, Proficiency: CMD,
  Portal (1)"`**.

## Design

### 1. Reorder `getCuratedRewards`'s output array

Currently the function builds the array in this order: loop
`collection.milestone.rewards` (item rewards) first, then Skill entries,
then Proficiency entries. This changes to: **Skill entries, then
Proficiency entries, then item rewards** — Skill/Proficiency as one block
moved to the front, keeping their existing relative order to each other
(Skill before Proficiency), and keeping the item rewards' existing
relative order to each other (unchanged, still driven by
`collection.milestone.rewards`'s array order).

### 2. Abbreviate the skill name

`SKILL_ABBREVIATIONS` (`client/src/crew/skillLabels.ts`) is keyed by bare
lowercase skill name (`"command"` → `"CMD"`); the regex-captured skill
name from a buff's `name` field is Title Case (`"Command"`, matching
`SKILL_LABELS`'s values exactly). Look it up via
`SKILL_ABBREVIATIONS[skill.toLowerCase()] ?? skill` (the `?? skill`
fallback is defensive only — every real buff name this regex matches is
one of the six known skills, so the fallback is never expected to fire,
but avoids ever rendering `undefined` if a future game update adds an
unrecognized skill-buff naming pattern).

The `"Skill: "`/`"Proficiency: "` prefixes are unchanged — only the text
after the colon changes from the full skill name to its abbreviation.

### 3. No change to `CollectionsTable.tsx`

`rewards.join(', ')` already just joins whatever order `getCuratedRewards`
returns — no caller-side change needed.

## Non-goals

- No change to which reward types are curated (item rewards not already
  matched by the existing `if`/`else if` chain — e.g. Merits, Credits,
  Honor — stay excluded, as they are today; this is an existing,
  unrelated design choice not being revisited here).
- No change to the Collections table's row-level sort order (which
  collections appear above others) — this is purely about the order and
  spelling of reward strings *within* one row's Rewards cell.
- No change to `skillLabels.ts` itself (the abbreviation map is reused
  as-is, not modified).

## Verification plan

- A throwaway script against the real `server/data/player-cache.json`
  independently re-derives `getCuratedRewards`'s output for the two real
  collections above and confirms the exact strings match the "Real-data
  verification" section.
- Real-browser check against the running dev server: `/collections`
  renders "Heh Cho'mruak tah"'s Rewards cell reading exactly `"Skill:
  CMD, 10x Portal (1)"`, and confirms no other collection's Rewards cell
  regressed (spot-check a couple with only item rewards, and a couple
  with only Skill/Proficiency rewards, to confirm no visual breakage from
  the reordering).
