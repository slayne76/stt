# Automatic STT Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manual `STT_SESSION_COOKIE` workflow with automatic
login via `STT_EMAIL`/`STT_PASSWORD`: when the cached session is missing
or rejected by the STT API, the server logs in through the real six-hop
flow, persists the fresh session, and retries — transparently, behind
the existing Refresh button.

**Architecture:** Three new/changed server modules following this
codebase's `*Client.ts`/`*Cache.ts` convention — `authClient.ts` (the
login flow itself), `sessionCache.ts` (persists the current session
cookie across restarts), and a retry orchestration wired into the
existing `routes/player.ts`. `sttClient.ts`'s `fetchPlayerData` is
decoupled from `AppConfig` to take a cookie value directly.

**Tech Stack:** Node 24, Express, TypeScript (`server/tsconfig.json`:
`target: ES2023`, `lib: ["ES2023"]`, no DOM lib — `fetch`/`Response`/
`Headers` types come from `@types/node`, confirmed including
`Headers.getSetCookie()` via a standalone `tsc --noEmit` dry run before
this plan was written). No test framework in this project (deliberate,
repeated choice) — verification is `tsc`/`eslint` plus real, deliberate
live-login checks against the real STT/Disruptor Beam infrastructure
using the real `STT_EMAIL`/`STT_PASSWORD` already in `server/.env`.

## Global Constraints

