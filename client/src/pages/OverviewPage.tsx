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
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { usePlayerData } from '../hooks/usePlayerData';
import { useCrewCatalog } from '../hooks/useCrewCatalog';
import { useCitationPriorities } from '../hooks/useCitationPriorities';
import { extractPlayerIdentity } from '../lib/extractPlayerIdentity';
import { getBaseSkillBonuses, getProficiencyBonuses } from '../lib/skillBuffs';
import { getCrewList, getFrozenCrewArchetypeIds, getOwnedArchetypeIds } from '../crew/getters';
import { filterGauntletPriority, filterMissingFavorite } from '../crew/filters';
import { byGauntletRankAsc, defaultCrewComparator, sortCrew } from '../crew/sorters';
import { applyPriorityCutoff } from '../crew/priorityCutoff';
import { getArchetypeMaxRarityMap, getCatalogCount, getGauntletRankMap, getMissingCrew } from '../catalog/getters';
import { byDataScoreDesc } from '../catalog/sorters';
import { getCollectionsList } from '../collections/getters';
import { useSearch } from '../lib/useSearch';
import CrewTable from '../crew/CrewTable';
import MissingCrewTable from '../catalog/MissingCrewTable';
import TableSearchBar from '../components/TableSearchBar';
import type { PlayerIdentity } from '../types/player';
import type { CatalogEntry } from '../types/catalogEntry';
import type { CrewMember } from '../types/crew';

const getCatalogEntryName = (c: CatalogEntry) => [c.name];

