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
  const firstItemRef = useRef<HTMLDivElement>(null);
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
  const setFirstItemRef = (node: HTMLDivElement | null) => {
    firstItemRef.current = node;
    if (node && focusFirstItemRef.current) {
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
    if (firstItemRef.current) {
      firstItemRef.current.focus();
    } else {
      focusFirstItemRef.current = true;
      openNow();
    }
  };

  const handlePanelKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelClose();
      setOpen(false);
      // Returning focus to the trigger fires its own onFocus (openNow), which
      // would immediately reopen the panel we just closed. Suppress that one
      // resulting focus event only.
      suppressTriggerFocusOpenRef.current = true;
      triggerRef.current?.focus();
    }
  };

  const handleTriggerFocus = () => {
    if (suppressTriggerFocusOpenRef.current) {
      suppressTriggerFocusOpenRef.current = false;
      return;
    }
    openNow();
  };

  return (
    <div ref={anchorRef} onMouseEnter={openNow} onMouseLeave={scheduleClose} onFocus={handleTriggerFocus} onBlur={scheduleClose}>
      <ListItemButton ref={triggerRef} sx={{ cursor: 'default' }} onKeyDown={handleTriggerKeyDown}>
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
          onKeyDown={handlePanelKeyDown}
        >
          <List>
            {items.map((item, index) => (
              <ListItemButton
                key={item.path}
                ref={index === 0 ? setFirstItemRef : undefined}
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
