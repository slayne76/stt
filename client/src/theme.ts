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
