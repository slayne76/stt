# Per-Member Crew-Row Striping in CollectionsTable — Design Spec

Same-day follow-up to the Stronger, reusable table striping feature
(commit `a17b849` and follow-ups, through `f7fcc79`). That feature made
each collection's two-row block (summary + detail) alternate a base
color per collection, and gave the detail row a flat, stronger
`ROW_EMPHASIS_COLOR` tint. It never made individual crew members inside
one collection's detail block visually distinct from each other — the
user reported this directly, with a live screenshot, after testing the
merged feature on `main`.

## Goal

Inside a collection's detail block, adjacent crew member rows (e.g.
"Klingon Quark" and "Human Q" under the same collection) should be
visually distinguishable from one another via alternating shading — the
same zebra-striping concept already used everywhere else in the app —
not just share one flat block-level tint.

## Root cause (confirmed live against the running dev server, not just
source reading)

`CollectionCrewList.tsx` renders each crew member as a plain `<Box>`,
never a `<TableRow>`/`<TableCell>`. It sits entirely inside
`CollectionsTable.tsx`'s single detail `<TableCell colSpan={6}>`, whose
`sx={{ bgcolor: ROW_EMPHASIS_COLOR }}` is one flat, non-parameterized
value — no per-member index ever factors into it. A live DOM read (both
via the user's own inspection and independently reproduced via
Playwright against the real dev server on port 5173) confirmed two crew
members in the same collection's block have byte-identical declared
`background-color`. The collection-to-collection block alternation
itself (transparent vs `STRIPE_COLOR` base, composited under the flat
`ROW_EMPHASIS_COLOR` overlay) is confirmed working exactly as the prior
feature specified — that part was not broken, just insufficient for what
the user is now asking for at the individual-member level.

## Non-goals

- No change to `CollectionsTable.tsx`'s own per-collection block
  alternation (`groupStripeBgcolor`, `ROW_EMPHASIS_COLOR` on the detail
  cell) — both stay exactly as shipped, kept per the user's explicit
  choice as the base underneath the new per-member striping.
- No change to any other table in the app — this is scoped to
  `CollectionCrewList.tsx` only.
- No new color constants — reuses the existing `STRIPE_COLOR` export
  from `theme.ts`, keeping this visually consistent with the rest of the
  app's striping and avoiding a second, redundant "what shade" decision.
- No dark-mode support, matching the parent feature's own non-goal (this
  app has no dark palette or theme toggle today).

## Design

### `client/src/collections/CollectionCrewList.tsx`

```tsx
import { Box, Typography } from '@mui/material';
import type { CrewMember } from '../types/crew';
import type { OwnedItem } from '../types/item';
import { getCrewTier, getEquipmentSlotsRemaining } from '../crew/getters';
import StarRating from '../crew/StarRating';
import StatusChip from '../components/StatusChip';
import { STRIPE_COLOR } from '../theme';

export interface CollectionCrewListProps {
  crew: CrewMember[];
  items: OwnedItem[];
}

function CollectionCrewList({ crew, items }: CollectionCrewListProps) {
  return (
    <Box sx={{ py: 1 }}>
      {crew.map((c, i) => {
        const tier = getCrewTier(c, items);
        const isReady = tier === 'ready';
        const isNeedsWork = tier === 'needsWork';
        return (
          <Box
            key={c.id}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              py: 0.5,
              px: 2,
              mx: -2,
              bgcolor: i % 2 === 1 ? STRIPE_COLOR : 'transparent',
            }}
          >
            <StarRating rarity={c.rarity} maxRarity={c.max_rarity} />
            <Typography sx={{ fontWeight: isReady ? 'bold' : 'normal' }}>{c.name}</Typography>
            {isReady && <StatusChip label="Ready" color="success" />}
            {isNeedsWork && <StatusChip label={`${c.max_rarity}/${c.max_rarity} Stars`} color="warning" />}
            <Typography color="text.secondary" sx={{ ml: 'auto' }}>
              Lv {c.level}
            </Typography>
            <Typography color="text.secondary" sx={{ minWidth: 80, textAlign: 'right' }}>
              Items: {getEquipmentSlotsRemaining(c)}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

export default CollectionCrewList;
```

Key points:

- **Index comes from `crew.map`'s own position, restarting at 0 for
  every call** — `CollectionCrewList` is instantiated fresh per
  collection (`CollectionsTable.tsx` renders one per collection, passing
  that collection's own `qualifyingCrew` array), so there is no shared
  counter to reset; the restart-per-collection behavior the user asked
  for falls out naturally from the component's existing structure,
  confirmed live (the same crew member, "Klingon Quark," appears first
  — index 0, transparent — in two different collections' blocks in the
  real data).
- **`px: 2, mx: -2` makes the stripe full-bleed.** The parent
  `TableCell` has 16px (`theme.spacing(2)`) padding on all sides
  (confirmed via computed style against the live page); without
  canceling it, each crew row's stripe would only cover its own
  content width, reading as a partial highlight rather than a proper
  row bar. The negative margin cancels the inherited padding, and the
  matching positive `px` restores it *inside* each row so text doesn't
  shift.
- **`STRIPE_COLOR` (not a new constant) composites on top of the
  existing `ROW_EMPHASIS_COLOR` block base**, since the row-level
  `bgcolor` and the parent cell's `bgcolor` are on different nested
  boxes — normal CSS alpha compositing, no `!important` needed here
  (no competing theme-level `nth-of-type` rule targets a plain `Box`).

No changes to `CollectionsTable.tsx` or `theme.ts`.

## Error handling

None new — pure presentational change, no new control flow. The
`qualifyingCrew.length === 0` empty-state path (`"No crew match."`) is
unaffected since it never reaches `CollectionCrewList`.

## Testing / verification plan

No automated test framework exists in this project (established,
repeated choice). Verification is real-browser observation against the
real dev server, seeded from `example-data.json`:

- Build (`npm run build -w client`) / lint (`npm run lint -w client`)
  clean — **already dry-run validated directly against this exact code
  during brainstorming, both clean.**
- Real-browser check: `/collections` — confirm within at least 2
  different collections' blocks (one with 2 crew, one with 6+) that
  adjacent crew rows alternate shade, the first row of every collection
  is always the lighter shade (restart-per-collection), and the overall
  block still reads as a distinct area from the summary row above it
  (kept `ROW_EMPHASIS_COLOR` base still visible).
- Independently re-derive the exact composited colors via computed
  style reads (not just eyeballing a screenshot) for at least one
  multi-crew collection, cross-checked against the predicted alpha math
  — **already done during brainstorming's dry-run**: `i=0` rows read
  `rgba(0, 0, 0, 0)` (transparent, block base shows through), `i=1,3,5`
  read `rgba(0, 0, 0, 0.08)` (`STRIPE_COLOR`) declared on the row itself,
  correctly compositing over the block's base.
- Confirm the collection-to-collection block alternation from the prior
  feature is visually unchanged (no regression) — same page, different
  collections' blocks still alternate their own base shade against each
  other.
- Confirm no console errors.
