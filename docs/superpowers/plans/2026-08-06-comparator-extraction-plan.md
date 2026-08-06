# `combineComparators`/`Comparator<T>` Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `Comparator<T>` and `combineComparators` out of the crew-domain `client/src/crew/sorters.ts` into a new domain-neutral `client/src/lib/comparator.ts`, and repoint every consumer's import. Zero behavior change — a pure move.

**Architecture:** One new file, nine import-line edits across the client workspace. No logic changes anywhere.

**Tech Stack:** Same as the existing client workspace — TypeScript (strict), no new dependencies.

## Global Constraints

- **New file `client/src/lib/comparator.ts`**, moved verbatim from `crew/sorters.ts:7-17`:
  ```ts
  export type Comparator<T> = (a: T, b: T) => number;

  export function combineComparators<T>(...comparators: Comparator<T>[]): Comparator<T> {
    return (a, b) => {
      for (const compare of comparators) {
        const result = compare(a, b);
        if (result !== 0) return result;
      }
      return 0;
    };
  }
  ```
  `lib/`, not `types/` — every file in `client/src/types/` is a pure interface; `lib/` is the established home for domain-agnostic utility logic (`lib/extractPlayerIdentity.ts` is the existing precedent).
- **`crew/sorters.ts` loses the type + function, gains one type-only import** (`byCollectionCountDesc`, `byTierAsc`, and `sortCrew` still reference `Comparator<...>` in their own signatures). It does not re-export `combineComparators`.
- **Every current consumer's import is updated** to pull `combineComparators`/`Comparator` from `lib/comparator` instead of `crew/sorters` — full list and exact before/after text in Task 1 below.
- **Zero behavior change.** No function signature, logic, or call site changes anywhere except the import path itself.
- **No automated test framework** (project-wide, deliberate choice). This change is unusually strongly provable by `tsc` alone — every import path is either correct (compiles) or a compile error, with no third silently-wrong outcome, since no runtime logic changes. TypeScript strict mode + ESLint across the whole client workspace is the verification; no browser check is needed.
- **Spec:** `docs/superpowers/specs/2026-08-06-comparator-extraction-design.md`.

---

### Task 1: Move `Comparator`/`combineComparators` to `lib/comparator.ts` and repoint every consumer

**Files:**
- Create: `client/src/lib/comparator.ts`
- Modify: `client/src/crew/sorters.ts`
- Modify: `client/src/pages/ThreeFourStarsCrewPage.tsx`
- Modify: `client/src/pages/FourFiveStarsCrewPage.tsx`
- Modify: `client/src/pages/FourFourStarsCrewReadyPage.tsx`
- Modify: `client/src/pages/FourFourStarsCrewPage.tsx`
- Modify: `client/src/pages/FrozenDuplicatesPage.tsx`
- Modify: `client/src/pages/ShipsPage.tsx`
- Modify: `client/src/ships/sorters.ts`
- Modify: `client/src/collections/sorters.ts`
- Modify: `client/src/collections/CollectionsTable.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `Comparator<T>` (type) and `combineComparators<T>(...comparators: Comparator<T>[]): Comparator<T>` — same names, same signatures, same behavior as before, now exported from `client/src/lib/comparator.ts` instead of `client/src/crew/sorters.ts`.

- [ ] **Step 1: Confirm the current state of `crew/sorters.ts` matches this plan's assumptions**

Run: `sed -n '1,17p' client/src/crew/sorters.ts`

Expected output:
```
import type { CrewMember } from '../types/crew';
import type { Collection } from '../types/collection';
import type { OwnedItem } from '../types/item';
import { getEquipmentSlotsRemaining, getCrewTier, type CrewTier } from './getters';
import { getCollectionCount } from '../collections/getters';

export type Comparator<T> = (a: T, b: T) => number;

export function combineComparators<T>(...comparators: Comparator<T>[]): Comparator<T> {
  return (a, b) => {
    for (const compare of comparators) {
      const result = compare(a, b);
      if (result !== 0) return result;
    }
    return 0;
  };
}
```

If this differs, stop and re-check the spec before proceeding — something has changed since this plan was written.

- [ ] **Step 2: Create `client/src/lib/comparator.ts`**

```ts
export type Comparator<T> = (a: T, b: T) => number;

export function combineComparators<T>(...comparators: Comparator<T>[]): Comparator<T> {
  return (a, b) => {
    for (const compare of comparators) {
      const result = compare(a, b);
      if (result !== 0) return result;
    }
    return 0;
  };
}
```

- [ ] **Step 3: Remove the moved code from `crew/sorters.ts` and add the new import**

Replace:
```ts
import type { CrewMember } from '../types/crew';
import type { Collection } from '../types/collection';
import type { OwnedItem } from '../types/item';
import { getEquipmentSlotsRemaining, getCrewTier, type CrewTier } from './getters';
import { getCollectionCount } from '../collections/getters';

