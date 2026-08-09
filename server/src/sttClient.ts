import { UpstreamAuthError, UpstreamError } from './errors';

export async function fetchPlayerData(sessionCookie: string, clientApi: string): Promise<unknown> {
  const url = `https://app.startrektimelines.com/player?client_api=${clientApi}&only_read_state=true`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Cookie: `_startrek_session=${sessionCookie}`,
        Accept: 'application/json',
      },
    });
  } catch (cause) {
    throw new UpstreamError(`Network error contacting STT API: ${(cause as Error).message}`);
  }

  if (response.status === 401 || response.status === 403) {
    throw new UpstreamAuthError(`STT API rejected the session (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    throw new UpstreamError(`STT API returned HTTP ${response.status}`);
  }

  const data = (await response.json()) as { player?: { id?: unknown; dbid?: unknown } };
  if (!isDisplayable(data.player?.id) && !isDisplayable(data.player?.dbid)) {
    throw new UpstreamAuthError(
      'STT API returned HTTP 200 with no player identity in the response — the session is likely invalid despite the non-error status.'
    );
  }

  return data;
}

function isDisplayable(value: unknown): value is number | string {
  return typeof value === 'number' || typeof value === 'string';
}
