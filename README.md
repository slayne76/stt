# STT Tracker

Local tool for tracking data and statistics for Star Trek Timelines.

## Setup

1. `npm install` (root — installs both workspaces)
2. Copy `server/.env.example` to `server/.env` and fill in `STT_EMAIL` and
   `STT_PASSWORD` with your Star Trek Timelines login credentials.
3. `npm run dev` (root — starts the API server on :3001 and the Vite dev
   server on :5173 together)
4. Open http://localhost:5173

## Session login

The server logs in automatically using `STT_EMAIL`/`STT_PASSWORD` whenever
it has no cached session or the STT API rejects the cached one — there's no
manual cookie-copying step. The resulting session is cached to
`server/data/session-cache.json` and reused across restarts until it's
rejected, at which point the server transparently logs in again. If login
itself fails (e.g. bad credentials), the Overview page shows an
"Automatic STT login failed: ..." error describing why.
