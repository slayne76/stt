# Nav Active-State Indicator — Design Spec

Closes the "Nav active-state" deferred backlog item in `docs/PROJECT_STATE.md`:
the sidebar nav's `ListItemButton`s never show which page is currently
selected (no `selected` prop / `useLocation` check).

## Goal

Give every one of the 13 nav entries a visual (and, for leaf pages, ARIA)
indication of "this is the current page" — for the two always-visible
top-level entries (Overview, Collections) and, distinctly, for the 11
entries that live inside the Crew/Ships hover flyouts.

## Current state

`AppLayout.tsx` already destructures `location` from `useLocation()` (used
today only to `key` the `ErrorBoundary`) and maps flat `NAV_ITEMS` entries
to plain `ListItemButton`s with no `selected` prop. `NavGroupItem.tsx`
renders the Crew/Ships flyout triggers and their children as `ListItemButton`s
with no location awareness at all — it doesn't currently call `useLocation()`.

## Non-goals

- No change to `routes.tsx` — this is a pure render-time concern of the nav
  components, not a data-shape change.
- No change to click/keyboard/hover/Escape/focus logic in `NavGroupItem.tsx`
  — purely additive props layered on top of the existing behavior.
- No custom styling — uses MUI's built-in `selected` prop (the theme's
  standard active-item treatment), not a bespoke visual language.

## Design

### Two distinct "active" signals, by design (confirmed in brainstorming)

1. **Leaf-page match** (`item.path === pathname`): the exact clicked-through
   page. Gets both `selected` (visual) and `aria-current="page"` (ARIA) —
   applies to Overview, Collections, and each of the 11 flyout children.
2. **Group match** (`items.some((item) => item.path === pathname)`): true
   whenever the current route is any child of that group. Gets `selected`
   only, **not** `aria-current="page"` — a group trigger isn't itself a
   page, so that specific ARIA value would be semantically wrong even
   though the trigger is a real `ListItemButton`. This is the only
   persistent "where am I" signal for the 11 flyout-based pages, since the
   flyout itself closes after navigation.

### `client/src/layout/AppLayout.tsx`

The flat-item branch of the existing `NAV_ITEMS.map(...)` render loop:

```tsx
<ListItemButton
  key={item.path}
  selected={location.pathname === item.path}
  aria-current={location.pathname === item.path ? 'page' : undefined}
  onClick={() => navigate(item.path)}
>
  <ListItemText primary={item.label} />
</ListItemButton>
```

`location` is already in scope (destructured from `useLocation()` earlier
in the component for the `ErrorBoundary` key) — no new hook call needed in
this file.

### `client/src/layout/NavGroupItem.tsx`

Gains its own `useLocation()` call, matching this component's existing
self-contained pattern of already calling `useNavigate()` independently
rather than having behavior threaded down as props from `AppLayout`:

```tsx
import { useLocation, useNavigate } from 'react-router-dom';
// ...
const { pathname } = useLocation();
const navigate = useNavigate();
const isGroupActive = items.some((item) => item.path === pathname);
```

The trigger `ListItemButton`:

```tsx
<ListItemButton
  ref={triggerRef}
  selected={isGroupActive}
  sx={{ cursor: 'default' }}
  onKeyDown={handleTriggerKeyDown}
  aria-haspopup="true"
  aria-expanded={open}
>
```

Each flyout-item `ListItemButton`:

```tsx
<ListItemButton
  key={item.path}
  ref={setItemRef(index)}
  role="menuitem"
  selected={item.path === pathname}
  aria-current={item.path === pathname ? 'page' : undefined}
  onClick={() => {
    navigate(item.path);
    suppressTriggerFocusOpenRef.current = true;
    triggerRef.current?.focus();
    setOpen(false);
  }}
>
  <ListItemText primary={item.label} />
</ListItemButton>
```

Everything else in both files — the render structure, event handlers,
refs, focus/keyboard logic — is untouched.

## Error handling

None introduced — this is a pure derived-boolean/prop-passing addition, no
new failure modes.

## Testing / verification plan

No automated test framework exists in this project (deliberate, repeated
choice). Verification:

- Build (`npm run build -w client`) / lint (`npm run lint -w client`)
  clean.
- Real-browser check: navigate to Overview, confirm it's visually
  `selected` and Collections is not (and vice versa after clicking
  Collections). Navigate to a Crew child (e.g. `/qps`) directly by URL,
  confirm the collapsed "Crew" trigger shows `selected` styling with the
  flyout closed — the persistent signal this feature exists for. Open the
  Crew flyout while on `/qps`, confirm the "QPs" item specifically is
  `selected` inside the open panel while its 8 siblings are not. Repeat the
  same group-and-child check for one Ships page. Confirm neither Overview
  nor Collections is ever `selected` while on a Crew/Ships page, and vice
  versa.
- Confirm `aria-current="page"` is present (via the accessibility tree or
  a DOM read) on the active leaf item only — never on a group trigger,
  even when that group is `isGroupActive`.
- Confirm no change to existing hover-open/Escape-close/keyboard
  roving-focus behavior — quick sanity check, not deep re-verification,
  since none of that logic was touched.
