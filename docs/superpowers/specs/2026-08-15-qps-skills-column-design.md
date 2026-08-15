# QPs page: top-2-skills column — Design

**Date:** 2026-08-15
**Status:** Approved

## Problem

The `/qps` route (`QPsTable.tsx`) shows crew eligible for QP leveling but gives
no visibility into what skills a crew member actually has. The user wants a
new, last column on that table showing the crew member's top 2 skills (by
strength), abbreviated (e.g. `SEC/DIP`, or just `ENG` for a 1-skill crew).

This is also the first feature to need a skill-abbreviation convention
(SCI/MED/CMD/ENG/DIP/SEC), which the user explicitly wants centralized and
reusable, since future features will keep using these abbreviations.

## Data source

Confirmed live against `example-data.json` (597 crew): every crew member's
raw JSON already carries a `skills` object, keyed by skill archetype, only
including the skills that crew member actually possesses (1–3 of the 6 game
skills):

```json
"skills": {
  "diplomacy_skill": { "core": 1178, "range_min": 263, "range_max": 525 },
  "security_skill":  { "core": 719,  "range_min": 201, "range_max": 367 },
  "command_skill":   { "core": 469,  "range_min": 49,  "range_max": 158 }
}
```

The `CrewMember` TypeScript type (`client/src/types/crew.ts`) doesn't declare
this field yet — `getCrewList()` casts the raw JSON array straight to
`CrewMember[]` with no per-field construction, so adding a new required field
is safe (same precedent as `in_buy_back_state` in feature 45 — confirmed no
`CrewMember` object-literal constructors exist anywhere in the codebase).

A full abbreviation lookup was searched for in `example-data.json` first (per
the user's suggestion it might already exist) — it does not; `SCI`/`MED`/etc.
only appear as substrings inside longer words (e.g. "science"), never as
actual short-code values. The abbreviation map is therefore new, defined by
this feature.

## Design

### 1. `CrewMember` type gains `skills`

```ts
export interface SkillValue {
  core: number;
  range_min: number;
  range_max: number;
}

export interface CrewMember {
  // ...existing fields...
  skills: Record<string, SkillValue>; // keys like "diplomacy_skill", "security_skill"
}
```

### 2. New shared module: `client/src/crew/skillLabels.ts`

Single source of truth for skill full names and abbreviations, keyed by the
bare skill name (no `_skill` suffix) — matching the key convention already
used by `client/src/lib/skillBuffs.ts`'s buff-stat regexes (`science`,
`engineering`, `diplomacy`, `command`, `security`, `medicine`):

```ts
export const SKILL_LABELS: Record<string, string> = {
  science: 'Science',
  engineering: 'Engineering',
  diplomacy: 'Diplomacy',
  command: 'Command',
  security: 'Security',
  medicine: 'Medicine',
};

export const SKILL_ABBREVIATIONS: Record<string, string> = {
  science: 'SCI',
  engineering: 'ENG',
  diplomacy: 'DIP',
  command: 'CMD',
  security: 'SEC',
  medicine: 'MED',
};
```

`client/src/lib/skillBuffs.ts` currently defines its own private `SKILL_LABELS`
constant (full names only, built for the Base Skill Bonus / Proficiency Bonus
tables feature). This feature refactors it to import `SKILL_LABELS` from the
new shared module instead of duplicating it — no behavior change to that
existing feature, just removes the duplicate definition now that a shared
home exists.

### 3. New getter: `getTopSkillAbbreviations`

Added to `client/src/crew/getters.ts` (alongside the other crew-derived
getters):

```ts
export function getTopSkillAbbreviations(crew: CrewMember): string {
  const entries = Object.entries(crew.skills)
    .map(([key, value]) => ({
      skillKey: key.replace(/_skill$/, ''),
      core: value.core,
    }))
    .filter((entry) => entry.skillKey in SKILL_ABBREVIATIONS);

  entries.sort(
    (a, b) =>
      b.core - a.core ||
      SKILL_ABBREVIATIONS[a.skillKey].localeCompare(SKILL_ABBREVIATIONS[b.skillKey])
  );

  return entries
    .slice(0, 2)
    .map((entry) => SKILL_ABBREVIATIONS[entry.skillKey])
    .join('/');
}
```

Behavior:
- Ranks a crew member's possessed skills by `core` value, descending.
- Ties broken alphabetically by abbreviation (user's explicit choice —
  simpler and fully deterministic vs. inventing a canonical in-game skill
  priority order).
- Takes the top 2 (or fewer, if the crew member has only 1 skill), joins with
  `/`. Example: 1000 Medicine / 1500 Diplomacy / 2000 Security → `SEC/DIP`
  (Medicine excluded as the 3rd/lowest). A 1-skill crew with 1500 Engineering
  → `ENG` (no trailing slash, no second entry).

### 4. Table integration: `QPsTable.tsx`

- New last `<TableCell>` per row, header **"Skills"**, plain
  `<Typography variant="body2">` text (matching the Name column's plain-text
  style — no chip/badge, since it's just short letters, not a status).
- `TablePaginationFooter`'s `colSpan` prop updated from `8` to `9` to match
  the new column count.

## Non-goals

- No changes to sorting/filtering — the new column is purely a display
  addition, not sortable, not searchable.
- No change to any other table/page in this pass — the shared abbreviation
  module is built now so *future* features can reuse it, but wiring it into
  other pages is explicitly out of scope here.

## Verification plan

- A throwaway script against the real `example-data.json` /
  `server/data/player-cache.json` independently re-derives several real
  crew members' top-2 abbreviations by hand from their raw `skills` object
  (including at least one 1-skill crew member, if one exists in the real
  data, to exercise the no-trailing-slash case).
- Real-browser check against the running dev server: `/qps` renders the new
  "Skills" column as the last column, values match the independently
  re-derived ones, pagination footer still spans correctly.
