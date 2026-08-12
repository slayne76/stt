import { createTheme } from '@mui/material/styles';

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
        // Tables with more than one <TableRow> per record break that assumption (DOM position
        // no longer matches record index) and must opt out with their own per-row `sx` +
        // `!important` override instead. See client/src/collections/CollectionsTable.tsx,
        // which does exactly this for its two-row-per-collection layout. If you're adding
        // another multi-row-per-record table, check that file first.
        root: ({ theme }) => ({
          '& .MuiTableRow-root:nth-of-type(even)': {
            backgroundColor: theme.palette.action.hover,
          },
        }),
      },
    },
  },
});

export default theme;
