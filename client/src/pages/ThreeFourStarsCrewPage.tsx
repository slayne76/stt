import {
  Alert,
  Button,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from '@mui/material';
import { usePlayerData } from '../hooks/usePlayerData';
import { getCrewList } from '../crew/getters';
import { filterByRarity } from '../crew/filters';
import { sortByName } from '../crew/sorters';

function ThreeFourStarsCrewPage() {
  const { data, loading, error, refresh } = usePlayerData();

  const crew = data ? sortByName(filterByRarity(getCrewList(data), { rarity: 3, maxRarity: 4 })) : [];

  return (
    <Stack spacing={2}>
      <Typography variant="h4">3/4 Stars crew</Typography>

      {loading && <CircularProgress />}
      {error && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void refresh()}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {!loading && !error && data && (
        crew.length === 0 ? (
          <Typography color="text.secondary">No crew at 3/4 stars.</Typography>
        ) : (
          <TableContainer component={Paper}>
            <Table>
              <TableBody>
                {crew.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.name}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )
      )}
    </Stack>
  );
}

export default ThreeFourStarsCrewPage;
