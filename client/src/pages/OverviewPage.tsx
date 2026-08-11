import {
  Alert,
  CircularProgress,
  Divider,
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
import { useCrewCatalog } from '../hooks/useCrewCatalog';
import { extractPlayerIdentity } from '../lib/extractPlayerIdentity';
import { getCrewList, getFrozenCrewArchetypeIds, getOwnedArchetypeIds } from '../crew/getters';
import { getArchetypeMaxRarityMap, getCatalogCount, getMissingCrew } from '../catalog/getters';
import { byDataScoreDesc } from '../catalog/sorters';
import { getCollectionsList } from '../collections/getters';
import { useSearch } from '../lib/useSearch';
import MissingCrewTable from '../catalog/MissingCrewTable';
import TableSearchBar from '../components/TableSearchBar';
import type { PlayerIdentity } from '../types/player';
import type { CatalogEntry } from '../types/catalogEntry';

const getCatalogEntryName = (c: CatalogEntry) => [c.name];

const FIELD_LABELS: Record<keyof PlayerIdentity, string> = {
  playerId: 'Player ID',
  dbid: 'DBID',
};

function OverviewPage() {
  const { data, loading, error } = usePlayerData();
  const { data: catalog, loading: catalogLoading, error: catalogError } = useCrewCatalog();
  const identity = data ? extractPlayerIdentity(data) : null;

  const crewList = data ? getCrewList(data) : [];
  const frozenArchetypeIds = data ? getFrozenCrewArchetypeIds(data) : new Set<number>();
  const catalogMaxRarityById = catalog ? getArchetypeMaxRarityMap(catalog) : new Map<number, number>();
  const collectionsList = data ? getCollectionsList(data) : [];

  function uniqueCrewCell(maxRarity: number): string {
    if (!catalog) return '—';
    const owned = getOwnedArchetypeIds(crewList, frozenArchetypeIds, catalogMaxRarityById, maxRarity).size;
    const total = getCatalogCount(catalog, maxRarity);
    const pct = total > 0 ? Math.ceil((owned / total) * 10000 - 1e-9) / 100 : 0;
    return `${owned}/${total} (${pct.toFixed(2)}%)`;
  }

  const owned4 = getOwnedArchetypeIds(crewList, frozenArchetypeIds, catalogMaxRarityById, 4);
  const missingInPortal = catalog ? [...getMissingCrew(catalog, owned4, 4, true)].sort(byDataScoreDesc) : [];
  const missingNotInPortal = catalog ? [...getMissingCrew(catalog, owned4, 4, false)].sort(byDataScoreDesc) : [];
  const inPortalSearch = useSearch(missingInPortal, getCatalogEntryName);
  const notInPortalSearch = useSearch(missingNotInPortal, getCatalogEntryName);

  const showMissingTables = Boolean(
    !loading && !error && identity && !catalogLoading && !catalogError && catalog
  );

  return (
    <Stack spacing={2}>
      <Typography variant="h4">Overview</Typography>

      {loading && <CircularProgress />}
      {error && <Alert severity="error">{error}</Alert>}

      {!loading && !error && identity && (
        <TableContainer component={Paper}>
          <Table>
            <TableBody>
              {(Object.keys(FIELD_LABELS) as (keyof PlayerIdentity)[]).map((field) => (
                <TableRow key={field}>
                  <TableCell component="th" scope="row">
                    {FIELD_LABELS[field]}
                  </TableCell>
                  <TableCell align="right">{identity[field] ?? '—'}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell component="th" scope="row">
                  5 Stars unique crew
                </TableCell>
                <TableCell align="right">
                  {catalogLoading ? (
                    <CircularProgress size={16} />
                  ) : catalogError ? (
                    'Unavailable'
                  ) : (
                    uniqueCrewCell(5)
                  )}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell component="th" scope="row">
                  4 Stars unique crew
                </TableCell>
                <TableCell align="right">
                  {catalogLoading ? (
                    <CircularProgress size={16} />
                  ) : catalogError ? (
                    'Unavailable'
                  ) : (
                    uniqueCrewCell(4)
                  )}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {showMissingTables && (
        <>
          <Divider sx={{ my: 2 }} />
          <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
            <Typography variant="h5">
              Missing 4 Stars (In Portal) ({inPortalSearch.filteredItems.length} of {missingInPortal.length})
            </Typography>
            <TableSearchBar
              value={inPortalSearch.query}
              onChange={inPortalSearch.setQuery}
              ariaLabel="Search Missing 4 Stars (In Portal) by name"
            />
          </Stack>
          {inPortalSearch.active && inPortalSearch.filteredItems.length === 0 ? (
            <Typography color="text.secondary">No results found for your search.</Typography>
          ) : (
            <MissingCrewTable crew={inPortalSearch.filteredItems} collections={collectionsList} />
          )}
          <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
            <Typography variant="h5">
              Missing 4 Stars (Not in Portal) ({notInPortalSearch.filteredItems.length} of {missingNotInPortal.length})
            </Typography>
            <TableSearchBar
              value={notInPortalSearch.query}
              onChange={notInPortalSearch.setQuery}
              ariaLabel="Search Missing 4 Stars (Not in Portal) by name"
            />
          </Stack>
          {notInPortalSearch.active && notInPortalSearch.filteredItems.length === 0 ? (
            <Typography color="text.secondary">No results found for your search.</Typography>
          ) : (
            <MissingCrewTable crew={notInPortalSearch.filteredItems} collections={collectionsList} />
          )}
        </>
      )}
    </Stack>
  );
}

export default OverviewPage;
