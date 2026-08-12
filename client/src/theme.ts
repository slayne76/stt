import { createTheme } from '@mui/material/styles';

// Both constants below must stay literal `rgba(...)` strings — never MUI
// palette-shorthand paths like `'action.hover'`. `groupStripeBgcolor` (below)
// appends `!important` to whatever `STRIPE_COLOR` holds, and MUI's `sx` prop
// resolves a palette-shorthand string via an exact dotted-path lookup against
// `theme.palette`; appending anything to that string breaks the lookup, so
// `sx` can no longer resolve it to a real color and silently drops the
// declaration instead — no error, no warning, the row just stops getting a
// stripe. `ROW_EMPHASIS_COLOR` is held to the same rule for consistency and
// because it's composed as a second flat-alpha layer on top of a row whose
// own background is already one of these `!important`-bearing values; a
// resolved palette token wouldn't compose the same predictable way. This is
// the exact trap an earlier version of this feature hit, which is why that
// version reached for a `theme` callback instead — these two constants let
// every call site skip that ceremony, but only as long as they stay literal.
export const STRIPE_COLOR = 'rgba(0, 0, 0, 0.08)';
export const ROW_EMPHASIS_COLOR = 'rgba(0, 0, 0, 0.16)';

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
 * record's actual color, with no other visible symptom. See
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
