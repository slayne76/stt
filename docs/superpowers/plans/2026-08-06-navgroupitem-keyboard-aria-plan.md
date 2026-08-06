# NavGroupItem Escape/ARIA/Max-Height Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three previously-deferred `NavGroupItem` gaps in one pass: `Escape` doesn't close the flyout when focus is still on the trigger, the flyout has no ARIA menu semantics (including arrow-key navigation), and a tall group has no max-height/scroll fallback.

**Architecture:** A single-file rewrite of `client/src/layout/NavGroupItem.tsx` — no new files, no prop/interface changes, both existing consumers (`AppLayout.tsx`'s "Crew" and "Ships" groups) pick up all three fixes automatically.

**Tech Stack:** Same as the existing client workspace — React 19, TypeScript (strict), MUI 6, no new dependencies. Verification uses the `playwright` MCP browser tools (real Chromium, confirmed working in this environment) against the real running dev server — this project has no automated test framework or browser-testing harness (deliberate, project-wide choice).

## Global Constraints

- **Escape handling moves from the portaled `Paper` to the wrapper `div`.** The `Popper`'s content is a React child of the wrapper even though it's portaled elsewhere in the DOM, so keydowns from both the trigger and every panel item already bubble to a handler placed there. New wrapper handler:
  ```ts
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    cancelClose();
    setOpen(false);
    if (document.activeElement !== triggerRef.current) {
      suppressTriggerFocusOpenRef.current = true;
      triggerRef.current?.focus();
    }
  };
  ```
  The `document.activeElement !== triggerRef.current` guard skips the refocus-and-suppress dance when focus was already on the trigger (nothing to move, nothing to suppress). This replaces `handlePanelKeyDown`'s old Escape branch entirely — the old handler is deleted from the `Paper`.
- **ARIA menu semantics, done fully, not just labels:** trigger `ListItemButton` gets `aria-haspopup="true"` and `aria-expanded={open}`; the panel's `List` gets `role="menu"`; each item `ListItemButton` gets `role="menuitem"`; `ArrowDown`/`ArrowUp` move focus between items (wrapping at both ends), `Home`/`End` jump to first/last. No typeahead search — not requested, YAGNI for a 2–6 item list.
- **`firstItemRef` (a single `useRef<HTMLDivElement>`) becomes `itemRefs` (a `useRef<(HTMLDivElement | null)[]>([])`).** `setFirstItemRef` becomes `setItemRef(index)`, a small factory — only `index === 0` keeps the existing pending-focus-on-mount behavior (focusing the first item once it mounts after a keyboard-triggered open); every other index just records itself. `handleTriggerKeyDown`'s existing `firstItemRef.current` check becomes `itemRefs.current[0]`.
- **Max-height/scroll:** the `Paper` gains `sx={{ maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' }}`. No `Popper` flip/collision handling — out of scope, not requested.
- **No signature/interface change.** `NavGroupItemProps` stays `{ label: string; items: { label: string; path: string }[] }`. `AppLayout.tsx` needs no change.
- **No automated test framework** (project-wide, repeatedly-reaffirmed choice). Verification is TypeScript strict mode + ESLint + interactive checks against the real running dev server via the `playwright` MCP browser tools (client already running at `http://localhost:5173`, server at `http://localhost:3001` — both were started earlier this session and auto-reload on file change; if either isn't running, start with `npm run dev` from the repo root and wait for both to report ready).
- **Spec:** `docs/superpowers/specs/2026-08-06-navgroupitem-keyboard-aria-design.md`.

---

### Task 1: Fix Escape, add ARIA menu semantics + arrow-key navigation, add max-height/scroll

**Files:**
- Modify: `client/src/layout/NavGroupItem.tsx` (entire file rewritten — see Step 3 for exact content)

**Interfaces:**
- Consumes: nothing new — same `NavGroupItemProps` as before.
- Produces: same default export, same props. No other file imports anything new from this one; `AppLayout.tsx`'s two `<NavGroupItem>` usages (`AppLayout.tsx:108`, one for "Crew" with 6 children, one for "Ships" with 2) are the only consumers and need no changes.

- [ ] **Step 1: Read the current file to confirm it matches this plan's assumptions**

Run: `cat -n client/src/layout/NavGroupItem.tsx`

Confirm it is 137 lines, matches the code quoted in the design spec (`docs/superpowers/specs/2026-08-06-navgroupitem-keyboard-aria-design.md`) — in particular that `firstItemRef`, `setFirstItemRef`, and `handlePanelKeyDown` (the `Escape`-only version) exist as described. If the file differs meaningfully from this, stop and re-read the spec before proceeding — something has changed since this plan was written.

- [ ] **Step 2: Confirm the dev servers are running, and reproduce the Escape-from-trigger bug BEFORE fixing anything**

Run: `curl -s -o /dev/null -w '%{http_code}' http://localhost:5173` and `curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/api/player`

If either doesn't respond, start them: `npm run dev` from the repo root (background it — e.g. run in a background shell — since it runs forever), then wait a few seconds and re-check both URLs.

The `playwright` MCP server should already be connected in this environment (real Chromium, no system-Chrome dependency). If its browser tools (`mcp__playwright__browser_navigate`, `mcp__playwright__browser_snapshot`, `mcp__playwright__browser_press_key`, `mcp__playwright__browser_click`, `mcp__playwright__browser_hover`) aren't visible in your tool list, load them first with `ToolSearch({query: "select:mcp__playwright__browser_navigate,mcp__playwright__browser_snapshot,mcp__playwright__browser_press_key,mcp__playwright__browser_click,mcp__playwright__browser_hover", max_results: 10})`.

Using the playwright tools, against the **current (unfixed) code**:
1. `browser_navigate` to `http://localhost:5173`.
2. `browser_snapshot` to find the "Crew" nav trigger's element ref.
3. Click or focus the "Crew" trigger (e.g. `browser_click` on it, or Tab to it) so the flyout panel opens — confirm via `browser_snapshot` that the 6 child items ("3/4 Stars crew," "4/5 Stars crew," "4/4 Stars crew (ready)," "4/4 Stars crew," "4 Stars Duplicates," "5 Stars Duplicates") are visible.
4. With focus still on the "Crew" trigger itself (do not Tab further into the panel), `browser_press_key` with `Escape`.
5. `browser_snapshot` again — **confirm the panel is still open** (the 6 items are still present in the snapshot). This is the bug this task exists to fix; if the panel already closed here, stop and re-check you're on the unmodified file (`git diff client/src/layout/NavGroupItem.tsx` should be empty).

- [ ] **Step 3: Rewrite `client/src/layout/NavGroupItem.tsx`**

Replace the entire file with:

```tsx
import { useEffect, useRef, useState } from 'react';
import { ChevronRight } from '@mui/icons-material';
import { List, ListItemButton, ListItemText, Paper, Popper } from '@mui/material';
import { useNavigate } from 'react-router-dom';

export interface NavGroupItemProps {
  label: string;
  items: { label: string; path: string }[];
}

function NavGroupItem({ label, items }: NavGroupItemProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const focusFirstItemRef = useRef(false);
  const suppressTriggerFocusOpenRef = useRef(false);
  const navigate = useNavigate();

  const cancelClose = () => {
    if (closeTimeoutRef.current !== undefined) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = undefined;
    }
  };

  const openNow = () => {
    cancelClose();
    setOpen(true);
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimeoutRef.current = setTimeout(() => setOpen(false), 150);
  };

  // Clear any pending close timer if the component unmounts while it's armed.
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current !== undefined) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  // The panel is portaled to document.body, so its DOM position (and thus
  // native Tab order) doesn't follow it into place after the trigger. Once
  // it's opened via keyboard, move focus into it explicitly. Popper mounts
  // its content on a delayed internal effect, so a plain useEffect keyed on
  // `open` can run before the first item's DOM node exists; a callback ref
  // fires exactly when that node actually attaches, regardless of timing.
  const setItemRef = (index: number) => (node: HTMLDivElement | null) => {
    itemRefs.current[index] = node;
    if (index === 0 && node && focusFirstItemRef.current) {
      focusFirstItemRef.current = false;
      node.focus();
    }
  };

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    // Tab focusing the trigger already opens the panel via onFocus, so the
    // first item is usually already mounted by the time a key is pressed —
    // setOpen(true) on an already-true state is a no-op re-render, so the
    // callback ref above won't fire again. Focus directly when it's already
    // there; otherwise fall back to the pending-flag + callback-ref path for
    // the case where the panel genuinely isn't open yet.
    if (itemRefs.current[0]) {
      itemRefs.current[0].focus();
    } else {
      focusFirstItemRef.current = true;
      openNow();
    }
  };

  // Escape is handled once, here, rather than only on the portaled panel —
  // the Popper's content is a React child of this wrapper (even though
  // portaled elsewhere in the DOM), so keydowns from both the trigger and
  // every panel item already bubble to this handler. This is what lets
  // Escape close the flyout even when focus never left the trigger (e.g.
  // opened via hover, or via ArrowDown/Enter without tabbing further).
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    cancelClose();
    setOpen(false);
    if (document.activeElement !== triggerRef.current) {
      // Focus was inside the panel — move it back and suppress the
      // trigger's own onFocus (which would otherwise immediately reopen
      // the panel we just closed).
      suppressTriggerFocusOpenRef.current = true;
      triggerRef.current?.focus();
    }
  };

  // Arrow-key roving focus + Home/End inside the open panel — without this,
  // role="menu" below would be dishonest: a menu whose items aren't
  // arrow-key navigable doesn't behave like one.
  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    const count = itemRefs.current.length;
    if (count === 0) return;
    const current = itemRefs.current.findIndex((node) => node === document.activeElement);
    let nextIndex: number;
    if (event.key === 'ArrowDown') {
      nextIndex = current === -1 ? 0 : (current + 1) % count;
    } else if (event.key === 'ArrowUp') {
      nextIndex = current === -1 ? count - 1 : (current - 1 + count) % count;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = count - 1;
    } else {
      return;
    }
    event.preventDefault();
    itemRefs.current[nextIndex]?.focus();
  };

  const handleTriggerFocus = () => {
    if (suppressTriggerFocusOpenRef.current) {
      suppressTriggerFocusOpenRef.current = false;
      return;
    }
    openNow();
  };

  return (
    <div
      ref={anchorRef}
      onMouseEnter={openNow}
      onMouseLeave={scheduleClose}
      onFocus={handleTriggerFocus}
      onBlur={scheduleClose}
      onKeyDown={handleKeyDown}
    >
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
      <Popper open={open} anchorEl={anchorRef.current} placement="right-start" sx={{ zIndex: (theme) => theme.zIndex.drawer + 2 }}>
        <Paper
          elevation={3}
          onMouseEnter={openNow}
          onMouseLeave={scheduleClose}
          onFocus={openNow}
          onBlur={scheduleClose}
          sx={{ maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' }}
        >
          <List role="menu" onKeyDown={handleMenuKeyDown}>
            {items.map((item, index) => (
              <ListItemButton
                key={item.path}
                ref={setItemRef(index)}
                role="menuitem"
                onClick={() => {
                  navigate(item.path);
                  setOpen(false);
                }}
              >
                <ListItemText primary={item.label} />
              </ListItemButton>
            ))}
          </List>
        </Paper>
      </Popper>
    </div>
  );
}

export default NavGroupItem;
```

- [ ] **Step 4: Build and lint check**

Run: `npm run build -w client`
Expected: exits 0.

Run: `npm run lint -w client`
Expected: exits 0, no new errors (the pre-existing `react-refresh/only-export-components` warning in `PlayerDataContext.tsx` is unrelated and expected to still appear).

Vite's dev server (already running at `http://localhost:5173`) picks up this change via HMR automatically — no restart needed before the next step.

- [ ] **Step 5: Re-verify the Escape-from-trigger fix**

Using the playwright tools against the now-fixed code:
1. `browser_navigate` to `http://localhost:5173` (or `browser_navigate` reload if already there — a hard reload ensures HMR fully applied).
2. Open the "Crew" flyout the same way as Step 2 (click or Tab to the trigger).
3. `browser_snapshot` — confirm the panel is open and the trigger's node now shows `aria-expanded="true"` and `aria-haspopup="true"` in the snapshot.
4. With focus still on the trigger, `browser_press_key` with `Escape`.
5. `browser_snapshot` — confirm the panel is now closed (the 6 item rows are gone from the snapshot). This is the fix; if it's still open, the fix didn't take — re-check Step 3 was applied correctly.

- [ ] **Step 6: Verify arrow-key navigation and Home/End**

Using the playwright tools:
1. Open the "Crew" flyout, then `browser_press_key` `ArrowDown` on the trigger (existing behavior — should focus the first item, "3/4 Stars crew"). `browser_snapshot` to confirm focus.
2. `browser_press_key` `ArrowDown` three more times — confirm (via `browser_snapshot` after each, or a final snapshot) focus has moved through items 2, 3, 4 in order.
3. From the last item ("5 Stars Duplicates"), `browser_press_key` `ArrowDown` once more — confirm focus wraps to the first item ("3/4 Stars crew").
4. `browser_press_key` `ArrowUp` — confirm focus wraps back to the last item ("5 Stars Duplicates").
5. `browser_press_key` `Home` — confirm focus jumps to the first item.
6. `browser_press_key` `End` — confirm focus jumps to the last item.
7. Repeat a shortened version (open, `ArrowDown` from trigger, one `ArrowDown`, confirm it moves from item 1 to item 2 and wraps correctly at 2 items) on the "Ships" group (2 items: "5 Stars Ships," "4 Stars Ships") to confirm the fix isn't accidentally hardcoded to 6 items.

- [ ] **Step 7: Verify Escape-from-panel-item still works (regression check)**

Using the playwright tools: open the "Crew" flyout, `ArrowDown` from the trigger to focus the first item, then `browser_press_key` `Escape`. `browser_snapshot` — confirm the panel closed AND focus returned to the "Crew" trigger (this path already worked before this task; confirm it still does after the handler consolidation in Step 3).

- [ ] **Step 8: Verify the max-height/scroll fallback**

Using the playwright tools: `browser_resize` (or equivalent) to a short viewport — e.g. 1280x400 — then open the "Crew" flyout (6 items, tall enough to have clipped at the old un-capped height). `browser_snapshot` or `browser_take_screenshot` — confirm the panel is fully visible up to the viewport edge (not clipped/cut off) and, if the content exceeds the available height, that it's scrollable rather than overflowing past the viewport boundary. Resize back to a normal size (e.g. 1280x800) afterward.

- [ ] **Step 9: Verify click-to-navigate still works (regression check)**

Using the playwright tools: open the "Ships" flyout, click "5 Stars Ships." Confirm (via `browser_snapshot` or checking the page URL) navigation to `/5-stars-ships` occurred and the flyout closed.

- [ ] **Step 10: Commit**

```bash
git add client/src/layout/NavGroupItem.tsx
git commit -m "Fix NavGroupItem Escape-from-trigger, add ARIA menu semantics and arrow-key nav, add max-height/scroll fallback"
```
