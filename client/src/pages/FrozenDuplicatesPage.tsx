import { usePlayerData } from '../hooks/usePlayerData';
import { getCrewList, getFrozenCrewArchetypeIds } from '../crew/getters';
import { filterFrozenDuplicates } from '../crew/filters';
import { byCollectionCountDesc, byEquipmentSlotsRemainingDesc, byLevelDesc, byNameAsc, sortCrew } from '../crew/sorters';
import { combineComparators } from '../lib/comparator';
import { getCollectionsList } from '../collections/getters';
import { useSearch } from '../lib/useSearch';
import CrewTable from '../crew/CrewTable';
import PageShell from '../layout/PageShell';
import TableSearchBar from '../components/TableSearchBar';

export interface FrozenDuplicatesPageProps {
  maxRarity: number;
  title: string;
}

function FrozenDuplicatesPage({ maxRarity, title }: FrozenDuplicatesPageProps) {
  const { data, loading, error, refresh } = usePlayerData();

  const collections = data ? getCollectionsList(data) : [];
  const frozenArchetypeIds = data ? getFrozenCrewArchetypeIds(data) : new Set<number>();
  const crew = data
    ? sortCrew(
        filterFrozenDuplicates(getCrewList(data), frozenArchetypeIds, maxRarity),
        combineComparators(byLevelDesc, byEquipmentSlotsRemainingDesc, byCollectionCountDesc(collections), byNameAsc)
      )
    : [];
  const { query, setQuery, filteredItems: filteredCrew, active } = useSearch(crew, (c) => [c.name]);

  const loaded = !loading && !error && !!data;

  return (
    <PageShell
      title={title}
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={filteredCrew.length}
      totalCount={crew.length}
      emptyMessage={
        active && filteredCrew.length === 0 ? 'No results found for your search.' : 'No duplicate crew at this rarity.'
      }
      titleActions={<TableSearchBar value={query} onChange={setQuery} />}
    >
      <CrewTable crew={filteredCrew} collections={collections} showCollectionsNames={false} />
    </PageShell>
  );
}

export default FrozenDuplicatesPage;
