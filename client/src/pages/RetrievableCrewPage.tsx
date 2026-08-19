import { useState } from 'react';
import { Alert, Snackbar } from '@mui/material';
import { usePlayerData } from '../hooks/usePlayerData';
import { useCrewCatalog } from '../hooks/useCrewCatalog';
import { usePolestarCatalog } from '../hooks/usePolestarCatalog';
import { useRetrievableCrew } from '../hooks/useRetrievableCrew';
import { getCrewList } from '../crew/getters';
import { getCollectionsList } from '../collections/getters';
import { buildRetrievableCrewRows, buildPolestarCatalogMap } from '../polestars/getters';
import type { RetrievableCrewEntry } from '../types/retrievableCrew';
import RetrievableCrewTable from '../polestars/RetrievableCrewTable';
import RetrievableCrewActions from '../polestars/RetrievableCrewActions';
import DeleteConfirmDialog from '../polestars/DeleteConfirmDialog';
import PageShell from '../layout/PageShell';

function RetrievableCrewPage() {
  const { data: playerData, loading: playerLoading } = usePlayerData();
  const { data: catalog, loading: catalogLoading } = useCrewCatalog();
  const { data: polestarCatalog, loading: polestarCatalogLoading } = usePolestarCatalog();
  const {
    data: retrievableCrew,
    loading: retrievableCrewLoading,
    error,
    refresh,
    deleteEntry,
  } = useRetrievableCrew();

  const [selectedArchetypeId, setSelectedArchetypeId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RetrievableCrewEntry | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState<{ severity: 'success' | 'error'; message: string } | null>(null);

  const loading = playerLoading || catalogLoading || polestarCatalogLoading || retrievableCrewLoading;
  const loaded = !loading && !error && !!retrievableCrew;

  const crewList = playerData ? getCrewList(playerData) : [];
  const collections = playerData ? getCollectionsList(playerData) : [];
  const rows = loaded ? buildRetrievableCrewRows(retrievableCrew, catalog ?? [], crewList, collections) : [];
  const polestarCatalogMap = buildPolestarCatalogMap(polestarCatalog ?? []);

  function crewLabel(archetypeId: number): string {
    return catalog?.find((c) => c.archetype_id === archetypeId)?.name ?? `archetype ${archetypeId}`;
  }

  // Real Add/Edit dialog wiring lands in the next task (RetrievableCrewFormDialog).
  // This task's scope is selection + the Delete flow only.
  function handleAddClick() {}
  function handleEditClick() {}

  function handleDeleteClick() {
    const entry = retrievableCrew?.find((e) => e.archetypeId === selectedArchetypeId) ?? null;
    if (entry) setDeleteTarget(entry);
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    const label = crewLabel(deleteTarget.archetypeId);
    setDeleteSubmitting(true);
    try {
      await deleteEntry(deleteTarget.archetypeId);
      setSnackbar({ severity: 'success', message: `Deleted ${label}.` });
      setDeleteTarget(null);
      setSelectedArchetypeId(null);
    } catch (err) {
      setSnackbar({ severity: 'error', message: err instanceof Error ? err.message : 'Failed to delete' });
    } finally {
      setDeleteSubmitting(false);
    }
  }

  return (
    <>
      <PageShell
        title="Retrievable Crew"
        loading={loading}
        error={error}
        onRetry={() => void refresh()}
        loaded={loaded}
        count={rows.length}
        emptyMessage="No retrievable crew tracked yet."
        titleActions={
          <RetrievableCrewActions
            onAdd={handleAddClick}
            onEdit={handleEditClick}
            onDelete={handleDeleteClick}
            canEdit={selectedArchetypeId !== null}
            canDelete={selectedArchetypeId !== null}
          />
        }
      >
        <RetrievableCrewTable
          rows={rows}
          polestarCatalogMap={polestarCatalogMap}
          selectedArchetypeId={selectedArchetypeId}
          onSelect={setSelectedArchetypeId}
        />
      </PageShell>
      <DeleteConfirmDialog
        open={deleteTarget !== null}
        crewName={deleteTarget ? crewLabel(deleteTarget.archetypeId) : ''}
        submitting={deleteSubmitting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void handleDeleteConfirm()}
      />
      <Snackbar open={snackbar !== null} autoHideDuration={6000} onClose={() => setSnackbar(null)}>
        <Alert severity={snackbar?.severity ?? 'success'} onClose={() => setSnackbar(null)}>
          {snackbar?.message ?? ''}
        </Alert>
      </Snackbar>
    </>
  );
}

export default RetrievableCrewPage;
