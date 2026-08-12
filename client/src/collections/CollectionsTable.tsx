import { Fragment } from 'react';
import {
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type { CrewMember } from '../types/crew';
import type { Collection } from '../types/collection';
import type { OwnedItem } from '../types/item';
import { getCuratedRewards } from './rewards';
import { isMaxedOut } from './sorters';
import { usePagination } from '../lib/usePagination';
import CollectionCrewList from './CollectionCrewList';
import TablePaginationFooter from '../components/TablePaginationFooter';

export interface CollectionsTableProps {
  collections: Collection[];
  items: OwnedItem[];
  qualifyingCrewByCollection: Map<number, CrewMember[]>;
  upgradableIds: Set<number>;
}

function CollectionsTable({ collections, items, qualifyingCrewByCollection, upgradableIds }: CollectionsTableProps) {
  const { pageItems, page, pageSize, showPagination, handlePageChange, handlePageSizeChange } =
    usePagination(collections);

  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Collection</TableCell>
            <TableCell>Rewards</TableCell>
            <TableCell align="right">Progress</TableCell>
            <TableCell align="right">Milestone</TableCell>
            <TableCell align="right">Crew</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {pageItems.map((collection, index) => {
            const qualifyingCrew = qualifyingCrewByCollection.get(collection.id) ?? [];
            const upgradable = upgradableIds.has(collection.id);
            const rewards = getCuratedRewards(collection);
            const progressDisplay = isMaxedOut(collection)
              ? 'MAX'
              : `${collection.progress}/${collection.milestone.goal}`;
            const stripeColor = index % 2 === 1 ? 'action.hover' : 'transparent';
            return (
              <Fragment key={collection.id}>
                <TableRow sx={{ bgcolor: stripeColor }}>
                  <TableCell>{page * pageSize + index + 1}</TableCell>
                  <TableCell>
                    {collection.name}
                    {upgradable && <Chip label="Upgradable" size="small" color="info" sx={{ ml: 1 }} />}
                  </TableCell>
                  <TableCell>{rewards.join(', ')}</TableCell>
                  <TableCell align="right">{progressDisplay}</TableCell>
                  <TableCell align="right">{collection.claimable_milestone_index}</TableCell>
                  <TableCell align="right">{qualifyingCrew.length}</TableCell>
                </TableRow>
                {/* Both this row and the summary row above alternate by collection index. This row is
                    always at an even DOM position (detail rows always follow their summary row), so
                    theme.ts's `nth-of-type(even)` rule (specificity (0,3,0)) would otherwise override a
                    plain `sx` background (specificity (0,1,0)) regardless of this collection's actual
                    parity. `!important` is required to make this row's own alternating color win.
                    Do not remove it — that would silently make every detail row the same shade again.
                    We use the theme-callback form of `sx` (not the `'action.hover'` shorthand string)
                    because appending `!important` to that shorthand breaks its palette-path lookup —
                    the callback resolves the token to its real `rgba(...)` value first. */}
                <TableRow
                  sx={{
                    bgcolor: (theme) =>
                      `${index % 2 === 1 ? theme.palette.action.hover : 'transparent'} !important`,
                  }}
                >
                  <TableCell sx={{ bgcolor: 'action.selected' }} colSpan={6}>
                    {qualifyingCrew.length === 0 ? (
                      <Typography color="text.secondary" sx={{ py: 1 }}>
                        No crew match.
                      </Typography>
                    ) : (
                      <CollectionCrewList crew={qualifyingCrew} items={items} />
                    )}
                  </TableCell>
                </TableRow>
              </Fragment>
            );
          })}
        </TableBody>
        <TablePaginationFooter
          show={showPagination}
          count={collections.length}
          page={page}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          colSpan={6}
        />
      </Table>
    </TableContainer>
  );
}

export default CollectionsTable;
