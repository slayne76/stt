import { useDilemmas } from '../hooks/useDilemmas';
import { useCrewCatalog } from '../hooks/useCrewCatalog';
import { useShipCatalog } from '../hooks/useShipCatalog';
import { sortedDilemmas, buildCatalogEntryMap, buildShipCatalogEntryMap, getChainSizeByName } from '../dilemmas/getters';
import DilemmasTable from '../dilemmas/DilemmasTable';
import PageShell from '../layout/PageShell';

function DilemmasPage() {
  const { data: catalog, loading: catalogLoading } = useCrewCatalog();
  const { data: shipCatalog, loading: shipCatalogLoading } = useShipCatalog();
  const { data, loading: dilemmasLoading, error, refresh } = useDilemmas();

  const loading = dilemmasLoading || catalogLoading || shipCatalogLoading;
  const loaded = !loading && !error && !!data;
  const dilemmas = data ? sortedDilemmas(data.dilemmas) : [];
  const catalogMap = buildCatalogEntryMap(catalog ?? []);
  const shipCatalogMap = buildShipCatalogEntryMap(shipCatalog ?? []);
  const chainSizeByName = getChainSizeByName(dilemmas);

  return (
    <PageShell
      title="Dilemmas"
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={dilemmas.length}
      emptyMessage="No dilemmas recorded yet."
    >
      <DilemmasTable
        dilemmas={dilemmas}
        catalogMap={catalogMap}
        shipCatalogMap={shipCatalogMap}
        chainSizeByName={chainSizeByName}
      />
    </PageShell>
  );
}

export default DilemmasPage;
