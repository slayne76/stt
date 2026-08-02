import type { PlayerData } from '../types/player';

export interface ApiErrorBody {
  error: string;
  code: 'UPSTREAM_AUTH_FAILED' | 'UPSTREAM_ERROR';
}

export class PlayerApiError extends Error {
  code: ApiErrorBody['code'];

  constructor(body: ApiErrorBody) {
    super(body.error);
    this.code = body.code;
  }
}

async function parsePlayerResponse(response: Response): Promise<PlayerData> {
  const body = await response.json();
  if (!response.ok) {
    throw new PlayerApiError(body as ApiErrorBody);
  }
  return body as PlayerData;
}

export async function fetchPlayer(): Promise<PlayerData> {
  const response = await fetch('/api/player');
  return parsePlayerResponse(response);
}

export async function refreshPlayer(): Promise<PlayerData> {
  const response = await fetch('/api/player/refresh', { method: 'POST' });
  return parsePlayerResponse(response);
}
