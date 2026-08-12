# Per-Member Crew-Row Striping in CollectionsTable — Design Spec

Same-day follow-up to the Stronger, reusable table striping feature
(commit `a17b849` and follow-ups, through `f7fcc79`). That feature made
each collection's two-row block (summary + detail) alternate a base
color per collection, and gave the detail row a flat, stronger
`ROW_EMPHASIS_COLOR` tint. It never made individual crew members inside
one collection's detail block visually distinct from each other — the
user reported this directly, with a live screenshot, after testing the
merged feature on `main`.

**Revision note:** the first version of this spec kept the prior
feature's per-collection block alternation (transparent/`STRIPE_COLOR`
on both rows, plus the flat `ROW_EMPHASIS_COLOR` detail tint) and only
added per-member striping on top of it. After seeing a dry-run
screenshot of that combination, the user reported the grey block-level
tint on alternating summary rows was hurting the overall visual effect
and asked for a second round: drop all block-level alternation and
tinting, keep only the new per-member striping, and add a visual
separator between one collection's rows and the next (since without any
block-level shading, a block that happens to end on a transparent crew
row would otherwise butt directly against the next collection's
(now-also-plain) summary row with no boundary at all). This revision
reflects that second, user-approved round — dry-run screenshotted and
confirmed against the live dev server before this spec was finalized.

## Goal

1. Inside a collection's detail block, adjacent crew member rows (e.g.
   "Klingon Quark" and "Human Q" under the same collection) should be
   visually distinguishable from one another via alternating shading —
   the same zebra-striping concept already used everywhere else in the
   app.
2. Both of `CollectionsTable`'s own rows (summary and detail) go back to
   a plain, non-alternating, transparent background — no more
   per-collection block tint or alternation at that level.
3. Since (2) removes the only thing that previously marked where one
   collection's block ends and the next begins, each block gets a
   visible divider (a stronger border) after its detail row.

## Root cause of the originally-reported issue (confirmed live against
the running dev server, not just source reading)

`CollectionCrewList.tsx` renders each crew member as a plain `<Box>`,
never a `<TableRow>`/`<TableCell>`. It sits entirely inside
`CollectionsTable.tsx`'s single detail `<TableCell colSpan={6}>`, whose
`sx={{ bgcolor: ROW_EMPHASIS_COLOR }}` was one flat, non-parameterized
value — no per-member index ever factored into it. A live DOM read
(both via the user's own inspection and independently reproduced via
Playwright against the real dev server on port 5173) confirmed two crew
members in the same collection's block had byte-identical declared
`background-color`.

## Non-goals

- No change to any other table in the app — this is scoped to
  `CollectionsTable.tsx` and `CollectionCrewList.tsx` only.
- No dark-mode support, matching the parent feature's own non-goal (this
  app has no dark palette or theme toggle today).
- Not attempting to keep `groupStripeBgcolor` "in active use" — it was
  the previous feature's per-collection alternation helper, and this
  revision removes its only call site. It stays in `theme.ts`,
  untouched, as documented general-purpose infrastructure for a
  hypothetical future multi-row-per-record table; removing it outright
  is out of scope for this change.

## Design

### `client/src/theme.ts`

- **Remove** `ROW_EMPHASIS_COLOR` (the old detail-row flat tint) — after
  this change nothing references it.
- **Add** `BLOCK_BOUNDARY_COLOR = 'rgba(0, 0, 0, 0.24)'` — a third tier
  in the same flat-alpha family as `STRIPE_COLOR` (0.08) and the old
  `ROW_EMPHASIS_COLOR` (0.16), used only for the new collection-boundary
  divider. Visibly stronger than MUI's default `MuiTableCell` border
  (a very faint `rgba(224,224,224,1)`, 1px) so it reads as a deliberate
  group separator, not just another row divider.
- **Add** `FORCE_TRANSPARENT_BGCOLOR = 'transparent !important'` — both
  of `CollectionsTable`'s rows still need an explicit forced-transparent
  `sx` value, even though neither alternates anymore. Without it, the
  app-wide `MuiTableBody` rule's generic `nth-of-type(even)` stripe
  (specificity `(0,3,0)`, beats a plain `sx` class at `(0,1,0)`) would
  still tint whichever row happens to land on an even DOM position —
  the exact multi-row-per-record bug `groupStripeBgcolor` was originally
  built to prevent, which doesn't go away just because this table no
  longer wants alternation.
- `groupStripeBgcolor` itself is untouched — its doc comment gets a
  short update noting it currently has no live caller (see Non-goals).
