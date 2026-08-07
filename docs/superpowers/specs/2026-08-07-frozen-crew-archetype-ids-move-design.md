# Move `getFrozenCrewArchetypeIds` to `crew/getters.ts` — Design

## What this is

A pure move: `getFrozenCrewArchetypeIds` currently lives in
`client/src/collections/getters.ts`, but it reads `PlayerData` directly
and returns `Set<number>` — it has nothing to do with collections at
all. It's structurally identical in shape to `getCrewList`/
`getOwnedItems`, both of which already live in `client/src/crew/getters.ts`.
This was flagged as a deferred-issues backlog item at the Frozen
duplicates pages feature's final review, at the time hypothetical
("still doesn't threaten the acyclicity constraint... but not urgent").
The friction it anticipated has since actually materialized:
`FrozenDuplicatesPage.tsx` is a page with nothing to do with collections
that nonetheless has to import from `collections/getters.ts` purely for
this one function.

## The move

**`client/src/crew/getters.ts`** gains the function, moved verbatim from
`collections/getters.ts:29-35`, plus the one type import it needs:

```ts
import type { StoredImmortal } from '../types/storedImmortal';

// ...

export function getFrozenCrewArchetypeIds(data: PlayerData): Set<number> {
  const player = data.player as Record<string, unknown> | undefined;
  const character = player?.character as Record<string, unknown> | undefined;
  const storedImmortals = character?.stored_immortals;
  const list = Array.isArray(storedImmortals) ? (storedImmortals as StoredImmortal[]) : [];
  return new Set(list.map((s) => s.id));
}
```

**`client/src/collections/getters.ts`** loses the function and its
now-unused `import type { StoredImmortal }`. **No re-export is added** —
`getCollectionCrew` (which stays in this file) already takes
`frozenArchetypeIds: Set<number>` as a plain parameter rather than
calling `getFrozenCrewArchetypeIds` itself (an existing, deliberate
module-boundary choice — see "Frozen crew and duplicate exclusion" in
`docs/PROJECT_STATE.md`), so nothing left in `collections/getters.ts`
needs this function at all once it moves.

**Both current consumers fold the import into their existing
`crew/getters.ts` import line**, rather than adding a new one:

| File | Before | After |
|---|---|---|
| `pages/CollectionsPage.tsx` | `import { getCrewList, getOwnedItems } from '../crew/getters';`<br>`import { getCollectionsList, getFrozenCrewArchetypeIds } from '../collections/getters';` | `import { getCrewList, getFrozenCrewArchetypeIds, getOwnedItems } from '../crew/getters';`<br>`import { getCollectionsList } from '../collections/getters';` |
| `pages/FrozenDuplicatesPage.tsx` | `import { getCrewList } from '../crew/getters';`<br>`import { getCollectionsList, getFrozenCrewArchetypeIds } from '../collections/getters';` | `import { getCrewList, getFrozenCrewArchetypeIds } from '../crew/getters';`<br>`import { getCollectionsList } from '../collections/getters';` |

## Why this doesn't threaten the acyclicity constraint

`crew/getters.ts` must stay import-free of `collections/` — a
load-bearing constraint documented in "The collections membership logic"
in `docs/PROJECT_STATE.md`, since `collections/getters.ts` already
imports `crew/getters.ts` (for `getCrewTier`), and the reverse edge would
be a genuine cycle. This move doesn't touch that edge at all:
`getFrozenCrewArchetypeIds` needs nothing from `collections/` — just
`PlayerData` and the `StoredImmortal` type — so adding it to
`crew/getters.ts` is exactly the same shape as every function already
there.

## Scope

4 files: `client/src/crew/getters.ts`, `client/src/collections/getters.ts`,
`client/src/pages/CollectionsPage.tsx`, `client/src/pages/FrozenDuplicatesPage.tsx`.
Zero behavior change — no signature changes, no logic changes, no call-site
changes beyond the import paths.

## Verification

Same story as the `combineComparators`/`Comparator<T>` extraction: this
project has no automated test framework, but a pure move where every
import is either correct (compiles) or a compile error is unusually
strongly provable by `tsc` alone. TypeScript strict mode + ESLint across
the client workspace is the verification; no browser check is needed.
