import { usePlayerData } from '../hooks/usePlayerData';
import { useCrewCatalog } from '../hooks/useCrewCatalog';
import { usePolestarCatalog } from '../hooks/usePolestarCatalog';
import { useRetrievableCrew } from '../hooks/useRetrievableCrew';
import { getCrewList } from '../crew/getters';
import { getCollectionsList } from '../collections/getters';
import { buildRetrievableCrewRows, buildPolestarCatalogMap } from '../polestars/getters';
import RetrievableCrewTable from '../polestars/RetrievableCrewTable';
import PageShell from '../layout/PageShell';

function RetrievableCrewPage() {
  const { data: playerData, loading: playerLoading } = usePlayerData();
  const { data: catalog, loading: catalogLoading } = useCrewCatalog();
  const { data: polestarCatalog, loading: polestarCatalogLoading } = usePolestarCatalog();
  const { data: retrievableCrew, loading: retrievableCrewLoading, error, refresh } = useRetrievableCrew();

  const loading = playerLoading || catalogLoading || polestarCatalogLoading || retrievableCrewLoading;
  const loaded = !loading && !error && !!retrievableCrew;

  const crewList = playerData ? getCrewList(playerData) : [];
  const collections = playerData ? getCollectionsList(playerData) : [];
  const rows = loaded ? buildRetrievableCrewRows(retrievableCrew, catalog ?? [], crewList, collections) : [];
  const polestarCatalogMap = buildPolestarCatalogMap(polestarCatalog ?? []);

  return (
    <PageShell
      title="Retrievable Crew"
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={rows.length}
      emptyMessage="No retrievable crew tracked yet."
    >
      <RetrievableCrewTable rows={rows} polestarCatalogMap={polestarCatalogMap} />
    </PageShell>
  );
}

export default RetrievableCrewPage;
