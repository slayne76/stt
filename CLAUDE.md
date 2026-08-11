# Repo-specific instructions

## Browser automation for verification (real-browser task checks, code review)

**Use the `playwright` npm package only** — it's a pinned root `devDependency`
(`package.json`), already installed via a normal `npm install` in every
worktree. Drive it directly as a library with a throwaway script:

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
- Reach for the `playwright`/`chrome-devtools` MCP servers as the primary
  tool — they're configured but have repeatedly disconnected mid-session in
  this sandbox; the raw `playwright` library is the reliable, established
  path.

**Scope:** this tool is for verification only (task-level and code-review
browser checks) — never a dependency of the shipped application itself.

**Chromium's browser binary is already cached** at `~/.cache/ms-playwright`
(a `$HOME`-level cache, shared across every worktree — not per-project, so
it never needs re-downloading). If it's ever missing, `npx playwright install
chromium` fetches just the one browser this project actually uses — never
run a bare `npx playwright install` (installs Chromium *and* Firefox *and*
WebKit by default; this project has only ever used headless Chromium).
