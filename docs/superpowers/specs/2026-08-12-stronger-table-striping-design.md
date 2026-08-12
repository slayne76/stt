# Stronger, Reusable Table Striping — Design Spec

Increases the app-wide table zebra-stripe contrast (currently too subtle
to read in practice) and replaces the ad-hoc `!important`/palette-shorthand
workaround in `CollectionsTable.tsx` with a small reusable helper, so a
future table with more than one row per record doesn't have to
re-derive the same CSS-specificity fix from scratch.

## Goal

The App-wide table theme feature (shipped 2026-08-12, commit `dd1fbdb`)
used MUI's `action.hover` (4% black overlay) for the base zebra stripe and
`action.selected` (8%) for `CollectionsTable`'s detail-row emphasis layer.
Both are real, working values — confirmed via computed-style measurements
at the time — but the user reported (and a fresh check confirmed) that in
practice the alternation is too subtle to notice, especially on
`CollectionsTable`, where the much stronger, constant detail-row tint
dominates visual attention and makes the fainter collection-to-collection
alternation hard to perceive by comparison.

## Current state

`client/src/theme.ts`'s `MuiTableBody` override:
```ts
root: ({ theme }) => ({
  '& .MuiTableRow-root:nth-of-type(even)': {
    backgroundColor: theme.palette.action.hover,
  },
}),
```

`client/src/collections/CollectionsTable.tsx`'s per-collection block:
```tsx
const stripeColor = index % 2 === 1 ? 'action.hover' : 'transparent';
return (
  <Fragment key={collection.id}>
    <TableRow sx={{ bgcolor: stripeColor }}>
      {/* summary cells */}
    </TableRow>
    <TableRow
      sx={{
        bgcolor: (theme) =>
          `${index % 2 === 1 ? theme.palette.action.hover : 'transparent'} !important`,
      }}
    >
      <TableCell sx={{ bgcolor: 'action.selected' }} colSpan={6}>
        {/* detail content */}
      </TableCell>
    </TableRow>
  </Fragment>
);
```

