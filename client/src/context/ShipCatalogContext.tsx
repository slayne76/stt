import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react';
import type { ShipCatalogEntry } from '../types/shipCatalogEntry';
import { fetchShipCatalog, refreshShipCatalog } from '../api/shipCatalogApi';

export interface ShipCatalogContextValue {
  data: ShipCatalogEntry[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export const ShipCatalogContext = createContext<ShipCatalogContextValue | undefined>(undefined);

export function ShipCatalogProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<ShipCatalogEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (fetcher: () => Promise<ShipCatalogEntry[]>) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ship catalog');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(fetchShipCatalog);
  }, [load]);

  const refresh = useCallback(() => load(refreshShipCatalog), [load]);

  return (
    <ShipCatalogContext.Provider value={{ data, loading, error, refresh }}>
      {children}
    </ShipCatalogContext.Provider>
  );
}
