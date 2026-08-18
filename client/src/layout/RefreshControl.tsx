import { useState } from 'react';
import { Box, Button, CircularProgress, MenuItem, Select, type SelectChangeEvent } from '@mui/material';

export type RefreshOption = 'player' | 'assets' | 'catalog' | 'all';

interface RefreshControlProps {
  playerLoading: boolean;
  onRefreshPlayer: () => Promise<void>;
  assetsRefreshing: boolean;
  onRefreshAssets: () => Promise<void>;
  catalogRefreshing: boolean;
  onRefreshCatalog: () => Promise<void>;
  shipCatalogRefreshing: boolean;
  onRefreshShipCatalog: () => Promise<void>;
}

const OPTIONS: { value: RefreshOption; label: string }[] = [
  { value: 'player', label: 'Refresh player data' },
  { value: 'assets', label: 'Refresh assets' },
  { value: 'catalog', label: 'Refresh catalogs' },
  { value: 'all', label: 'Refresh all' },
];

function RefreshControl({
  playerLoading,
  onRefreshPlayer,
  assetsRefreshing,
  onRefreshAssets,
  catalogRefreshing,
  onRefreshCatalog,
  shipCatalogRefreshing,
  onRefreshShipCatalog,
}: RefreshControlProps) {
  const [selected, setSelected] = useState<RefreshOption>('player');

  const isRefreshing =
    selected === 'all'
      ? playerLoading || assetsRefreshing || catalogRefreshing || shipCatalogRefreshing
      : selected === 'player'
        ? playerLoading
        : selected === 'assets'
          ? assetsRefreshing
          : catalogRefreshing || shipCatalogRefreshing;

  function handleChange(event: SelectChangeEvent<RefreshOption>) {
    setSelected(event.target.value as RefreshOption);
  }

  async function handleApply() {
    if (selected === 'player') {
      await onRefreshPlayer();
    } else if (selected === 'assets') {
      await onRefreshAssets();
    } else if (selected === 'catalog') {
      await Promise.allSettled([onRefreshCatalog(), onRefreshShipCatalog()]);
    } else {
      await Promise.allSettled([onRefreshPlayer(), onRefreshAssets(), onRefreshCatalog(), onRefreshShipCatalog()]);
    }
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 'auto' }}>
      <Select<RefreshOption>
        size="small"
        value={selected}
        onChange={handleChange}
        disabled={isRefreshing}
        inputProps={{ 'aria-label': 'Refresh target' }}
        sx={{
          color: 'common.white',
          '.MuiOutlinedInput-notchedOutline': { borderColor: 'common.white' },
          '.MuiSvgIcon-root': { color: 'common.white' },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'common.white' },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'common.white' },
          '&.Mui-disabled .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.5)' },
          '&.Mui-disabled .MuiSelect-select': { WebkitTextFillColor: 'rgba(255,255,255,0.5)' },
        }}
      >
        {OPTIONS.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
      <Button
        variant="contained"
        color="success"
        onClick={() => void handleApply()}
        disabled={isRefreshing}
        startIcon={isRefreshing ? <CircularProgress size={16} color="inherit" /> : undefined}
        sx={{ '&.Mui-disabled': { bgcolor: 'success.dark', color: 'common.white' } }}
      >
        Apply
      </Button>
    </Box>
  );
}

export default RefreshControl;
