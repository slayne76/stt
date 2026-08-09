# Automatic STT login — Design

**Date:** 2026-08-09
**Status:** Approved

## Problem

Today, `server/.env`'s `STT_SESSION_COOKIE` has to be pasted in by hand
(DevTools > Application > Cookies) every time it expires, with no known
expiry to plan around. This replaces that manual step with automatic
login: `STT_EMAIL`/`STT_PASSWORD` in `server/.env`, and the server logs
in and retrieves a fresh session on demand whenever the cached one is
rejected.

## Goal

- `server/.env` holds `STT_EMAIL`/`STT_PASSWORD` instead of
  `STT_SESSION_COOKIE`.
- The server persists whatever session cookie it currently holds across
  restarts (`server/data/session-cache.json`, gitignored like the
  existing player/catalog caches).
- Hitting the existing Refresh button (`POST /api/player/refresh`, and
  the same code path `GET /api/player` already falls through to on a
  cold cache): try the cached session first; if the STT API rejects it
  (`401`/`403`) — or there's no cached session yet — log in fresh,
  persist the new session, and retry once.
- Errors specific to this new flow (bad credentials, the login flow
  breaking upstream, a freshly-logged-in session still being rejected)
  surface on the frontend with an unmistakable `"Automatic STT
  login..."` message, distinct from the existing generic upstream-error
  text — **no frontend code changes**, since `PlayerDataContext`/
  `playerApi.ts` already render whatever message string the backend's
  `{error, code}` body carries.

## Non-goals

- No fetch timeouts on the new login requests — timeout coverage is
  already inconsistent across this codebase's external clients
  (`catalogClient.ts` has `AbortSignal.timeout(30_000)`, but
  `sttClient.ts` and `assetClient.ts` don't, an existing, already-deferred
  backlog item); the login flow inherits the same accepted gap as
  `sttClient.ts`/`assetClient.ts` rather than fixing it here as scope
  creep.
- No login-attempt rate-limiting/cooldown — single-user, loopback-only
  app, refreshed by hand occasionally. YAGNI.
- No manual-cookie-override fallback (`STT_SESSION_COOKIE` is removed
  entirely, not kept alongside `STT_EMAIL`/`STT_PASSWORD`) — confirmed
  with the user; simpler, one code path.
- No generic multi-account/multi-credential support — one email/password
  pair, matching how the app already assumes a single player.
- No proactive expiry checking — the `_startrek_session` cookie carries
  no `Max-Age`/`Expires` at all (verified live), so "valid" can only be
  determined reactively, by trying it and seeing if the API rejects it.

## The real login flow — verified mechanics

Confirmed live, end-to-end, against the real STT/Disruptor Beam/Tilting
Point infrastructure (a full authorization-code-style OAuth dance across
two domains, six hops). This section is the literal reference an
implementer needs — nothing here should be re-derived or re-guessed.

