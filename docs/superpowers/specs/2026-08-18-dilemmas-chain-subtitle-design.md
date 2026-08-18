# Dilemmas table: "(part x/y)" chain subtitle — Design

**Date:** 2026-08-18
**Status:** Approved

## Problem

Every dilemma chain added so far shared an obvious naming pattern (`"A
Higher Duty, Part 1"`, `"...Part 2"`, `"...Part 3"`) that visually implied
the relationship even without any explicit UI signal. The next chain
breaks that assumption: `"The Beginning of the End of the World"` (part
1/2) leads to `"The Voice of the Prophets"` (part 2/2) — two dilemmas
already correctly linked and grouped by the existing `chainName`/
`partNumber` fields, but with no visible cue in the table that they're
related at all.

## Design

Add a subtitle line under the dilemma's `name` in the table's Name column:
`(part {partNumber}/{chainSize})`, where `chainSize` is how many dilemmas
share that dilemma's `chainName`. Shown only when `chainSize > 1` — a
standalone dilemma (chain of one) shows nothing extra, exactly as today.

### `client/src/dilemmas/getters.ts`

New exported helper, pure and derived entirely from existing fields (no
schema change):

```ts
export function getChainSizeByName(dilemmas: Dilemma[]): Map<string, number> {
  const sizes = new Map<string, number>();
  for (const d of dilemmas) {
    sizes.set(d.chainName, (sizes.get(d.chainName) ?? 0) + 1);
  }
  return sizes;
}
```

### `client/src/dilemmas/DilemmasTable.tsx`

`DilemmasTableProps` gains `chainSizeByName: Map<string, number>`. In the
Name cell, alongside the existing `{dilemma.name}`, add a conditional
second line:

```tsx
const chainSize = chainSizeByName.get(dilemma.chainName) ?? 1;
// ...
<TableCell sx={{ whiteSpace: 'nowrap' }}>
  {dilemma.name}
  {chainSize > 1 && (
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
      (part {dilemma.partNumber}/{chainSize})
    </Typography>
  )}
</TableCell>
```

### `client/src/pages/DilemmasPage.tsx`

Compute `getChainSizeByName(dilemmas)` alongside the existing
`sortedDilemmas`/`buildCatalogEntryMap` calls and pass it down as the new
prop.

### New seed data

Two dilemmas appended to `server/src/data/dilemmas.json`, `chainName`
identical on both despite the unrelated display names:

```json
{
  "id": "the-beginning-of-the-end-of-the-world",
  "name": "The Beginning of the End of the World",
  "chainName": "The Beginning of the End of the World",
  "partNumber": 1,
  "choices": [
    { "letter": "A", "description": "Debate the vedek.", "leadsToDilemmaId": "the-voice-of-the-prophets" },
    { "letter": "B", "description": "Reassure the crowd that they are safe." },
    { "letter": "C", "description": "Allow the vedek to share his beliefs." }
  ]
},
{
  "id": "the-voice-of-the-prophets",
  "name": "The Voice of the Prophets",
  "chainName": "The Beginning of the End of the World",
  "partNumber": 2,
  "choices": [
    { "letter": "A", "description": "Ask the vedek to hand over the Orb." },
    { "letter": "B", "description": "Stun him before he can open the Orb." },
    { "letter": "C", "description": "Convince the vedek that he does not need the Orb's visions.", "rewards": [{ "crewArchetypeId": 6960, "dropRatePercent": 100, "showName": true }] }
  ]
}
```

`crewArchetypeId: 6960` = "The Clown", resolved by exact-name match
against the crew catalog.

## Non-goals

- No change to the choice-icon rule, reward/drop-rate rendering, or
  chain-boundary divider — those already work correctly off `chainName`/
  `partNumber` regardless of the display-name pattern.
- No change to sort order — `chainName` (not `name`) already drives
  grouping/sorting, so this chain sorts correctly under "T" without any
  changes.
- The subtitle is presentational only; it doesn't change `id`/`chainName`/
  `partNumber` semantics.

## Verification plan

- `tsc --noEmit` clean on `client`.
- Real-browser check against `/dilemmas`: confirm "The Beginning of the
  End of the World" shows `(part 1/2)` under its name, "The Voice of the
  Prophets" shows `(part 2/2)`, and every existing single-chain-member
  dilemma (e.g. "Lost Among the Stars") shows no subtitle at all. Confirm
  the two new rows sort together (chainName "The Beginning of the End of
  the World" alphabetically among the others) with the chain-boundary
  divider after the second row. Confirm reward/icon rendering for the new
  entries (C → check + The Clown 100%; A/B → x on both dilemmas; A on the
  first → check, since it leads to the second).
