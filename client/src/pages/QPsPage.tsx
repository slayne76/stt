import { usePageData } from '../hooks/usePageData';
import { getCrewList } from '../crew/getters';
import { filterQPEligible } from '../crew/filters';
import { byQPOnHoldAsc, byQPLevelDesc, byQPBitsDesc, byNameAsc, sortCrew } from '../crew/sorters';
import { combineComparators } from '../lib/comparator';
import { useSearch } from '../lib/useSearch';
import QPsTable from '../crew/QPsTable';
import PageShell from '../layout/PageShell';
import TableSearchBar from '../components/TableSearchBar';

function QPsPage() {
  const { data, loading, error, refresh, loaded } = usePageData();

  const crew = data
    ? sortCrew(
        filterQPEligible(getCrewList(data)),
        combineComparators(byQPOnHoldAsc, byQPLevelDesc, byQPBitsDesc, byNameAsc)
      )
    : [];
  const { query, setQuery, filteredItems: filteredCrew, active } = useSearch(crew, (c) => [c.name]);

  return (
    <PageShell
      title="QPs"
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={filteredCrew.length}
      totalCount={crew.length}
      emptyMessage={active && filteredCrew.length === 0 ? 'No results found for your search.' : 'No crew need QP leveling.'}
      titleActions={<TableSearchBar value={query} onChange={setQuery} ariaLabel="Search QPs by name" />}
    >
      <QPsTable crew={filteredCrew} />
    </PageShell>
  );
}

export default QPsPage;
