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
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { usePlayerData } from '../hooks/usePlayerData';
import { getCrewList, getEquipmentSlotsRemaining } from '../crew/getters';
import { filterByRarity } from '../crew/filters';
import { byEquipmentSlotsRemainingDesc, byLevelDesc, byNameAsc, combineComparators, sortCrew } from '../crew/sorters';

function ThreeFourStarsCrewPage() {
  const { data, loading, error, refresh } = usePlayerData();

  const crew = data
    ? sortCrew(
        filterByRarity(getCrewList(data), { rarity: 3, maxRarity: 4 }),
        combineComparators(byLevelDesc, byEquipmentSlotsRemainingDesc, byNameAsc)
      )
    : [];

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
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell align="right">Level</TableCell>
                  <TableCell align="right">Items to equip</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {crew.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.name}</TableCell>
                    <TableCell align="right">{c.level}</TableCell>
                    <TableCell align="right">{getEquipmentSlotsRemaining(c)}</TableCell>
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
