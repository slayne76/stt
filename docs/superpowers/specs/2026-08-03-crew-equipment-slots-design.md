# 3/4 Stars crew: Equipment slots remaining + composable sorting — Design

Date: 2026-08-03

## Purpose

Add an "Items to equip" column to the "3/4 Stars crew" page, derived from
each crew member's `equipment` array, and add it as a third sort key
applied after level: level (desc) → items-to-equip (desc) → name (asc).

This is also the point where sorting is refactored from one named function
per combination (`sortByName`, `sortByLevelThenName`) to composable
single-key comparators, since a third factor made the growing-dead-code
pattern from the previous change worth addressing head-on rather than
repeating a third time.

## Grounding in real data

Verified against the real 597-crew sample (`example-data.json`, gitignored):

- `equipment_slots.length` is `4` for all 597 crew — the "4 total slots"
  assumption is safe as a hardcoded constant, not something that needs to
  vary per crew member.
- `equipment.length` (the count of *filled* slots) ranges over
  `{0: 20, 1: 40, 2: 105, 3: 218, 4: 214}` crew respectively — real spread
  across the full 0–4 range.
- Filled slot indices are not always contiguous from 0 (e.g. one crew has
  `equipment: [[1,...],[3,...]]`, slots 0 and 2 empty) — irrelevant to the
  design, since the formula only needs the *count* of filled slots
  (`equipment.length`), not which specific indices are filled.

## Design

### Getter

`client/src/crew/getters.ts`:

- Add `equipment: [number, number][]` to `CrewMember`
  (`client/src/types/crew.ts`) — each entry is `[slotIndex, itemArchetypeId]`,
  matching the real payload shape.
- Add:
  ```ts
  export function getEquipmentSlotsRemaining(crew: CrewMember): number {
    return (crew.equipment?.length ?? 0) - 4;
  }
  ```
  Returns `-4` (0 equipped) through `0` (4/4 equipped) — the exact
  convention specified by the user. The optional-chain on `equipment` is
  defensive in the same spirit as `getCrewList`'s existing style, given
  `getCrewList`'s cast from `unknown` JSON is not field-validated.

### Sorters (refactored to composable comparators)

`client/src/crew/sorters.ts` is rewritten (replacing `sortByName` and
`sortByLevelThenName`, both now dead/about-to-be-dead code) with:

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

export function byLevelDesc(a: CrewMember, b: CrewMember): number {
  return b.level - a.level;
}

export function byEquipmentSlotsRemainingDesc(a: CrewMember, b: CrewMember): number {
  return getEquipmentSlotsRemaining(b) - getEquipmentSlotsRemaining(a);
}

export function byNameAsc(a: CrewMember, b: CrewMember): number {
  return a.name.localeCompare(b.name);
}

export function sortCrew(crew: CrewMember[], comparator: Comparator<CrewMember>): CrewMember[] {
  return [...crew].sort(comparator);
}
```

Future factors add one more `byXAsc`/`byXDesc` comparator, not a new named
combination function — pages compose exactly the chain they need via
`combineComparators(...)`.

### Page

`client/src/pages/ThreeFourStarsCrewPage.tsx`:

- Replace the `sortByLevelThenName(...)` call with
  `sortCrew(filterByRarity(...), combineComparators(byLevelDesc, byEquipmentSlotsRemainingDesc, byNameAsc))`.
- Add a `TableCell` header "Items to equip" (right-aligned, matching
  "Level"'s convention) and a per-row cell showing
  `getEquipmentSlotsRemaining(c)`.

Ordering example from the request, confirmed by this design: two level-100
crew, `a` at `-1` and `b` at `-4` items-to-equip. `byLevelDesc` ties (both
100). `byEquipmentSlotsRemainingDesc` computes `b - a` = `-4 - (-1)` = `-3`,
a negative result, so `a` (-1) sorts before `b` (-4) — matches the
requested order (closer to completion first) exactly.

## Non-goals

- No changes to the rarity filter.
- No changes to `getCrewList` or `filterByRarity`.
- No new dependencies.

## Open questions

None — fully scoped by the user's request.
