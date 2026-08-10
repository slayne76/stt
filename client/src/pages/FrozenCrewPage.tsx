import { usePlayerData } from '../hooks/usePlayerData';
import { useCrewCatalog } from '../hooks/useCrewCatalog';
import { getFrozenCrewArchetypeIds } from '../crew/getters';
import { getFrozenCrew } from '../catalog/getters';
import { byMaxRarityDesc, byNameAsc } from '../catalog/sorters';
import { combineComparators } from '../lib/comparator';
import FrozenCrewTable from '../catalog/FrozenCrewTable';
import PageShell from '../layout/PageShell';

function FrozenCrewPage() {
  const { data, loading, error, refresh } = usePlayerData();
  const { data: catalog, loading: catalogLoading, error: catalogError } = useCrewCatalog();

  const frozenArchetypeIds = data ? getFrozenCrewArchetypeIds(data) : new Set<number>();
  const crew = catalog
    ? [...getFrozenCrew(catalog, frozenArchetypeIds, [4, 5])].sort(combineComparators(byMaxRarityDesc, byNameAsc))
    : [];

  const loaded = !loading && !catalogLoading && !error && !!data;

  return (
    <PageShell
      title="5 & 4 Stars Frozen Crew"
      loading={loading || catalogLoading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={crew.length}
      emptyMessage={!catalog && catalogError ? `Crew catalog unavailable: ${catalogError}` : 'No frozen 4 or 5-star crew.'}
    >
      <FrozenCrewTable crew={crew} />
    </PageShell>
  );
}

export default FrozenCrewPage;
