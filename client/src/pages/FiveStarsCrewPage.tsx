import { usePlayerData } from '../hooks/usePlayerData';
import { getCrewList } from '../crew/getters';
import { filterUnmaxed } from '../crew/filters';
import { byEquipmentSlotsRemainingDesc, byLevelDesc, byNameAsc, byRarityDesc, sortCrew } from '../crew/sorters';
import { combineComparators } from '../lib/comparator';
import { getCollectionsList } from '../collections/getters';
import CrewTable from '../crew/CrewTable';
import PageShell from '../layout/PageShell';

function FiveStarsCrewPage() {
  const { data, loading, error, refresh } = usePlayerData();

  const collections = data ? getCollectionsList(data) : [];
  const crew = data
    ? sortCrew(
        filterUnmaxed(getCrewList(data), 5),
        combineComparators(byLevelDesc, byEquipmentSlotsRemainingDesc, byRarityDesc, byNameAsc)
      )
    : [];

  const loaded = !loading && !error && !!data;

  return (
    <PageShell
      title="5 Stars Crew"
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={crew.length}
      emptyMessage="No unmaxed 5-star crew."
    >
      <CrewTable crew={crew} collections={collections} showCollectionsNames={true} />
    </PageShell>
  );
}

export default FiveStarsCrewPage;
