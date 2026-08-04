import { useRef, useState } from 'react';
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
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
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

  return (
    <div ref={anchorRef} onMouseEnter={openNow} onMouseLeave={scheduleClose} onFocus={openNow} onBlur={scheduleClose}>
      <ListItemButton sx={{ cursor: 'default' }}>
        <ListItemText primary={label} />
        <ChevronRight fontSize="small" />
      </ListItemButton>
      <Popper open={open} anchorEl={anchorRef.current} placement="right-start" sx={{ zIndex: (theme) => theme.zIndex.drawer + 2 }}>
        <Paper elevation={3} onMouseEnter={openNow} onMouseLeave={scheduleClose} onFocus={openNow} onBlur={scheduleClose}>
          <List>
            {items.map((item) => (
              <ListItemButton
                key={item.path}
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
