import { createTheme } from '@mui/material/styles';

// Must stay a literal `rgba(...)` string — never an MUI palette-shorthand
// path like `'action.hover'`. `groupStripeBgcolor` (below) appends
// `!important` to whatever `STRIPE_COLOR` holds, and MUI's `sx` prop
// resolves a palette-shorthand string via an exact dotted-path lookup against
// `theme.palette`; appending anything to that string breaks the lookup, so
// `sx` can no longer resolve it to a real color and silently drops the
// declaration instead — no error, no warning, the row just stops getting a
// stripe. This is the exact trap an earlier version of this feature hit,
// which is why that version reached for a `theme` callback instead — this
// constant lets every call site skip that ceremony, but only as long as it
// stays literal.
export const STRIPE_COLOR = 'rgba(0, 0, 0, 0.08)';

// A third tier in the same flat-alpha family as `STRIPE_COLOR`, for a
// visible-but-not-heavy divider between grouped blocks of rows (e.g. one
// collection's rows vs. the next in `CollectionsTable.tsx`) — distinct from
// the much fainter default `MuiTableCell` border MUI already draws between
// every row.
export const BLOCK_BOUNDARY_COLOR = 'rgba(0, 0, 0, 0.24)';

/**
 * Forces a `TableRow`'s background to transparent regardless of its DOM
 * position, overriding the `MuiTableBody` rule below's generic
 * `nth-of-type(even)` stripe. Needed by any row in a multi-row-per-record
 * table that intentionally does not participate in row-level striping —
 * without this, the generic rule would still tint whichever row happens to
 * land on an even DOM position, independent of which record it actually
 * belongs to (see `groupStripeBgcolor`'s doc comment below for the full
 * DOM-position-vs-record-parity explanation this shares).
 */
export const FORCE_TRANSPARENT_BGCOLOR = 'transparent !important';

/**
 * For tables that render more than one <TableRow> per logical record —
 * breaking the MuiTableBody rule below's assumption that DOM position
 * lines up 1:1 with record index. Returns the `sx` `bgcolor` value to
 * apply to EVERY row belonging to one record, keyed by that record's own
 * index (not the individual row's DOM position).
 *
 * `!important` is always included, and must not be removed. Once a record
 * spans more than one row, DOM position no longer tracks record parity:
 * e.g. with 3 rows per record, record 0's 2nd row lands at DOM position 2
 * (even), but record 1's 2nd row lands at DOM position 5 (odd). Any row
 * that happens to land on an even DOM position — regardless of which
 * record it actually belongs to — gets matched by the generic
 * `nth-of-type(even)` rule below, whose selector has specificity (0,3,0)
 * (MUI's generated class selector plus the `:nth-of-type` pseudo-class,
 * nested under the root selector) and so beats a plain `sx` background
 * declaration's specificity of (0,1,0). `!important` is what makes this
 * row's own record-based color win instead; dropping it would silently let
 * some rows fall back to the generic DOM-position stripe instead of their
 * record's actual color, with no other visible symptom.
 *
 * Not currently called by any table in the app — `CollectionsTable.tsx`
 * (the motivating case this was built for) moved to fully transparent rows
 * (`FORCE_TRANSPARENT_BGCOLOR`) with striping applied per crew member
 * inside the detail cell instead (see `CollectionCrewList.tsx`) after
 * user feedback that block-level alternation competed visually with
 * per-crew-member striping. Kept as documented infrastructure for the
 * next table that genuinely needs per-record (not per-DOM-row) alternation.
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
        // opt out with `groupStripeBgcolor(recordIndex)` or `FORCE_TRANSPARENT_BGCOLOR`
        // (above) applied to every row of the record instead.
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
