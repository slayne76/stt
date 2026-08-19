import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react';
import type { PolestarCatalogEntry } from '../types/polestarCatalogEntry';
import { fetchPolestarCatalog, refreshPolestarCatalog } from '../api/polestarCatalogApi';

export interface PolestarCatalogContextValue {
  data: PolestarCatalogEntry[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export const PolestarCatalogContext = createContext<PolestarCatalogContextValue | undefined>(undefined);

export function PolestarCatalogProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<PolestarCatalogEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (fetcher: () => Promise<PolestarCatalogEntry[]>) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load polestar catalog');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(fetchPolestarCatalog);
  }, [load]);

  const refresh = useCallback(() => load(refreshPolestarCatalog), [load]);

  return (
    <PolestarCatalogContext.Provider value={{ data, loading, error, refresh }}>
      {children}
    </PolestarCatalogContext.Provider>
  );
}
