import type { RetrievableCrewEntry } from '../types/retrievableCrew';

export async function fetchRetrievableCrew(): Promise<RetrievableCrewEntry[]> {
  const response = await fetch('/api/retrievable-crew');
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error((body as { error?: string }).error ?? `Failed to load retrievable crew: HTTP ${response.status}`);
  }
  return response.json() as Promise<RetrievableCrewEntry[]>;
}
