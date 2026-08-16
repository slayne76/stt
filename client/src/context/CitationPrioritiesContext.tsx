import { createContext, useEffect, useState, type ReactNode } from 'react';
import { fetchCitationPriorities, type CitationPrioritiesResponse } from '../api/citationPrioritiesApi';

export interface CitationPrioritiesContextValue {
  data: CitationPrioritiesResponse | null;
  loading: boolean;
  error: string | null;
}

export const CitationPrioritiesContext = createContext<CitationPrioritiesContextValue | undefined>(undefined);

export function CitationPrioritiesProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<CitationPrioritiesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchCitationPriorities()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load citation priorities');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <CitationPrioritiesContext.Provider value={{ data, loading, error }}>{children}</CitationPrioritiesContext.Provider>
  );
}
