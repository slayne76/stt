import { useEffect, useRef, useState } from 'react';
import { ChevronRight } from '@mui/icons-material';
import { List, ListItemButton, ListItemText, Paper, Popper } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import type { NavLink } from '../routes';

export interface NavGroupItemProps {
  label: string;
  items: NavLink[];
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
    const count = items.length;
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
          <List role="menu" aria-label={label} onKeyDown={handleMenuKeyDown}>
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
          </List>
        </Paper>
      </Popper>
    </div>
  );
}

export default NavGroupItem;
