import { Box, Typography } from '@mui/material';
import type { PolestarCatalogEntry } from '../types/polestarCatalogEntry';
import { getPolestarTypeColor } from './getters';
import Thumbnail from '../assets/Thumbnail';

// Grey — the "eligible but not currently selected" state in the Add/Edit
// dialog's picker. Never actually shown by the read-only table (a rendered
// slot there is always a real, chosen Polestar, so it always passes
// selected={true}).
const UNSELECTED_BADGE_COLOR = '#9E9E9E';

export interface PolestarBadgeProps {
  entry: PolestarCatalogEntry;
  // Colored by type (rarity red / trait purple / skill blue) when true,
  // grey when false.
  selected: boolean;
  // Presence makes the badge clickable (cursor pointer, hover-free by
  // design — no hover state was specced). Omit for a static display.
  onClick?: () => void;
  // Only meaningful alongside onClick — dims the badge and suppresses the
  // click handler (used once 4 Polestars are already selected).
  disabled?: boolean;
}

function PolestarBadge({ entry, selected, onClick, disabled }: PolestarBadgeProps) {
  const interactive = onClick !== undefined && !disabled;
  return (
    <Box
      onClick={interactive ? onClick : undefined}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: 56,
        gap: '2px',
        mx: 'auto',
        cursor: interactive ? 'pointer' : 'default',
        opacity: onClick !== undefined && disabled ? 0.4 : 1,
      }}
    >
      <Thumbnail
        asset={entry.icon}
        circleBackgroundColor={selected ? getPolestarTypeColor(entry.filter.type) : UNSELECTED_BADGE_COLOR}
      />
      <Typography variant="caption" align="center" sx={{ lineHeight: 1.1 }}>
        {entry.short_name}
      </Typography>
    </Box>
  );
}

export default PolestarBadge;
