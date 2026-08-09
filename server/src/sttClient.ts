import type { AppConfig } from './config';
import { readSessionCookie } from './sessionCache';
import { UpstreamAuthError, UpstreamError } from './errors';

export async function fetchPlayerData(config: AppConfig): Promise<unknown> {
  const sessionCookie = readSessionCookie();
  if (!sessionCookie) {
    throw new UpstreamAuthError('Session cookie not found. Run automatic login first.');
  }

  const url = `https://app.startrektimelines.com/player?client_api=${config.sttClientApi}&only_read_state=true`;

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
    throw new UpstreamAuthError(
      `STT API rejected the session cookie (HTTP ${response.status}). It has likely expired — re-run automatic login.`
    );
  }

  if (!response.ok) {
    throw new UpstreamError(`STT API returned HTTP ${response.status}`);
  }

  return response.json();
}