- The `MuiTableBody` styleOverride's own explanatory comment drops its
  now-stale pointer to `CollectionsTable.tsx` as an example (that file
  no longer demonstrates per-record alternation) and mentions
  `FORCE_TRANSPARENT_BGCOLOR` as the other valid opt-out.

### `client/src/collections/CollectionsTable.tsx`

```tsx
import { BLOCK_BOUNDARY_COLOR, FORCE_TRANSPARENT_BGCOLOR } from '../theme';
// ...
{pageItems.map((collection, index) => {
  const qualifyingCrew = qualifyingCrewByCollection.get(collection.id) ?? [];
  const upgradable = upgradableIds.has(collection.id);
  const rewards = getCuratedRewards(collection);
  const progressDisplay = isMaxedOut(collection)
    ? 'MAX'
    : `${collection.progress}/${collection.milestone.goal}`;
  return (
    <Fragment key={collection.id}>
      <TableRow sx={{ bgcolor: FORCE_TRANSPARENT_BGCOLOR }}>
        <TableCell>{page * pageSize + index + 1}</TableCell>
        <TableCell>
          {collection.name}
          {upgradable && <Chip label="Upgradable" size="small" color="info" sx={{ ml: 1 }} />}
        </TableCell>
        <TableCell>{rewards.join(', ')}</TableCell>
        <TableCell align="right">{progressDisplay}</TableCell>
        <TableCell align="right">{collection.claimable_milestone_index}</TableCell>
        <TableCell align="right">{qualifyingCrew.length}</TableCell>
      </TableRow>
      <TableRow sx={{ bgcolor: FORCE_TRANSPARENT_BGCOLOR }}>
        <TableCell colSpan={6} sx={{ borderBottom: `2px solid ${BLOCK_BOUNDARY_COLOR}` }}>
          {qualifyingCrew.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 1 }}>
              No crew match.
            </Typography>
          ) : (
            <CollectionCrewList crew={qualifyingCrew} items={items} />
          )}
        </TableCell>
      </TableRow>
    </Fragment>
  );
})}
```

The `index`-derived `stripeBgcolor` local variable goes away entirely —
`index` itself is still used (row numbering, React key context via
`collection.id`), just no longer for a stripe color. The divider border
is placed on the detail row's cell (not the following summary row's) so
it renders exactly once per collection regardless of crew count,
including the zero-crew "No crew match" case.

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
  counter to reset; the restart-per-collection behavior falls out
  naturally from the component's existing structure, confirmed live
  (the same crew member, "Klingon Quark," appears first — index 0,
  transparent — in two different collections' blocks in the real data).
- **`px: 2, mx: -2` makes the stripe full-bleed.** The parent
  `TableCell` has 16px (`theme.spacing(2)`) padding on all sides
  (confirmed via computed style against the live page); without
  canceling it, each crew row's stripe would only cover its own
  content width, reading as a partial highlight rather than a proper
  row bar. The negative margin cancels the inherited padding, and the
  matching positive `px` restores it *inside* each row so text doesn't
  shift.
- **`STRIPE_COLOR` (not a new constant) composites directly against the
  now-plain-white detail cell** — no block-level base underneath it
  anymore. Normal CSS alpha compositing, no `!important` needed here
  (no competing theme-level `nth-of-type` rule targets a plain `Box`).

## Error handling

None new — pure presentational change, no new control flow. The
`qualifyingCrew.length === 0` empty-state path (`"No crew match."`) is
unaffected since it never reaches `CollectionCrewList`, and still gets
the collection-boundary border on its own cell.

## Testing / verification plan

No automated test framework exists in this project (established,
repeated choice). Verification is real-browser observation against the
real dev server, seeded from `example-data.json`:

- Build (`npm run build -w client`) / lint (`npm run lint -w client`)
  clean — **already dry-run validated directly against this exact code
  twice during brainstorming (once for the per-member striping alone,
  once for this revision), both clean.**
- Real-browser check: `/collections` — confirm both summary and detail
  rows are plain/uniform across every collection (no leftover
  alternation), crew rows within a block alternate shade, and a visible
  divider line appears after every collection's detail row, immediately
  before the next collection's summary row.
- Independently re-derive the exact composited colors via computed
  style reads for at least the first 4 collections' rows (not just
  eyeballing a screenshot) — **already done during brainstorming's
  dry-run**: all 4 sampled summary/detail `TableRow`s read
  `rgba(0, 0, 0, 0)` regardless of DOM-even/odd position (confirms
  `FORCE_TRANSPARENT_BGCOLOR` is correctly defeating the generic
  app-wide stripe rule), and the divider borders measured exactly
  `rgba(0, 0, 0, 0.24)` / `2px` as specified.
- Confirm no console errors.
