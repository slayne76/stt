import { usePageData } from '../hooks/usePageData';
import { useCrewCatalog } from '../hooks/useCrewCatalog';
import { getFrozenCrewArchetypeIds } from '../crew/getters';
import { getFrozenCrew } from '../catalog/getters';
import { byMaxRarityDesc, byNameAsc } from '../catalog/sorters';
import { combineComparators } from '../lib/comparator';
import { useSearch } from '../lib/useSearch';
import FrozenCrewTable from '../catalog/FrozenCrewTable';
import PageShell from '../layout/PageShell';
import TableSearchBar from '../components/TableSearchBar';

function FrozenCrewPage() {
  const { data: catalog, loading: catalogLoading, error: catalogError } = useCrewCatalog();
  const { data, loading, error, refresh, loaded } = usePageData(catalogLoading);

  const frozenArchetypeIds = data ? getFrozenCrewArchetypeIds(data) : new Set<number>();
  const crew = catalog
    ? [...getFrozenCrew(catalog, frozenArchetypeIds, [4, 5])].sort(combineComparators(byMaxRarityDesc, byNameAsc))
    : [];
  const { query, setQuery, filteredItems: filteredCrew, active } = useSearch(crew, (c) => [c.name]);

  return (
    <PageShell
      title="5 & 4 Stars Frozen Crew"
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={filteredCrew.length}
      totalCount={crew.length}
      emptyMessage={
        !catalog && catalogError
          ? `Crew catalog unavailable: ${catalogError}`
          : active && filteredCrew.length === 0
            ? 'No results found for your search.'
            : 'No frozen 4 or 5-star crew.'
      }
      titleActions={<TableSearchBar value={query} onChange={setQuery} ariaLabel="Search 5 & 4 Stars Frozen Crew by name" />}
    >
      <FrozenCrewTable crew={filteredCrew} />
    </PageShell>
  );
}

export default FrozenCrewPage;
