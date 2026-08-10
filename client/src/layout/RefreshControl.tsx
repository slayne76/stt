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
}

const OPTIONS: { value: RefreshOption; label: string }[] = [
  { value: 'player', label: 'Refresh player data' },
  { value: 'assets', label: 'Refresh assets' },
  { value: 'catalog', label: 'Refresh catalog' },
  { value: 'all', label: 'Refresh all' },
];

function RefreshControl({
  playerLoading,
  onRefreshPlayer,
  assetsRefreshing,
  onRefreshAssets,
  catalogRefreshing,
  onRefreshCatalog,
}: RefreshControlProps) {
  const [selected, setSelected] = useState<RefreshOption>('player');

  const isRefreshing =
    selected === 'all'
      ? playerLoading || assetsRefreshing || catalogRefreshing
      : selected === 'player'
        ? playerLoading
        : selected === 'assets'
          ? assetsRefreshing
          : catalogRefreshing;

  function handleChange(event: SelectChangeEvent<RefreshOption>) {
    setSelected(event.target.value as RefreshOption);
  }

  async function handleApply() {
    if (selected === 'player') {
      await onRefreshPlayer();
    } else if (selected === 'assets') {
      await onRefreshAssets();
    } else if (selected === 'catalog') {
      await onRefreshCatalog();
    } else {
      await Promise.allSettled([onRefreshPlayer(), onRefreshAssets(), onRefreshCatalog()]);
    }
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 'auto' }}>
      <Select<RefreshOption>
        size="small"
        value={selected}
        onChange={handleChange}
        disabled={isRefreshing}
        sx={{
          color: 'common.white',
          '.MuiOutlinedInput-notchedOutline': { borderColor: 'common.white' },
          '.MuiSvgIcon-root': { color: 'common.white' },
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
