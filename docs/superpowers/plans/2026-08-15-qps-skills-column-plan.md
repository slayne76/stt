# QPs Page Top-2-Skills Column Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new last column to the `/qps` table showing each crew member's top 2 skills (by core value), abbreviated (e.g. `SEC/DIP`, or just `ENG` for a 1-skill crew) — and establish a reusable, shared skill-abbreviation module for future features.

**Architecture:** Task 1 creates a standalone, independently-testable data module (`client/src/crew/skillLabels.ts`) plus a new `getTopSkillAbbreviations` getter and the underlying `CrewMember.skills` type — no UI dependency. Task 2 wires the getter into `QPsTable.tsx` as a new table column.

**Tech Stack:** React 19, TypeScript strict mode, MUI, `tsx` (root devDependency, used for throwaway verification scripts — this project has no automated test framework by deliberate choice).

## Global Constraints

- **Verification for this feature must use the real, live-refreshed `server/data/player-cache.json` (636 crew as of 2026-08-15) — NOT `example-data.json`** (597 crew, stale since 2026-08-04). When setting up any worktree for this plan, copy the actual current `server/data/player-cache.json` from the main checkout.
- A skill's "strength" is its `core` value (not `range_min`/`range_max`) — confirmed by the user during brainstorming.
- Ties on `core` value are broken alphabetically by **abbreviation** (`CMD` < `DIP` < `ENG` < `MED` < `SCI` < `SEC`) — confirmed by the user during brainstorming, not a fixed in-game priority order.
- The abbreviation map is: `science: 'SCI'`, `engineering: 'ENG'`, `diplomacy: 'DIP'`, `command: 'CMD'`, `security: 'SEC'`, `medicine: 'MED'`.
- Raw crew skill keys in the game data carry a `_skill` suffix (e.g. `diplomacy_skill`) — strip it before looking up the abbreviation/label.
- Display is exactly 2 abbreviations joined by `/` (highest first), or 1 abbreviation with no trailing slash if the crew member has only 1 skill. No 0-skill case needs handling — every real crew member has 1–3 skills (confirmed: distribution across 636 real crew is 7×1-skill, 88×2-skill, 541×3-skill, zero with 0).
- No changes to sorting/filtering/search — this is a display-only column addition.
- Build (`npm run build -w client`) and lint (`npm run lint -w client`) must stay clean: 0 errors, same pre-existing warning count as before this feature.
- Full spec: `docs/superpowers/specs/2026-08-15-qps-skills-column-design.md`.

---

### Task 1: Shared skill-abbreviation module, `CrewMember.skills` type, and `getTopSkillAbbreviations` getter

**Files:**
- Create: `client/src/crew/skillLabels.ts`
- Modify: `client/src/types/crew.ts`
- Modify: `client/src/crew/getters.ts`
- Modify: `client/src/lib/skillBuffs.ts`

**Interfaces:**
- Produces: `SKILL_LABELS: Record<string, string>`, `SKILL_ABBREVIATIONS: Record<string, string>` — both exported from `client/src/crew/skillLabels.ts`, keyed by bare skill name (`science`, `engineering`, `diplomacy`, `command`, `security`, `medicine`).
- Produces: `SkillValue { core: number; range_min: number; range_max: number }` exported from `client/src/types/crew.ts`; `CrewMember` gains `skills: Record<string, SkillValue>` (keys carry the `_skill` suffix, e.g. `"diplomacy_skill"`, matching the raw game data).
- Produces: `getTopSkillAbbreviations(crew: CrewMember): string` exported from `client/src/crew/getters.ts`.

- [ ] **Step 1: Create `client/src/crew/skillLabels.ts`**

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

- [ ] **Step 2: Add `SkillValue` and `skills` to `client/src/types/crew.ts`**

Replace the full current file contents:

```ts
import type { DatacoreAsset } from './asset';

export interface CrewMember {
  id: number;
  symbol: string;
  name: string;
  short_name: string;
  archetype_id: number;
  rarity: number;
  max_rarity: number;
  level: number;
  equipment: [number, number][];
  equipment_slots: { level: number; archetype: number }[];
  traits: string[];
  traits_hidden: string[];
  portrait?: DatacoreAsset;
  q_bits: number;
  in_buy_back_state: boolean;
}
```

