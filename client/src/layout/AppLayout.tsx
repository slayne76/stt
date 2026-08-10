import { useEffect, useState } from 'react';
import { Alert, AppBar, Box, Drawer, List, ListItemButton, ListItemText, Snackbar, Toolbar, Typography } from '@mui/material';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { usePlayerData } from '../hooks/usePlayerData';
import { useCrewCatalog } from '../hooks/useCrewCatalog';
import { refreshAssets } from '../api/assetsApi';
import NavGroupItem from './NavGroupItem';
import ErrorBoundary from '../components/ErrorBoundary';
import RefreshControl from './RefreshControl';

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
  {
    label: 'Crew',
    children: [
      { label: '5 Stars Crew', path: '/5-stars-crew' },
      { label: '3/4 Stars crew', path: '/3-4-stars-crew' },
      { label: '4/5 Stars crew', path: '/4-5-stars-crew' },
      { label: '4/4 Stars crew (ready)', path: '/4-4-stars-crew-ready' },
      { label: '4/4 Stars crew', path: '/4-4-stars-crew' },
      { label: '4 Stars Duplicates', path: '/4-stars-duplicates' },
      { label: '5 Stars Duplicates', path: '/5-stars-duplicates' },
      { label: 'QPs', path: '/qps' },
      { label: '5 & 4 Stars Frozen Crew', path: '/5-4-stars-frozen-crew' },
    ],
  },
  {
    label: 'Ships',
    children: [
      { label: '5 Stars Ships', path: '/5-stars-ships' },
      { label: '4 Stars Ships', path: '/4-stars-ships' },
    ],
  },
  { label: 'Collections', path: '/collections' },
];

function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh, loading } = usePlayerData();
  const [refreshingAssets, setRefreshingAssets] = useState(false);
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const [assetsSuccess, setAssetsSuccess] = useState(false);

  const { refresh: refreshCatalog, loading: catalogRefreshing, error: catalogError } = useCrewCatalog();
  const [catalogErrorSnackbarOpen, setCatalogErrorSnackbarOpen] = useState(false);

  useEffect(() => {
    if (catalogError) setCatalogErrorSnackbarOpen(true);
  }, [catalogError]);

  async function handleRefreshAssets() {
    setRefreshingAssets(true);
    setAssetsError(null);
    setAssetsSuccess(false);
    try {
      await refreshAssets();
      setAssetsSuccess(true);
    } catch (err) {
      setAssetsError(err instanceof Error ? err.message : 'Failed to refresh asset cache');
    } finally {
      setRefreshingAssets(false);
    }
  }

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <Typography variant="h6" noWrap component="div">
            STT Tracker
          </Typography>
          <RefreshControl
            playerLoading={loading}
            onRefreshPlayer={refresh}
            assetsRefreshing={refreshingAssets}
            onRefreshAssets={handleRefreshAssets}
            catalogRefreshing={catalogRefreshing}
            onRefreshCatalog={refreshCatalog}
          />
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
        <ErrorBoundary key={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </Box>
      <Snackbar open={assetsError !== null} autoHideDuration={6000} onClose={() => setAssetsError(null)}>
        <Alert severity="error" onClose={() => setAssetsError(null)}>
          {assetsError}
        </Alert>
      </Snackbar>
      <Snackbar open={assetsSuccess} autoHideDuration={6000} onClose={() => setAssetsSuccess(false)}>
        <Alert severity="success" onClose={() => setAssetsSuccess(false)}>
          Asset cache refreshed
        </Alert>
      </Snackbar>
      <Snackbar
        open={catalogErrorSnackbarOpen && catalogError !== null}
        autoHideDuration={6000}
        onClose={() => setCatalogErrorSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity="error" onClose={() => setCatalogErrorSnackbarOpen(false)}>
          {catalogError}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default AppLayout;
