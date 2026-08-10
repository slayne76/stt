import { usePlayerData } from '../hooks/usePlayerData';
import { getCrewList, getOwnedItems } from '../crew/getters';
import { filterByRarity, filterNeedsWork } from '../crew/filters';
import { byCollectionCountDesc, byEquipmentSlotsRemainingDesc, byLevelDesc, byNameAsc, sortCrew } from '../crew/sorters';
import { combineComparators } from '../lib/comparator';
import { getCollectionsList } from '../collections/getters';
import CrewTable from '../crew/CrewTable';
import PageShell from '../layout/PageShell';

function FourFourStarsCrewPage() {
  const { data, loading, error, refresh } = usePlayerData();

  const collections = data ? getCollectionsList(data) : [];
  const crew = data
    ? sortCrew(
        filterNeedsWork(
          filterByRarity(getCrewList(data), { rarity: 4, maxRarity: 4 }),
          getOwnedItems(data)
        ),
        combineComparators(byLevelDesc, byEquipmentSlotsRemainingDesc, byCollectionCountDesc(collections), byNameAsc)
      )
    : [];

  const loaded = !loading && !error && !!data;

  return (
    <PageShell
      title="4/4 Stars crew"
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={crew.length}
      emptyMessage="No crew at 4/4 stars."
    >
      <CrewTable crew={crew} collections={collections} showCollectionsNames={true} />
    </PageShell>
  );
}

export default FourFourStarsCrewPage;
