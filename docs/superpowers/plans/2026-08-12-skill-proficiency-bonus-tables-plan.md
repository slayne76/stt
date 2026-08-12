# Base Skill Bonus & Proficiency Bonus Tables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new tables to the Overview page — "Base Skill Bonus" (6 rows) and "Proficiency Bonus" (6 rows, Min/Max columns) — sourced from the player's accumulated collection-buff percentages in `data.player.character.all_buffs`.

**Architecture:** Task 1 creates a standalone, independently-testable data module (`lib/skillBuffs.ts`) with no UI dependency. Task 2 wires it into `OverviewPage.tsx`, appending two new tables after the existing ones.

**Tech Stack:** React 19, TypeScript strict mode, MUI.

## Global Constraints

- **Verification for this feature must use the real, live-refreshed `server/data/player-cache.json` — NOT `example-data.json`.** `example-data.json` is stale (2026-08-04) and does not necessarily contain matching values; the reference values in this plan were computed from the real file as of 2026-08-12. When setting up any worktree for this plan, copy the actual current `server/data/player-cache.json` from the main checkout, not `example-data.json`.
- Both tables always render exactly 6 rows, driven by a fixed 6-skill set (science/engineering/diplomacy/command/security/medicine) — an absent `stat` in `all_buffs` defaults that skill's value to `0`, it never shrinks the row count.
- Values are whole-number percentages (`Math.round(buff.value * 100)`), displayed with a leading `+` (e.g. `+42%`).
- Base Skill Bonus sorted desc by value, tie-broken alphabetically by skill name. Proficiency Bonus sorted desc by `min`, tie-broken alphabetically by skill name.
- No search, no pagination, no icons — both tables are fixed-size and plain-text, matching the spec's stated non-goals.
- No change to `OverviewPage.tsx`'s existing loading/error/`showMissingTables` gating — the two new tables render inside the same conditional as the existing Missing-4-Stars tables, no new data source.
- Build (`npm run build -w client`) and lint (`npm run lint -w client`) must stay clean: 0 errors, same 4 pre-existing/expected-class warnings as before this feature.
- Full spec: `docs/superpowers/specs/2026-08-12-skill-proficiency-bonus-tables-design.md`.

---

### Task 1: Create `client/src/lib/skillBuffs.ts`

**Files:**
- Create: `client/src/lib/skillBuffs.ts`

**Interfaces:**
- Produces: `SkillBonus { skill: string; value: number }`, `ProficiencyBonus { skill: string; min: number; max: number }`, `getBaseSkillBonuses(data: PlayerData): SkillBonus[]`, `getProficiencyBonuses(data: PlayerData): ProficiencyBonus[]` — all exported from `client/src/lib/skillBuffs.ts`.

- [ ] **Step 1: Create `client/src/lib/skillBuffs.ts`**

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

- [ ] **Step 2: Build and lint**