with:

```ts
import type { DatacoreAsset } from './asset';

export interface SkillValue {
  core: number;
  range_min: number;
  range_max: number;
}

export interface CrewMember {
  id: number;
  symbol: string;
  name: string;
  short_name: string;
  archetype_id: number;
  rarity: number;
  max_rarity: number;
  level: number;
  equipment: [number, number][];
  equipment_slots: { level: number; archetype: number }[];
  traits: string[];
  traits_hidden: string[];
  portrait?: DatacoreAsset;
  q_bits: number;
  in_buy_back_state: boolean;
  skills: Record<string, SkillValue>;
}
```

- [ ] **Step 3: Add `getTopSkillAbbreviations` to `client/src/crew/getters.ts`**

Add this import at the top of the file, alongside the existing imports:

```ts
import { SKILL_ABBREVIATIONS } from './skillLabels';
```

Append this function at the end of the file:

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

- [ ] **Step 4: Refactor `client/src/lib/skillBuffs.ts` to import `SKILL_LABELS` instead of defining its own**

Replace:

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
```

with:

```ts
import type { PlayerData } from '../types/player';
import { SKILL_LABELS } from '../crew/skillLabels';

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

const CORE_SKILL_STAT = /^(\w+)_skill_core$/;
```

Nothing else in `skillBuffs.ts` changes — `getAllBuffs`, `getBaseSkillBonuses`, `getProficiencyBonuses`, and `PROFICIENCY_STAT` stay exactly as they are, now reading the imported `SKILL_LABELS` instead of the local constant. This is a pure dedup refactor — behavior is unchanged (same keys, same values).

- [ ] **Step 5: Build and lint**

Run: `npm run build -w client` — expect success, 0 errors.
Run: `npm run lint -w client` — expect 0 errors, same pre-existing warning count as before this feature (this change adds no new component files, so no new `react-refresh/only-export-components` warnings).

- [ ] **Step 6: Data-driven verification against the real, live-refreshed `server/data/player-cache.json`**

Write a throwaway script at the repo root, `verify-top-skills.ts` (not committed — delete it after capturing output), using `tsx` (already a root devDependency):

```ts
import { readFileSync } from 'node:fs';
import { getTopSkillAbbreviations } from './client/src/crew/getters';
import type { CrewMember } from './client/src/types/crew';

const data = JSON.parse(readFileSync('server/data/player-cache.json', 'utf-8'));
const crew: CrewMember[] = data.player.character.crew;

const byName = (name: string) => crew.find((c) => c.name === name)!;

console.log('Captain Tribble (1 skill):', getTopSkillAbbreviations(byName('Captain Tribble')));
console.log('Minuet (2 skills):', getTopSkillAbbreviations(byName('Minuet')));
console.log('Dancing Chekov (3 skills):', getTopSkillAbbreviations(byName('Dancing Chekov')));
```

Run: `npx tsx verify-top-skills.ts` (from the repo root).

**Expected output, computed from the real file as of 2026-08-15 — confirm your run matches exactly:**

```
Captain Tribble (1 skill): CMD
Minuet (2 skills): DIP/CMD
Dancing Chekov (3 skills): DIP/SEC
```

Reasoning to sanity-check, not just byte-match: Captain Tribble only has `command_skill` (core 1890) → `CMD`, no slash. Minuet has `diplomacy_skill` (core 1380) and `command_skill` (core 1303), both kept since there are only 2 → `DIP/CMD`. Dancing Chekov has three skills — `diplomacy_skill` (core 1186), `security_skill` (core 719), `command_skill` (core 469) — the top 2 by core are kept and command (the lowest of the 3) is dropped → `DIP/SEC`.

If any of these three named crew members don't exist in your run's data file (the user may have refreshed with different data since this plan was written), pick 3 different real crew members from the same file instead — one with exactly 1 skill, one with exactly 2, one with exactly 3 — and hand-verify each output against that crew member's raw `skills` object directly. State explicitly in your report whether your run used the same 3 named crew members as above or substitutes, and why if substitutes were needed.

Delete the throwaway script once you've captured its output in your report.

- [ ] **Step 7: Commit**

```bash
git add client/src/crew/skillLabels.ts client/src/types/crew.ts client/src/crew/getters.ts client/src/lib/skillBuffs.ts
git commit -m "Add getTopSkillAbbreviations and shared skill-abbreviation module"
```

---

### Task 2: Render the "Skills" column in `QPsTable.tsx`

**Files:**
- Modify: `client/src/crew/QPsTable.tsx`

**Interfaces:**
- Consumes: `getTopSkillAbbreviations(crew: CrewMember): string` from Task 1 (`./getters`, already imported into this file for other getters — extend the existing import).

- [ ] **Step 1: Extend the `./getters` import and add the header cell**

Replace:

```tsx
import { getQPLevel, getQPProgressDisplay, getQPPointsNeeded, getQPRoundsLeft, QP_MAX_LEVEL } from './getters';
```

with:

```tsx
import {
  getQPLevel,
  getQPProgressDisplay,
  getQPPointsNeeded,
  getQPRoundsLeft,
  getTopSkillAbbreviations,
  QP_MAX_LEVEL,
} from './getters';
```

Replace:

```tsx
            <TableCell align="right">Rounds left</TableCell>
          </TableRow>
        </TableHead>
