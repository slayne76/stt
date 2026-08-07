# Bind the Server to `127.0.0.1` — Design

## What this is

`server/src/index.ts` calls `app.listen(PORT, callback)` with no host
argument, which binds Express to all network interfaces (`0.0.0.0`) —
the server is reachable from any device on the local network, not just
this machine. For a single-user local tool with three currently-
unauthenticated endpoints (`GET /api/player`, `POST /api/player/refresh`,
and the asset proxy's `GET /api/assets/:filename`/`POST
/api/assets/refresh`), this is unnecessary exposure. Flagged at both the
Asset cache proxy feature's final review and earlier reviews as the
standalone hardening pass that would cover all three endpoints in one
line, rather than adding auth to each individually.

## The fix

```ts
app.listen(PORT, '127.0.0.1', () => {
  console.log(`STT tracker server listening on http://127.0.0.1:${PORT}`);
});
```

One line changed (the `listen` call gains the host argument), one line
improved (the startup log now states the actual bound address, making
the binding visible at runtime rather than an implicit default nobody
sees). Binding to loopback only means every one of the three endpoints
above stops being reachable from other devices on the network, in a
single change, rather than needing individual auth added to each.

**No impact on local dev or normal use:** the client's Vite proxy
(`client/vite.config.ts`) already targets `http://localhost:3001`, and
`localhost` resolves to loopback — every existing request path continues
to work identically. This only removes reachability from other machines
on the same network, which was never an intended use case for a
single-user local tool.

## Scope

One file: `server/src/index.ts`. No new dependencies, no config
changes, no route changes.

## Verification

This project has no automated test framework (deliberate, project-wide
choice). Verification is TypeScript strict mode + ESLint plus a direct
curl check: with the server running, confirm it still answers on
`http://127.0.0.1:3001/health` (or `localhost:3001`, same address) as
before, and — the actual property under test — confirm it does **not**
answer on the machine's LAN-facing IP address (e.g. `curl
http://<lan-ip>:3001/health` from the same machine, targeting the
interface rather than loopback, should fail to connect rather than
succeed), proving the bind actually narrowed reachability rather than
merely changing a log message.