export type Comparator<T> = (a: T, b: T) => number;

export function combineComparators<T>(...comparators: Comparator<T>[]): Comparator<T> {
  return (a, b) => {
    for (const compare of comparators) {
      const result = compare(a, b);
      if (result !== 0) return result;
    }
    return 0;
  };
}
```
with:
```ts
import type { CrewMember } from '../types/crew';
import type { Collection } from '../types/collection';
import type { OwnedItem } from '../types/item';
import type { Comparator } from '../lib/comparator';
import { getEquipmentSlotsRemaining, getCrewTier, type CrewTier } from './getters';
import { getCollectionCount } from '../collections/getters';
```

The rest of the file (`byLevelDesc` through `sortCrew`) is unchanged.

- [ ] **Step 4: Repoint the five crew page files**

All five currently have the identical line:
```ts
import { byCollectionCountDesc, byEquipmentSlotsRemainingDesc, byLevelDesc, byNameAsc, combineComparators, sortCrew } from '../crew/sorters';
```
Replace it, in each of these five files, with these two lines in place of the one:
```ts
import { byCollectionCountDesc, byEquipmentSlotsRemainingDesc, byLevelDesc, byNameAsc, sortCrew } from '../crew/sorters';
import { combineComparators } from '../lib/comparator';
```
Apply this in:
- `client/src/pages/ThreeFourStarsCrewPage.tsx`
- `client/src/pages/FourFiveStarsCrewPage.tsx`
- `client/src/pages/FourFourStarsCrewReadyPage.tsx`
- `client/src/pages/FourFourStarsCrewPage.tsx`
- `client/src/pages/FrozenDuplicatesPage.tsx`

No other line in any of these five files changes.

- [ ] **Step 5: Repoint `client/src/pages/ShipsPage.tsx`**

Replace:
```ts
import { combineComparators } from '../crew/sorters';
```
with:
```ts
import { combineComparators } from '../lib/comparator';
```

- [ ] **Step 6: Repoint `client/src/ships/sorters.ts`**

Replace:
```ts
import type { Comparator } from '../crew/sorters';
```
with:
```ts
import type { Comparator } from '../lib/comparator';
```

- [ ] **Step 7: Repoint `client/src/collections/sorters.ts`**

Replace:
```ts
import { combineComparators, type Comparator } from '../crew/sorters';
```
with:
```ts
import { combineComparators, type Comparator } from '../lib/comparator';
```

- [ ] **Step 8: Repoint `client/src/collections/CollectionsTable.tsx`**

Find this exact import block:
```ts
import {
  byEquipmentSlotsRemainingDesc,
  byLevelDesc,
  byMaxRarityDesc,
  byNameAsc,
  byTierAsc,
  combineComparators,
  sortCrew,
} from '../crew/sorters';
```
Replace it with:
```ts
import {
  byEquipmentSlotsRemainingDesc,
  byLevelDesc,
  byMaxRarityDesc,
  byNameAsc,
  byTierAsc,
  sortCrew,
} from '../crew/sorters';
import { combineComparators } from '../lib/comparator';
```

- [ ] **Step 9: Build and lint check**

Run: `npm run build -w client`
Expected: exits 0. This is the load-bearing check for this task — a wrong import path or a missed consumer fails here, not silently.

Run: `npm run lint -w client`
Expected: exits 0, no new errors (the pre-existing `react-refresh/only-export-components` warning in `PlayerDataContext.tsx` is unrelated and expected to still appear).

- [ ] **Step 10: Confirm no consumer still imports `combineComparators`/`Comparator` from `crew/sorters`**

Run: `grep -rn "combineComparators\|type Comparator" client/src --include="*.ts" --include="*.tsx" | grep "crew/sorters"`

Expected: no output (empty). If anything prints, a consumer was missed — find it and repeat Steps 4–8's pattern for that file before proceeding.

- [ ] **Step 11: Commit**

```bash
git add client/src/lib/comparator.ts client/src/crew/sorters.ts client/src/pages/ThreeFourStarsCrewPage.tsx client/src/pages/FourFiveStarsCrewPage.tsx client/src/pages/FourFourStarsCrewReadyPage.tsx client/src/pages/FourFourStarsCrewPage.tsx client/src/pages/FrozenDuplicatesPage.tsx client/src/pages/ShipsPage.tsx client/src/ships/sorters.ts client/src/collections/sorters.ts client/src/collections/CollectionsTable.tsx
git commit -m "Extract combineComparators/Comparator<T> to lib/comparator.ts"
```
