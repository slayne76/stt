# Collections page: crew subrow grid layout + bold field labels — Design

**Date:** 2026-08-17
**Status:** Approved

## Problem

The Collections page's per-collection crew subrow (`CollectionCrewList.tsx`,
shipped in the immediately-preceding feature) displays `Level:`, `Items:`,
`Total Collections:`, and `Other Collections:` as a flex row with no
column alignment — the user found the result confusing: values for the
same field land at different horizontal positions on different rows, and
nothing visually distinguishes a field's label from its value.

## Investigation

Prototyped directly against the running app (`main` checkout, dev server
on port 5173) and iterated with the user via real screenshots before
writing this spec, per the user's explicit request to preview the layout
before finalizing development. Two rounds:

- **Round 1** used narrower fixed column widths (90px for `Level:`,
  160px for `Total Collections:`). Screenshot showed inconsistent
  wrapping — `Level: 100` (3-digit level) wrapped onto two lines while
  `Level: 70` (2-digit) didn't, and `Total Collections:` wrapped on
  every row since its own label text didn't fit its column.
- **Round 2** widened the `Level:`/`Total Collections:` columns (120px /
  200px) and added `whiteSpace: 'nowrap'` to every field except `Other
  Collections:` (the one genuinely variable-length field, left free to
  wrap within its own column). Screenshot confirmed clean single-line
  rendering for every field across a full page of real data, including
  long crew names (wrap only within the Name column, without disturbing
  any other column's position) and the zero-other-collections case
  (`Maquis Eddington`, `Total Collections: 1`, `Other Collections:` with
  nothing after it — reads fine now that it's a clearly bold-labeled
  field in its own column, not a dangling flex item). **User approved
  Round 2's screenshots as final.**

## Design

Replace the row's `display: 'flex'` with `display: 'grid'` and a fixed
(not `fr`/`auto`-based) `gridTemplateColumns`. Because every crew row
renders its own independent grid (not one shared grid container spanning
all rows), using the *same fixed pixel widths* on every row is what
produces vertical alignment across rows — no structural change to
`CollectionsTable.tsx`'s two-`TableRow`-per-collection layout is needed.

```ts
// Fixed pixel widths (not fr/auto) so every row's independent grid resolves
// to the same column positions, producing table-like vertical alignment
// without a shared grid container or visible header row.
const GRID_TEMPLATE_COLUMNS = '110px 220px 140px 120px 100px 200px 1fr';
```

Column order (unchanged from the shipped feature): Star, Name, status
chip, Level, Items, Total Collections, Other Collections. The chip
(previously an inline element that only sometimes rendered) becomes its
own grid cell — an empty `<Box>` when neither `isReady` nor
`isNeedsWork` — so its presence/absence never shifts later columns.

A small `Field` helper renders each bold-label/value pair, replacing the
four near-identical `<Typography color="text.secondary">Label:
{value}</Typography>` blocks with one shared component:

```tsx
function Field({ label, value, wrap = false }: { label: string; value: React.ReactNode; wrap?: boolean }) {
  return (
    <Typography color="text.secondary" sx={wrap ? undefined : { whiteSpace: 'nowrap' }}>
      <Box component="span" sx={{ fontWeight: 'bold' }}>
        {label}
      </Box>{' '}
      {value}
    </Typography>
  );
}
```

Per the user's explicit choice, **all four labels are bold** (`Level:`,
`Items:`, `Total Collections:`, `Other Collections:`), values stay
normal weight. `Field`'s `wrap` prop defaults to `false` (adds
`whiteSpace: 'nowrap'`, keeping the label+value pair on one line, sized
to fit its fixed column per the widths above) and is only set `true` for
`Other Collections:`, the sole field whose value length is unbounded —
it wraps within its own `1fr` column instead of forcing the row wider or
squeezing its neighbors (same reasoning, restated as a column-width
problem instead of a flex-shrink problem, as the flexShrink/nowrap fix
from the immediately-preceding feature).

Full replacement of `client/src/collections/CollectionCrewList.tsx`:

