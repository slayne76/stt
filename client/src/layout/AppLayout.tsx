import { AppBar, Box, Button, CircularProgress, Drawer, List, ListItemButton, ListItemText, Toolbar, Typography } from '@mui/material';
import { Outlet, useNavigate } from 'react-router-dom';
import { usePlayerData } from '../hooks/usePlayerData';
import NavGroupItem from './NavGroupItem';

const DRAWER_WIDTH = 220;

interface NavLink {
  label: string;
  path: string;
}

interface NavGroup {
  label: string;
  children: NavLink[];
}

function isNavGroup(item: NavLink | NavGroup): item is NavGroup {
  return 'children' in item;
}

const NAV_ITEMS: (NavLink | NavGroup)[] = [
  { label: 'Overview', path: '/' },
  { label: '3/4 Stars crew', path: '/3-4-stars-crew' },
  { label: '4/5 Stars crew', path: '/4-5-stars-crew' },
  { label: '4/4 Stars crew (ready)', path: '/4-4-stars-crew-ready' },
  { label: '4/4 Stars crew', path: '/4-4-stars-crew' },
  { label: 'Collections', path: '/collections' },
  { label: '4 Stars Duplicates', path: '/4-stars-duplicates' },
  { label: '5 Stars Duplicates', path: '/5-stars-duplicates' },
  {
    label: 'Ships',
    children: [
      { label: '5 Stars Ships', path: '/5-stars-ships' },
      { label: '4 Stars Ships', path: '/4-stars-ships' },
    ],
  },
];

function AppLayout() {
  const navigate = useNavigate();
  const { refresh, loading } = usePlayerData();

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <Typography variant="h6" noWrap component="div">
            STT Tracker
          </Typography>
          <Button
            variant="contained"
            color="success"
            onClick={() => void refresh()}
            disabled={loading}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{
              ml: 'auto',
              '&.Mui-disabled': { bgcolor: 'success.dark', color: 'common.white' },
            }}
          >
            Refresh
          </Button>
        </Toolbar>
      </AppBar>
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
        }}
      >
        <Toolbar />
        <List>
          {NAV_ITEMS.map((item) =>
            isNavGroup(item) ? (
              <NavGroupItem key={item.label} label={item.label} items={item.children} />
            ) : (
              <ListItemButton key={item.path} onClick={() => navigate(item.path)}>
                <ListItemText primary={item.label} />
              </ListItemButton>
            )
          )}
        </List>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
}

export default AppLayout;