```

with:

```tsx
            <TableCell align="right">Rounds left</TableCell>
            <TableCell>Skills</TableCell>
          </TableRow>
        </TableHead>
```

- [ ] **Step 2: Add the data cell as the new last column**

Replace:

```tsx
                <TableCell align="right">-{getQPPointsNeeded(c)}</TableCell>
                <TableCell align="right">-{getQPRoundsLeft(c)}</TableCell>
              </TableRow>
```

with:

```tsx
                <TableCell align="right">-{getQPPointsNeeded(c)}</TableCell>
                <TableCell align="right">-{getQPRoundsLeft(c)}</TableCell>
                <TableCell>{getTopSkillAbbreviations(c)}</TableCell>
              </TableRow>
```

- [ ] **Step 3: Update the pagination footer's `colSpan`**

Replace:

```tsx
          colSpan={8}
```

with:

```tsx
          colSpan={9}
```

- [ ] **Step 4: Build and lint**

Run: `npm run build -w client` — expect success, 0 errors.
Run: `npm run lint -w client` — expect 0 errors, same pre-existing warning count as before this feature.

- [ ] **Step 5: Real-browser verification**

The real, live-refreshed `server/data/player-cache.json` should already be seeded in this worktree from Task 1's setup (per the Global Constraints note — NOT `example-data.json`). If it's missing, copy it from the main checkout before proceeding.

Start the dev server: `npm run dev` (root). Using the `playwright` library directly (or the `mcp__playwright__*`/`mcp__chrome-devtools__*` MCP tools if available — see `CLAUDE.md`), navigate to `/qps` and:

1. Confirm the table header row's last column reads "Skills", after "Rounds left".
2. Read the actual rendered "Skills" cell values for at least the first 8 rows (per-cell reads — do not use a whole-row/concatenated text extraction) and confirm they match, in order:

   ```
   1. Assimilated Spock    → SEC/ENG
   2. Chances Taken Kirk   → CMD/SEC
   3. Corrupted Badgey     → SEC/CMD
   4. Gorn Offensive Pike  → CMD/SEC
   5. Morphing Vadic       → SEC/SCI
   6. Starfleet Medical Phlox → MED/SCI
   7. Colonel West         → DIP/ENG
   8. Impish Riker         → DIP/CMD
   ```

   If the live data has changed since this plan was written (different names/order in the first 8 rows), that's fine — instead read whichever 8 crew members actually appear first, and for each one, independently cross-check its rendered "Skills" value against a manual read of that crew member's raw `skills` object in `server/data/player-cache.json` (top 2 by `core`, descending). State explicitly in your report whether you used the table above or a fresh cross-check, and why.
3. Confirm the pagination footer (if visible — only shows when there are more rows than fit one page) still spans the full table width with no visual misalignment, now that there are 9 columns instead of 8.
4. Confirm no existing column changed position or content — this is purely an appended last column.

Stop the dev server afterward (kill only the process this step started — confirm ownership via the working-directory/port before killing anything if a port conflict comes up).

- [ ] **Step 6: Commit**

```bash
git add client/src/crew/QPsTable.tsx
git commit -m "Add Skills column to QPs table"
```