**Shared headers, sent on every request in the chain:**
```
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8
```
The `Accept` header matters: this API content-negotiates, and a bare
`Accept: */*` (curl/fetch's default) gets treated as an API client and
returns `401 {"error":"Credentials required"}` JSON instead of the
expected interactive HTML/redirect flow.

**Cookie handling:** Node's `fetch` has no built-in cookie jar. Every
request must explicitly send `Cookie: <accumulated jar>` built from
whatever `Set-Cookie` headers prior hops in the chain returned. A flat
`{ [name]: string }` object is sufficient — the two domains involved
never share a cookie name, so there's no real domain-scoping collision
risk a fuller cookie-jar library would protect against. Every fetch call
uses `redirect: 'manual'` (not `'follow'`) so each hop's `Location` and
`Set-Cookie` can be inspected — a plain "follow everything" fetch can't
intercept the point where a POST must be injected mid-chain (hop 4).

**Hop 1 — GET `https://app.startrektimelines.com/users/auth/dbid`**
Expect: `302`, `Location` → a `games.disruptorbeam.com/oauth2/auth?...`
URL carrying `client_id`, `redirect_uri`, `response_type=code`, `state`.
Capture any `Set-Cookie` (an anonymous `_startrek_session` appears here
but gets superseded later — harmless to store, not load-bearing).

**Hop 2 — GET `<the oauth2/auth URL from hop 1>`**
Expect: `303`, `Location` → `https://games.disruptorbeam.com/login`.
Capture `Set-Cookie: db_oauth_id=...` — **this cookie's value encodes the
pending OAuth request's return URL** (`original-url=...`), which is what
lets the login POST in hop 4 know to redirect back into the OAuth chain
instead of a generic default page. This is the step a naive
"just POST straight to the login form" implementation would skip, and
the whole reason a direct POST fails.

**Hop 3 — GET `https://games.disruptorbeam.com/login`**
Send `Cookie: db_oauth_id=<from hop 2>`. Expect: `200`. Matches real
browser behavior (load the page before submitting); the response only
clears an unrelated flash-message cookie, nothing load-bearing, but real
login sessions load this page first and there's no verified guarantee
skipping it is safe.

**Hop 4 — POST `https://games.disruptorbeam.com/auth/authenticate/userpass`**
```
Content-Type: application/x-www-form-urlencoded
Referer: https://games.disruptorbeam.com/login
Cookie: db_oauth_id=<current value>
Body: username=<email>&password=<password>   (URL-encoded, e.g. via URLSearchParams)
```
- **Success:** `303`, `Location` → back to hop 2's `oauth2/auth` URL
  (same `state`). Capture new `Set-Cookie: db_oauth_id=...` and
  `Set-Cookie: dbid_ss=...` (7-day `Max-Age`, confirmed — this is the
  Disruptor Beam *account* session, separate from the STT game session).
- **Bad credentials:** `400`, the login page re-rendered (no redirect).
  → throw `UpstreamAuthError`: *"Automatic STT login failed: Disruptor
  Beam rejected the email/password (check STT_EMAIL and STT_PASSWORD in
  server/.env)."*
- **Anything else:** → throw `UpstreamAuthError`: *"Automatic STT login
  failed: the login flow returned an unexpected response at step
  'login POST'. The login process may have changed upstream."*

**Hop 5 — GET `<the oauth2/auth URL again, same URL as hop 2's target>`**
Send `Cookie: db_oauth_id=..., dbid_ss=...` and
`Referer: https://games.disruptorbeam.com/login`. Expect: `302`,
`Location` → `https://app.startrektimelines.com/users/auth/dbid/callback?code=...&state=...`.
**Observed flaky once during research:** an identical request without
the `Referer` header (chained automatically via a redirect-follower
rather than issued as a fresh request) returned `404 Action not found`.
Sending `Referer` explicitly (real browser behavior for this navigation,
not a workaround) fixed it on retry — build it in from the start. As a
defensive net given the one observed flake, retry this specific hop once
after a short delay (~300ms) if it 404s, before treating it as a real
failure (`UpstreamAuthError`, hop name `'oauth2 authorize'`).

**Hop 6 — GET `<the callback URL from hop 5, with its code and state>`**
Expect: `302`, `Location` → `https://app.startrektimelines.com/` (safe
to ignore where this points — no need to follow further). **Capture
`Set-Cookie: _startrek_session=...` from this exact response — this is
the final, authenticated session value.** If this response isn't `302`,
or carries no `_startrek_session` cookie → throw `UpstreamAuthError`,
hop name `'OAuth callback'`.

**Return value:** the `_startrek_session` cookie value captured in hop 6.
Confirmed live against the real `/player` endpoint during research (real
`display_name`, `money`, `honor`, etc. came back, `200 OK`).

## Architecture

Three new/changed server modules, following this codebase's existing
`*Client.ts` / `*Cache.ts` naming convention (`sttClient.ts`/`cache.ts`,
`catalogClient.ts`/`catalogCache.ts`):

- **`server/src/authClient.ts`** (new) — exports
  `loginAndGetSessionCookie(email: string, password: string): Promise<string>`,
  implementing the six hops above end-to-end.
- **`server/src/sessionCache.ts`** (new) — mirrors `cache.ts`:
  `readSessionCookie(): string | null` /
  `writeSessionCookie(cookie: string): void`, persisted to
  `server/data/session-cache.json` (already covered by the existing
  `server/data/` gitignore entry) as `{ sessionCookie, obtainedAt }`.
  `obtainedAt` is diagnostic-only metadata — nothing may treat it as a
  TTL, since no real expiry is known (see Non-goals).
- **`server/src/sttClient.ts`** (changed) — `fetchPlayerData`'s
  signature changes from `(config: AppConfig)` to
  `(sessionCookie: string, clientApi: string)`, decoupling it from the
  whole config object so it can be called with either a cached or a
  freshly-obtained cookie without threading email/password through it.
  Its 401/403 → `UpstreamAuthError` behavior is otherwise unchanged.
- **`server/src/config.ts`** (changed) — `AppConfig` drops
  `sttSessionCookie`, gains `sttEmail: string` / `sttPassword: string`
  (from `STT_EMAIL`/`STT_PASSWORD`, both defaulting to `''` like the
  existing fields do).
- **`server/src/routes/player.ts`** (changed) — `refreshAndRespond`
  gains the retry orchestration (see below), replacing its current
  single `fetchPlayerData(config)` call. Kept inline in this file as a
  non-exported helper, matching how `refreshAndRespond` itself already
  lives there rather than in a separate service module — this is
  ~15-20 lines of glue, not enough to justify a new file on its own.

## Retry orchestration (`routes/player.ts`)

```
function getPlayerDataWithAutoLogin(config):
  cookie = readSessionCookie()
  if cookie is not null:
    try:
      return fetchPlayerData(cookie, config.sttClientApi)
    catch UpstreamAuthError:
      pass  // fall through to login below
  // either no cached cookie, or the cached one was rejected
  freshCookie = authClient.loginAndGetSessionCookie(config.sttEmail, config.sttPassword)
  writeSessionCookie(freshCookie)
  try:
    return fetchPlayerData(freshCookie, config.sttClientApi)
  catch UpstreamAuthError:
    throw UpstreamAuthError("Automatic STT login succeeded, but the STT
      player API still rejected the new session — check
      STT_CLIENT_API or report this as a bug.")
```

Bounded: at most one login attempt and one retry per request — no loop
risk. `authClient.loginAndGetSessionCookie` throwing (bad credentials,
broken flow, network error) propagates its own message directly, already
distinct per the "Login flow" section above.

This covers both `GET /api/player` (falls through to
`refreshAndRespond` on a cold player-data cache — e.g. first-ever run,
no `session-cache.json` yet either) and `POST /api/player/refresh` (the
Refresh button), since both already share `refreshAndRespond` today —
no route-shape changes needed.

## Error messages (frontend-visible, verbatim)

All four share an unmistakable `"Automatic STT login..."` lead-in,
distinct from the existing plain `"STT API returned HTTP <n>"` a
non-auth `UpstreamError` still produces:

1. *"Automatic STT login failed: Disruptor Beam rejected the
   email/password (check STT_EMAIL and STT_PASSWORD in server/.env)."*
2. *"Automatic STT login failed: the login flow returned an unexpected
   response at step '\<hop\>'. The login process may have changed
   upstream."* (`<hop>` ∈ `login POST`, `oauth2 authorize`,
   `OAuth callback`, or the equivalent for an unexpected status at any
   other hop)
