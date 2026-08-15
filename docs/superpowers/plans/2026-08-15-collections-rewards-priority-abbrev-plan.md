# Collections Rewards Priority/Abbreviation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the Collections page's "Rewards" column, move Skill/Proficiency reward strings to the front (ahead of item rewards) and abbreviate the skill name using the shared `SKILL_ABBREVIATIONS` map.

**Architecture:** Single-file, single-task change — `client/src/collections/rewards.ts` only. Reorders the two loops that build the returned array and adds an abbreviation lookup; no caller-side change (`CollectionsTable.tsx`'s `rewards.join(', ')` needs nothing new).

**Tech Stack:** React 19, TypeScript strict mode, `tsx` (root devDependency, used for throwaway verification scripts — this project has no automated test framework by deliberate choice).

## Global Constraints

- Output order: Skill entries, then Proficiency entries (same relative order as today, unchanged), then item-type rewards in their existing `collection.milestone.rewards`-array order (unchanged relative order, just moved after Skill/Proficiency).
- Skill name abbreviation via `SKILL_ABBREVIATIONS` (`client/src/crew/skillLabels.ts`), keyed by lowercased skill name (`skill.toLowerCase()`), with a `?? skill` fallback (defensive only — every real buff name this regex matches is one of the six known skills).
- The `"Skill: "`/`"Proficiency: "` prefixes are unchanged — only the text after the colon changes.
- No change to which reward types are curated, no change to `CollectionsTable.tsx`, no change to `skillLabels.ts` itself.
- Build (`npm run build -w client`) and lint (`npm run lint -w client`) must stay clean: 0 errors, same pre-existing warning count as before this feature.
- **Real expected values, computed from `server/data/player-cache.json` as of 2026-08-15:**
  - "Heh Cho'mruak tah": `"Skill: CMD, 10x Portal (1)"`
  - "Their Royal Highnesses": `"Skill: CMD, Proficiency: CMD, Portal (1)"`
  - If the live data has changed since this plan was written, re-derive independently (see the verification step) rather than expecting a byte-match.
- Full spec: `docs/superpowers/specs/2026-08-15-collections-rewards-priority-abbrev-design.md`.

---

### Task 1: Reorder and abbreviate `getCuratedRewards`

**Files:**
- Modify: `client/src/collections/rewards.ts`

**Interfaces:** None — `getCuratedRewards(collection: Collection): string[]`'s signature is unchanged; only its internal logic and output order/content change. Its one caller (`CollectionsTable.tsx:51`) needs no changes.

- [ ] **Step 1: Reorder the two loops and add abbreviation**

Replace the full current file contents:

```ts
import type { Collection } from '../types/collection';

const CORE_SKILL_PATTERN = /^(.+) Core Skill \+\d+%$/;
const SKILL_PROFICIENCY_PATTERN = /^(.+) Skill Proficiency (?:Min|Max) \+\d+%$/;

export function getCuratedRewards(collection: Collection): string[] {
  const rewards: string[] = [];

  for (const reward of collection.milestone.rewards) {
    if (reward.symbol === 'premium_10x_bundle') {
      rewards.push(`10x Portal (${reward.quantity})`);
    } else if (reward.symbol === 'premium_1x_bundle') {
      rewards.push(`Portal (${reward.quantity})`);
    } else if (reward.symbol === 'premium_purchasable') {
      rewards.push(`Dilithium (${reward.quantity})`);
    } else if (reward.type === 1) {
      rewards.push(reward.full_name);
    } else if (reward.symbol === 'niners_avatar') {
      rewards.push('The Niners Avatar');
    } else if (reward.symbol === 'honorable_citation_quality5') {
      rewards.push('Legendary Honorable Citation');
    }
  }

  const skillSet = new Set<string>();
  const proficiencySet = new Set<string>();

  for (const buff of collection.milestone.buffs) {
    const coreMatch = buff.name.match(CORE_SKILL_PATTERN);
    if (coreMatch) {
      skillSet.add(coreMatch[1]);
      continue;
    }
    const proficiencyMatch = buff.name.match(SKILL_PROFICIENCY_PATTERN);
    if (proficiencyMatch) {
      proficiencySet.add(proficiencyMatch[1]);
    }
  }

  for (const skill of skillSet) {
    rewards.push(`Skill: ${skill}`);
  }
  for (const skill of proficiencySet) {
    rewards.push(`Proficiency: ${skill}`);
  }

  return rewards;
}
```

with:

```ts
import type { Collection } from '../types/collection';
import { SKILL_ABBREVIATIONS } from '../crew/skillLabels';

const CORE_SKILL_PATTERN = /^(.+) Core Skill \+\d+%$/;
const SKILL_PROFICIENCY_PATTERN = /^(.+) Skill Proficiency (?:Min|Max) \+\d+%$/;

function abbreviateSkill(skill: string): string {
  return SKILL_ABBREVIATIONS[skill.toLowerCase()] ?? skill;
}

export function getCuratedRewards(collection: Collection): string[] {
  const skillSet = new Set<string>();
  const proficiencySet = new Set<string>();

  for (const buff of collection.milestone.buffs) {
    const coreMatch = buff.name.match(CORE_SKILL_PATTERN);
    if (coreMatch) {
      skillSet.add(coreMatch[1]);
      continue;
    }
    const proficiencyMatch = buff.name.match(SKILL_PROFICIENCY_PATTERN);
    if (proficiencyMatch) {
      proficiencySet.add(proficiencyMatch[1]);
    }
  }

  const rewards: string[] = [];

  for (const skill of skillSet) {
    rewards.push(`Skill: ${abbreviateSkill(skill)}`);
  }
  for (const skill of proficiencySet) {
    rewards.push(`Proficiency: ${abbreviateSkill(skill)}`);
  }

  for (const reward of collection.milestone.rewards) {
    if (reward.symbol === 'premium_10x_bundle') {
      rewards.push(`10x Portal (${reward.quantity})`);
    } else if (reward.symbol === 'premium_1x_bundle') {
      rewards.push(`Portal (${reward.quantity})`);
    } else if (reward.symbol === 'premium_purchasable') {
      rewards.push(`Dilithium (${reward.quantity})`);
    } else if (reward.type === 1) {
      rewards.push(reward.full_name);
    } else if (reward.symbol === 'niners_avatar') {
      rewards.push('The Niners Avatar');
    } else if (reward.symbol === 'honorable_citation_quality5') {
      rewards.push('Legendary Honorable Citation');
    }
  }

  return rewards;
}
```

(The item-rewards `if`/`else if` chain itself is byte-identical, just moved below the skill/proficiency block instead of above it.)

- [ ] **Step 2: Build and lint**

Run: `npm run build -w client` — expect success, 0 errors.
Run: `npm run lint -w client` — expect 0 errors, same pre-existing warning count as before this feature.

- [ ] **Step 3: Data-driven verification against the real, live-refreshed `server/data/player-cache.json`**

Write a throwaway script at the repo root, `verify-collections-rewards.ts` (not committed — delete it after capturing output), using `tsx` (already a root devDependency):

```ts
import { readFileSync } from 'node:fs';
import { getCuratedRewards } from './client/src/collections/rewards';
import { getCollectionsList } from './client/src/collections/getters';

const data = JSON.parse(readFileSync('server/data/player-cache.json', 'utf-8'));
const collections = getCollectionsList(data);

for (const name of ["Heh Cho'mruak tah", 'Their Royal Highnesses']) {
  const collection = collections.find((c) => c.name === name);
  console.log(name, '=>', collection ? getCuratedRewards(collection).join(', ') : '(not found in this data)');
}
```

Run: `npx tsx verify-collections-rewards.ts` (from the repo root).

**Expected output, computed from the real file as of 2026-08-15 — confirm your run matches exactly:**

```
Heh Cho'mruak tah => Skill: CMD, 10x Portal (1)
Their Royal Highnesses => Skill: CMD, Proficiency: CMD, Portal (1)
```

If either collection no longer exists in your run's data, or its rewards/buffs have changed (the user may have refreshed with newer live data), the important thing is that your run's output genuinely reflects: Skill entries first, then Proficiency entries, then item rewards, all abbreviated — not that it byte-matches the strings above. In that case, pick 1-2 different real collections from the output that do exercise both a Skill/Proficiency reward and an item reward, and manually cross-check their `milestone.buffs`/`milestone.rewards` against the printed output. State explicitly in your report whether your run matched the two named collections above or you substituted others, and why.

Delete the throwaway script once you've captured its output in your report.

- [ ] **Step 4: Real-browser verification**

The real, live-refreshed `server/data/player-cache.json` should already be seeded in this worktree (per this project's established worktree-setup convention). If it's missing, copy it from the main checkout before proceeding.

Start the dev server: `npm run dev` (root). Using the `playwright` library directly (or the `mcp__playwright__*`/`mcp__chrome-devtools__*` MCP tools if available — see `CLAUDE.md`), navigate to `/collections` and:

1. Find the "Heh Cho'mruak tah" row (use the page's search box if needed) and read its Rewards cell's actual text (a single per-cell DOM read, not inferred) — confirm it reads exactly `"Skill: CMD, 10x Portal (1)"` (or whatever Step 3's script actually output, if the live data differed).
2. Find the "Their Royal Highnesses" row and confirm its Rewards cell reads exactly `"Skill: CMD, Proficiency: CMD, Portal (1)"` (or Step 3's actual output).
3. Spot-check at least 2 more rows — one with only item rewards (no Skill/Proficiency buffs) and one with only Skill/Proficiency rewards (no item rewards) — and confirm both render without error and with no stray `undefined` text (which would indicate the `SKILL_ABBREVIATIONS` lookup fell through unexpectedly).
4. Confirm the rest of the Collections page (pagination, the "Upgradable" chip, the per-collection crew list below each row) is unaffected.

Stop the dev server afterward (kill only the process this step started — confirm ownership via the working-directory/port before killing anything if a port conflict comes up; if the port is already occupied by the user's own separately-running dev server, do not kill it — run on an alternate port instead, same as established practice on this project).

- [ ] **Step 5: Commit**

```bash
git add client/src/collections/rewards.ts
git commit -m "Prioritize and abbreviate Skill/Proficiency rewards on Collections page"
```
