# Nav Active-State Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every nav entry a visual indication of "this is the current page" — `AppLayout.tsx`'s two flat top-level entries (Overview, Collections) and, distinctly, `NavGroupItem.tsx`'s 11 flyout-based entries (the Crew/Ships group triggers themselves, plus each of their children).

**Architecture:** Both files independently compare `useLocation().pathname` against `NAV_ITEMS`/`items` path values and pass MUI's `selected` prop (plus `aria-current="page"` on leaf-page matches only) to the relevant `ListItemButton`s. No new files, no new component, no change to `routes.tsx` — purely additive props layered on existing render logic.

**Tech Stack:** React 19, TypeScript strict mode, react-router-dom, MUI.

## Global Constraints

- No change to `client/src/routes.tsx` — this is a pure render-time concern of the nav components, not a data-shape change.
- No change to click/keyboard/hover/Escape/focus logic in `NavGroupItem.tsx` — purely additive props on top of the existing behavior.
- No custom styling — use MUI's built-in `selected` prop only, no bespoke CSS.
- Two distinct signals, not interchangeable: a **leaf-page match** (`item.path === pathname`) gets both `selected` and `aria-current="page"`; a **group match** (`items.some((item) => item.path === pathname)`) gets `selected` only — never `aria-current="page"`, since a group trigger isn't itself a page.
- Build (`npm run build -w client`) and lint (`npm run lint -w client`) must stay clean: 0 errors, same 4 pre-existing/expected-class warnings as before this feature (2 in `PlayerDataContext.tsx`/`CrewCatalogContext.tsx`, 2 in `routes.tsx`) — this feature adds no new exports, so the warning count shouldn't change.
- Full spec: `docs/superpowers/specs/2026-08-12-nav-active-state-design.md`.

---

### Task 1: Add active-state props to `AppLayout.tsx` and `NavGroupItem.tsx`

**Files:**
- Modify: `client/src/layout/AppLayout.tsx:70-78`
- Modify: `client/src/layout/NavGroupItem.tsx:1-20,141-150,161-175`

**Interfaces:**
- Consumes: nothing new — both files already have everything needed (`NAV_ITEMS`/`isNavGroup`/`NavLink` from `../routes`, `useLocation`/`useNavigate` from `react-router-dom`).
- Produces: nothing new — no new exports, no new props on `NavGroupItemProps`.

- [ ] **Step 1: Confirm the current state of both files matches this plan's assumptions**

