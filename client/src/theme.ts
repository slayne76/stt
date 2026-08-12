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
