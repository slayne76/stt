import { Chip } from '@mui/material';
import type { ChipProps } from '@mui/material';

export interface StatusChipProps {
  label: string;
  color: ChipProps['color'];
}

function StatusChip({ label, color }: StatusChipProps) {
  return <Chip label={label} size="small" color={color} />;
}

export default StatusChip;
