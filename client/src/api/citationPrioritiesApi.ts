export interface CitationPrioritiesResponse {
  originalAlgorithm: number[];
  betaTachyon: number[];
}

export async function fetchCitationPriorities(): Promise<CitationPrioritiesResponse> {
  const response = await fetch('/api/citation-priorities');
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error((body as { error?: string }).error ?? `Failed to load citation priorities: HTTP ${response.status}`);
  }
  return response.json() as Promise<CitationPrioritiesResponse>;
}
