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

// Fixed pixel widths (not fr/auto) so every row's independent grid resolves
// to the same column positions, producing table-like vertical alignment
// without a shared grid container or visible header row.
const GRID_TEMPLATE_COLUMNS = '110px 220px 140px 120px 100px 200px 1fr';

function Field({ label, value, wrap = false }: { label: string; value: React.ReactNode; wrap?: boolean }) {
  return (
    <Typography color="text.secondary" sx={wrap ? undefined : { whiteSpace: 'nowrap' }}>
      <Box component="span" sx={{ fontWeight: 'bold' }}>
        {label}
      </Box>{' '}
      {value}
    </Typography>
  );
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
              display: 'grid',
              gridTemplateColumns: GRID_TEMPLATE_COLUMNS,
              alignItems: 'center',
              columnGap: 1,
              py: 0.5,
              // Cancels parent TableCell's 16px padding so each stripe reaches the cell edges
              px: 2,
              mx: -2,
              bgcolor: i % 2 === 1 ? STRIPE_COLOR : 'transparent',
            }}
          >
            <StarRating rarity={c.rarity} maxRarity={c.max_rarity} />
            <Typography sx={{ fontWeight: isReady ? 'bold' : 'normal' }}>{c.name}</Typography>
            <Box>
              {isReady && <StatusChip label="Ready" color="success" />}
              {isNeedsWork && <StatusChip label={`${c.max_rarity}/${c.max_rarity} Stars`} color="warning" />}
            </Box>
            <Field label="Level:" value={c.level} />
            <Field label="Items:" value={getEquipmentSlotsRemaining(c)} />
            <Field label="Total Collections:" value={crewCollections.length} />
            <Field
              label="Other Collections:"
              value={otherCollections.map((col) => col.name).join(', ')}
              wrap
            />
          </Box>
        );
      })}
    </Box>
  );
}

export default CollectionCrewList;
