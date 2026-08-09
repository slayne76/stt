# Router-level ErrorBoundary — Design

**Date:** 2026-08-09
**Status:** Approved

## Problem

No `ErrorBoundary` exists anywhere in this client. Any uncaught render-time
exception currently blanks the entire React root — there is nothing between
a throwing component and a fully dead screen. This was surfaced, but not
itself fixed, by the Missing 4 Stars tables feature: a stale-shaped catalog
cache file caused `MissingCrewTable`'s `.toFixed(2)` call to throw, which
would have blanked the whole app on merge had the shape-guard fix not been
applied first. That specific trigger is fixed; the general gap — no
boundary at all, for any future cause — is not.

## Goal

Add a reusable `ErrorBoundary` component that contains a page-level render
crash to that page's content area, leaving navigation (topbar, nav drawer)
usable so the user can move to a different, healthy page instead of facing
a blank screen requiring a manual reload.

## Non-goals

- No error-tracking/reporting service integration (this project uses
  `console.error` as its only error-surfacing mechanism today; adding a
  telemetry sink is out of scope).
- No boundary around `AppLayout` itself (the topbar/nav/provider tree) —
  only around the routed page content (`<Outlet />`). A crash inside
  `AppLayout` itself remains uncaught, same as today; that's a much rarer
  surface (no page-specific data-shape risk lives there) and adding a
  second, outer boundary is not justified by any concrete trigger found so
  far.
- No automated tests — this project has no test framework, by repeated,
  deliberate choice. Verification is a real-browser check instead (see
  below).

## Component design

New file: `client/src/components/ErrorBoundary.tsx`, alongside the existing
`StatusChip.tsx` (the client's one other shared, domain-agnostic
component).

React only supports error boundaries as class components — there is no
hook-based equivalent as of React 19 — so this is necessarily a class
component, the one exception to this codebase's otherwise all-functional
component style.

```tsx
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
```

- No raw error message or stack is shown in the UI — kept generic,
  consistent with how `PageShell`'s existing error `Alert` reads. The full
  error and component stack go to `console.error` for diagnosis (you're the
  sole user/developer of this app; devtools console is sufficient, matching
  how errors are already surfaced elsewhere in this project).
- "Try again" resets `hasError` to `false` in place, re-rendering
  `children` — useful if the underlying condition was transient (e.g. a
  retry after the catalog cache mentioned above finishes refetching in the
  background).

## Integration point

`AppLayout.tsx` wraps `<Outlet />`:

```tsx
<ErrorBoundary key={location.pathname}>
  <Outlet />
</ErrorBoundary>
```

`location` comes from a new `useLocation()` call (alongside the existing
`useNavigate()` import from `react-router-dom`).

**Why `<Outlet />` only, not the whole `<App />`:** keeps the topbar and nav
drawer alive when a page crashes, so the user can click to a different page
rather than facing a screen with no way out short of a manual reload. This
directly matches the scenario that motivated this feature — a page-content
render crash, not a crash in the app shell itself.

**Why `key={location.pathname}`:** React remounts a component when its
`key` changes, which discards the old instance's state — including
`hasError`. Keying the boundary by the current path means navigating to a
new route always gets a fresh `ErrorBoundary`, auto-clearing any stale
error state without the user needing to click "Try again" first, and
without `ErrorBoundary` itself needing any react-router awareness (that
awareness stays in `AppLayout`, which already owns routing concerns — the
component itself stays generic and reusable, matching the existing
`NavGroupItem` precedent in this codebase of small, dependency-free shared
primitives).

## Fallback UI

Reuses `PageShell`'s existing error-`Alert` visual pattern exactly
(`severity="error"`, `Button` action, `color="inherit"` `size="small"`) so
a crash-fallback and a data-fetch-error look like the same visual language
to the user, not two different error styles.

## Verification plan

No test framework exists in this project. Verification is a real
browser check (headless-browser tooling confirmed working as of
2026-08-06):

1. Temporarily force a page component to throw during render (e.g. a
   throwaway `throw new Error('test')` inside one page's render body).
2. Confirm: the fallback `Alert` renders in the content area; the fallback
   text and "Try again" button are visible; `console.error` received the
   error.
3. Confirm the topbar and nav drawer remain visible and clickable while
   the fallback is showing.
4. Click "Try again" with the forced throw still in place — confirm the
   page throws again (fallback re-renders, `hasError` correctly reset then
   re-caught).
5. Remove the forced throw, click "Try again" — confirm the page now
   renders normally.
6. With the forced throw still in place (re-add temporarily), navigate to
   a different page via the nav drawer — confirm the new page renders
   normally without needing "Try again" (auto-reset via `key` change).
7. Revert the throwaway forced-throw code before merging; it must not ship.

## Files touched

- New: `client/src/components/ErrorBoundary.tsx`
- Modified: `client/src/layout/AppLayout.tsx` (add `useLocation` import,
  wrap `<Outlet />`)