3. *"Automatic STT login failed: network error contacting the login
   flow (\<message\>)."*
4. *"Automatic STT login succeeded, but the STT player API still
   rejected the new session — check STT_CLIENT_API or report this as a
   bug."*

All four are thrown as `UpstreamAuthError` (the existing error class —
no new error type needed, message text alone carries the distinction),
reaching the frontend via the existing `502 {error, code:
'UPSTREAM_AUTH_FAILED'}` response shape, unchanged.

## Config/.env changes

`server/.env.example`:
```
# Credentials for automatic STT login (games.disruptorbeam.com/login,
# the "Sign in with Dbid" flow). Used server-side only, never sent to
# the frontend.
STT_EMAIL=
STT_PASSWORD=

# STT client API version query param (see the game's network requests).
STT_CLIENT_API=33
```
`STT_SESSION_COOKIE` is removed from both `.env.example` and
`config.ts` entirely — no fallback/override path (confirmed with user).

## Testing/verification plan

No automated test framework exists in this project (deliberate, repeated
choice). Verification requires the real `STT_EMAIL`/`STT_PASSWORD`
already present in the main checkout's `server/.env` — the standard
worktree-seeding step for this project needs to copy that file into the
implementation worktree (same pattern already used for
`example-data.json`/session cookies on past features). Each verification
step below is a real login against Disruptor Beam's production system —
run each deliberately, not in a loop, out of courtesy to a third-party
service:

1. **Cold start:** with no `server/data/session-cache.json` present, hit
   `GET /api/player` (or load the app fresh) — confirm it triggers login
   automatically, real player data comes back, and
   `server/data/session-cache.json` now exists with a plausible cookie
   value.
2. **Reactive re-login:** with a cached `session-cache.json` present,
   overwrite its `sessionCookie` with a garbage value, then click
   Refresh — confirm the `401`/`403` is detected, login triggers
   automatically, and the request succeeds with a freshly-written
   `session-cache.json`.
3. **Bad-credentials error path:** temporarily set `STT_PASSWORD` to an
   incorrect value (worktree `.env` only, never committed) with no
   cached session, click Refresh — confirm the exact "Disruptor Beam
   rejected the email/password" message comes back in the `502` response
   and renders in the browser via the existing error UI.
4. **Cache-file shape check:** confirm `session-cache.json`'s structure
   (`{ sessionCookie, obtainedAt }`) by inspection after step 1.
5. **Grep check:** confirm `STT_SESSION_COOKIE` no longer appears
   anywhere in `server/src/` or `.env.example`.

## Files touched

- New: `server/src/authClient.ts`
- New: `server/src/sessionCache.ts`
- Modified: `server/src/config.ts`
- Modified: `server/src/sttClient.ts`
- Modified: `server/src/routes/player.ts`
- Modified: `server/.env.example`
