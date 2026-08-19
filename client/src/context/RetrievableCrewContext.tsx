import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react';
import type { RetrievableCrewEntry } from '../types/retrievableCrew';
import { fetchRetrievableCrew } from '../api/retrievableCrewApi';

export interface RetrievableCrewContextValue {
  data: RetrievableCrewEntry[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
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

  return (
    <RetrievableCrewContext.Provider value={{ data, loading, error, refresh: load }}>
      {children}
    </RetrievableCrewContext.Provider>
  );
}
