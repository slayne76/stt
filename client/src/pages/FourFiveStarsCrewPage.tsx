import { usePageData } from '../hooks/usePageData';
import { getCrewList } from '../crew/getters';
import { filterByRarity } from '../crew/filters';
import { defaultCrewComparator, sortCrew } from '../crew/sorters';
import { getCollectionsList } from '../collections/getters';
import { useSearch } from '../lib/useSearch';
import CrewTable from '../crew/CrewTable';
import PageShell from '../layout/PageShell';
import TableSearchBar from '../components/TableSearchBar';

function FourFiveStarsCrewPage() {
  const { data, loading, error, refresh, loaded } = usePageData();

  const collections = data ? getCollectionsList(data) : [];
  const crew = data
    ? sortCrew(filterByRarity(getCrewList(data), { rarity: 4, maxRarity: 5 }), defaultCrewComparator(collections))
    : [];
  const { query, setQuery, filteredItems: filteredCrew, active } = useSearch(crew, (c) => [c.name]);

  return (
    <PageShell
      title="4/5 Stars crew"
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={filteredCrew.length}
      totalCount={crew.length}
      emptyMessage={active && filteredCrew.length === 0 ? 'No results found for your search.' : 'No crew at 4/5 stars.'}
      titleActions={<TableSearchBar value={query} onChange={setQuery} ariaLabel="Search 4/5 Stars crew by name" />}
    >
      <CrewTable crew={filteredCrew} collections={collections} showCollectionsNames={true} />
    </PageShell>
  );
}

export default FourFiveStarsCrewPage;
