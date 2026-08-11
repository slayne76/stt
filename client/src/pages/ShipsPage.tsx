import { usePlayerData } from '../hooks/usePlayerData';
import { getOwnedItems } from '../crew/getters';
import { combineComparators } from '../lib/comparator';
import { getShipList } from '../ships/getters';
import { filterIncompleteShipsByRarity } from '../ships/filters';
import { byLevelDesc, byLevelProgressDesc, byMissingSchematicsAsc, byNameAsc, sortShips } from '../ships/sorters';
import { useSearch } from '../lib/useSearch';
import ShipsTable from '../ships/ShipsTable';
import PageShell from '../layout/PageShell';
import TableSearchBar from '../components/TableSearchBar';

export interface ShipsPageProps {
  rarity: number;
  title: string;
}

function ShipsPage({ rarity, title }: ShipsPageProps) {
  const { data, loading, error, refresh } = usePlayerData();

  const items = data ? getOwnedItems(data) : [];
  const ships = data
    ? sortShips(
        filterIncompleteShipsByRarity(getShipList(data), rarity),
        combineComparators(byLevelDesc, byLevelProgressDesc, byMissingSchematicsAsc(items), byNameAsc)
      )
    : [];
  const { query, setQuery, filteredItems: filteredShips, active } = useSearch(ships, (s) => [s.name]);

  const loaded = !loading && !error && !!data;

  return (
    <PageShell
      title={title}
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={filteredShips.length}
      totalCount={ships.length}
      emptyMessage={
        active && filteredShips.length === 0 ? 'No results found for your search.' : 'No incomplete ships at this rarity.'
      }
      titleActions={<TableSearchBar value={query} onChange={setQuery} ariaLabel={`Search ${title} by name`} />}
    >
      <ShipsTable ships={filteredShips} items={items} />
    </PageShell>
  );
}

export default ShipsPage;
