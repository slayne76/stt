import { usePageData } from '../hooks/usePageData';
import { getCrewList, getFrozenCrewArchetypeIds, getDuplicateCrewGroups } from '../crew/getters';
import { byMaxRarityDesc, defaultCrewComparator } from '../crew/sorters';
import { combineComparators } from '../lib/comparator';
import { getCollectionsList } from '../collections/getters';
import { useSearch } from '../lib/useSearch';
import DuplicatesTable from '../crew/DuplicatesTable';
import PageShell from '../layout/PageShell';
import TableSearchBar from '../components/TableSearchBar';

function DuplicatesPage() {
  const { data, loading, error, refresh, loaded } = usePageData();

  const collections = data ? getCollectionsList(data) : [];
  const frozenArchetypeIds = data ? getFrozenCrewArchetypeIds(data) : new Set<number>();
  const groups = data
    ? [...getDuplicateCrewGroups(getCrewList(data), frozenArchetypeIds)].sort((a, b) =>
        combineComparators(byMaxRarityDesc, defaultCrewComparator(collections))(a.crew, b.crew)
      )
    : [];
  const { query, setQuery, filteredItems: filteredGroups, active } = useSearch(groups, (g) => [g.crew.name]);

  return (
    <PageShell
      title="Duplicates"
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={filteredGroups.length}
      totalCount={groups.length}
      emptyMessage={active && filteredGroups.length === 0 ? 'No results found for your search.' : 'No duplicate crew.'}
      titleActions={<TableSearchBar value={query} onChange={setQuery} ariaLabel="Search Duplicates by name" />}
    >
      <DuplicatesTable groups={filteredGroups} collections={collections} />
    </PageShell>
  );
}

export default DuplicatesPage;
