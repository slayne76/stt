# QPs Page "Ready" Chip + Shared StatusChip — Design

## What this is

Two small, paired changes to the QPs page (`docs/superpowers/specs/2026-08-07-qps-page-design.md`):

1. On `QPsTable`, a crew row whose "Rounds left" is `-1` (i.e. one
   successful Q Bit mission away from its next level) gets its name
   bolded, with a "Ready" chip to the right of the name — visually
   matching the existing "Ready" treatment on the Collections page's
   per-collection crew list (`CollectionCrewList.tsx`).
2. That chip rendering gets extracted into a new, generic, reusable
   `StatusChip` component, since Collections already has two chip
   variants (`Ready` / needs-work) doing near-identical rendering
   inline, and more such chips are expected on future pages.

## The "Ready" condition

A row counts as ready when `getQPRoundsLeft(c) <= 1`. This is exactly
the existing "on hold" boundary already used to sort rows to the bottom
of the QPs page (`getQPPointsNeeded(c) <= 25`) — `getQPRoundsLeft` is
`Math.ceil(pointsNeeded / 25)`, and for any page-eligible row
`pointsNeeded` is always `> 0` (a crew member reaching an exact
threshold is by definition already at the *next* QP level, per
`getQPLevel`'s `<` comparison — see the QPs page design doc), so
`roundsLeft` is never `0` here. No new getter is introduced: the
existing `getQPRoundsLeft` (from `crew/getters.ts`) is reused directly
in `QPsTable.tsx`.

## New component: `client/src/components/StatusChip.tsx`

First file in a new `client/src/components/` folder — this project
didn't previously have a home for small, reusable, presentational UI
pieces shared across domains/pages (`layout/` is page-shell/nav
scaffolding, `lib/` is domain-neutral pure logic). `components/` is
that home going forward.

Deliberately generic — takes a label and an MUI `Chip` `color`, nothing
domain-specific (no "ready"/"needs work" enum baked in), so it can be
reused for whatever chip variants come next without changing its
contract:

```tsx
import { Chip } from '@mui/material';
import type { ChipProps } from '@mui/material';

export interface StatusChipProps {
  label: string;
  color: ChipProps['color'];
}

function StatusChip({ label, color }: StatusChipProps) {
  return <Chip label={label} size="small" color={color} />;
}

export default StatusChip;
```

## Changes to `CollectionCrewList.tsx`

Both existing inline `Chip` usages are replaced with `StatusChip`,
proving the new component covers both variants already in the
codebase, not just the one being copied to QPs. Pure extraction — no
visual or behavioral change:

- `isReady` row: `<StatusChip label="Ready" color="success" />`
- `isNeedsWork` row: `<StatusChip label={\`${c.max_rarity}/${c.max_rarity} Stars\`} color="warning" />`

The unused `Chip` import is removed from this file once both usages are
gone.

## Changes to `QPsTable.tsx`

Per row, compute `const isReady = getQPRoundsLeft(c) <= 1;`. The `Name`
cell changes from a bare text node to a flex row (matching
`CollectionCrewList`'s existing pattern), bold when ready, with the
chip to the right when ready:

```tsx
<TableCell>
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
    <Typography sx={{ fontWeight: isReady ? 'bold' : 'normal' }}>{c.name}</Typography>
    {isReady && <StatusChip label="Ready" color="success" />}
  </Box>
</TableCell>
```

New imports needed in `QPsTable.tsx`: `Box`, `Typography` (from
`@mui/material`) and the new `StatusChip`. All other columns (`#`,
`Image`, `Stars`, `QL`, `QPs`, `Points left`, `Rounds left`) are
unchanged.

## Scope

New: `client/src/components/StatusChip.tsx`.
Modified: `client/src/crew/QPsTable.tsx` (Name cell rendering),
`client/src/collections/CollectionCrewList.tsx` (both chips replaced
with `StatusChip`, unused `Chip` import removed). No changes to
getters/filters/sorters, no changes to routing/nav, no server changes.

## Verification

This project has no automated test framework (deliberate, project-wide
choice). This is a small, low-risk UI change with no new derived-value
logic (the "ready" condition reuses an already-verified getter
unmodified), so verification is:

- `tsc`/`eslint` clean on both workspaces.
- Interactive browser check via the `playwright` MCP tooling against a
  real running dev server with live data: navigate to `/qps`, confirm
  at least one row with `Rounds left: -1` renders bold name + green
  "Ready" chip, confirm rows with `Rounds left` more negative than
  `-1` do NOT render the chip/bold.
- Navigate to `/collections`, expand a collection, confirm both the
  "Ready" and needs-work chips still render identically to before the
  refactor (visual regression check on the extraction).
