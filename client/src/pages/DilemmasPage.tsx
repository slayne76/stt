import { useDilemmas } from '../hooks/useDilemmas';
import { useCrewCatalog } from '../hooks/useCrewCatalog';
import { sortedDilemmas, buildCatalogEntryMap } from '../dilemmas/getters';
import DilemmasTable from '../dilemmas/DilemmasTable';
import PageShell from '../layout/PageShell';

function DilemmasPage() {
  const { data: catalog, loading: catalogLoading } = useCrewCatalog();
  const { data, loading: dilemmasLoading, error, refresh } = useDilemmas();

  const loading = dilemmasLoading || catalogLoading;
  const loaded = !loading && !error && !!data;
  const dilemmas = data ? sortedDilemmas(data.dilemmas) : [];
  const catalogMap = buildCatalogEntryMap(catalog ?? []);

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
      <DilemmasTable dilemmas={dilemmas} catalogMap={catalogMap} />
    </PageShell>
  );
}

export default DilemmasPage;
