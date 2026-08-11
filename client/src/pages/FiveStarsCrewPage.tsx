import { usePageData } from '../hooks/usePageData';
import { getCrewList } from '../crew/getters';
import { filterUnmaxed } from '../crew/filters';
import { byEquipmentSlotsRemainingDesc, byLevelDesc, byNameAsc, byRarityDesc, sortCrew } from '../crew/sorters';
import { combineComparators } from '../lib/comparator';
import { getCollectionsList } from '../collections/getters';
import { useSearch } from '../lib/useSearch';
import CrewTable from '../crew/CrewTable';
import PageShell from '../layout/PageShell';
import TableSearchBar from '../components/TableSearchBar';

function FiveStarsCrewPage() {
  const { data, loading, error, refresh, loaded } = usePageData();

  const collections = data ? getCollectionsList(data) : [];
  const crew = data
    ? sortCrew(
        filterUnmaxed(getCrewList(data), 5),
        combineComparators(byLevelDesc, byEquipmentSlotsRemainingDesc, byRarityDesc, byNameAsc)
      )
    : [];
  const { query, setQuery, filteredItems: filteredCrew, active } = useSearch(crew, (c) => [c.name]);

  return (
    <PageShell
      title="5 Stars Crew"
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={filteredCrew.length}
      totalCount={crew.length}
      emptyMessage={active && filteredCrew.length === 0 ? 'No results found for your search.' : 'No unmaxed 5-star crew.'}
      titleActions={<TableSearchBar value={query} onChange={setQuery} ariaLabel="Search 5 Stars Crew by name" />}
    >
      <CrewTable crew={filteredCrew} collections={collections} showCollectionsNames={true} />
    </PageShell>
  );
}

export default FiveStarsCrewPage;
