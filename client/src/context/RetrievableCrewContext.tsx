import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react';
import type { RetrievableCrewEntry } from '../types/retrievableCrew';
import {
  fetchRetrievableCrew,
  addRetrievableCrew,
  updateRetrievableCrew,
  deleteRetrievableCrew,
} from '../api/retrievableCrewApi';

export interface RetrievableCrewContextValue {
  data: RetrievableCrewEntry[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addEntry: (entry: RetrievableCrewEntry) => Promise<void>;
  updateEntry: (originalArchetypeId: number, entry: RetrievableCrewEntry) => Promise<void>;
  deleteEntry: (archetypeId: number) => Promise<void>;
}

export const RetrievableCrewContext = createContext<RetrievableCrewContextValue | undefined>(undefined);

export function RetrievableCrewProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<RetrievableCrewEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchRetrievableCrew();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load retrievable crew');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Mutation methods are user-initiated (Add/Edit/Delete dialogs), not
  // page-load fetches — they deliberately don't touch loading/error (those
  // stay reserved for the initial page-load state). Failures propagate to
  // the caller so the dialog/page can show its own inline error (e.g. a
  // Snackbar) and decide whether to keep a form open, instead of the whole
  // page falling back to its error state.
  const addEntry = useCallback(async (entry: RetrievableCrewEntry) => {
    const result = await addRetrievableCrew(entry);
    setData(result);
  }, []);

  const updateEntry = useCallback(async (originalArchetypeId: number, entry: RetrievableCrewEntry) => {
    const result = await updateRetrievableCrew(originalArchetypeId, entry);
    setData(result);
  }, []);

  const deleteEntry = useCallback(async (archetypeId: number) => {
    const result = await deleteRetrievableCrew(archetypeId);
    setData(result);
  }, []);

  return (
    <RetrievableCrewContext.Provider
      value={{ data, loading, error, refresh: load, addEntry, updateEntry, deleteEntry }}
    >
      {children}
    </RetrievableCrewContext.Provider>
  );
}
