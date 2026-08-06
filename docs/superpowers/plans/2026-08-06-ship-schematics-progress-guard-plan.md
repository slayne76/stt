# Ship Schematics Progress — Missing-Field Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `getShipSchematicsProgress` (`client/src/ships/getters.ts`) fail closed (return `0`) instead of returning `NaN` when `ship.schematic_gain_cost_next_level` is missing or otherwise not a finite number, while leaving its existing, verified behavior for real data completely unchanged.

**Architecture:** A single guard clause added to one existing function. No new files, no new types, no signature change, no caller changes.

**Tech Stack:** Same as the existing client workspace — TypeScript (strict), no new dependencies.

## Global Constraints

- **The fix, exactly:**
  ```ts
  export function getShipSchematicsProgress(ship: Ship, items: OwnedItem[]): number {
    const needed = ship.schematic_gain_cost_next_level;
    if (!Number.isFinite(needed)) return 0; // missing/malformed data — fail closed, not "maxed"
    if (needed <= 0) return 100; // legitimate already-maxed sentinel (verified: always exactly -1)
    return Math.min(100, (getShipSchematicsOwned(ship, items) / needed) * 100);
  }
  ```
- **Order matters:** the `Number.isFinite` check must run before the `needed <= 0` check. `Number.isFinite` safely returns `false` for `undefined`/`null`/`NaN`/non-numbers without throwing; checking `<= 0` first would let `undefined <= 0` (which is `false`) fall through to the division, reproducing the original bug.
- **Missing/invalid data returns `0`, not `100`.** This is a deliberate departure from returning `100` (which would conflate "can't tell" with "definitely maxed") — decided during brainstorming, documented in the design spec.
- **The existing `needed <= 0` branch (the real `-1` sentinel) is untouched** — verified across all 128 ships in `example-data.json`: exactly `-1` for every already-maxed ship, a real positive number for every incomplete one, 0 exceptions.
- **No signature change.** `getShipSchematicsProgress` still takes `(ship: Ship, items: OwnedItem[])` and returns `number` in `[0, 100]`. Its only call site, `ShipsTable.tsx`, needs no change.
- **No automated test framework** (project-wide, repeatedly-reaffirmed choice). Verification is TypeScript strict mode + ESLint + a throwaway data-driven script against real `example-data.json` (deleted before committing) + hand-constructed cases for the shape real data doesn't contain.
- **Spec:** `docs/superpowers/specs/2026-08-06-ship-schematics-progress-guard-design.md`.

---

### Task 1: Add the missing-field guard to `getShipSchematicsProgress`

**Files:**
- Modify: `client/src/ships/getters.ts:28-32`

**Interfaces:**
- Consumes: `Ship` (`types/ship.ts`), `OwnedItem` (`types/item.ts`), `getShipSchematicsOwned` (`ships/getters.ts`, pre-existing, unchanged) — all pre-existing, no changes needed to any of them.
- Produces: `getShipSchematicsProgress(ship: Ship, items: OwnedItem[]): number` — same exported name and signature as before; only its internal behavior for missing/invalid `schematic_gain_cost_next_level` changes. `ShipsTable.tsx` (the only caller) needs no change.

- [ ] **Step 1: Read the current implementation to confirm line numbers before editing**

Run: `grep -n "getShipSchematicsProgress" -A 5 client/src/ships/getters.ts`

Expected output:
```
28:export function getShipSchematicsProgress(ship: Ship, items: OwnedItem[]): number {
29-  const needed = ship.schematic_gain_cost_next_level;
30-  if (needed <= 0) return 100;
31-  return Math.min(100, (getShipSchematicsOwned(ship, items) / needed) * 100);
32-}
```

If the line numbers or content differ from this, stop and re-read the full file before proceeding — something has changed since this plan was written.

- [ ] **Step 2: Write the throwaway verification script**

`example-data.json` (gitignored, real personal game data) is at the repo root. Create `client/src/ships/__verify.ts` (deleted in Step 6, never committed):

