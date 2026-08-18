import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react';
import type { DilemmasResponse } from '../types/dilemma';
import { fetchDilemmas } from '../api/dilemmasApi';

export interface DilemmasContextValue {
  data: DilemmasResponse | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export const DilemmasContext = createContext<DilemmasContextValue | undefined>(undefined);

export function DilemmasProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DilemmasResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchDilemmas();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dilemmas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <DilemmasContext.Provider value={{ data, loading, error, refresh: load }}>
      {children}
    </DilemmasContext.Provider>
  );
}
