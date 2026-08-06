# Ship Schematics Progress — Missing-Field Guard — Design

## What this is

A one-function defensive fix in `getShipSchematicsProgress`
(`client/src/ships/getters.ts`), closing a deferred-issues backlog entry
flagged at the Crew nav group / schematics bar feature's final review:
the function's existing guard checks `needed <= 0` to detect the
legitimate "already maxed" sentinel, but if `schematic_gain_cost_next_level`
were ever missing (`undefined`) rather than the real `-1` sentinel,
`undefined <= 0` is `false`, so the function falls through to
`owned / undefined`, producing `NaN`. MUI's `LinearProgress` would then
render an invalid `transform: translateX(NaN%)`, which the browser
silently drops — the bar would look stuck at whatever it last rendered
(effectively 100%, since that's `LinearProgress`'s un-transformed default),
misrepresenting a ship with broken data as fully progressed.

Never observed in the real 128-ship sample (`schematic_gain_cost_next_level`
is present and correct — `-1` for every maxed ship, a real positive number
for every incomplete one, 0 exceptions either way, per the Ships pages
feature's verification). This fix is purely defensive, for the case where
a future API response is missing the field.

## The fix

```ts
export function getShipSchematicsProgress(ship: Ship, items: OwnedItem[]): number {
  const needed = ship.schematic_gain_cost_next_level;
  if (!Number.isFinite(needed)) return 0; // missing/malformed data — fail closed, not "maxed"
  if (needed <= 0) return 100; // legitimate already-maxed sentinel (verified: always exactly -1)
  return Math.min(100, (getShipSchematicsOwned(ship, items) / needed) * 100);
}
```

`Number.isFinite` is the standard JS way to reject `undefined`, `null`,
`NaN`, and any other non-finite-number value the unvalidated `PlayerData`
cast could produce, without touching or reinterpreting the existing,
already-verified `needed <= 0` branch. Order matters: the finiteness check
must run first, since `Number.isFinite` on a non-number safely returns
`false` without throwing, whereas checking `<= 0` first on `undefined`
would (as today) silently pass through.

## The 0%-not-100% decision

The existing `needed <= 0` branch returns `100` for the real "-1 means
maxed" sentinel — that's correct, verified, unchanged behavior. For the
new *missing/invalid* case specifically, this fix returns `0`, not `100`,
by explicit choice: a ship whose data can't be evaluated should read as
"no progress info," a visibly incomplete-looking bar, rather than silently
looking finished. This is a **deliberate departure** from the
deferred-issues backlog's original one-line suggestion (`if (!(needed > 0))
return 100;`, which would have folded missing data into the same "maxed"
branch) — reconsidered during brainstorming as more consistent with this
project's general fail-closed instinct (e.g. the equipment-slot guards in
`crew/getters.ts` return a sentinel that fails the "ready" check rather
than silently passing it).

## Scope

One file, one function: `client/src/ships/getters.ts`,
`getShipSchematicsProgress`. No signature change (still `(ship, items) =>
number`, still returns a value in `[0, 100]`), so no caller
(`ShipsTable.tsx`, the only call site) needs any change. No type changes,
no new dependencies.

## Verification

Matches this project's usual pattern for a guard against a data shape
never observed in the real sample (e.g. the equipment-slots guard's
hand-constructed 4-missing-slot test case): a throwaway
`ships/__verify.ts` script, run via `npx tsx`, deleted before commit,
that:

1. Runs every one of the real 128 sample ships through both the old and
   new logic and asserts identical output for all of them — proving the
   fix is a pure addition for real data, not a behavior change.
2. Hand-constructs a `Ship` with `schematic_gain_cost_next_level` cast to
   `undefined` (simulating the malformed-payload case that can't occur in
   the current sample) and asserts the new branch returns exactly `0`,
   not `NaN` and not `100`.
3. Confirms the real `-1`-sentinel ships (already-maxed, real data) still
   return exactly `100` — the pre-existing branch is unaffected.

Plus `tsc`/`eslint`, same as every feature.