Run:
```bash
grep -n "location.pathname\|selected=" client/src/layout/AppLayout.tsx
grep -n "useLocation\|selected=" client/src/layout/NavGroupItem.tsx
```
Expected: both commands print nothing (no `selected` prop or `useLocation` call exists yet in either file — this feature hasn't been added). If either prints a match, stop and re-read the actual file before proceeding — it has already changed from what this plan assumes.

- [ ] **Step 2: Add `selected`/`aria-current` to the flat-item branch in `client/src/layout/AppLayout.tsx`**

Replace:

```tsx
          {NAV_ITEMS.map((item) =>
            isNavGroup(item) ? (
              <NavGroupItem key={item.label} label={item.label} items={item.children} />
            ) : (
              <ListItemButton key={item.path} onClick={() => navigate(item.path)}>
                <ListItemText primary={item.label} />
              </ListItemButton>
            )
          )}
```

with:

```tsx
          {NAV_ITEMS.map((item) =>
            isNavGroup(item) ? (
              <NavGroupItem key={item.label} label={item.label} items={item.children} />
            ) : (
              <ListItemButton
                key={item.path}
                selected={location.pathname === item.path}
                aria-current={location.pathname === item.path ? 'page' : undefined}
                onClick={() => navigate(item.path)}
              >
                <ListItemText primary={item.label} />
              </ListItemButton>
            )
          )}
```

`location` is already destructured from `useLocation()` earlier in this component (used today for the `ErrorBoundary` key) — no new hook call needed in this file. Nothing else in `AppLayout.tsx` changes.

- [ ] **Step 3: Add `useLocation` import and `pathname`/`isGroupActive` to `client/src/layout/NavGroupItem.tsx`**

Replace:

```tsx
import { useNavigate } from 'react-router-dom';
```

with:

```tsx
import { useLocation, useNavigate } from 'react-router-dom';
```

Replace:

```tsx
function NavGroupItem({ label, items }: NavGroupItemProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const focusFirstItemRef = useRef(false);
  const suppressTriggerFocusOpenRef = useRef(false);
  const navigate = useNavigate();
```

with:

```tsx
function NavGroupItem({ label, items }: NavGroupItemProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const focusFirstItemRef = useRef(false);
  const suppressTriggerFocusOpenRef = useRef(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isGroupActive = items.some((item) => item.path === pathname);
```

- [ ] **Step 4: Add `selected` to the trigger `ListItemButton` in `client/src/layout/NavGroupItem.tsx`**

Replace:

```tsx
      <ListItemButton
        ref={triggerRef}
        sx={{ cursor: 'default' }}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <ListItemText primary={label} />
        <ChevronRight fontSize="small" />
      </ListItemButton>
```

with:

```tsx
      <ListItemButton
        ref={triggerRef}
        selected={isGroupActive}
        sx={{ cursor: 'default' }}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <ListItemText primary={label} />
        <ChevronRight fontSize="small" />
      </ListItemButton>
```

- [ ] **Step 5: Add `selected`/`aria-current` to each flyout-item `ListItemButton` in `client/src/layout/NavGroupItem.tsx`**

Replace:

```tsx
            {items.map((item, index) => (
              <ListItemButton
                key={item.path}
                ref={setItemRef(index)}
                role="menuitem"
                onClick={() => {
                  navigate(item.path);
                  suppressTriggerFocusOpenRef.current = true;
                  triggerRef.current?.focus();
                  setOpen(false);
                }}
              >
                <ListItemText primary={item.label} />
              </ListItemButton>
            ))}
```

with:

```tsx
            {items.map((item, index) => (
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
            ))}
```

Everything else in both files — render structure, event handlers, refs, focus/keyboard logic — is untouched.

- [ ] **Step 6: Build and lint**

Run: `npm run build -w client` — expect success, 0 errors.
Run: `npm run lint -w client` — expect 0 errors, exactly the same 4 warnings as before this feature (2 pre-existing in `PlayerDataContext.tsx`/`CrewCatalogContext.tsx`, 2 in `routes.tsx`) — this feature adds no new exports, so the warning count must not change.

- [ ] **Step 7: Real-browser verification**

Seed data first (worktree/fresh-checkout requirement — skip if `server/data/player-cache.json` already exists with real content):
```bash
cp example-data.json server/data/player-cache.json
```

Start the dev server: `npm run dev` (root — runs server + client concurrently). Using the `playwright` library directly (or the `mcp__playwright__*`/`mcp__chrome-devtools__*` MCP tools if available in this session — see `CLAUDE.md`):

1. On load (`/`), confirm **Overview** is visually `selected` and **Collections** is not; confirm `aria-current="page"` is present on Overview's button and absent from Collections'.
2. Click **Collections**, confirm the reverse (Collections `selected` + `aria-current`, Overview neither).
3. Navigate directly by URL to `/qps` (a Crew child), confirm the collapsed **Crew** trigger shows `selected` styling with the flyout closed — this is the persistent signal the feature exists for. Confirm **Ships** is not `selected`, and neither Overview nor Collections is `selected`.
4. With the page still on `/qps`, hover open the **Crew** flyout and confirm the **QPs** item specifically is `selected` with `aria-current="page"` inside the open panel, while its other 8 siblings (5 Stars Crew, 3/4 Stars crew, 4/5 Stars crew, 4/4 Stars crew (ready), 4/4 Stars crew, 4 Stars Duplicates, 5 Stars Duplicates, 5 & 4 Stars Frozen Crew) are neither `selected` nor carry `aria-current`.
5. Repeat steps 3-4 for one Ships page (e.g. navigate directly to `/4-stars-ships`, confirm **Ships** trigger is `selected` with the flyout closed, then open the flyout and confirm **4 Stars Ships** specifically is `selected`/`aria-current` while **5 Stars Ships** is not).
6. Quick sanity check only (not deep re-verification, since this logic wasn't touched): confirm the Crew/Ships flyouts still open on hover/focus and close on `Escape`.

Stop the dev server afterward (kill only the process this step started — confirm ownership via the working-directory/port before killing anything if a port conflict comes up).

- [ ] **Step 8: Commit**

```bash
git add client/src/layout/AppLayout.tsx client/src/layout/NavGroupItem.tsx
git commit -m "Add nav active-state indicator"
```
