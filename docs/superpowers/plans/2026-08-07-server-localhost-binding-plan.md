# Bind the Server to 127.0.0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind the Express server to `127.0.0.1` only, removing LAN reachability for all three currently-unauthenticated endpoints in one change.

**Architecture:** A one-line change to `app.listen(...)`'s call signature, plus an improved log message. No new files, no config changes.

**Tech Stack:** Same as the existing server workspace — Node 24 + Express + TypeScript. No new dependencies.

## Global Constraints

- **The fix, exactly:**
  ```ts
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`STT tracker server listening on http://127.0.0.1:${PORT}`);
  });
  ```
- **No impact on local dev or normal use** — the client's Vite proxy already targets `http://localhost:3001`, which resolves to loopback regardless of this change.
- **No automated test framework** (project-wide, deliberate choice). Verification is TypeScript strict mode + ESLint plus a direct curl check proving the actual property under test: the server answers on loopback and does NOT answer on the machine's LAN-facing IP address after the change.
- **Spec:** `docs/superpowers/specs/2026-08-07-server-localhost-binding-design.md`.

---

### Task 1: Bind the server to `127.0.0.1`

**Files:**
- Modify: `server/src/index.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: no exported signature changes — this file has no exports at all (it's the server entrypoint). No caller is affected.

- [ ] **Step 1: Confirm the current state of `server/src/index.ts` matches this plan's assumptions**

Run: `cat -n server/src/index.ts`

Confirm the final block is exactly:
```ts
app.listen(PORT, () => {
  console.log(`STT tracker server listening on port ${PORT}`);
});
```

If it differs, stop and re-check the spec before proceeding.

- [ ] **Step 2: Establish the pre-fix baseline — confirm the server IS currently reachable on the LAN-facing interface**

This proves the "before" state, so the "after" check in Step 5 is a real regression test, not an assumption.

Run: `hostname -I | awk '{print $1}'` to get this machine's primary LAN-facing IP address (call it `$LAN_IP` in the following steps — substitute the actual printed value).

Start the server if not already running with this worktree's code: `npm run dev -w server` (background it, since it runs forever — e.g. run in a background shell) — or confirm one is already reachable at `http://localhost:3001/health` first.

Run: `curl -s -m 3 -o /dev/null -w '%{http_code}\n' http://$LAN_IP:3001/health`

Expected: `200` — confirming the server is currently reachable via the LAN interface, the exact exposure this task removes. (If this returns anything other than `200`, e.g. the machine's networking setup already blocks this some other way, note it in your report — the fix is still correct to apply, but Step 5's "after" comparison will be less meaningful and should be reported as such rather than silently treated as equivalent evidence.)

- [ ] **Step 3: Apply the fix**

In `server/src/index.ts`, replace:
```ts
app.listen(PORT, () => {
  console.log(`STT tracker server listening on port ${PORT}`);
});
```
with:
```ts
app.listen(PORT, '127.0.0.1', () => {
  console.log(`STT tracker server listening on http://127.0.0.1:${PORT}`);
});
```

- [ ] **Step 4: Build and lint check**

Run: `npm run build -w server`
Expected: exits 0.

Run: `npm run lint -w server`
Expected: exits 0, no errors.

- [ ] **Step 5: Restart the server and confirm the bind actually narrowed reachability**

Stop whatever server process was running in Step 2 and start a fresh one so it picks up the change (`npm run dev -w server`, backgrounded).

Run: `curl -s -m 3 -o /dev/null -w '%{http_code}\n' http://localhost:3001/health`
Expected: `200` — loopback access still works.

Run: `curl -s -m 3 -o /dev/null -w '%{http_code}\n' http://$LAN_IP:3001/health` (same `$LAN_IP` from Step 2)
Expected: the connection fails (curl exits non-zero / times out / "Connection refused" — NOT a `200`). This is the actual property under test: the same request that succeeded in Step 2 must now fail to connect at all.

- [ ] **Step 6: Commit**

```bash
git add server/src/index.ts
git commit -m "Bind the server to 127.0.0.1, removing LAN reachability"
```