const GAUNTLET_PRIORITY_LIMIT = 5;

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
  const gauntletRankMap = catalog ? getGauntletRankMap(catalog) : new Map<number, number>();
  const gauntletPriorityCrew = catalog
    ? sortCrew(filterGauntletPriority(crewList, gauntletRankMap), byGauntletRankAsc(gauntletRankMap)).slice(
        0,
        GAUNTLET_PRIORITY_LIMIT
      )
    : [];
  const { data: citationPriorities, loading: citationLoading, error: citationError } = useCitationPriorities();

  const crewById = new Map(crewList.map((c) => [c.id, c]));

  function resolveCitationCrew(ids: number[]): CrewMember[] {
    return ids.map((id) => crewById.get(id)).filter((c): c is CrewMember => c !== undefined);
  }

  const originalAlgorithmCrew = citationPriorities ? applyPriorityCutoff(resolveCitationCrew(citationPriorities.originalAlgorithm)) : [];
  const betaTachyonCrew = citationPriorities ? applyPriorityCutoff(resolveCitationCrew(citationPriorities.betaTachyon)) : [];

  const collectionsList = data ? getCollectionsList(data) : [];
  const missingFavoriteCrew = data
    ? sortCrew(filterMissingFavorite(crewList), defaultCrewComparator(collectionsList))
    : [];
  const missingFavoriteSearch = useSearch(missingFavoriteCrew, (c) => [c.name]);
  const baseSkillBonuses = data ? getBaseSkillBonuses(data) : [];
  const proficiencyBonuses = data ? getProficiencyBonuses(data) : [];

  function getUniqueCrewStats(maxRarity: number): { owned: number; total: number } | null {
    if (!catalog || catalogLoading || catalogError) return null;
    const owned = getOwnedArchetypeIds(crewList, frozenArchetypeIds, catalogMaxRarityById, maxRarity).size;
    const total = getCatalogCount(catalog, maxRarity);
    return { owned, total };
  }

  function uniqueCrewCell(maxRarity: number): string {
    const stats = getUniqueCrewStats(maxRarity);
    if (!stats) return '—';
    const pct = stats.total > 0 ? Math.ceil((stats.owned / stats.total) * 10000 - 1e-9) / 100 : 0;
    return `${stats.owned}/${stats.total} (${pct.toFixed(2)}%)`;
  }

  function uniqueCrewLabel(baseLabel: string, maxRarity: number): string {
    const stats = getUniqueCrewStats(maxRarity);
    return stats ? `${baseLabel} (${stats.owned - stats.total})` : baseLabel;
  }

  const owned4 = getOwnedArchetypeIds(crewList, frozenArchetypeIds, catalogMaxRarityById, 4);
  const missingInPortal = catalog ? [...getMissingCrew(catalog, owned4, 4, true)].sort(byDataScoreDesc) : [];
  const missingNotInPortal = catalog ? [...getMissingCrew(catalog, owned4, 4, false)].sort(byDataScoreDesc) : [];
  const inPortalSearch = useSearch(missingInPortal, getCatalogEntryName);
  const notInPortalSearch = useSearch(missingNotInPortal, getCatalogEntryName);

  // Player data being loaded and non-errored gates every section on this page:
  // without it there is no roster to describe, and rendering a section early
  // would flash an empty table if a faster fetch (catalog, citation priorities)
  // resolves first.
  const playerReady = Boolean(!loading && !error && identity);

  const showCatalogData = Boolean(playerReady && !catalogLoading && !catalogError && catalog);

  return (
    <Stack spacing={2}>
      <Typography variant="h4">Overview</Typography>

      {loading && <CircularProgress />}
      {error && <Alert severity="error">{error}</Alert>}

      {!loading && !error && identity && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell colSpan={2}>
                  <Typography variant="h5" component="span">
                    Player Info
                  </Typography>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(Object.keys(FIELD_LABELS) as (keyof PlayerIdentity)[]).map((field) => (
                <TableRow key={field}>
                  <TableCell component="th" scope="row">
                    {FIELD_LABELS[field]}
                  </TableCell>
                  <TableCell align="right">{identity[field] ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {showCatalogData && (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography variant="h5">Priorities (Gauntlet)</Typography>
          <CrewTable
            crew={gauntletPriorityCrew}
            collections={collectionsList}
            showCollectionsNames={true}
            gauntletRankByArchetypeId={gauntletRankMap}
          />
        </>
      )}

      {playerReady && (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography variant="h5">Priorities (Original Algorithm)</Typography>
          {citationLoading && <Typography>Loading priorities…</Typography>}
          {citationError && <Alert severity="error">{citationError}</Alert>}
          {citationPriorities && (
            <CrewTable crew={originalAlgorithmCrew} collections={collectionsList} showCollectionsNames={true} />
          )}
        </>
      )}

      {playerReady && (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography variant="h5">Priorities (Beta Tachyon)</Typography>
          {citationLoading && <Typography>Loading priorities…</Typography>}
          {citationError && <Alert severity="error">{citationError}</Alert>}
          {citationPriorities && (
            <CrewTable crew={betaTachyonCrew} collections={collectionsList} showCollectionsNames={true} />
          )}
        </>
      )}

      {!loading && !error && identity && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell colSpan={2}>
                  <Typography variant="h5" component="span">
                    Missing Crew recap
                  </Typography>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                <TableCell component="th" scope="row">
                  {uniqueCrewLabel('5 Stars unique crew', 5)}
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
                  {uniqueCrewLabel('4 Stars unique crew', 4)}
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

      {!loading && !error && identity && (
        <>
          <Divider sx={{ my: 2 }} />
          <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
            <Typography variant="h5">
              Missing Favorite Flag ({missingFavoriteSearch.filteredItems.length} of {missingFavoriteCrew.length})
            </Typography>
            <TableSearchBar
              value={missingFavoriteSearch.query}
              onChange={missingFavoriteSearch.setQuery}
              ariaLabel="Search Missing Favorite Flag by name"
            />
          </Stack>
          {missingFavoriteSearch.active && missingFavoriteSearch.filteredItems.length === 0 ? (
            <Typography color="text.secondary">No results found for your search.</Typography>
          ) : (
            <CrewTable crew={missingFavoriteSearch.filteredItems} collections={collectionsList} showCollectionsNames={true} />
          )}
        </>
      )}

      {showCatalogData && (
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

          <Divider sx={{ my: 2 }} />
          <Typography variant="h5">Base Skill Bonus</Typography>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Skill</TableCell>
                  <TableCell align="right">Bonus</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {baseSkillBonuses.map((row) => (
                  <TableRow key={row.skill}>
                    <TableCell component="th" scope="row">
                      {row.skill}
                    </TableCell>
                    <TableCell align="right">+{row.value}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Typography variant="h5">Proficiency Bonus</Typography>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Skill</TableCell>
                  <TableCell align="right">Min Bonus</TableCell>
                  <TableCell align="right">Max Bonus</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {proficiencyBonuses.map((row) => (
                  <TableRow key={row.skill}>
                    <TableCell component="th" scope="row">
                      {row.skill}
                    </TableCell>
                    <TableCell align="right">+{row.min}%</TableCell>
                    <TableCell align="right">+{row.max}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </Stack>
  );
}

export default OverviewPage;
