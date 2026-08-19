import type { RetrievableCrewEntry } from '../types/retrievableCrew';

async function parseRetrievableCrewListResponse(response: Response, action: string): Promise<RetrievableCrewEntry[]> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error((body as { error?: string }).error ?? `Failed to ${action}: HTTP ${response.status}`);
  }
  return response.json() as Promise<RetrievableCrewEntry[]>;
}

export async function fetchRetrievableCrew(): Promise<RetrievableCrewEntry[]> {
  const response = await fetch('/api/retrievable-crew');
  return parseRetrievableCrewListResponse(response, 'load retrievable crew');
}

export async function addRetrievableCrew(entry: RetrievableCrewEntry): Promise<RetrievableCrewEntry[]> {
  const response = await fetch('/api/retrievable-crew', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });
  return parseRetrievableCrewListResponse(response, 'add retrievable crew');
}

export async function updateRetrievableCrew(
  originalArchetypeId: number,
  entry: RetrievableCrewEntry
): Promise<RetrievableCrewEntry[]> {
  const response = await fetch(`/api/retrievable-crew/${originalArchetypeId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });
  return parseRetrievableCrewListResponse(response, 'update retrievable crew');
}

export async function deleteRetrievableCrew(archetypeId: number): Promise<RetrievableCrewEntry[]> {
  const response = await fetch(`/api/retrievable-crew/${archetypeId}`, { method: 'DELETE' });
  return parseRetrievableCrewListResponse(response, 'delete retrievable crew');
}
