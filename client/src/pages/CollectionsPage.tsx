import { Alert, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { usePlayerData } from '../hooks/usePlayerData';
import { getCrewList, getFrozenCrewArchetypeIds, getOwnedItems } from '../crew/getters';
import { getCollectionsList } from '../collections/getters';
import { byUpgradableThenCompletionThenNameAsc } from '../collections/sorters';
import CollectionsTable from '../collections/CollectionsTable';

function CollectionsPage() {
  const { data, loading, error, refresh } = usePlayerData();

  const rawCollections = data ? getCollectionsList(data) : [];
  const crew = data ? getCrewList(data) : [];
  const items = data ? getOwnedItems(data) : [];
  const frozenArchetypeIds = data ? getFrozenCrewArchetypeIds(data) : new Set<number>();
  const collections = data
    ? [...rawCollections].sort(byUpgradableThenCompletionThenNameAsc(rawCollections, crew, items, frozenArchetypeIds))
    : [];

  const loaded = !loading && !error && data;

  return (
    <Stack spacing={2}>
      <Typography variant="h4">Collections{loaded ? ` (${collections.length})` : ''}</Typography>

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
        collections.length === 0 ? (
          <Typography color="text.secondary">No collections found.</Typography>
        ) : (
          <CollectionsTable
            collections={collections}
            crew={crew}
            items={items}
            frozenArchetypeIds={frozenArchetypeIds}
          />
        )
      )}
    </Stack>
  );
}

export default CollectionsPage;