- Every error message string in Task 2/3's code must match the spec's
  four messages **verbatim** (see each task's exact code below) — the
  user explicitly asked for these to be unmistakably distinct from
  generic upstream-error text.
- `STT_SESSION_COOKIE` is removed entirely from `config.ts` and
  `.env.example` — no fallback/manual-override code path.
- No proactive expiry checking anywhere — `readSessionCookie()`'s
  result is only ever validated reactively, by trying it and catching a
  `401`/`403` from the STT API. Nothing may treat `obtainedAt` as a TTL.
- At most one login attempt and one retry per `/player` or
  `/player/refresh` request — no retry loops.
- No fetch timeouts added to the new `authClient.ts` requests — matches
  the existing, already-deferred gap in `sttClient.ts`/`assetClient.ts`
  (only `catalogClient.ts` has one today); do not add timeout handling
  here as scope creep.
- No login rate-limiting/cooldown, no multi-account support — YAGNI,
  single-user app.
- Zero frontend code changes — `PlayerDataContext`/`playerApi.ts`
  already render whatever message string the backend's `{error, code}`
  body carries.
- Real login attempts against Disruptor Beam's production system are
  expensive/impactful in a way a normal function call isn't — run each
  verification step deliberately, once, not in a retry loop or a script
  that calls the real login endpoint repeatedly.

---

### Task 1: Config + session cache

**Files:**
- Modify: `server/.env.example`
- Modify: `server/src/config.ts`
- Create: `server/src/sessionCache.ts`

**Interfaces:**
- Produces: `AppConfig { sttEmail: string; sttPassword: string; sttClientApi: string }` and `loadConfig(): AppConfig` from `./config`; `readSessionCookie(): string | null` and `writeSessionCookie(cookie: string): void` from `./sessionCache`.
- Consumes: nothing from other tasks (foundational, no dependencies).

- [ ] **Step 1: Update `server/.env.example`**

Replace its entire contents with:

```
# Credentials for automatic STT login (games.disruptorbeam.com/login,
# the "Sign in with Dbid" flow). Used server-side only, never sent to
# the frontend.
STT_EMAIL=
STT_PASSWORD=

# STT client API version query param (see the game's network requests).
STT_CLIENT_API=33
```

- [ ] **Step 2: Update `server/src/config.ts`**

Replace its entire contents with:

```ts
import 'dotenv/config';

export interface AppConfig {
  sttEmail: string;
  sttPassword: string;
  sttClientApi: string;
}

export function loadConfig(): AppConfig {
  return {
    sttEmail: process.env.STT_EMAIL ?? '',
    sttPassword: process.env.STT_PASSWORD ?? '',
    sttClientApi: process.env.STT_CLIENT_API ?? '33',
  };
}
```

- [ ] **Step 3: Create `server/src/sessionCache.ts`**

```ts
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

const CACHE_PATH = 'data/session-cache.json';

interface SessionCache {
  sessionCookie: string;
  obtainedAt: string;
}

export function readSessionCookie(): string | null {
  if (!existsSync(CACHE_PATH)) {
    return null;
  }
  try {
    const raw = readFileSync(CACHE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as SessionCache;
    return typeof parsed.sessionCookie === 'string' ? parsed.sessionCookie : null;
  } catch {
    return null;
  }
}

export function writeSessionCookie(cookie: string): void {
  mkdirSync(dirname(CACHE_PATH), { recursive: true });
  const data: SessionCache = { sessionCookie: cookie, obtainedAt: new Date().toISOString() };
  writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), 'utf-8');
}
```

Note the shape guard on read (`typeof parsed.sessionCookie === 'string'`)
— this project was bitten once before by an un-guarded cache read
crashing the whole app on a malformed cache file (see
`docs/PROJECT_STATE.md`'s "Missing 4 Stars tables" section); every cache
reader in this codebase now guards its shape, and this new one follows
the same pattern from the start.

- [ ] **Step 4: Verify with a throwaway script**

Create `server/scratch-verify-session-cache.ts`:

```ts
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { readSessionCookie, writeSessionCookie } from './src/sessionCache';

function main(): void {
  if (existsSync('data/session-cache.json')) unlinkSync('data/session-cache.json');

  const missing = readSessionCookie();
  if (missing !== null) throw new Error(`expected null for missing cache file, got: ${missing}`);

  writeSessionCookie('test-cookie-value-123');
  const roundTrip = readSessionCookie();
  if (roundTrip !== 'test-cookie-value-123') {
    throw new Error(`expected round-trip to return the written cookie, got: ${roundTrip}`);
  }

  writeFileSync('data/session-cache.json', JSON.stringify({ notSessionCookie: 'oops' }));
  const malformed = readSessionCookie();
  if (malformed !== null) throw new Error(`expected null for malformed cache shape, got: ${malformed}`);

  unlinkSync('data/session-cache.json');
  console.log('sessionCache verification: all 3 assertions passed');
}

main();
```

Run from the `server/` directory (the module's relative `CACHE_PATH`
resolves against the process's working directory, matching how
`cache.ts`/`catalogCache.ts` already work):

```bash
cd server
npx tsx scratch-verify-session-cache.ts
```

Expected output: `sessionCache verification: all 3 assertions passed`
with no thrown error.

- [ ] **Step 5: Delete the throwaway script**

```bash
rm server/scratch-verify-session-cache.ts
```

- [ ] **Step 6: Build and lint**

```bash
npm run build -w server
npm run lint -w server
```

Expected: both exit cleanly (no `tsc` errors, no new ESLint
errors/warnings).

- [ ] **Step 7: Commit**

```bash
git add server/.env.example server/src/config.ts server/src/sessionCache.ts
git commit -m "Add session cache and switch config to email/password

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: The login flow (`authClient.ts`)

**Files:**
- Create: `server/src/authClient.ts`

**Interfaces:**
- Produces: `loginAndGetSessionCookie(email: string, password: string): Promise<string>` from `./authClient` — resolves to the authenticated `_startrek_session` cookie value, or throws `UpstreamAuthError` with one of the exact messages below.
- Consumes: `UpstreamAuthError` from `./errors` (pre-existing, unchanged — see `server/src/errors.ts`).

This task does not depend on Task 1 — it can be implemented and verified
independently, using real credentials directly.

- [ ] **Step 1: Create `server/src/authClient.ts`**

```ts
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

function locationOf(response: Response, hop: string): string {
  const location = response.headers.get('location');
  if (!location) throw unexpectedResponse(hop, response.status);
  return location;
}

export async function loginAndGetSessionCookie(email: string, password: string): Promise<string> {
  const jar: CookieJar = {};

  // Hop 1: initiate the OAuth flow
  const hop1 = await manualFetch(DBID_AUTH_URL, jar);
  if (hop1.status !== 302) throw unexpectedResponse('dbid auth init', hop1.status);
  const oauthAuthorizeUrl = locationOf(hop1, 'dbid auth init');

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
  // Observed flaky once during design research without a Referer header; sending it (real browser
  // behavior for this navigation) plus one defensive retry on 404 covers the observed failure mode.
  let hop5 = await manualFetch(oauthAuthorizeUrl, jar, { referer: LOGIN_PAGE_URL });
  if (hop5.status === 404) {
    await sleep(300);
    hop5 = await manualFetch(oauthAuthorizeUrl, jar, { referer: LOGIN_PAGE_URL });
  }
  if (hop5.status !== 302) throw unexpectedResponse('oauth2 authorize', hop5.status);
  const callbackUrl = locationOf(hop5, 'oauth2 authorize');

  // Hop 6: complete the callback — this is where the real, authenticated session cookie appears
  const hop6 = await manualFetch(callbackUrl, jar);
  if (hop6.status !== 302) throw unexpectedResponse('OAuth callback', hop6.status);
  const sessionCookie = jar['_startrek_session'];
  if (!sessionCookie) throw unexpectedResponse('OAuth callback', hop6.status);
  return sessionCookie;
}
```

- [ ] **Step 2: Verify with a throwaway script using real credentials**

Create `server/scratch-verify-auth-client.ts`:

```ts
import 'dotenv/config';
import { loginAndGetSessionCookie } from './src/authClient';
import { UpstreamAuthError } from './src/errors';

async function main(): Promise<void> {
  const email = process.env.STT_EMAIL;
  const password = process.env.STT_PASSWORD;
  if (!email || !password) {
    throw new Error('Set STT_EMAIL and STT_PASSWORD in server/.env before running this script.');
  }

  // 1. Real login should succeed and return a plausible cookie
  const cookie = await loginAndGetSessionCookie(email, password);
  if (typeof cookie !== 'string' || cookie.length === 0) {
    throw new Error('expected a non-empty session cookie string');
  }
  console.log('Got session cookie:', cookie.slice(0, 6) + '...(' + cookie.length + ' chars)');

  // 2. Confirm the cookie actually works against the real player endpoint
  const playerResponse = await fetch('https://app.startrektimelines.com/player?client_api=33&only_read_state=true', {
    headers: { Cookie: `_startrek_session=${cookie}`, Accept: 'application/json' },
  });
  if (playerResponse.status !== 200) {
    throw new Error(`expected 200 from /player, got ${playerResponse.status}`);
  }
  console.log('/player status:', playerResponse.status);

  // 3. Bad credentials should throw the specific message
  try {
    await loginAndGetSessionCookie(email, 'deliberately-wrong-password');
    throw new Error('expected loginAndGetSessionCookie to throw for bad credentials');
  } catch (err) {
    if (!(err instanceof UpstreamAuthError)) throw err;
    if (!err.message.includes('Disruptor Beam rejected the email/password')) {
      throw new Error(`unexpected error message: ${err.message}`);
    }
    console.log('Bad-credentials path correctly threw:', err.message);
  }

  console.log('authClient verification: all assertions passed');
}

void main();
```

Run from the `server/` directory — **this makes two real login attempts
against the live Disruptor Beam/STT infrastructure (one success, one
deliberate failure); run it once, not in a loop:**

```bash
cd server
npx tsx scratch-verify-auth-client.ts
```

Expected output ends with `authClient verification: all assertions
passed`, with a real `/player status: 200` line partway through.

- [ ] **Step 3: Delete the throwaway script**

```bash
rm server/scratch-verify-auth-client.ts
```

- [ ] **Step 4: Build and lint**

```bash
npm run build -w server
npm run lint -w server
```

Expected: both exit cleanly.

- [ ] **Step 5: Commit**

```bash
git add server/src/authClient.ts
git commit -m "Add the automatic STT login flow (authClient.ts)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Wire it into `/api/player` (retry orchestration)

**Files:**
- Modify: `server/src/sttClient.ts`
- Modify: `server/src/routes/player.ts`

**Interfaces:**
- Consumes: `AppConfig` (`sttEmail`, `sttPassword`, `sttClientApi`) and `readSessionCookie`/`writeSessionCookie` from Task 1; `loginAndGetSessionCookie(email, password): Promise<string>` from Task 2.
- Produces: `fetchPlayerData(sessionCookie: string, clientApi: string): Promise<unknown>` from `./sttClient` (signature change from the current `fetchPlayerData(config: AppConfig)` — this is the one breaking change to an existing exported function in this plan).

This task depends on both Task 1 and Task 2 being complete.

- [ ] **Step 1: Update `server/src/sttClient.ts`**

Replace its entire contents with:

```ts
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

  return response.json();
}
```

Note: this inner message is never shown to the user directly — the
retry orchestration in Step 2 below always catches it internally and
either retries silently (cached-cookie path) or replaces it with a more
specific message (fresh-login-still-rejected path). It only matters for
triggering the `instanceof UpstreamAuthError` check.

**Amendment (discovered live during Task 3 execution, approved by the
user before Task 3 completed):** the code above assumes an invalid
session always produces `401`/`403`. Live testing found this false for
a malformed cookie value — the STT API instead returned `HTTP 200` with
a stub body (`{"email":null,"password":null}`), which the status-only
check above would silently accept as success and cache as if real. Fix:
also validate the response actually contains a player identity, using
the exact same convention the client already relies on in
`client/src/lib/extractPlayerIdentity.ts` (`player.id`/`player.dbid`).
The corrected, actual final version of this file is:

```ts
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
```

This is the version that must actually be committed for this task —
treat this amendment as authoritative over the original code block
above.

- [ ] **Step 2: Update `server/src/routes/player.ts`**

Replace its entire contents with:

```ts
import { Router, type Response } from 'express';
import type { AppConfig } from '../config';
import { fetchPlayerData } from '../sttClient';
import { loginAndGetSessionCookie } from '../authClient';
import { readPlayerCache, writePlayerCache } from '../cache';
import { readSessionCookie, writeSessionCookie } from '../sessionCache';
import { UpstreamAuthError, UpstreamError } from '../errors';

export function createPlayerRouter(config: AppConfig): Router {
  const router = Router();

  router.get('/player', async (_req, res) => {
    const cached = readPlayerCache();
    if (cached !== null) {
      res.json(cached);
      return;
    }
    await refreshAndRespond(config, res);
  });

  router.post('/player/refresh', async (_req, res) => {
    await refreshAndRespond(config, res);
  });

  return router;
}

async function getPlayerDataWithAutoLogin(config: AppConfig): Promise<unknown> {
  const cachedCookie = readSessionCookie();
  if (cachedCookie !== null) {
    try {
      return await fetchPlayerData(cachedCookie, config.sttClientApi);
    } catch (err) {
      if (!(err instanceof UpstreamAuthError)) {
        throw err;
      }
      // fall through to a fresh login below
    }
  }

  const freshCookie = await loginAndGetSessionCookie(config.sttEmail, config.sttPassword);
  writeSessionCookie(freshCookie);

  try {
    return await fetchPlayerData(freshCookie, config.sttClientApi);
  } catch (err) {
    if (err instanceof UpstreamAuthError) {
      throw new UpstreamAuthError(
        'Automatic STT login succeeded, but the STT player API still rejected the new session — check STT_CLIENT_API or report this as a bug.'
      );
    }
    throw err;
  }
}

async function refreshAndRespond(config: AppConfig, res: Response): Promise<void> {
  try {
    const data = await getPlayerDataWithAutoLogin(config);
    writePlayerCache(data);
    res.json(data);
  } catch (err) {
    if (err instanceof UpstreamAuthError) {
      res.status(502).json({ error: err.message, code: 'UPSTREAM_AUTH_FAILED' });
      return;
    }
    if (err instanceof UpstreamError) {
      res.status(502).json({ error: err.message, code: 'UPSTREAM_ERROR' });
      return;
    }
    res.status(502).json({ error: 'Unexpected error fetching player data', code: 'UPSTREAM_ERROR' });
  }
}
```

- [ ] **Step 3: Build and lint**

```bash
npm run build -w server
npm run lint -w server
```

Expected: both exit cleanly — this is also where a stale reference to
the old `fetchPlayerData(config)` signature (if any survived) would
surface as a `tsc` error.

- [ ] **Step 4: Grep check — `STT_SESSION_COOKIE` is fully gone**

```bash
grep -rn "STT_SESSION_COOKIE" server/src server/.env.example
```

Expected: no output (no matches).

- [ ] **Step 5: Real end-to-end verification — cold start**

Ensure `server/data/session-cache.json` does not exist, then start the
real dev server and hit the player endpoint:

```bash
rm -f server/data/session-cache.json
npm run dev
```

In a separate terminal, once the server is up:

```bash
curl -s http://127.0.0.1:3001/api/player | head -c 300
echo
cat server/data/session-cache.json
```

Expected: the `curl` output is real player JSON (not an error body,
`display_name`/`money`/`honor`-shaped), and `session-cache.json` now
exists with a `{ "sessionCookie": "...", "obtainedAt": "..." }` shape.
This makes one real login attempt.

- [ ] **Step 6: Real end-to-end verification — reactive re-login**

With the server still running and `session-cache.json` now present,
corrupt the cached cookie to force a rejection, then hit refresh:

```bash
node -e "
const fs = require('node:fs');
const path = 'server/data/session-cache.json';
const data = JSON.parse(fs.readFileSync(path, 'utf-8'));
data.sessionCookie = 'deliberately-invalid-cookie-value';
fs.writeFileSync(path, JSON.stringify(data, null, 2));
"
curl -s -X POST http://127.0.0.1:3001/api/player/refresh | head -c 300
echo
cat server/data/session-cache.json
```

Expected: the `curl` output is real player JSON again (not a `502`
error) — confirming the `401`/`403` from the corrupted cookie was
detected and a fresh login transparently replaced it — and
`session-cache.json`'s `sessionCookie` value has changed from the
deliberately-invalid one. This makes one real login attempt.

- [ ] **Step 7: Real end-to-end verification — bad-credentials error path**

Stop the dev server. Temporarily set `STT_PASSWORD` in `server/.env` to
an incorrect value (do not commit this change), delete the session
cache so a fresh login is forced, restart the server, and hit refresh:

```bash
rm -f server/data/session-cache.json
# manually edit server/.env: change STT_PASSWORD to an incorrect value
npm run dev
```

In a separate terminal:

```bash
curl -s -X POST http://127.0.0.1:3001/api/player/refresh
```

Expected: a `502` response with body
`{"error":"Automatic STT login failed: Disruptor Beam rejected the
email/password (check STT_EMAIL and STT_PASSWORD in server/.env).","code":"UPSTREAM_AUTH_FAILED"}`.

Then restore the real password in `server/.env` (do not leave the
incorrect value in place), delete the session cache once more so the
next real request logs in cleanly, and confirm one final real request
succeeds:

```bash
rm -f server/data/session-cache.json
# manually restore the real STT_PASSWORD in server/.env
```

Restart the dev server and confirm `curl -s http://127.0.0.1:3001/api/player`
returns real player JSON again. Stop the dev server once confirmed.

- [ ] **Step 8: Commit**

```bash
git add server/src/sttClient.ts server/src/routes/player.ts
git commit -m "Wire automatic login into the player refresh route

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** all six login hops (Task 2), the retry orchestration
  and its exact bounded-retry shape (Task 3), all four verbatim error
  messages (Tasks 2 and 3), the config/.env changes and full removal of
  `STT_SESSION_COOKIE` (Task 1 + Task 3's grep check), session
  persistence across restarts (Task 1, exercised live in Task 3 Step 5),
  and all five items from the spec's testing plan (Task 3 Steps 4-7,
  Task 1/2's own throwaway-script checks) are each covered by a
  concrete task step.
- **No placeholders:** every code block is complete and copy-pasteable;
  no "add error handling"-style steps; every verification step names the
  exact command and exact expected output.
- **Type consistency:** `fetchPlayerData(sessionCookie: string, clientApi: string)` matches its one call site in Task 3's `routes/player.ts` exactly (both `fetchPlayerData(cachedCookie, config.sttClientApi)` and `fetchPlayerData(freshCookie, config.sttClientApi)`). `loginAndGetSessionCookie(email: string, password: string): Promise<string>` matches its Task 3 call site `loginAndGetSessionCookie(config.sttEmail, config.sttPassword)`. `AppConfig`'s three fields (`sttEmail`, `sttPassword`, `sttClientApi`) are used consistently across Task 1's `config.ts` and Task 3's `routes/player.ts` — no leftover reference to the removed `sttSessionCookie` field anywhere (verified by Task 3 Step 4's grep).
- **Dry-run validated:** `Headers.getSetCookie()` (the one real
  type-safety risk in this plan, given this project's DOM-lib-free
  `tsconfig.json`) was confirmed to type-check cleanly under this
  project's exact compiler settings before this plan was written, not
  left as an assumption for the implementer to discover.
