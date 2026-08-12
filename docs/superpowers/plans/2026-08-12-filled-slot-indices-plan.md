# getFilledSlotIndices / getMissingSlotIndices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract `getFilledSlotIndices`/`getMissingSlotIndices` as shared primitives in `client/src/crew/getters.ts`, and rewire `isImmortalized`, `getEquipmentSlotsRemaining`, and `getMissingEquipmentArchetypeIds` to all derive from them — removing the data-dependent assumption that a raw `equipment.length` count and a `Set`-of-indices computation always agree.

**Architecture:** One file, one task. All three target functions plus the two new primitives live in the same file and are tightly interdependent — nothing here is independently useful or testable until the whole edit lands together.

**Tech Stack:** React 19, TypeScript strict mode.

## Global Constraints

- **Zero behavior change for any real crew member in the current dataset** — this is the plan's central claim and must be proven (exhaustively, not sampled), not assumed.
- Verification must use the real, live-refreshed `server/data/player-cache.json` — NOT `example-data.json`, which is stale.
- The fullness check is `getMissingSlotIndices(crew).length === 0`, not `getFilledSlotIndices(crew).size === 4` — the size-based check is NOT equivalent in the presence of an out-of-range slot index (see spec's Design section for why); use the missing-indices form everywhere.
- `getEquipmentSlotsRemaining`'s existing `-4..0` sign convention (a previously-confirmed, deliberate specification — not a bug) must be preserved exactly for all normal data: `return -getMissingSlotIndices(crew).length;`.
- No change to `CrewMember`'s type, to `equipment_slots` handling, to `isReadyToImmortalize`/`getCrewTier`/`areAllMissingItemsOwned`'s own bodies, or to any consumer of `getEquipmentSlotsRemaining` (`CrewTable.tsx`, `crew/sorters.ts`, `CollectionCrewList.tsx`) — they keep calling the same functions with the same signatures.
- Build (`npm run build -w client`) and lint (`npm run lint -w client`) must stay clean: 0 errors, same 4 pre-existing/expected-class warnings as before this feature.
- Full spec: `docs/superpowers/specs/2026-08-12-filled-slot-indices-design.md`.

---

### Task 1: Extract the shared primitives and rewire the three consumers

**Files:**
- Modify: `client/src/crew/getters.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `getFilledSlotIndices(crew: CrewMember): Set<number>`, `getMissingSlotIndices(crew: CrewMember): number[]` — both newly exported from `client/src/crew/getters.ts`. `getEquipmentSlotsRemaining`, `getMissingEquipmentArchetypeIds`, `isImmortalized` keep their existing signatures (`(crew: CrewMember) => number/number[]/boolean`) — no caller anywhere else in the codebase needs to change.

- [ ] **Step 1: Confirm the current state of `client/src/crew/getters.ts` matches this plan's assumptions**

Run:
```bash
grep -n "getFilledSlotIndices\|getMissingSlotIndices" client/src/crew/getters.ts
```
Expected: no output (neither function exists yet). If this prints anything, stop and re-read the actual file before proceeding — it has already changed from what this plan assumes.

- [ ] **Step 2: Replace lines 13-38 of `client/src/crew/getters.ts`**

Replace this block (from `getEquipmentSlotsRemaining` through the end of `isImmortalized` — i.e. everything between `getCrewList` above it and `isReadyToImmortalize` below it):

```ts
export function getEquipmentSlotsRemaining(crew: CrewMember): number {
  return (crew.equipment?.length ?? 0) - 4;
}

export function getOwnedItems(data: PlayerData): OwnedItem[] {
  const player = data.player as Record<string, unknown> | undefined;
  const character = player?.character as Record<string, unknown> | undefined;
  const items = character?.items;
  return Array.isArray(items) ? (items as OwnedItem[]) : [];
}

export function getMissingEquipmentArchetypeIds(crew: CrewMember): number[] {
  const filledSlots = new Set(crew.equipment.map(([slot]) => slot));
  const missingIndices = [0, 1, 2, 3].filter((i) => !filledSlots.has(i));
  const slots = crew.equipment_slots ?? [];
  return missingIndices.map((i) => slots[i]?.archetype ?? -1);
}

export function areAllMissingItemsOwned(crew: CrewMember, items: OwnedItem[]): boolean {
  const missingArchetypeIds = getMissingEquipmentArchetypeIds(crew);
  return missingArchetypeIds.every((archetypeId) => items.some((item) => item.archetype_id === archetypeId));
}

export function isImmortalized(crew: CrewMember): boolean {
  return crew.rarity === crew.max_rarity && crew.level === 100 && crew.equipment.length === 4;
}
```

with:

```ts
const ALL_SLOT_INDICES = [0, 1, 2, 3];

export function getFilledSlotIndices(crew: CrewMember): Set<number> {
  return new Set(crew.equipment.map(([slot]) => slot));
}

export function getMissingSlotIndices(crew: CrewMember): number[] {
  const filledSlots = getFilledSlotIndices(crew);
  return ALL_SLOT_INDICES.filter((i) => !filledSlots.has(i));
}

export function getEquipmentSlotsRemaining(crew: CrewMember): number {
  return -getMissingSlotIndices(crew).length;
}

export function getOwnedItems(data: PlayerData): OwnedItem[] {
  const player = data.player as Record<string, unknown> | undefined;
  const character = player?.character as Record<string, unknown> | undefined;
  const items = character?.items;
  return Array.isArray(items) ? (items as OwnedItem[]) : [];
}

export function getMissingEquipmentArchetypeIds(crew: CrewMember): number[] {
  const missingIndices = getMissingSlotIndices(crew);
  const slots = crew.equipment_slots ?? [];
  return missingIndices.map((i) => slots[i]?.archetype ?? -1);
}

export function areAllMissingItemsOwned(crew: CrewMember, items: OwnedItem[]): boolean {
  const missingArchetypeIds = getMissingEquipmentArchetypeIds(crew);
  return missingArchetypeIds.every((archetypeId) => items.some((item) => item.archetype_id === archetypeId));
}

export function isImmortalized(crew: CrewMember): boolean {
  return crew.rarity === crew.max_rarity && crew.level === 100 && getMissingSlotIndices(crew).length === 0;
}
```

Everything else in the file (`getCrewList` above, `isReadyToImmortalize`/`getCrewTier`/`getFrozenCrewArchetypeIds`/the QP functions/`getOwnedArchetypeIds` below) is untouched — they already call `getEquipmentSlotsRemaining`/`isImmortalized`/`areAllMissingItemsOwned` by name, which now resolve to the rewired implementations with identical signatures.

- [ ] **Step 3: Build and lint**

Run: `npm run build -w client` — expect success, 0 errors.
Run: `npm run lint -w client` — expect 0 errors, same 4 pre-existing warnings as before this feature.

- [ ] **Step 4: Exhaustive old-vs-new data-driven verification against the real, live-refreshed `server/data/player-cache.json`**

Write a throwaway script at the repo root, `verify-slot-indices.ts` (not committed — delete it once you've captured its output in your report):

```ts
import { readFileSync } from 'node:fs';
import { isImmortalized, getEquipmentSlotsRemaining, getMissingEquipmentArchetypeIds } from './client/src/crew/getters';
import type { CrewMember } from './client/src/types/crew';

const data = JSON.parse(readFileSync('server/data/player-cache.json', 'utf-8'));
const crewList = data.player.character.crew as CrewMember[];

function oldSlotsRemaining(c: CrewMember): number {
  return (c.equipment?.length ?? 0) - 4;
}
function oldImmortalized(c: CrewMember): boolean {
  return c.rarity === c.max_rarity && c.level === 100 && c.equipment.length === 4;
}
function oldMissingArchetypeIds(c: CrewMember): number[] {
  const filledSlots = new Set(c.equipment.map(([slot]) => slot));
  const missingIndices = [0, 1, 2, 3].filter((i) => !filledSlots.has(i));
  const slots = c.equipment_slots ?? [];
  return missingIndices.map((i) => slots[i]?.archetype ?? -1);
}

let mismatches = 0;
let anomalies = 0;
for (const c of crewList) {
  const eqIndices = c.equipment.map(([slot]) => slot);
  const uniqueIndices = new Set(eqIndices);
  if (uniqueIndices.size !== eqIndices.length || eqIndices.some((i) => i < 0 || i > 3)) {
    anomalies++;
  }
  const a1 = oldSlotsRemaining(c);
  const a2 = getEquipmentSlotsRemaining(c);
  const b1 = oldImmortalized(c);
  const b2 = isImmortalized(c);
  const c1 = JSON.stringify(oldMissingArchetypeIds(c));
  const c2 = JSON.stringify(getMissingEquipmentArchetypeIds(c));
  if (a1 !== a2 || b1 !== b2 || c1 !== c2) {
    mismatches++;
    console.log('MISMATCH', c.name, { a1, a2, b1, b2, c1, c2 });
  }
}
console.log(`Total crew: ${crewList.length}, anomalies (dup/out-of-range slot indices): ${anomalies}, mismatches: ${mismatches}`);
```

Run: `npx tsx verify-slot-indices.ts` (from the repo root — both the import paths and the `server/data/player-cache.json` read path are relative to this file's location at the repo root).

**Expected output, dry-run-verified by the controller before this plan was finalized — confirm your run matches:**

```
Total crew: 604, anomalies (dup/out-of-range slot indices): 0, mismatches: 0
```

The load-bearing number is **`mismatches: 0`** — this must hold regardless. If your run's crew count or anomaly count differs from `604`/`0` (the user may have refreshed with newer live data since this plan was written), that's expected and fine; state it plainly in your report. If `mismatches` is ever non-zero, STOP — do not proceed to commit — and report BLOCKED with the specific crew member(s) and old/new values that disagreed, since that would mean the two implementations are not actually equivalent and the plan's central claim is wrong.

- [ ] **Step 5: Real-browser sanity check**

The real, live-refreshed `server/data/player-cache.json` should already be seeded in this worktree. Start the dev server (`npm run dev`, root) and, using the `playwright` library or MCP tools:

1. Open any crew page (e.g. `/3-4-stars-crew`) and confirm the "Items" column (driven by `getEquipmentSlotsRemaining`) renders the same values it did before this change — spot-check at least 3 rows' values against a manual read of the same crew members' `equipment` array length in `server/data/player-cache.json`.
2. Open a Collections row with an expanded crew list (`CollectionCrewList`'s "Items:" display) and confirm it renders correctly for at least one crew member.
3. Confirm no crew that was previously excluded from a "needs work"/"ready" list now appears (or vice versa) — e.g. load `/4-4-stars-crew` and `/4-4-stars-crew-ready` and confirm their combined crew set and each one's row count look unchanged from what you'd expect (this is a sanity check only — Step 4's exhaustive data comparison is the real proof, this is just confirming the UI reflects it).

Stop the dev server afterward (kill only the process this step started).

- [ ] **Step 6: Commit**

```bash
git add client/src/crew/getters.ts
git commit -m "Extract getFilledSlotIndices/getMissingSlotIndices shared primitive"
```
