# getFilledSlotIndices / getMissingSlotIndices — Design Spec

Closes the "`getFilledSlotIndices` not extracted" deferred backlog item in
`docs/PROJECT_STATE.md`.

## Goal

`isImmortalized` checks equipment-slot fullness via a raw count
(`crew.equipment.length === 4`), while `getMissingEquipmentArchetypeIds`
checks it via a `Set` of slot indices derived from the same `equipment`
array — they currently agree only because real data never has
duplicate or out-of-range equipment slot indices. The backlog entry's
original note cited this as verified across 597 sample crew (an older
snapshot); re-verified fresh against the user's real, live-refreshed
`server/data/player-cache.json` for this spec — **604 real crew today,
zero with duplicate or out-of-range slot indices** — the assumption
still holds, but, as the backlog entry says, not structurally. A shared
primitive removes the data-dependent assumption. Per brainstorming, the
fix also extends to a third function with the identical bug pattern —
`getEquipmentSlotsRemaining` (`equipment.length - 4`) — since it's the
most heavily-used of the three (drives `CrewTable`'s "Items" column, the
crew sort order, and is itself the guard inside `isReadyToImmortalize`),
and leaving it unfixed would mean fixing 2 of 3 identical latent bugs.

## Current state (`client/src/crew/getters.ts`)

```ts
export function getEquipmentSlotsRemaining(crew: CrewMember): number {
  return (crew.equipment?.length ?? 0) - 4;
}

export function getMissingEquipmentArchetypeIds(crew: CrewMember): number[] {
  const filledSlots = new Set(crew.equipment.map(([slot]) => slot));
  const missingIndices = [0, 1, 2, 3].filter((i) => !filledSlots.has(i));
  const slots = crew.equipment_slots ?? [];
  return missingIndices.map((i) => slots[i]?.archetype ?? -1);
}

export function isImmortalized(crew: CrewMember): boolean {
  return crew.rarity === crew.max_rarity && crew.level === 100 && crew.equipment.length === 4;
}
```

`CrewMember.equipment: [number, number][]` — each tuple's first element is
the slot index (0-3); the second is unused by any current getter.
`getMissingEquipmentArchetypeIds` is only ever called (via
`areAllMissingItemsOwned`) from inside `isReadyToImmortalize`, itself
guarded by `getEquipmentSlotsRemaining(crew) < 0` — so today it's only
ever invoked when raw `equipment.length < 4`, which is exactly why the
duplicate-index disagreement this spec fixes has never actually
manifested: `isImmortalized`'s `length === 4` branch and
`getMissingEquipmentArchetypeIds`'s Set-based branch have never run on
the same anomalous crew member in practice.

## Non-goals

- No behavior change for any real crew member in the current dataset —
  proven via an exhaustive old-vs-new comparison across all 604 real
  crew (see Testing below), not just asserted. Already dry-run by the
  controller before this spec was finalized: 0 mismatches across all
  604 × 3 comparisons, 0 crew with duplicate/out-of-range slot indices.
- No change to `CrewMember.equipment`'s type or to `equipment_slots`
  handling — `getMissingEquipmentArchetypeIds`'s archetype-lookup logic
  (`slots[i]?.archetype ?? -1`) is untouched, only its slot-index
  computation is deduplicated.
- No change to `getEquipmentSlotsRemaining`'s established `-4..0` sign
  convention (previously confirmed correct, not a bug — see
  `docs/PROJECT_STATE.md`'s "Controller judgment over reviewer findings"
  precedent) — the new implementation preserves this exactly for all
  normal data.
- Does not attempt to fix or guard against `crew.equipment` genuinely
  containing more than 4 entries, or negative-remaining semantics beyond
  what already exists — out of scope, not something the backlog entry or
  brainstorming raised.

## Design

### `client/src/crew/getters.ts` — two new exported primitives

```ts
const ALL_SLOT_INDICES = [0, 1, 2, 3];

export function getFilledSlotIndices(crew: CrewMember): Set<number> {
  return new Set(crew.equipment.map(([slot]) => slot));
}

export function getMissingSlotIndices(crew: CrewMember): number[] {
  const filledSlots = getFilledSlotIndices(crew);
  return ALL_SLOT_INDICES.filter((i) => !filledSlots.has(i));
}
```

**Why `missingSlotIndices.length === 0` and not `filledSlotIndices.size
=== 4`, for the fullness check:** a naive size check isn't fully robust
against an out-of-range slot index — if `crew.equipment` ever contained
an entry with slot index `4` (or any value outside `0-3`), the `Set`
could reach size 4 while a real slot (0-3) stays empty, and a
`size === 4` check would wrongly call that crew member fully equipped.
Checking that none of the 4 *real* slot indices (`0-3`) are missing is
the actually-correct definition, and it's exactly what
`getMissingEquipmentArchetypeIds` already effectively computes today —
this spec generalizes that existing, correct logic into a shared
primitive rather than inventing a new definition.

### Three existing functions, rewired to derive from the primitive

```ts
export function getEquipmentSlotsRemaining(crew: CrewMember): number {
  return -getMissingSlotIndices(crew).length;
}

export function getMissingEquipmentArchetypeIds(crew: CrewMember): number[] {
  const missingIndices = getMissingSlotIndices(crew);
  const slots = crew.equipment_slots ?? [];
  return missingIndices.map((i) => slots[i]?.archetype ?? -1);
}

export function isImmortalized(crew: CrewMember): boolean {
  return crew.rarity === crew.max_rarity && crew.level === 100 && getMissingSlotIndices(crew).length === 0;
}
```

`isReadyToImmortalize`, `getCrewTier`, `areAllMissingItemsOwned`, and
every consumer of `getEquipmentSlotsRemaining`
(`CrewTable.tsx`, `crew/sorters.ts`'s `byEquipmentSlotsRemainingDesc`,
`CollectionCrewList.tsx`) are unchanged — they call the same functions
with the same signatures, just now backed by a structurally-consistent
implementation.

## Error handling

None new — `getFilledSlotIndices`/`getMissingSlotIndices` have the same
input assumptions (`crew.equipment` is always an array, per
`CrewMember`'s type) as the code they replace; no new failure mode.

## Testing / verification plan

No automated test framework exists in this project (deliberate, repeated
choice). Verification:

- Build (`npm run build -w client`) / lint (`npm run lint -w client`)
  clean.
- **Exhaustive (not sampled) old-vs-new comparison across all real
  crew members** (604 as of this writing) in the user's real,
  live-refreshed `server/data/player-cache.json` — NOT the stale
  `example-data.json`: for every crew member, compute `isImmortalized`,
  `getEquipmentSlotsRemaining`, and `getMissingEquipmentArchetypeIds`
  with both the old (pre-this-spec) and new implementations, and confirm
  every single value is identical across every comparison. This is the
  load-bearing claim of the "no behavior change" non-goal — it must be
  demonstrated, not assumed. Already dry-run by the controller with an
  equivalent standalone script: 0 mismatches, 0 crew with duplicate/
  out-of-range slot indices — the implementer's own run should reproduce
  this exactly (or, if the live data has changed since, should still
  find 0 mismatches even if the anomaly-count changes).
- Real-browser check: confirm at least one page from each consumer is
  visually unchanged — `CrewTable`'s "Items" column (any crew page), the
  crew sort order (any page using `byEquipmentSlotsRemainingDesc`), and
  `CollectionCrewList`'s "Items:" display (any Collections row expansion) —
  all rendering identically to before this change.
