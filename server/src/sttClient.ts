import type { AppConfig } from './config';
import { UpstreamAuthError, UpstreamError } from './errors';

export async function fetchPlayerData(config: AppConfig): Promise<unknown> {
  if (!config.sttSessionCookie) {
    throw new UpstreamAuthError('STT_SESSION_COOKIE is not set in server/.env');
  }

  const url = `https://app.startrektimelines.com/player?client_api=${config.sttClientApi}&only_read_state=true`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Cookie: `_startrek_session=${config.sttSessionCookie}`,
        Accept: 'application/json',
      },
    });
  } catch (cause) {
    throw new UpstreamError(`Network error contacting STT API: ${(cause as Error).message}`);
  }

  if (response.status === 401 || response.status === 403) {
    throw new UpstreamAuthError(
      `STT API rejected the session cookie (HTTP ${response.status}). It has likely expired — update STT_SESSION_COOKIE in server/.env.`
    );
  }

  if (!response.ok) {
    throw new UpstreamError(`STT API returned HTTP ${response.status}`);
  }

  return response.json();
}
