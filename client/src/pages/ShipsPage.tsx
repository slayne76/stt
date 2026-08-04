import { Alert, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { usePlayerData } from '../hooks/usePlayerData';
import { getOwnedItems } from '../crew/getters';
import { combineComparators } from '../crew/sorters';
import { getShipList } from '../ships/getters';
import { filterIncompleteShipsByRarity } from '../ships/filters';
import { byLevelDesc, byLevelProgressDesc, byMissingSchematicsAsc, byNameAsc, sortShips } from '../ships/sorters';
import ShipsTable from '../ships/ShipsTable';

export interface ShipsPageProps {
  rarity: number;
  title: string;
}

function ShipsPage({ rarity, title }: ShipsPageProps) {
  const { data, loading, error, refresh } = usePlayerData();

  const items = data ? getOwnedItems(data) : [];
  const ships = data
    ? sortShips(
        filterIncompleteShipsByRarity(getShipList(data), rarity),
        combineComparators(byLevelDesc, byLevelProgressDesc, byMissingSchematicsAsc(items), byNameAsc)
      )
    : [];

  const loaded = !loading && !error && data;

  return (
    <Stack spacing={2}>
      <Typography variant="h4">{title}{loaded ? ` (${ships.length})` : ''}</Typography>

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

      {loaded && (
        ships.length === 0 ? (
          <Typography color="text.secondary">No incomplete ships at this rarity.</Typography>
        ) : (
          <ShipsTable ships={ships} items={items} />
        )
      )}
    </Stack>
  );
}

export default ShipsPage;
