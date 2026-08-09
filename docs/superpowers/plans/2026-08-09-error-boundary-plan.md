# Router-level ErrorBoundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable `ErrorBoundary` component wrapping the routed page content (`<Outlet />`) in `AppLayout`, so a render-time crash in any one page's content no longer blanks the entire app — the topbar and nav drawer stay usable, and navigating away from the crashed page auto-clears the error.

**Architecture:** A single new class component, `client/src/components/ErrorBoundary.tsx` (React requires error boundaries to be class components — there's no hook equivalent), showing a `PageShell`-style error `Alert` with a "Try again" reset button on catch. `AppLayout.tsx` wraps `<Outlet />` in it, keyed by `location.pathname` so navigating to a new route remounts the boundary and clears any stale error state automatically.

**Tech Stack:** React 19, TypeScript, MUI v6 (`Alert`, `Button`), react-router-dom v7 (`useLocation`). No test framework in this project (by deliberate, repeated choice) — verification is `tsc`/`eslint` plus a real-browser check using this session's confirmed-working Playwright/headless-Chromium tooling.

## Global Constraints

- No raw error message or stack may be shown in the fallback UI — generic
  "Something went wrong on this page" text only, matching `PageShell`'s
  existing error-`Alert` copy style. The full error and component stack go
  to `console.error` instead.
- `ErrorBoundary` itself must have no react-router dependency — the
  route-awareness (the `key={location.pathname}` reset) lives entirely in
  `AppLayout`, not inside the component.
- The boundary wraps `<Outlet />` only, not the whole `<App />` — `AppLayout`'s
  own topbar/drawer/providers stay outside it, unchanged.
- Any throwaway test-only code used for browser verification (a forced
  `throw` in a page component) must be fully reverted before the final
  commit — it must not ship.

---

### Task 1: ErrorBoundary component + AppLayout integration

**Files:**
- Create: `client/src/components/ErrorBoundary.tsx`
- Modify: `client/src/layout/AppLayout.tsx`

**Interfaces:**
- Produces: `ErrorBoundary` — default export, a React class component with
  props `{ children: ReactNode }`. No other exports.
- Consumes (in `AppLayout.tsx`): `useLocation` from `react-router-dom`
  (same package `useNavigate` is already imported from at
  `client/src/layout/AppLayout.tsx:3`); `Alert`, `Button` already imported
  in that file from `@mui/material`.

- [ ] **Step 1: Create the `ErrorBoundary` component**

Write `client/src/components/ErrorBoundary.tsx`:

```tsx
import { Component } from 'react';
import type { ReactNode } from 'react';
import { Alert, Button } from '@mui/material';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: { componentStack: string }) {
    console.error('ErrorBoundary caught a render error:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={this.handleReset}>
              Try again
            </Button>
          }
        >
          Something went wrong on this page.
        </Alert>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
```

- [ ] **Step 2: Wire `ErrorBoundary` into `AppLayout`**

In `client/src/layout/AppLayout.tsx`:

Change the import line at line 3 from:

```tsx
import { Outlet, useNavigate } from 'react-router-dom';
```

to:

```tsx
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
```

Add a new import (alongside the other local imports, e.g. after the
`NavGroupItem` import at line 7):

```tsx
import ErrorBoundary from '../components/ErrorBoundary';
```

Inside the `AppLayout` function body, add a `location` hook call next to
the existing `navigate` one (around line 50):

```tsx
const navigate = useNavigate();
const location = useLocation();
```

Change the `<Outlet />` usage (around line 140), from:

```tsx
<Box component="main" sx={{ flexGrow: 1, p: 3 }}>
  <Toolbar />
  <Outlet />
</Box>
```

to:

```tsx
<Box component="main" sx={{ flexGrow: 1, p: 3 }}>
  <Toolbar />
  <ErrorBoundary key={location.pathname}>
    <Outlet />
  </ErrorBoundary>
</Box>
```

- [ ] **Step 3: Type-check, build, and lint**

Run:

```bash
npm run build -w client
npm run lint -w client
```

Expected: both exit cleanly (no `tsc` errors, no new ESLint errors/warnings).

- [ ] **Step 4: Real-browser verification — crash is caught, nav stays usable**

Start the dev server (seed `server/data/player-cache.json` from
`example-data.json` first if this is a fresh worktree — see standing
worktree setup step):

```bash
npm run dev
```

Temporarily add a forced throw to the top of `OverviewPage`'s component
body (`client/src/pages/OverviewPage.tsx`) — right after the function
signature, before any hooks:

```tsx
throw new Error('test: forced render crash for ErrorBoundary verification');
```

Using the browser tooling, navigate to `/` and confirm:
- The page content area shows the fallback `Alert` with the text
  "Something went wrong on this page." and a "Try again" button — not a
  blank page.
- The topbar (title, Refresh buttons) and the nav drawer (Overview, Crew,
  Ships, Collections) are still visible and rendered normally.
- The browser console shows a `console.error` log starting with
  `ErrorBoundary caught a render error:`.

- [ ] **Step 5: Real-browser verification — "Try again" and auto-reset on navigation**

With the forced throw from Step 4 still in place in `OverviewPage.tsx`:

Click "Try again" in the fallback `Alert`. Confirm the page throws again
and the fallback `Alert` re-renders (expected — the underlying cause, the
forced throw, hasn't been removed yet).

Using the nav drawer, click to a different page (e.g. "Collections").
Confirm:
- `CollectionsPage` renders normally (no fallback `Alert`, real content
  shown) — this is the auto-reset behavior from keying `ErrorBoundary` by
  `location.pathname`.

Navigate back to `/` via the nav drawer. Confirm the fallback `Alert`
reappears (the forced throw is still there, so `/` should crash again on
every fresh mount) — this confirms the reset genuinely re-tries the render
rather than permanently suppressing the boundary.

- [ ] **Step 6: Remove the forced throw**

Remove the `throw new Error(...)` line added to `OverviewPage.tsx` in
Step 4. Confirm `git diff client/src/pages/OverviewPage.tsx` is empty.

- [ ] **Step 7: Real-browser verification — normal operation after revert**

Reload `/` in the browser. Confirm `OverviewPage` renders its real content
normally, with no fallback `Alert`.

- [ ] **Step 8: Final build/lint check**

```bash
npm run build -w client
npm run lint -w client
```

Expected: both exit cleanly.

- [ ] **Step 9: Commit**

```bash
git add client/src/components/ErrorBoundary.tsx client/src/layout/AppLayout.tsx
git commit -m "Add router-level ErrorBoundary around page content

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** Component design (Step 1), integration point + key
  reset (Step 2), fallback UI copy/styling (Step 1, matches `PageShell`'s
  `Alert`/`Button` pattern), all 7 verification-plan items from the spec
  (Steps 4–7 cover: fallback renders, console logs, nav stays usable, retry
  re-throws while cause remains, cross-page nav auto-resets, forced-throw
  code is reverted, normal operation resumes) — all covered by this single
  task.
- **No placeholders:** All code blocks are complete and copy-pasteable;
  no "add error handling"-style steps.
- **Type consistency:** `ErrorBoundary` takes `{ children: ReactNode }` and
  is a default export in both its own file and the `AppLayout.tsx` import
  — consistent throughout. `location.pathname` matches the `useLocation()`
  return type from `react-router-dom` v7.
- **Single-task plan:** Both files change together for one deliverable (an
  unwired `ErrorBoundary` component isn't independently reviewable without
  its integration point, since there's no test framework to exercise it in
  isolation) — matches this project's file-structure guidance ("files that
  change together should live together") applied at the task level.