```tsx
import { Box, Typography } from '@mui/material';
import type { CrewMember } from '../types/crew';
import type { Collection } from '../types/collection';
import type { OwnedItem } from '../types/item';
import { getCrewTier, getEquipmentSlotsRemaining } from '../crew/getters';
import { getCrewCollections } from './getters';
import StarRating from '../crew/StarRating';
import StatusChip from '../components/StatusChip';
import { STRIPE_COLOR } from '../theme';

export interface CollectionCrewListProps {
  crew: CrewMember[];
  items: OwnedItem[];
  allCollections: Collection[];
  currentCollectionId: number;
}

// Fixed pixel widths (not fr/auto) so every row's independent grid resolves
// to the same column positions, producing table-like vertical alignment
// without a shared grid container or visible header row.
const GRID_TEMPLATE_COLUMNS = '110px 220px 140px 120px 100px 200px 1fr';

function Field({ label, value, wrap = false }: { label: string; value: React.ReactNode; wrap?: boolean }) {
  return (
    <Typography color="text.secondary" sx={wrap ? undefined : { whiteSpace: 'nowrap' }}>
      <Box component="span" sx={{ fontWeight: 'bold' }}>
        {label}
      </Box>{' '}
      {value}
    </Typography>
  );
}

function CollectionCrewList({ crew, items, allCollections, currentCollectionId }: CollectionCrewListProps) {
  return (
    <Box sx={{ py: 1 }}>
      {crew.map((c, i) => {
        const tier = getCrewTier(c, items);
        const isReady = tier === 'ready';
        const isNeedsWork = tier === 'needsWork';
        const crewCollections = getCrewCollections(c, allCollections);
        const otherCollections = crewCollections.filter((col) => col.id !== currentCollectionId);
        return (
          <Box
            key={c.id}
            sx={{
              display: 'grid',
              gridTemplateColumns: GRID_TEMPLATE_COLUMNS,
              alignItems: 'center',
              columnGap: 1,
              py: 0.5,
              // Cancels parent TableCell's 16px padding so each stripe reaches the cell edges
              px: 2,
              mx: -2,
              bgcolor: i % 2 === 1 ? STRIPE_COLOR : 'transparent',
            }}
          >
            <StarRating rarity={c.rarity} maxRarity={c.max_rarity} />
            <Typography sx={{ fontWeight: isReady ? 'bold' : 'normal' }}>{c.name}</Typography>
            <Box>
              {isReady && <StatusChip label="Ready" color="success" />}
              {isNeedsWork && <StatusChip label={`${c.max_rarity}/${c.max_rarity} Stars`} color="warning" />}
            </Box>
            <Field label="Level:" value={c.level} />
            <Field label="Items:" value={getEquipmentSlotsRemaining(c)} />
            <Field label="Total Collections:" value={crewCollections.length} />
            <Field
              label="Other Collections:"
              value={otherCollections.map((col) => col.name).join(', ')}
              wrap
            />
          </Box>
        );
      })}
    </Box>
  );
}

export default CollectionCrewList;
```

This is a pure rewrite of one file's rendering — no prop signature
change (`CollectionCrewListProps` is untouched), no change to
`CollectionsTable.tsx` or `CollectionsPage.tsx`, no change to any data
logic (`getCrewCollections`, `getCrewTier`, `getEquipmentSlotsRemaining`
calls are unchanged, just re-laid-out).

## Non-goals

- No column headers — explicitly requested by the user ("just to have
  spaces and to line them up, no column headers").
- No change to `CollectionsTable.tsx`'s existing two-`TableRow`s-per-
  collection structure, striping mechanism (`STRIPE_COLOR`,
  `FORCE_TRANSPARENT_BGCOLOR`), or the `allCollections`/
  `currentCollectionId` props threaded in by the immediately-preceding
  feature.
- No change to any other `CrewTable`/table component on the app — this
  is scoped entirely to the Collections page's crew subrow.
- No configurable/responsive column widths — fixed pixel values tuned
  against real data at the Collections page's typical viewport; not
  addressing narrow-viewport/mobile behavior (out of scope, matches the
  rest of this desktop-oriented app).

## Verification plan

- Already substantially verified during brainstorming: real screenshots
  against the live app confirmed column alignment across rows, bold
  labels, single-line rendering for Level/Items/Total Collections
  (including 3-digit levels and negative Items values), correct wrapping
  for long names and long Other Collections lists, and the
  zero-other-collections case — all against real `player-cache.json`
  data, approved by the user.
- Implementation task re-confirms with its own real-browser check
  (typecheck clean, screenshot matching the approved design) since the
  prototype code was reverted from `main` and needs to be reapplied
  cleanly through the standard branch/review pipeline.
