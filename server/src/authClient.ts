import { UpstreamAuthError } from './errors';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const ACCEPT_HTML = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8';

const DBID_AUTH_URL = 'https://app.startrektimelines.com/users/auth/dbid';
const LOGIN_PAGE_URL = 'https://games.disruptorbeam.com/login';
const LOGIN_POST_URL = 'https://games.disruptorbeam.com/auth/authenticate/userpass';

type CookieJar = Record<string, string>;

function cookieHeader(jar: CookieJar): string {
  return Object.entries(jar)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

function updateJar(jar: CookieJar, response: Response): void {
  for (const raw of response.headers.getSetCookie()) {
    const pair = raw.split(';')[0];
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    jar[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ManualFetchOptions {
  method?: string;
  body?: string;
  referer?: string;
}

async function manualFetch(url: string, jar: CookieJar, options: ManualFetchOptions = {}): Promise<Response> {
  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    Accept: ACCEPT_HTML,
    Cookie: cookieHeader(jar),
  };
  if (options.referer) headers['Referer'] = options.referer;
  if (options.body) headers['Content-Type'] = 'application/x-www-form-urlencoded';

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body,
      redirect: 'manual',
    });
  } catch (cause) {
    throw new UpstreamAuthError(
      `Automatic STT login failed: network error contacting the login flow (${(cause as Error).message}).`
    );
  }
  updateJar(jar, response);
  return response;
}

function unexpectedResponse(hop: string, status: number): UpstreamAuthError {
  return new UpstreamAuthError(
    `Automatic STT login failed: the login flow returned an unexpected response at step '${hop}' (HTTP ${status}). The login process may have changed upstream.`
  );
}

function locationOf(response: Response, hop: string, requestUrl: string): string {
  const location = response.headers.get('location');
  if (!location) throw unexpectedResponse(hop, response.status);
  return new URL(location, requestUrl).toString();
}

export async function loginAndGetSessionCookie(email: string, password: string): Promise<string> {
  const jar: CookieJar = {};

  // Hop 1: initiate the OAuth flow
  const hop1 = await manualFetch(DBID_AUTH_URL, jar);
  if (hop1.status !== 302) throw unexpectedResponse('dbid auth init', hop1.status);
  const oauthAuthorizeUrl = locationOf(hop1, 'dbid auth init', DBID_AUTH_URL);

  // Hop 2: hit the OAuth authorize endpoint — expect a bounce to the login page
  const hop2 = await manualFetch(oauthAuthorizeUrl, jar);
  if (hop2.status !== 303) throw unexpectedResponse('oauth2 authorize (initial)', hop2.status);

  // Hop 3: load the login page itself (matches real browser behavior)
  await manualFetch(LOGIN_PAGE_URL, jar);

  // Hop 4: submit credentials
  const body = new URLSearchParams({ username: email, password }).toString();
  const hop4 = await manualFetch(LOGIN_POST_URL, jar, { method: 'POST', body, referer: LOGIN_PAGE_URL });
  if (hop4.status === 400) {
    throw new UpstreamAuthError(
      'Automatic STT login failed: Disruptor Beam rejected the email/password (check STT_EMAIL and STT_PASSWORD in server/.env).'
    );
  }
  if (hop4.status !== 303) throw unexpectedResponse('login POST', hop4.status);

  // Hop 5: re-hit the OAuth authorize endpoint, now authenticated — expect the authorization code.
  // Observed flaky during design research and again during implementation — different status
  // codes (404, then 303) but the same plausible root cause: session-store propagation lag
  // between the login POST (hop 4) and this immediately-following request. One defensive
  // retry after a short delay covers both observed failure modes.
  let hop5 = await manualFetch(oauthAuthorizeUrl, jar, { referer: LOGIN_PAGE_URL });
  if (hop5.status !== 302) {
    await sleep(300);
    hop5 = await manualFetch(oauthAuthorizeUrl, jar, { referer: LOGIN_PAGE_URL });
  }
  if (hop5.status !== 302) throw unexpectedResponse('oauth2 authorize', hop5.status);
  const callbackUrl = locationOf(hop5, 'oauth2 authorize', oauthAuthorizeUrl);

  // Hop 6: complete the callback — this is where the real, authenticated session cookie appears
  const hop6 = await manualFetch(callbackUrl, jar);
  if (hop6.status !== 302) throw unexpectedResponse('OAuth callback', hop6.status);
  const sessionCookie = hop6.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .find((p) => p.startsWith('_startrek_session='))
    ?.slice('_startrek_session='.length);
  if (!sessionCookie) throw unexpectedResponse('OAuth callback', hop6.status);
  return sessionCookie;
}
