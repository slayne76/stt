import { usePageData } from '../hooks/usePageData';
import { useCrewCatalog } from '../hooks/useCrewCatalog';
import { getCrewList } from '../crew/getters';
import { filterByRarity } from '../crew/filters';
import { defaultCrewComparator, sortCrew } from '../crew/sorters';
import { getCollectionsList } from '../collections/getters';
import { getUniquelyRetrievableArchetypeIds } from '../catalog/getters';
import { useSearch } from '../lib/useSearch';
import CrewTable from '../crew/CrewTable';
import PageShell from '../layout/PageShell';
import TableSearchBar from '../components/TableSearchBar';

function ThreeFiveStarsCrewPage() {
  const { data: catalog, loading: catalogLoading, error: catalogError } = useCrewCatalog();
  const { data, loading, error, refresh, loaded } = usePageData(catalogLoading);

  const collections = data ? getCollectionsList(data) : [];
  const crew = data
    ? sortCrew(filterByRarity(getCrewList(data), { rarity: 3, maxRarity: 5 }), defaultCrewComparator(collections))
    : [];
  const uniquelyRetrievableArchetypeIds = catalog
    ? getUniquelyRetrievableArchetypeIds(catalog)
    : catalogError
      ? null
      : new Set<number>();
  const { query, setQuery, filteredItems: filteredCrew, active } = useSearch(crew, (c) => [c.name]);

  return (
    <PageShell
      title="3/5 Stars Crew"
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={filteredCrew.length}
      totalCount={crew.length}
      emptyMessage={active && filteredCrew.length === 0 ? 'No results found for your search.' : 'No crew at 3/5 stars.'}
      titleActions={<TableSearchBar value={query} onChange={setQuery} ariaLabel="Search 3/5 Stars Crew by name" />}
    >
      <CrewTable
        crew={filteredCrew}
        collections={collections}
        showCollectionsNames={true}
        uniquelyRetrievableArchetypeIds={uniquelyRetrievableArchetypeIds}
      />
    </PageShell>
  );
}

export default ThreeFiveStarsCrewPage;
