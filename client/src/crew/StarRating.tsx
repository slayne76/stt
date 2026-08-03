import { Star } from '@mui/icons-material';
import { Box } from '@mui/material';

export interface StarRatingProps {
  rarity: number;
  maxRarity: number;
}

function StarRating({ rarity, maxRarity }: StarRatingProps) {
  return (
    <Box sx={{ display: 'inline-flex' }}>
      {Array.from({ length: maxRarity }, (_, i) => (
        <Star key={i} fontSize="small" sx={{ color: '#FFD700', opacity: i < rarity ? 1 : 0.3 }} />
      ))}
    </Box>
  );
}

export default StarRating;
