import { usePlayerData } from '../hooks/usePlayerData';
import { getCrewList, getFrozenCrewArchetypeIds, getOwnedItems } from '../crew/getters';
import { getCollectionsList } from '../collections/getters';
import {
  byUpgradableThenCompletionThenNameAsc,
  getQualifyingCrewByCollection,
  getUpgradableCollectionIds,
} from '../collections/sorters';
import { useSearch } from '../lib/useSearch';
import CollectionsTable from '../collections/CollectionsTable';
import PageShell from '../layout/PageShell';
import TableSearchBar from '../components/TableSearchBar';

function CollectionsPage() {
  const { data, loading, error, refresh } = usePlayerData();

  const rawCollections = data ? getCollectionsList(data) : [];
  const crew = data ? getCrewList(data) : [];
  const items = data ? getOwnedItems(data) : [];
  const frozenArchetypeIds = data ? getFrozenCrewArchetypeIds(data) : new Set<number>();
  const qualifyingCrewByCollection = getQualifyingCrewByCollection(rawCollections, crew, items, frozenArchetypeIds);
  const upgradableIds = getUpgradableCollectionIds(rawCollections, qualifyingCrewByCollection, items);
  const collections = data
    ? [...rawCollections].sort(byUpgradableThenCompletionThenNameAsc(upgradableIds))
    : [];
  const {
    query,
    setQuery,
    filteredItems: filteredCollections,
    active,
  } = useSearch(collections, (c) => [c.name]);

  const loaded = !loading && !error && !!data;

  return (
    <PageShell
      title="Collections"
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={filteredCollections.length}
      totalCount={collections.length}
      emptyMessage={
        active && filteredCollections.length === 0 ? 'No results found for your search.' : 'No collections found.'
      }
      titleActions={<TableSearchBar value={query} onChange={setQuery} ariaLabel="Search Collections by name" />}
    >
      <CollectionsTable
        collections={filteredCollections}
        items={items}
        qualifyingCrewByCollection={qualifyingCrewByCollection}
        upgradableIds={upgradableIds}
      />
    </PageShell>
  );
}

export default CollectionsPage;
