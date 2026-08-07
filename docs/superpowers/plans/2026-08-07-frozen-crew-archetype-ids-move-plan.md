# Move `getFrozenCrewArchetypeIds` to `crew/getters.ts` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `getFrozenCrewArchetypeIds` out of `client/src/collections/getters.ts` into `client/src/crew/getters.ts`, and update both consumers' imports. Zero behavior change — a pure move.

**Architecture:** One function relocated, four import-line edits. No logic changes anywhere.

**Tech Stack:** Same as the existing client workspace — TypeScript (strict), no new dependencies.

## Global Constraints

- **`client/src/crew/getters.ts` gains `getFrozenCrewArchetypeIds`**, moved verbatim from `collections/getters.ts`, plus `import type { StoredImmortal } from '../types/storedImmortal';`.
- **`client/src/collections/getters.ts` loses the function and its now-unused `StoredImmortal` import.** No re-export is added — `getCollectionCrew` (which stays in this file) already takes `frozenArchetypeIds: Set<number>` as a plain parameter, so nothing left in this file needs the getter.
- **Both consumers fold the import into their existing `crew/getters.ts` import line**, dropping it from their `collections/getters.ts` import line (which keeps `getCollectionsList`): `client/src/pages/CollectionsPage.tsx`, `client/src/pages/FrozenDuplicatesPage.tsx`.
- **Zero behavior change.** No signature, logic, or call-site changes anywhere except import paths.
- **Does not threaten the documented acyclicity constraint** (`crew/getters.ts` must stay import-free of `collections/`) — `getFrozenCrewArchetypeIds` needs nothing from `collections/`, only `PlayerData` and the `StoredImmortal` type, same shape as every other function already in `crew/getters.ts`.
- **No automated test framework** (project-wide, deliberate choice). This is unusually strongly provable by `tsc` alone — every import path is either correct (compiles) or a compile error, with no third silently-wrong outcome, since no runtime logic changes. TypeScript strict mode + ESLint across the client workspace is the verification; no browser check is needed.
- **Spec:** `docs/superpowers/specs/2026-08-07-frozen-crew-archetype-ids-move-design.md`.

---

### Task 1: Move `getFrozenCrewArchetypeIds` and repoint both consumers

**Files:**
- Modify: `client/src/crew/getters.ts`
- Modify: `client/src/collections/getters.ts`
- Modify: `client/src/pages/CollectionsPage.tsx`
- Modify: `client/src/pages/FrozenDuplicatesPage.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `getFrozenCrewArchetypeIds(data: PlayerData): Set<number>` — same name and signature as before, now exported from `client/src/crew/getters.ts` instead of `client/src/collections/getters.ts`.

- [ ] **Step 1: Confirm the current state of all four files matches this plan's assumptions**

Run: `cat -n client/src/collections/getters.ts`

Confirm it matches exactly:
```ts
import type { PlayerData } from '../types/player';
import type { Collection } from '../types/collection';
import type { CrewMember } from '../types/crew';
import type { OwnedItem } from '../types/item';
import type { StoredImmortal } from '../types/storedImmortal';
import { getCrewTier } from '../crew/getters';

export function getCollectionsList(data: PlayerData): Collection[] {
  const player = data.player as Record<string, unknown> | undefined;
  const character = player?.character as Record<string, unknown> | undefined;
  const collections = character?.cryo_collections;
  return Array.isArray(collections) ? (collections as Collection[]) : [];
}

export function crewBelongsToCollection(crew: CrewMember, collection: Collection): boolean {
  const crewTraits = new Set([...(crew.traits ?? []), ...(crew.traits_hidden ?? [])]);
  const collectionTraits = collection.traits ?? [];
  const extraCrew = collection.extra_crew ?? [];
  return collectionTraits.some((trait) => crewTraits.has(trait)) || extraCrew.includes(crew.archetype_id);
}

export function getCrewCollections(crew: CrewMember, collections: Collection[]): Collection[] {
  return collections.filter((collection) => crewBelongsToCollection(crew, collection));
}

export function getCollectionCount(crew: CrewMember, collections: Collection[]): number {
  return getCrewCollections(crew, collections).length;
}

export function getFrozenCrewArchetypeIds(data: PlayerData): Set<number> {
  const player = data.player as Record<string, unknown> | undefined;
  const character = player?.character as Record<string, unknown> | undefined;
  const storedImmortals = character?.stored_immortals;
  const list = Array.isArray(storedImmortals) ? (storedImmortals as StoredImmortal[]) : [];
  return new Set(list.map((s) => s.id));
}

