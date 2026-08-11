import { usePageData } from '../hooks/usePageData';
import { getCrewList, getOwnedItems } from '../crew/getters';
import { filterByRarity, filterReadyToImmortalize } from '../crew/filters';
import { defaultCrewComparator, sortCrew } from '../crew/sorters';
import { getCollectionsList } from '../collections/getters';
import { useSearch } from '../lib/useSearch';
import CrewTable from '../crew/CrewTable';
import PageShell from '../layout/PageShell';
import TableSearchBar from '../components/TableSearchBar';

function FourFourStarsCrewReadyPage() {
  const { data, loading, error, refresh, loaded } = usePageData();

  const collections = data ? getCollectionsList(data) : [];
  const crew = data
    ? sortCrew(
        filterReadyToImmortalize(filterByRarity(getCrewList(data), { rarity: 4, maxRarity: 4 }), getOwnedItems(data)),
        defaultCrewComparator(collections)
      )
    : [];
  const { query, setQuery, filteredItems: filteredCrew, active } = useSearch(crew, (c) => [c.name]);

  return (
    <PageShell
      title="4/4 Stars crew (ready)"
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={filteredCrew.length}
      totalCount={crew.length}
      emptyMessage={
        active && filteredCrew.length === 0
          ? 'No results found for your search.'
          : 'No crew ready to immortalize at 4/4 stars.'
      }
      titleActions={<TableSearchBar value={query} onChange={setQuery} ariaLabel="Search 4/4 Stars crew (ready) by name" />}
    >
      <CrewTable crew={filteredCrew} collections={collections} showCollectionsNames={true} />
    </PageShell>
  );
}

export default FourFourStarsCrewReadyPage;
