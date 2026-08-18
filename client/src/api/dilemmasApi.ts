import type { DilemmasResponse } from '../types/dilemma';

export async function fetchDilemmas(): Promise<DilemmasResponse> {
  const response = await fetch('/api/dilemmas');
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error((body as { error?: string }).error ?? `Failed to load dilemmas: HTTP ${response.status}`);
  }
  return response.json() as Promise<DilemmasResponse>;
}