export function getCollectionCrew(
  collection: Collection,
  crewList: CrewMember[],
  items: OwnedItem[],
  frozenArchetypeIds: Set<number>
): CrewMember[] {
  return crewList.filter(
    (crew) =>
      crewBelongsToCollection(crew, collection) &&
      getCrewTier(crew, items) !== null &&
      !frozenArchetypeIds.has(crew.archetype_id)
  );
}
```

Run: `cat -n client/src/crew/getters.ts`

Confirm it ends with `getCrewTier` (line 50-55) and does NOT already contain `getFrozenCrewArchetypeIds` or import `StoredImmortal`.

Run: `grep -n "getFrozenCrewArchetypeIds\|from '../collections/getters'\|from '../crew/getters'" client/src/pages/CollectionsPage.tsx client/src/pages/FrozenDuplicatesPage.tsx`

Confirm output is:
```
client/src/pages/CollectionsPage.tsx:3:import { getCrewList, getOwnedItems } from '../crew/getters';
client/src/pages/CollectionsPage.tsx:4:import { getCollectionsList, getFrozenCrewArchetypeIds } from '../collections/getters';
client/src/pages/FrozenDuplicatesPage.tsx:3:import { getCrewList } from '../crew/getters';
client/src/pages/FrozenDuplicatesPage.tsx:7:import { getCollectionsList, getFrozenCrewArchetypeIds } from '../collections/getters';
```

If any of this differs, stop and re-check the spec before proceeding.

- [ ] **Step 2: Add `getFrozenCrewArchetypeIds` to `client/src/crew/getters.ts`**

Replace:
```ts
import type { PlayerData } from '../types/player';
import type { CrewMember } from '../types/crew';
import type { OwnedItem } from '../types/item';
```
with:
```ts
import type { PlayerData } from '../types/player';
import type { CrewMember } from '../types/crew';
import type { OwnedItem } from '../types/item';
import type { StoredImmortal } from '../types/storedImmortal';
```

Then append this function at the end of the file (after `getCrewTier`):
```ts

export function getFrozenCrewArchetypeIds(data: PlayerData): Set<number> {
  const player = data.player as Record<string, unknown> | undefined;
  const character = player?.character as Record<string, unknown> | undefined;
  const storedImmortals = character?.stored_immortals;
  const list = Array.isArray(storedImmortals) ? (storedImmortals as StoredImmortal[]) : [];
  return new Set(list.map((s) => s.id));
}
```

- [ ] **Step 3: Remove `getFrozenCrewArchetypeIds` from `client/src/collections/getters.ts`**

Replace:
```ts
import type { PlayerData } from '../types/player';
import type { Collection } from '../types/collection';
import type { CrewMember } from '../types/crew';
import type { OwnedItem } from '../types/item';
import type { StoredImmortal } from '../types/storedImmortal';
import { getCrewTier } from '../crew/getters';
```
with:
```ts
import type { PlayerData } from '../types/player';
import type { Collection } from '../types/collection';
import type { CrewMember } from '../types/crew';
import type { OwnedItem } from '../types/item';
import { getCrewTier } from '../crew/getters';
```

Then remove the function itself — replace:
```ts
export function getFrozenCrewArchetypeIds(data: PlayerData): Set<number> {
  const player = data.player as Record<string, unknown> | undefined;
  const character = player?.character as Record<string, unknown> | undefined;
  const storedImmortals = character?.stored_immortals;
  const list = Array.isArray(storedImmortals) ? (storedImmortals as StoredImmortal[]) : [];
  return new Set(list.map((s) => s.id));
}

export function getCollectionCrew(
```
with:
```ts
export function getCollectionCrew(
```

- [ ] **Step 4: Repoint `client/src/pages/CollectionsPage.tsx`**

Replace:
```ts
import { getCrewList, getOwnedItems } from '../crew/getters';
import { getCollectionsList, getFrozenCrewArchetypeIds } from '../collections/getters';
```
with:
```ts
import { getCrewList, getFrozenCrewArchetypeIds, getOwnedItems } from '../crew/getters';
import { getCollectionsList } from '../collections/getters';
```

- [ ] **Step 5: Repoint `client/src/pages/FrozenDuplicatesPage.tsx`**

Replace:
```ts
import { getCrewList } from '../crew/getters';
```
with:
```ts
import { getCrewList, getFrozenCrewArchetypeIds } from '../crew/getters';
```

Then replace:
```ts
import { getCollectionsList, getFrozenCrewArchetypeIds } from '../collections/getters';
```
with:
```ts
import { getCollectionsList } from '../collections/getters';
```

- [ ] **Step 6: Build and lint check**

Run: `npm run build -w client`
Expected: exits 0. This is the load-bearing check — a wrong import path or a missed consumer fails here, not silently.

Run: `npm run lint -w client`
Expected: exits 0, no new errors (the pre-existing `react-refresh/only-export-components` warning in `PlayerDataContext.tsx` is unrelated and expected to still appear).

- [ ] **Step 7: Confirm `getFrozenCrewArchetypeIds` is no longer exported from `collections/getters.ts`**

Run: `grep -rn "getFrozenCrewArchetypeIds" client/src --include="*.ts" --include="*.tsx"`

Expected: every match is either the definition in `crew/getters.ts`, or an import/usage from `crew/getters.ts` in `CollectionsPage.tsx`/`FrozenDuplicatesPage.tsx`. No match should reference `collections/getters.ts`.

- [ ] **Step 8: Commit**

```bash
git add client/src/crew/getters.ts client/src/collections/getters.ts client/src/pages/CollectionsPage.tsx client/src/pages/FrozenDuplicatesPage.tsx
git commit -m "Move getFrozenCrewArchetypeIds from collections/getters.ts to crew/getters.ts"
```
