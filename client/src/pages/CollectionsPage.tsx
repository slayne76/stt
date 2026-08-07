import { usePlayerData } from '../hooks/usePlayerData';
import { getCrewList, getFrozenCrewArchetypeIds, getOwnedItems } from '../crew/getters';
import { getCollectionsList } from '../collections/getters';
import { byUpgradableThenCompletionThenNameAsc } from '../collections/sorters';
import CollectionsTable from '../collections/CollectionsTable';
import PageShell from '../layout/PageShell';

function CollectionsPage() {
  const { data, loading, error, refresh } = usePlayerData();

  const rawCollections = data ? getCollectionsList(data) : [];
  const crew = data ? getCrewList(data) : [];
  const items = data ? getOwnedItems(data) : [];
  const frozenArchetypeIds = data ? getFrozenCrewArchetypeIds(data) : new Set<number>();
  const collections = data
    ? [...rawCollections].sort(byUpgradableThenCompletionThenNameAsc(rawCollections, crew, items, frozenArchetypeIds))
    : [];

  const loaded = !loading && !error && !!data;

  return (
    <PageShell
      title="Collections"
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={collections.length}
      emptyMessage="No collections found."
    >
      <CollectionsTable
        collections={collections}
        crew={crew}
        items={items}
        frozenArchetypeIds={frozenArchetypeIds}
      />
    </PageShell>
  );
}

export default CollectionsPage;
