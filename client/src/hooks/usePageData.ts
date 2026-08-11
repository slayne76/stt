import { usePlayerData } from './usePlayerData';
import type { PlayerData } from '../types/player';

export interface UsePageDataResult {
  data: PlayerData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  loaded: boolean;
}

export function usePageData(extraLoading = false): UsePageDataResult {
  const { data, loading, error, refresh } = usePlayerData();
  const combinedLoading = loading || extraLoading;
  const loaded = !combinedLoading && !error && !!data;
  return { data, loading: combinedLoading, error, refresh, loaded };
}
