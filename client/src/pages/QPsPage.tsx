import { usePlayerData } from '../hooks/usePlayerData';
import { getCrewList } from '../crew/getters';
import { filterQPEligible } from '../crew/filters';
import { byQPOnHoldAsc, byQPLevelDesc, byQPBitsDesc, byNameAsc, sortCrew } from '../crew/sorters';
import { combineComparators } from '../lib/comparator';
import QPsTable from '../crew/QPsTable';
import PageShell from '../layout/PageShell';

function QPsPage() {
  const { data, loading, error, refresh } = usePlayerData();

  const crew = data
    ? sortCrew(
        filterQPEligible(getCrewList(data)),
        combineComparators(byQPOnHoldAsc, byQPLevelDesc, byQPBitsDesc, byNameAsc)
      )
    : [];

  const loaded = !loading && !error && !!data;

  return (
    <PageShell
      title="QPs"
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={crew.length}
      emptyMessage="No crew need QP leveling."
    >
      <QPsTable crew={crew} />
    </PageShell>
  );
}

export default QPsPage;
