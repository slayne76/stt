import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react';
import type { PlayerData } from '../types/player';
import { fetchPlayer, refreshPlayer, PlayerApiError } from '../api/playerApi';

export interface PlayerDataContextValue {
  data: PlayerData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export const PlayerDataContext = createContext<PlayerDataContextValue | undefined>(undefined);

export function PlayerDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<PlayerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (fetcher: () => Promise<PlayerData>) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
    } catch (err) {
      setError(err instanceof PlayerApiError ? err.message : 'Failed to load player data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(fetchPlayer);
  }, [load]);

  const refresh = useCallback(() => load(refreshPlayer), [load]);

  return (
    <PlayerDataContext.Provider value={{ data, loading, error, refresh }}>
      {children}
    </PlayerDataContext.Provider>
  );
}