Run: `npm run build -w client` — expect success, 0 errors.
Run: `npm run lint -w client` — expect 0 errors, same 4 pre-existing warnings as before this feature (2 in `PlayerDataContext.tsx`/`CrewCatalogContext.tsx`, 2 in `routes.tsx`) — this file adds no new exports of the kind that trigger `react-refresh/only-export-components` (it's not a component file), so the warning count must not change.

- [ ] **Step 3: Data-driven verification against the real, live-refreshed `server/data/player-cache.json`**

Write a throwaway script at the repo root, `verify-skill-buffs.ts` (not committed — delete it in Step 3's last instruction below), using `tsx` (already a root devDependency):

```ts
import { readFileSync } from 'node:fs';
import { getBaseSkillBonuses, getProficiencyBonuses } from './client/src/lib/skillBuffs';

const data = JSON.parse(readFileSync('server/data/player-cache.json', 'utf-8'));
console.log('Base Skill Bonuses:', JSON.stringify(getBaseSkillBonuses(data)));
console.log('Proficiency Bonuses:', JSON.stringify(getProficiencyBonuses(data)));
```

Run: `npx tsx verify-skill-buffs.ts` (from the repo root — both the import path and the `server/data/player-cache.json` read path are relative to this file's location at the repo root).

**Expected output, computed from the real file as of 2026-08-12 — confirm your run matches exactly (order included):**

```
Base Skill Bonuses: [{"skill":"Diplomacy","value":45},{"skill":"Engineering","value":44},{"skill":"Command","value":43},{"skill":"Science","value":42},{"skill":"Medicine","value":40},{"skill":"Security","value":39}]
Proficiency Bonuses: [{"skill":"Command","min":33,"max":33},{"skill":"Diplomacy","min":33,"max":33},{"skill":"Engineering","min":33,"max":33},{"skill":"Security","min":33,"max":33},{"skill":"Science","min":32,"max":32},{"skill":"Medicine","min":31,"max":31}]
```

If your run's data file has since changed (the user may have refreshed with newer live data), the important thing is that your run's values genuinely match what a manual read of `server/data/player-cache.json`'s `player.character.all_buffs` array shows for each `*_skill_core`/`*_skill_range_min`/`*_skill_range_max` stat — not that they byte-match the numbers above. State explicitly in your report whether your output matched the numbers above exactly, or differed (and why, if you can tell — e.g. the data file's timestamp is newer than 2026-08-12).

Delete the throwaway script once you've captured its output in your report.

- [ ] **Step 4: Commit**

```bash
git add client/src/lib/skillBuffs.ts
git commit -m "Add getBaseSkillBonuses/getProficiencyBonuses"
```

---

### Task 2: Render the two tables in `OverviewPage.tsx`

**Files:**
- Modify: `client/src/pages/OverviewPage.tsx`

**Interfaces:**
- Consumes: `getBaseSkillBonuses(data: PlayerData): SkillBonus[]`, `getProficiencyBonuses(data: PlayerData): ProficiencyBonus[]` from Task 1 (`../lib/skillBuffs`).

- [ ] **Step 1: Add `TableHead` to the MUI import and the two new function imports**

Replace:

```tsx
import {
  Alert,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from '@mui/material';
import { usePlayerData } from '../hooks/usePlayerData';
import { useCrewCatalog } from '../hooks/useCrewCatalog';
import { extractPlayerIdentity } from '../lib/extractPlayerIdentity';
import { getCrewList, getFrozenCrewArchetypeIds, getOwnedArchetypeIds } from '../crew/getters';
```

with:

```tsx
import {
  Alert,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { usePlayerData } from '../hooks/usePlayerData';
import { useCrewCatalog } from '../hooks/useCrewCatalog';
import { extractPlayerIdentity } from '../lib/extractPlayerIdentity';
import { getBaseSkillBonuses, getProficiencyBonuses } from '../lib/skillBuffs';
import { getCrewList, getFrozenCrewArchetypeIds, getOwnedArchetypeIds } from '../crew/getters';
```

- [ ] **Step 2: Compute the two derived arrays**

Replace:

```tsx
  const crewList = data ? getCrewList(data) : [];
  const frozenArchetypeIds = data ? getFrozenCrewArchetypeIds(data) : new Set<number>();
  const catalogMaxRarityById = catalog ? getArchetypeMaxRarityMap(catalog) : new Map<number, number>();
  const collectionsList = data ? getCollectionsList(data) : [];
```

with:

```tsx
  const crewList = data ? getCrewList(data) : [];
  const frozenArchetypeIds = data ? getFrozenCrewArchetypeIds(data) : new Set<number>();
  const catalogMaxRarityById = catalog ? getArchetypeMaxRarityMap(catalog) : new Map<number, number>();
  const collectionsList = data ? getCollectionsList(data) : [];
  const baseSkillBonuses = data ? getBaseSkillBonuses(data) : [];
  const proficiencyBonuses = data ? getProficiencyBonuses(data) : [];
```

- [ ] **Step 3: Append the two new tables after the existing Missing-4-Stars tables**

Replace:

```tsx
          {notInPortalSearch.active && notInPortalSearch.filteredItems.length === 0 ? (
            <Typography color="text.secondary">No results found for your search.</Typography>
          ) : (
            <MissingCrewTable crew={notInPortalSearch.filteredItems} collections={collectionsList} />
          )}
        </>
      )}
```

with:

```tsx
          {notInPortalSearch.active && notInPortalSearch.filteredItems.length === 0 ? (
            <Typography color="text.secondary">No results found for your search.</Typography>
          ) : (
            <MissingCrewTable crew={notInPortalSearch.filteredItems} collections={collectionsList} />
          )}

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
        </>
      )}
```

Everything else in the file — the identity table, the two Missing-4-Stars tables and their search bars, `showMissingTables`'s definition — is untouched.

- [ ] **Step 4: Build and lint**

Run: `npm run build -w client` — expect success, 0 errors.
Run: `npm run lint -w client` — expect 0 errors, same 4 pre-existing warnings as before this feature.

- [ ] **Step 5: Real-browser verification**

The real, live-refreshed `server/data/player-cache.json` should already be seeded in this worktree from Task 1's setup (per the Global Constraints note — NOT `example-data.json`). If it's missing, copy it from the main checkout before proceeding.

Start the dev server: `npm run dev` (root). Using the `playwright` library directly (or the `mcp__playwright__*`/`mcp__chrome-devtools__*` MCP tools if available — see `CLAUDE.md`), navigate to `/` and:

1. Confirm both new tables render, below the existing "Missing 4 Stars (Not in Portal)" table, with headings "Base Skill Bonus" and "Proficiency Bonus".
2. Read the actual rendered row values (not inferred from source) and confirm the Base Skill Bonus table shows exactly 6 rows in this order: Diplomacy +45%, Engineering +44%, Command +43%, Science +42%, Medicine +40%, Security +39% (or, if the live data has changed since this plan was written, confirm the rendered order is genuinely sorted descending by value, and cross-check at least 2 rows' values directly against a manual read of `server/data/player-cache.json`).
3. Read the actual rendered row values for the Proficiency Bonus table and confirm exactly 6 rows, each showing a Min and Max column, sorted descending by Min.
4. Confirm the page's existing content (identity table, both Missing-4-Stars tables) still renders correctly above the new tables — no regression to existing behavior.

Stop the dev server afterward (kill only the process this step started — confirm ownership via the working-directory/port before killing anything if a port conflict comes up).

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/OverviewPage.tsx
git commit -m "Add Base Skill Bonus and Proficiency Bonus tables to Overview"
```