The summary row's `sx` needs no `!important` (it's always at a DOM-odd
position, so the theme's `nth-of-type(even)` rule never targets it); the
detail row's `sx` does need `!important` (always DOM-even), and needs the
theme-callback form of `sx` specifically because appending `!important` to
the `'action.hover'` shorthand string breaks `sx`'s exact-string
palette-path lookup (confirmed in the prior feature's final review, by
tracing `@mui/system`'s actual source).

**Rendered contrast, measured via computed style + pixel sampling in the
shipped code:** transparent base → `rgb(255,255,255)`; `action.hover`
base → `rgb(245,245,245)` (10 units difference); detail row over either
base + `action.selected` → `rgb(235,235,235)` or `rgb(225,225,225)`
respectively. A 10-unit (≈4%) difference out of 255 is the root cause of
the reported "looks all the same grey" observation.

## Non-goals

- No dark-mode support — this app has no theme toggle and no dark palette
  today; the new literal `rgba(0, 0, 0, X)` constants are light-theme-only
  by design, matching the app's current single-theme reality. Revisit if
  dark mode is ever added.
- No change to the blue header styling (`MuiTableHead`'s override) — only
  the body-row striping values and their implementation are in scope.
- No change to any table's column structure, data, sorting, search, or
  pagination behavior.
- Does not attempt to redefine MUI's actual `theme.palette.action.hover`/
  `action.selected` values globally (which would also affect MUI's own
  interaction-state visuals — menu hover, selected list items, etc.,
  wherever they're used elsewhere in the app) — per the user's explicit
  choice, this uses new, separately-named constants decoupled from MUI's
  semantic action-state tokens, not a palette override.

## Design

### `client/src/theme.ts` — new exported constants + helper

```ts
import { createTheme } from '@mui/material/styles';

export const STRIPE_COLOR = 'rgba(0, 0, 0, 0.08)';
export const ROW_EMPHASIS_COLOR = 'rgba(0, 0, 0, 0.16)';

/**
 * For tables that render more than one <TableRow> per logical record —
 * breaking the MuiTableBody rule below's assumption that DOM position
 * lines up 1:1 with record index. Returns the `sx` `bgcolor` value to
 * apply to EVERY row belonging to one record, keyed by that record's own
 * index (not the individual row's DOM position). `!important` is always
 * included: harmless on a row whose DOM position wouldn't have conflicted
 * with the generic rule anyway, necessary on any row that would have
 * (e.g. a table's 2nd, 4th, ... row per record, which is always
 * DOM-even regardless of its record's actual parity). See
 * `collections/CollectionsTable.tsx` for a concrete two-row-per-record
 * example.
 */
export function groupStripeBgcolor(recordIndex: number): string {
  return `${recordIndex % 2 === 1 ? STRIPE_COLOR : 'transparent'} !important`;
}

const theme = createTheme({
  components: {
    MuiTableHead: {
      styleOverrides: {
        root: ({ theme }) => ({
          backgroundColor: theme.palette.primary.main,
          '& .MuiTableCell-root': {
            color: theme.palette.primary.contrastText,
            fontWeight: 600,
          },
        }),
      },
    },
    MuiTableBody: {
      styleOverrides: {
        // Assumes one <TableRow> per record — DOM position and record position line up 1:1,
        // so striping by nth-of-type(even) is equivalent to striping by record index.
        // Tables with more than one <TableRow> per record break that assumption and must
        // opt out with `groupStripeBgcolor(recordIndex)` (above) applied to every row of
        // the record instead. See client/src/collections/CollectionsTable.tsx.
        root: () => ({
          '& .MuiTableRow-root:nth-of-type(even)': {
            backgroundColor: STRIPE_COLOR,
          },
        }),
      },
    },
  },
});

export default theme;
```

`MuiTableHead`'s override is unchanged. `STRIPE_COLOR`/`ROW_EMPHASIS_COLOR`
are plain literal `rgba()` strings, not MUI palette-shorthand paths — this
is what removes the theme-callback requirement (Non-goals doesn't need to
mention this since it's not a functional exclusion, just a simplification
that falls out naturally from switching away from `'action.hover'`-style
shorthand strings).

### `client/src/collections/CollectionsTable.tsx` — simplified, using the helper

```tsx
import { groupStripeBgcolor, ROW_EMPHASIS_COLOR } from '../theme';
// ...
{pageItems.map((collection, index) => {
  const qualifyingCrew = qualifyingCrewByCollection.get(collection.id) ?? [];
  const upgradable = upgradableIds.has(collection.id);
  const rewards = getCuratedRewards(collection);
  const progressDisplay = isMaxedOut(collection)
    ? 'MAX'
    : `${collection.progress}/${collection.milestone.goal}`;
  const stripeBgcolor = groupStripeBgcolor(index);
  return (
    <Fragment key={collection.id}>
      <TableRow sx={{ bgcolor: stripeBgcolor }}>
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
      <TableRow sx={{ bgcolor: stripeBgcolor }}>
        <TableCell sx={{ bgcolor: ROW_EMPHASIS_COLOR }} colSpan={6}>
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

Both rows now use the exact same `stripeBgcolor` value (computed once,
via the shared helper) instead of the previous asymmetric handling
(summary row had its own inline ternary with no `!important`; detail row
had a separate theme-callback expression). The detail cell's
`sx={{ bgcolor: 'action.selected' }}` becomes
`sx={{ bgcolor: ROW_EMPHASIS_COLOR }}`. The explanatory comment already
present above the detail row (added in the prior feature's final-review
fix wave) gets trimmed/updated to reflect the simplified, helper-based
code rather than removed — the underlying CSS-specificity fact it
explains is unchanged, just now lives inside `groupStripeBgcolor`'s own
doc comment instead of being re-explained inline at every call site.

## Error handling

None new — pure constant/function extraction and value changes, no new
control flow.

## Testing / verification plan

No automated test framework exists in this project. This is a purely
visual change; verification is real-browser observation, already
partially done during brainstorming (both contrast options were rendered
against real data and the user picked Option A: 8%/16%):

- Build (`npm run build -w client`) / lint (`npm run lint -w client`)
  clean.
- Real-browser check: `/collections` — confirm each collection's two rows
  share one clearly-visible base color, alternating per collection (not
  per raw row), with the detail row visibly a bit stronger than its own
  summary row. At least one simple table (e.g. `/qps`) — confirm the
  stronger app-wide stripe is clearly visible without looking heavy.
  Confirm the blue header is unaffected on both.
- Confirm no console errors.
- Since this is a refinement of already-shipped, working code, an
  exhaustive pixel-sampling check (matching the rigor of the prior
  feature) is warranted for `CollectionsTable` specifically, given that's
  exactly where the previous round's subtlety problem was reported —
  confirm rendered pixel values match the new constants' predicted alpha
  math for all 4 row types: even-index summary (`transparent` alone) →
  `rgb(255,255,255)`; odd-index summary (`STRIPE_COLOR` alone, α=0.08) →
  255 × 0.92 ≈ `rgb(235,235,235)`; even-index detail (`ROW_EMPHASIS_COLOR`
  alone over a transparent base, α=0.16) → 255 × 0.84 ≈ `rgb(214,214,214)`;
  odd-index detail (`ROW_EMPHASIS_COLOR` composited over the `STRIPE_COLOR`
  base) → 255 × 0.92 × 0.84 ≈ `rgb(197,197,197)`.
