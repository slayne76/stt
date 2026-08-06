# NavGroupItem — Escape/ARIA/Max-Height Follow-Up — Design

## What this is

Three small, previously-deferred gaps in `NavGroupItem`
(`client/src/layout/NavGroupItem.tsx`), all flagged across the Ships
pages and Crew nav group features' final reviews and explicitly grouped
in the deferred-issues backlog as "worth pairing... as one small
follow-up": Escape doesn't close the flyout when focus is still on the
trigger, the flyout has no ARIA menu semantics, and a tall group (the
"Crew" group, 6 items) has no max-height/scroll fallback on a short
viewport. One file, no interface changes, no new dependencies.

## 1. Escape-from-trigger fix

**The bug:** `handlePanelKeyDown` (the current `Escape` handler,
`NavGroupItem.tsx:80-91`) is attached only to the portaled `Paper`. It
never fires if `Escape` is pressed while focus is still on the trigger —
the most common state right after opening via mouse hover, or via
`ArrowDown`/`Enter` on the trigger without then tabbing further into the
panel.

**The fix:** consolidate `Escape` handling onto the outer wrapper `div`'s
`onKeyDown` (`NavGroupItem.tsx:102`), replacing `handlePanelKeyDown` and
removing it from the `Paper`:

```ts
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
```

This works because the `Popper`'s content, though portaled elsewhere in
the DOM, stays a React child of the wrapper `div` — React's synthetic
event bubbling follows the fiber tree, not the DOM tree, so keydowns from
both the trigger `ListItemButton` and every panel item already reach this
one handler. (Same fact the Ships pages flyout's hover/leave logic
already relies on — see "Ships pages" in `docs/PROJECT_STATE.md`.) The
`document.activeElement !== triggerRef.current` guard skips the
refocus-and-suppress dance when focus was already on the trigger — there
is nothing to move and nothing to suppress in that case, just close.

`handleTriggerKeyDown` (`ArrowDown`/`Enter`/`Space` opens the panel and
focuses the first item) is unaffected — it stays on the trigger
`ListItemButton` specifically, since it only makes sense when the trigger
itself has focus.

## 2. Full ARIA menu semantics

- Trigger `ListItemButton` (`NavGroupItem.tsx:103`) gains
  `aria-haspopup="true"` and `aria-expanded={open}`.
- The panel's `List` (`NavGroupItem.tsx:116`) gains `role="menu"`; each
  item `ListItemButton` (`NavGroupItem.tsx:118-127`) gains
  `role="menuitem"`.
- **Arrow-key roving focus inside the panel**, replacing the current
  single `firstItemRef` with an array of item refs (`itemRefs.current:
  (HTMLDivElement | null)[]`, populated the same way `setFirstItemRef`
  already does today, just for every index instead of only index 0). One
  keydown handler on the panel's `List`:
  - `ArrowDown` — focus the next item, wrapping from the last to the first.
  - `ArrowUp` — focus the previous item, wrapping from the first to the last.
  - `Home` — focus the first item.
  - `End` — focus the last item.
  - `Escape` is NOT handled here — it's already handled at the wrapper
    `div` level (Section 1) and bubbles there the same way.
- **No typeahead search** (type a letter to jump to a matching item).
  Not something the backlog asked for, and every existing/plausible
  group is short (2–6 items today) — YAGNI.

**Knock-on change from replacing `firstItemRef` with `itemRefs`:**
`handleTriggerKeyDown` (`NavGroupItem.tsx:61-78`) currently checks
`firstItemRef.current` to decide whether the panel's first item is
already mounted (focus it directly) or not yet (set the pending-focus
flag and open). That check becomes `itemRefs.current[0]` — same logic,
new array, no other behavior change. `setFirstItemRef`
(`NavGroupItem.tsx:53-59`, the callback ref that focuses the first item
once it mounts after a keyboard-triggered open) becomes a small factory,
`setItemRef(index)`, called as `ref={setItemRef(index)}` in the `.map`
— only `index === 0` still carries the pending-focus-on-mount behavior;
every other index just records itself into `itemRefs.current`.

## 3. Max-height + scroll fallback

The `Paper` (`NavGroupItem.tsx:108-115`) gains
`sx={{ maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' }}` — caps the
panel to just under the full viewport height and scrolls instead of
clipping. `32px` is a small fixed margin (16px top + 16px bottom), not
computed from the anchor's position — simple and sufficient for the
stated problem (content taller than the viewport), not a general
overflow-avoidance system.

**Explicitly out of scope:** `Popper` flip/collision handling (repositioning
the panel if it would render partially off-screen). That's a different,
unrequested feature — this only addresses "content taller than viewport
clips instead of scrolling," the specific gap the backlog named.

## Scope

One file: `client/src/layout/NavGroupItem.tsx`. No changes to
`NavGroupItemProps` (still `{ label: string; items: { label: string;
path: string }[] }`), no changes to `AppLayout.tsx` or any page — both
existing consumers ("Crew," 6 items; "Ships," 2 items) pick up all three
fixes automatically, the same zero-per-consumer-change story every prior
`NavGroupItem` change has had. No new dependencies — `role`/`aria-*` are
plain DOM attributes MUI's `ListItemButton`/`List` forward as-is; no ARIA
library, no focus-trap package.

## Verification

This project has no automated test framework and no browser-testing
harness wired into CI (deliberate, project-wide choice) — verification
for this feature is TypeScript strict mode + ESLint + interactive
browser verification via the `playwright`/`chrome-devtools` MCP tooling
that became available this session (see "Browser-based visual
verification (2026-08-06)" in `docs/PROJECT_STATE.md`), the same tooling
just used to confirm the crew/ship image thumbnails render. Concretely,
against the real running dev server on both the "Crew" (6-item) and
"Ships" (2-item) groups:

1. Tab to the trigger, confirm the panel opens (existing behavior,
   regression check) and `aria-expanded="true"`/`aria-haspopup="true"`
   are present on the trigger element.
2. With focus still on the trigger (panel open, never tabbed further),
   press `Escape` — confirm the panel closes. This is the specific
   behavior that doesn't work today; it's the one case this feature
   exists to fix.
3. `ArrowDown` from the trigger — confirm focus lands on the first item
   (existing behavior, regression check).
4. `ArrowDown`/`ArrowUp` repeatedly inside the panel — confirm focus
   cycles through every item and wraps at both ends.
5. `Home`/`End` inside the panel — confirm focus jumps to the first/last
   item.
6. `Escape` with focus on a panel item — confirm the panel closes and
   focus returns to the trigger (existing behavior, regression check —
   this path already worked, must keep working after the handler moves).
7. Resize the browser viewport short enough to clip the 6-item "Crew"
   panel at its old height, open it, confirm it scrolls instead of
   clipping.
8. Click an item — confirm navigation and panel-close still work
   (existing behavior, regression check).
