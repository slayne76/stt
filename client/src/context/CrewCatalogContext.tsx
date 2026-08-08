import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react';
import type { CatalogEntry } from '../types/catalogEntry';
import { fetchCrewCatalog, refreshCrewCatalog } from '../api/catalogApi';

export interface CrewCatalogContextValue {
  data: CatalogEntry[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export const CrewCatalogContext = createContext<CrewCatalogContextValue | undefined>(undefined);

export function CrewCatalogProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<CatalogEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (fetcher: () => Promise<CatalogEntry[]>) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load crew catalog');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(fetchCrewCatalog);
  }, [load]);

  const refresh = useCallback(() => load(refreshCrewCatalog), [load]);

  return (
    <CrewCatalogContext.Provider value={{ data, loading, error, refresh }}>
      {children}
    </CrewCatalogContext.Provider>
  );
}
