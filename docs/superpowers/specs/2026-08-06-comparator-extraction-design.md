# `combineComparators`/`Comparator<T>` Extraction — Design

## What this is

A pure move: `Comparator<T>` and `combineComparators` currently live in
`client/src/crew/sorters.ts`, a crew-domain module, even though both are
fully generic and domain-neutral — neither references `CrewMember` or
anything crew-specific. This was flagged as a deferred-issues backlog
item repeatedly, each time a new module ended up depending on a
crew-housed utility for something that has nothing to do with crew:
first `collections/sorters.ts` and `collections/CollectionsTable.tsx`,
then `ships/sorters.ts` (a third consumer, which is what tipped this from
"worth noting" to "worth doing" per the backlog's own escalation). This
also pre-empts a real future risk: `crew/sorters.ts` already imports
`collections/getters.ts` (for `getCollectionCount`), so if it ever needed
anything from `collections/sorters.ts`, that would be a genuine circular
import — moving the neutral utility out from under `crew/sorters.ts`
removes the one thing that made `crew/sorters.ts` look like a plausible
home for shared code in the first place.

## The move

New file `client/src/lib/comparator.ts` — moved verbatim out of
`crew/sorters.ts:7-17`, byte-identical logic:

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

**`lib/`, not `types/`, despite the backlog's original suggested name
(`types/comparator.ts`) — a deliberate correction, not a typo.** Every
existing file in `client/src/types/` (`player.ts`, `crew.ts`, `item.ts`,
`collection.ts`, `storedImmortal.ts`, `ship.ts`, `asset.ts`) is a pure
interface, no executable code. `client/src/lib/` already exists for
exactly this shape of thing — domain-agnostic utility logic that isn't a
type — with one precedent, `lib/extractPlayerIdentity.ts`. Putting a
function there would break an established, unbroken convention for no
reason; `lib/comparator.ts` fits the precedent instead.

**`crew/sorters.ts` loses the type + function, gains one import:**
`import type { Comparator } from '../lib/comparator';` — still needed,
since `byCollectionCountDesc`, `byTierAsc`, and `sortCrew` all reference
`Comparator<...>` in their own signatures. **It does not re-export
`combineComparators`** — every consumer redirects its own import to
`lib/comparator` directly, so nothing keeps treating `crew/sorters.ts` as
a source of shared utility code going forward.

**Every current consumer's import updated** — crew-specific sorters (if
any) stay imported from `crew/sorters`; `combineComparators`/`Comparator`
move to `lib/comparator`:

| File | Change |
|---|---|
| `pages/ThreeFourStarsCrewPage.tsx` | drop `combineComparators` from the `crew/sorters` import, add it from `lib/comparator` |
| `pages/FourFiveStarsCrewPage.tsx` | same |
| `pages/FourFourStarsCrewReadyPage.tsx` | same |
| `pages/FourFourStarsCrewPage.tsx` | same |
| `pages/FrozenDuplicatesPage.tsx` | same |
| `pages/ShipsPage.tsx` | its only import from `crew/sorters` today is `combineComparators` alone — that import line moves to `lib/comparator` entirely |
| `ships/sorters.ts` | `import type { Comparator } from '../crew/sorters'` → `from '../lib/comparator'` |
| `collections/sorters.ts` | `import { combineComparators, type Comparator } from '../crew/sorters'` → `from '../lib/comparator'` |
| `collections/CollectionsTable.tsx` | drop `combineComparators` from its `crew/sorters` import block (which also imports several crew-specific sorters it keeps), add it from `lib/comparator` |

## Scope

1 new file (`client/src/lib/comparator.ts`) + 9 modified files (all
import-line changes only, listed above). **Zero behavior change** — no
function's logic changes, no signature changes, no call-site changes
beyond the import path. Nothing outside `client/` is touched.

## Verification

This project has no automated test framework (deliberate, project-wide
choice), but this particular change is unusually strongly provable by
`tsc` alone: every one of the 9 import updates is either correct (compiles)
or a compile error (wrong path, wrong export name) — there is no
third, silently-wrong outcome a type-checker wouldn't catch, since no
runtime logic changes at all. TypeScript strict mode + ESLint across the
whole client workspace is the verification; no browser check is needed
here, unlike every other feature in this project, because there is
nothing behavioral left to observe once the build is green.