```ts
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { getShipList, getShipSchematicsOwned, getShipSchematicsProgress } from './getters';
import { getOwnedItems } from '../crew/getters';
import type { Ship } from '../types/ship';
import type { OwnedItem } from '../types/item';

// Inlined copy of the pre-fix implementation, so real data can be regression-checked
// old-vs-new without needing to stash/unstash the actual source file mid-script.
function oldGetShipSchematicsProgress(ship: Ship, items: OwnedItem[]): number {
  const needed = ship.schematic_gain_cost_next_level;
  if (needed <= 0) return 100;
  return Math.min(100, (getShipSchematicsOwned(ship, items) / needed) * 100);
}

const raw = JSON.parse(readFileSync('example-data.json', 'utf-8')) as Record<string, unknown>;
const ships = getShipList(raw);
const items = getOwnedItems(raw);

// Every real ship must produce identical output old vs new — proves the fix is a pure
// addition for real data, not a behavior change (real data never hits the new branch).
for (const ship of ships) {
  const oldValue = oldGetShipSchematicsProgress(ship, items);
  const newValue = getShipSchematicsProgress(ship, items);
  assert.equal(newValue, oldValue, `${ship.symbol}: old=${oldValue}, new=${newValue}`);
}

// Real already-maxed ship — the legitimate -1 sentinel must still return 100.
const enterpriseD = ships.find((s) => s.symbol === 'enterprise_d_ship');
assert.ok(enterpriseD, 'U.S.S. Enterprise NCC-1701-D not found');
assert.equal(enterpriseD.schematic_gain_cost_next_level, -1, 'expected the -1 sentinel on a maxed ship');
assert.equal(getShipSchematicsProgress(enterpriseD, items), 100);

// Real incomplete ship — the normal percentage calculation must be unaffected.
const reliant = ships.find((s) => s.symbol === 'fed_reliant_ship');
assert.ok(reliant, 'U.S.S. Reliant not found');
assert.equal(reliant.schematic_gain_cost_next_level, 1800);
assert.equal(getShipSchematicsProgress(reliant, items), (1755 / 1800) * 100);

// Hand-constructed case for a shape the real sample never contains: missing field.
const malformedShip = { ...reliant, schematic_gain_cost_next_level: undefined } as unknown as Ship;
assert.equal(getShipSchematicsProgress(malformedShip, items), 0, 'missing schematic_gain_cost_next_level must return 0, not NaN or 100');

// Hand-constructed case: NaN itself (e.g. a non-numeric value that survived an unvalidated cast).
const nanShip = { ...reliant, schematic_gain_cost_next_level: NaN } as unknown as Ship;
assert.equal(getShipSchematicsProgress(nanShip, items), 0, 'NaN schematic_gain_cost_next_level must return 0');

console.log('MATCH: all ship schematics progress guard assertions passed');
```

- [ ] **Step 3: Run the verification script against the CURRENT (unfixed) code and confirm it fails**

Run from the **repo root**: `npx tsx client/src/ships/__verify.ts`

Expected: the old-vs-new comparison loop and the two real-ship assertions pass (unsurprising — before Step 4, `getShipSchematicsProgress` *is* `oldGetShipSchematicsProgress`), but the script throws an `AssertionError` on the `malformedShip` or `nanShip` assertion (the actual returned value will be `NaN`, not `0`) — this confirms the test actually exercises the bug before it's fixed. If it passes instead, stop: the test isn't testing what this plan thinks it's testing.

- [ ] **Step 4: Apply the fix**

In `client/src/ships/getters.ts`, replace:

```ts
export function getShipSchematicsProgress(ship: Ship, items: OwnedItem[]): number {
  const needed = ship.schematic_gain_cost_next_level;
  if (needed <= 0) return 100;
  return Math.min(100, (getShipSchematicsOwned(ship, items) / needed) * 100);
}
```

with:

```ts
export function getShipSchematicsProgress(ship: Ship, items: OwnedItem[]): number {
  const needed = ship.schematic_gain_cost_next_level;
  if (!Number.isFinite(needed)) return 0; // missing/malformed data — fail closed, not "maxed"
  if (needed <= 0) return 100; // legitimate already-maxed sentinel (verified: always exactly -1)
  return Math.min(100, (getShipSchematicsOwned(ship, items) / needed) * 100);
}
```

- [ ] **Step 5: Re-run the verification script and confirm it passes**

Run from the **repo root**: `npx tsx client/src/ships/__verify.ts`

Expected output: `MATCH: all ship schematics progress guard assertions passed`, exit code 0. If any assertion still throws, do not proceed — re-check the fix against Step 4 exactly.

- [ ] **Step 6: Delete the throwaway verification script**

```bash
rm client/src/ships/__verify.ts
```

- [ ] **Step 7: Build and lint check**

Run: `npm run build -w client`
Expected: exits 0.

Run: `npm run lint -w client`
Expected: exits 0, no errors.

- [ ] **Step 8: Commit**

```bash
git add client/src/ships/getters.ts
git commit -m "Fix getShipSchematicsProgress to fail closed on missing schematic_gain_cost_next_level"
```
