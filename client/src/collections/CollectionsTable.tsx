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
import { BLOCK_BOUNDARY_COLOR, FORCE_TRANSPARENT_BGCOLOR } from '../theme';
import { getCuratedRewards } from './rewards';
import { isMaxedOut } from './sorters';
import { usePagination } from '../lib/usePagination';
import CollectionCrewList from './CollectionCrewList';
import TablePaginationFooter from '../components/TablePaginationFooter';

export interface CollectionsTableProps {
  // `collections` is search-filtered and drives only the top-level pagination; `allCollections` is the
  // full, unfiltered list needed for correct per-crew collection-membership counts (using the filtered
  // list there would silently undercount when the current search hides one of a crew's other collections).
  collections: Collection[];
  allCollections: Collection[];
  items: OwnedItem[];
  qualifyingCrewByCollection: Map<number, CrewMember[]>;
  upgradableIds: Set<number>;
  // A collection in this set is also in `upgradableIds` (Ready-alone coverage implies
  // combined coverage) — drives the "Upgradable" chip's color (green), not its visibility.
  readyAloneIds: Set<number>;
}

function CollectionsTable({
  collections,
  allCollections,
  items,
  qualifyingCrewByCollection,
  upgradableIds,
  readyAloneIds,
}: CollectionsTableProps) {
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
            const readyAlone = readyAloneIds.has(collection.id);
            const rewards = getCuratedRewards(collection);
            const progressDisplay = isMaxedOut(collection)
              ? 'MAX'
              : `${collection.progress}/${collection.milestone.goal}`;
            return (
              <Fragment key={collection.id}>
                <TableRow sx={{ bgcolor: FORCE_TRANSPARENT_BGCOLOR }}>
                  <TableCell>{page * pageSize + index + 1}</TableCell>
                  <TableCell>
                    {collection.name}
                    {upgradable && (
                      <Chip label="Upgradable" size="small" color={readyAlone ? 'success' : 'info'} sx={{ ml: 1 }} />
                    )}
                  </TableCell>
                  <TableCell>{rewards.join(', ')}</TableCell>
                  <TableCell align="right">{progressDisplay}</TableCell>
                  <TableCell align="right">{collection.claimable_milestone_index}</TableCell>
                  <TableCell align="right">{qualifyingCrew.length}</TableCell>
                </TableRow>
                <TableRow sx={{ bgcolor: FORCE_TRANSPARENT_BGCOLOR }}>
                  <TableCell
                    colSpan={6}
                    sx={{ borderBottom: `2px solid ${BLOCK_BOUNDARY_COLOR}` }}
                  >
                    {qualifyingCrew.length === 0 ? (
                      <Typography color="text.secondary" sx={{ py: 1 }}>
                        No crew match.
                      </Typography>
                    ) : (
                      <CollectionCrewList
                        crew={qualifyingCrew}
                        items={items}
                        allCollections={allCollections}
                        currentCollectionId={collection.id}
                      />
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
