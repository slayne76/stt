# STT Tracker

Local tool for tracking data and statistics for Star Trek Timelines.

## Setup

1. `npm install` (root — installs both workspaces)
2. Copy `server/.env.example` to `server/.env` and fill in `STT_SESSION_COOKIE`
   with the value of your `_startrek_session` cookie (from browser DevTools
   while logged into the game).
3. `npm run dev` (root — starts the API server on :3001 and the Vite dev
   server on :5173 together)
4. Open http://localhost:5173

## Refreshing the session cookie

The cookie expires periodically. When the Overview page shows an error about
the session cookie (e.g. "STT_SESSION_COOKIE is not set in server/.env" or
"STT API rejected the session cookie (HTTP 401/403)..."), grab a fresh
`_startrek_session` value and update `server/.env`, then restart the server
(or hit Refresh once the new value is in place).
