import { Box, Typography } from '@mui/material';
import type { CrewMember } from '../types/crew';
import type { Collection } from '../types/collection';
import type { OwnedItem } from '../types/item';
import { getCrewTier, getEquipmentSlotsRemaining } from '../crew/getters';
import { getCrewCollections } from './getters';
import StarRating from '../crew/StarRating';
import StatusChip from '../components/StatusChip';
import { STRIPE_COLOR } from '../theme';

export interface CollectionCrewListProps {
  crew: CrewMember[];
  items: OwnedItem[];
  allCollections: Collection[];
  currentCollectionId: number;
}

function CollectionCrewList({ crew, items, allCollections, currentCollectionId }: CollectionCrewListProps) {
  return (
    <Box sx={{ py: 1 }}>
      {crew.map((c, i) => {
        const tier = getCrewTier(c, items);
        const isReady = tier === 'ready';
        const isNeedsWork = tier === 'needsWork';
        const crewCollections = getCrewCollections(c, allCollections);
        const otherCollections = crewCollections.filter((col) => col.id !== currentCollectionId);
        return (
          <Box
            key={c.id}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              py: 0.5,
              // Cancels parent TableCell's 16px padding so each stripe reaches the cell edges
              px: 2,
              mx: -2,
              bgcolor: i % 2 === 1 ? STRIPE_COLOR : 'transparent',
            }}
          >
            <StarRating rarity={c.rarity} maxRarity={c.max_rarity} />
            <Typography sx={{ fontWeight: isReady ? 'bold' : 'normal', flexShrink: 0, whiteSpace: 'nowrap' }}>
              {c.name}
            </Typography>
            {isReady && <StatusChip label="Ready" color="success" />}
            {isNeedsWork && <StatusChip label={`${c.max_rarity}/${c.max_rarity} Stars`} color="warning" />}
            <Typography color="text.secondary" sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
              Level: {c.level}
            </Typography>
            <Typography
              color="text.secondary"
              sx={{ minWidth: 80, textAlign: 'right', flexShrink: 0, whiteSpace: 'nowrap' }}
            >
              Items: {getEquipmentSlotsRemaining(c)}
            </Typography>
            <Typography color="text.secondary" sx={{ ml: 'auto', flexShrink: 0, whiteSpace: 'nowrap' }}>
              Total Collections: {crewCollections.length}
            </Typography>
            <Typography color="text.secondary" sx={{ minWidth: 0 }}>
              Other Collections: {otherCollections.map((col) => col.name).join(', ')}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

export default CollectionCrewList;
