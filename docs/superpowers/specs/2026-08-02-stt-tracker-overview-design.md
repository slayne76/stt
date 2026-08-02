# STT Tracker — Overview Section Design

Date: 2026-08-02

## Purpose

A locally-run application for tracking data and statistics for the game
*Star Trek Timelines* (STT). The app pulls the player's own data from the
official game API and presents it in various sections/routes. This spec
covers the foundational slice: project scaffolding, the data-fetching
pipeline (with a static/manual session token), and a first "Overview"
section showing basic player identity fields (Player ID, DBID) in an MUI
table. Later specs will add sections that filter/analyze character data,
and eventually automate token acquisition via username/password login.

## Non-goals (this spec)

- Automatic login / token refresh (username+password) — token is supplied
  manually via `.env` for now.
- Character filtering/statistics UI — only the Overview identity table.
- Tests / CI — deferred until there's non-trivial logic to test.
- Production build/deployment — this is a local dev tool for now.

## Why a backend is needed

`app.startrektimelines.com` is not expected to return
`Access-Control-Allow-Origin` headers for arbitrary local origins, so a
browser-only app cannot call it directly. A small local Node/Express
backend proxies the request, holds the session token, and will be the
natural home for future auto-login (which requires posting credentials
server-side, never from browser JS).

## Architecture

Monorepo using npm workspaces:

```
stt/
  package.json          # root, workspaces: ["server", "client"], concurrently dev script
  server/                # Node 24 + TypeScript + Express
  client/                # Vite 8 + React 19 + TypeScript + MUI
  docs/
```

Dev workflow: `npm run dev` at the root runs both the Express server
(port 3001) and Vite dev server (port 5173) via `concurrently`. Vite's
dev server proxies `/api/*` to the Express server, so the browser only
talks to one origin (`localhost:5173`) — avoiding CORS entirely and
mirroring how a future combined build would work.

## Backend (`server/`)

- **Stack**: Node 24, TypeScript, Express, native global `fetch` (Node 24
  ships it — no extra HTTP client dependency).
- **Config**: `.env` (gitignored), loaded via `dotenv`:
  - `STT_SESSION_COOKIE` — value of the `_startrek_session` cookie.
  - `STT_CLIENT_API` — API version query param, default `33`.
  - `PORT` — backend port, default `3001`.
  - `.env.example` committed with placeholder values and comments.
- **Upstream call**: replicates the provided curl —
  `GET https://app.startrektimelines.com/player?client_api=<version>&only_read_state=true`
  with header `Cookie: _startrek_session=<value>` and
  `Accept: application/json` (we control this server-side call directly,
  so no need to mimic full browser headers).
- **Cache**: raw JSON response written to `server/data/player-cache.json`
  (gitignored). Single-user local tool — a flat file is sufficient, no
  database.
- **Endpoints**:
  - `GET /api/player` — returns cached JSON if the cache file exists,
    otherwise performs a live fetch, writes the cache, and returns it.
  - `POST /api/player/refresh` — always performs a live fetch, overwrites
    the cache, and returns the fresh JSON.
- **Error handling**: upstream failures are translated into a typed JSON
  error body plus an appropriate HTTP status:
  - Upstream `401`/`403` → `502` with
    `{ error: string, code: "UPSTREAM_AUTH_FAILED" }` (token likely
    expired — message tells the user to update `.env`).
  - Any other upstream/network failure → `502` with
    `{ error: string, code: "UPSTREAM_ERROR" }`.

## Frontend (`client/`)

- **Stack**: Vite 8, React 19, TypeScript, MUI (free/community components
  only), React Router.
- **Layout shell**: `AppLayout` component — MUI `AppBar` (top) + `Drawer`
  (side nav) wrapping a React Router `<Outlet />`. One nav entry for now:
  "Overview" (`/`).
- **Data fetching**: `usePlayerData()` hook — calls `GET /api/player` on
  mount, exposes `{ data, loading, error, refresh }` via plain
  `useState`/`useEffect` (`refresh` calls `POST /api/player/refresh`).
  No React Query for this single-endpoint slice; revisit if a later
  section needs shared caching across routes.
- **Overview page** (`/`):
  - "Refresh" button (calls `refresh()`).
  - Loading spinner while fetching.
  - MUI `Alert` (severity error) showing the backend's error message when
    `error` is set (e.g. surfacing the "token expired" case).
  - On success: MUI `Table` with two columns (Field / Value), one row
    per known field — `Player ID`, `DBID` — read from the response via a
    typed `PlayerData` interface (only the fields we currently use, not
    the full payload shape).
- **Types**: `client/src/types/player.ts` defines `PlayerData` covering
  just the identity fields needed now; extended incrementally as more
  sections are added.

## Tooling

- TypeScript strict mode in both `server/` and `client/`.
- ESLint flat config (`eslint.config.js`) at each workspace: shared base
  rules, plus React-specific plugin rules in `client/`.
- Git: `.gitignore` covers `node_modules`, `dist`, `.env`,
  `server/data/*cache*.json`. `.env.example` is committed.
- No test framework yet — added when a section has real logic (e.g.
  character-filtering rules) worth unit-testing.

## Open questions for later specs

- Exact JSON path for the Player ID / DBID fields will be confirmed once
  we inspect a real payload from the live API (schema nesting in STT's
  player object is not something we're guessing blind on — first run
  will reveal it, and the hook/table will be adjusted then).
- Character data filtering criteria — to be defined in a follow-up spec
  once this foundational slice is working end-to-end.
