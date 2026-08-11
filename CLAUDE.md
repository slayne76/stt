# Repo-specific instructions

## Browser automation for verification (real-browser task checks, code review)

**Prefer the `playwright`/`chrome-devtools` MCP servers first, in a fresh
session.** Confirmed working end-to-end 2026-08-11 (real `navigate`/
`new_page`, `snapshot`, `click`, and `fill`/`type` calls against the running
dev app, both tools independently, not just a `claude mcp list` connection
check). If `ToolSearch` doesn't surface `mcp__playwright__*` /
`mcp__chrome-devtools__*` tool schemas, or a call fails partway through, that
means the servers didn't load into (or dropped out of) *this* session — a
known limitation for sessions that were already running before the servers
were configured, or long-running sessions in general, not evidence the tools
are broken. In that case fall back to the raw `playwright` library below
rather than retrying the MCP call repeatedly.

**Fallback: the `playwright` npm package**, driven directly as a library —
it's a pinned root `devDependency` (`package.json`), already installed via a
normal `npm install` in every worktree:

```js
const { chromium } = require('playwright'); // or: import { chromium } from 'playwright';
const browser = await chromium.launch(); // headless by default — this works fine in this sandbox
```

**Do not:**
- Run `npm install playwright` — it is already a project dependency; installing
  it again (locally, globally, or via `npx`) wastes time and risks an
  unauthorized `package.json`/`package-lock.json` diff that has to be caught
  and reverted (this has happened before).
- Install or use `@playwright/test` (the test-runner framework) — this
  project has no test framework by deliberate choice; use the plain
  `playwright` library with an ad-hoc script instead.
- Install or use `puppeteer`, or any other browser-automation library — not
  needed, not configured, and a prior attempt left a broken, empty download
  in `~/.cache/puppeteer` while a report falsely claimed no browser was
  available at all.

**Scope:** this tool is for verification only (task-level and code-review
browser checks) — never a dependency of the shipped application itself.

**Chromium's browser binary is already cached** at `~/.cache/ms-playwright`
(a `$HOME`-level cache, shared across every worktree — not per-project, so
it never needs re-downloading). If it's ever missing, `npx playwright install
chromium` fetches just the one browser this project actually uses — never
run a bare `npx playwright install` (installs Chromium *and* Firefox *and*
WebKit by default; this project has only ever used headless Chromium).

## Git safety: never commit on `main`

This repo's process always works in an isolated git worktree (a branch
named `worktree-<feature>`), never on `main` directly — every feature is
reviewed and merged through that flow. Before running `git commit` (or
`git push`), run `git branch --show-current`. If it prints `main` — or
you're not certain you're in the worktree you were dispatched to — STOP:
do not commit. Report back to whoever dispatched you instead. This
happened for real on 2026-08-11 (a fix-dispatch subagent ended up
operating against the main checkout instead of its assigned worktree and
committed there directly) — caught only because merging the properly-
reviewed feature branch produced an unexpected conflict instead of a
clean fast-forward, not because anything flagged it at commit time.
