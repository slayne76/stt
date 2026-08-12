# Base Skill Bonus & Proficiency Bonus Tables — Design Spec

Adds two new tables to the Overview page, appended after the existing
Missing 4 Stars tables: "Base Skill Bonus" (6 rows, one per skill) and
"Proficiency Bonus" (6 rows, one per skill, Min/Max columns). Sourced from
the player's accumulated collection-buff percentages ("Active buffs" in
the game), not from any per-crew calculation.

## Research: where this data actually lives

Reverse-engineered against the user's real, live-refreshed
`server/data/player-cache.json` (NOT `example-data.json`, which is stale —
2026-08-04 vs. the live file's 2026-08-12) and cross-checked against real
in-game values the user reported directly (e.g. "SCIENCE +42%",
"MEDICINE MIN +31% / MAX +31%").

`data.player.character.all_buffs` is a flat array of the player's
currently-active aggregate buffs across all sources (`crew_collection`,
`captains_bridge`, `starbase`). Confirmed **no duplicate `stat` keys**
across the full 33-entry array (checked programmatically) — each `stat`
already represents the fully-aggregated total, not a per-source partial
that would need summing. Shape of one entry:

```json
{
  "flavor": "Increases Science Core Skill by +1%",
  "icon": { "file": "/bonuses/bonus_sci" },
  "name": "Science Core Skill +1%",
  "operator": "percent_increase",
  "short_name": "Science Core Skill +42%",
  "source": "crew_collection",
  "stat": "science_skill_core",
  "symbol": "cc_science_skill_core_1",
  "value": 0.42
}
```

The 24 `crew_collection`-sourced, skill-related entries break down exactly
into the 18 this feature needs plus 6 unrelated ones:

- **6 base-skill entries**, `stat` matching `^(\w+)_skill_core$`:
  `science_skill_core` (0.42), `engineering_skill_core` (0.44),
  `diplomacy_skill_core` (0.45), `command_skill_core` (0.43),
  `security_skill_core` (0.39), `medicine_skill_core` (0.40). Every value
  matches the user's reported figures exactly.
- **12 proficiency entries** (6 skills × min/max), `stat` matching
  `^(\w+)_skill_range_(min|max)$`: e.g. `medicine_skill_range_min` (0.31),
  `medicine_skill_range_max` (0.31). All 12 values match the user's
  reported figures exactly; min and max happen to be equal for every
  skill in this snapshot (not assumed to be structurally guaranteed —
  see Design below).
- **6 unrelated `crew_collection` entries**, correctly excluded:
  `replicator_fuel_cost`, `chroniton_max`, `crew_experience_training`,
  `replicator_uses` (these + 2 more not skill-shaped at all), plus 10
  `captains_bridge` ship-stat entries and 1 `starbase` entry — none match
  the `_skill_core`/`_skill_range_(min|max)` patterns and are filtered out
  by construction.

**This reuses an already-established pattern in this codebase**:
`client/src/collections/rewards.ts`'s `CORE_SKILL_PATTERN`/
`SKILL_PROFICIENCY_PATTERN` regexes already parse the identical English
naming convention (`"X Core Skill +1%"` / `"X Skill Proficiency Min/Max
+1%"`) from a *different* buff list (`collection.milestone.buffs[].name`,
a per-collection-tier reward description with no numeric total). This
feature's data source (`all_buffs`) is different — it carries the
player's actual accumulated total in `.value`, which is what's needed
here — but the naming/domain concept (6 skills, each with a core bonus
and a min/max proficiency pair) is the same one already established.

## Non-goals

- No per-crew skill calculation — this is purely the player-wide
  accumulated bonus percentage, already computed by the game itself.
- No display of the 6 unrelated `crew_collection` buffs (replicator,
  chroniton, trainer) or the `captains_bridge`/`starbase` buffs — out of
  scope, a different concept ("ship bonuses" / "economy bonuses") the
  user didn't ask for.
- No icons — `all_buffs[].icon.file` exists (e.g. `/bonuses/bonus_sci`)
  but the user didn't ask for icons and no existing Overview table uses
  them; matches this table's plain-text sibling tables.
- No search or pagination — both tables are always exactly 6 rows, far
  below any threshold this app's `useSearch`/`usePagination` hooks exist
  for.

## Design

### `client/src/lib/skillBuffs.ts` (new)

```ts
import type { PlayerData } from '../types/player';

export interface SkillBonus {
  skill: string;
  value: number;
}

export interface ProficiencyBonus {
  skill: string;
  min: number;
  max: number;
}

interface Buff {
  stat: string;
  value: number;
}

const SKILL_LABELS: Record<string, string> = {
  science: 'Science',
  engineering: 'Engineering',
  diplomacy: 'Diplomacy',
  command: 'Command',
  security: 'Security',
  medicine: 'Medicine',
};

const CORE_SKILL_STAT = /^(\w+)_skill_core$/;
const PROFICIENCY_STAT = /^(\w+)_skill_range_(min|max)$/;

function getAllBuffs(data: PlayerData): Buff[] {
  const player = (data.player ?? {}) as Record<string, unknown>;
  const character = (player.character ?? {}) as Record<string, unknown>;
  const buffs = character.all_buffs;
  return Array.isArray(buffs) ? (buffs as Buff[]) : [];
}

export function getBaseSkillBonuses(data: PlayerData): SkillBonus[] {
  const values: Record<string, number> = {};
  for (const buff of getAllBuffs(data)) {
    const match = buff.stat.match(CORE_SKILL_STAT);
    if (match && SKILL_LABELS[match[1]]) {
      values[match[1]] = Math.round(buff.value * 100);
    }
  }
  return Object.keys(SKILL_LABELS)
    .map((key) => ({ skill: SKILL_LABELS[key], value: values[key] ?? 0 }))
    .sort((a, b) => b.value - a.value || a.skill.localeCompare(b.skill));
}

export function getProficiencyBonuses(data: PlayerData): ProficiencyBonus[] {
  const mins: Record<string, number> = {};
  const maxs: Record<string, number> = {};
  for (const buff of getAllBuffs(data)) {
    const match = buff.stat.match(PROFICIENCY_STAT);
    if (match && SKILL_LABELS[match[1]]) {
      if (match[2] === 'min') mins[match[1]] = Math.round(buff.value * 100);
      else maxs[match[1]] = Math.round(buff.value * 100);
    }
  }
  return Object.keys(SKILL_LABELS)
    .map((key) => ({ skill: SKILL_LABELS[key], min: mins[key] ?? 0, max: maxs[key] ?? 0 }))
    .sort((a, b) => b.min - a.min || a.skill.localeCompare(b.skill));
}
```

Placed in `lib/` — matching the existing `extractPlayerIdentity.ts`
precedent (a small, domain-neutral "derive a display-ready shape from raw
`PlayerData`" utility, not tied to the crew/collections/catalog domains).

**Always 6 rows in both tables, regardless of what's actually present in
`all_buffs`**: both functions map over the fixed `SKILL_LABELS` key set
and default an absent skill to `0`, rather than only emitting rows for
whatever happens to appear in the data. This is a deliberate choice — the
6 skills are a fixed conceptual set in the game, and a table that could
silently shrink from 6 rows to fewer (if a skill genuinely has zero
collection-buff progress) would read as broken rather than correct.

**Rounding:** `buff.value` is a fraction (`0.42`); `Math.round(value *
100)` converts to a whole-number percentage, safe against float
imprecision (e.g. a stored `0.42` that's actually
`0.42000000000000004` still rounds to `42`).

### `client/src/pages/OverviewPage.tsx` (changed)

Two more `Paper`/`TableContainer`/`Table` blocks appended after the
existing Missing-4-Stars tables (inside the same `showMissingTables`
conditional — these tables need `data`, same as the identity table above,
no second data source and no new loading/error state), each with a
`TableHead` row (unlike the header-less identity table, since these have
genuinely named columns, not a flat key-value list):

```tsx
<Divider sx={{ my: 2 }} />
<Typography variant="h5">Base Skill Bonus</Typography>
<TableContainer component={Paper}>
  <Table>
    <TableHead>
      <TableRow>
        <TableCell>Skill</TableCell>
        <TableCell align="right">Bonus</TableCell>
      </TableRow>
    </TableHead>
    <TableBody>
      {baseSkillBonuses.map((row) => (
        <TableRow key={row.skill}>
          <TableCell component="th" scope="row">
            {row.skill}
          </TableCell>
          <TableCell align="right">+{row.value}%</TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
</TableContainer>

<Typography variant="h5">Proficiency Bonus</Typography>
<TableContainer component={Paper}>
  <Table>
    <TableHead>
      <TableRow>
        <TableCell>Skill</TableCell>
        <TableCell align="right">Min Bonus</TableCell>
        <TableCell align="right">Max Bonus</TableCell>
      </TableRow>
    </TableHead>
    <TableBody>
      {proficiencyBonuses.map((row) => (
        <TableRow key={row.skill}>
          <TableCell component="th" scope="row">
            {row.skill}
          </TableCell>
          <TableCell align="right">+{row.min}%</TableCell>
          <TableCell align="right">+{row.max}%</TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
</TableContainer>
```

`baseSkillBonuses`/`proficiencyBonuses` computed the same way the page's
existing derived values are (`data ? getBaseSkillBonuses(data) : []`),
following the file's established pattern.

## Error handling

None new — both functions defensively cast through
`Record<string, unknown>` and fall back to `0`/`[]` on any missing/
malformed shape, matching every other `PlayerData`-reading getter in this
codebase (`extractPlayerIdentity`, `getFrozenCrewArchetypeIds`, etc.). No
new failure mode either function could throw on.

## Testing / verification plan

No automated test framework exists in this project (deliberate, repeated
choice). Verification:

- Build (`npm run build -w client`) / lint (`npm run lint -w client`)
  clean.
- **Data-driven verification against the real, live-refreshed
  `server/data/player-cache.json`** (not `example-data.json`) — compute
  both functions' output directly (a throwaway Node/ts-node script, or
  the real running app) and confirm every one of the 18 values matches
  the user's reported real figures exactly: Diplomacy 45%, Engineering
  44%, Command 43%, Science 42%, Medicine 40%, Security 39% (Base Skill,
  already sorted correctly desc); Diplomacy/Engineering/Security/Command
  33%/33%, Science 32%/32%, Medicine 31%/31% (Proficiency, sorted desc by
  Min).
- Real-browser check: load Overview with real data, confirm both new
  tables render below the existing Missing-4-Stars tables, in the correct
  sorted order, with the `+N%` formatting, and confirm the page's existing
  loading/error behavior is unaffected (no new spinner/error path
  introduced).
