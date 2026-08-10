import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TablePagination,
  TableRow,
} from '@mui/material';
import type { CrewMember } from '../types/crew';
import type { Collection } from '../types/collection';
import { getEquipmentSlotsRemaining } from './getters';
import { getCollectionCount, getCrewCollections } from '../collections/getters';
import { PAGE_SIZE_OPTIONS, usePagination } from '../lib/usePagination';
import StarRating from './StarRating';
import Thumbnail from '../assets/Thumbnail';

export interface CrewTableProps {
  crew: CrewMember[];
  collections: Collection[];
  showCollectionsNames: boolean;
}

function CrewTable({ crew, collections, showCollectionsNames }: CrewTableProps) {
  const { pageItems, page, pageSize, showPagination, handlePageChange, handlePageSizeChange } = usePagination(crew);

  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Image</TableCell>
            <TableCell>Stars</TableCell>
            <TableCell>Name</TableCell>
            <TableCell align="right">Level</TableCell>
            <TableCell align="right">Items to equip</TableCell>
            <TableCell align="right">{showCollectionsNames ? 'Total collections' : 'Collections'}</TableCell>
            {showCollectionsNames && <TableCell>Collections names</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {pageItems.map((c, index) => (
            <TableRow key={c.id}>
              <TableCell>{page * pageSize + index + 1}</TableCell>
              <TableCell>
                <Thumbnail asset={c.portrait} />
              </TableCell>
              <TableCell>
                <StarRating rarity={c.rarity} maxRarity={c.max_rarity} />
              </TableCell>
              <TableCell>{c.name}</TableCell>
              <TableCell align="right">{c.level}</TableCell>
              <TableCell align="right">{getEquipmentSlotsRemaining(c)}</TableCell>
              <TableCell align="right">{getCollectionCount(c, collections)}</TableCell>
              {showCollectionsNames && (
                <TableCell>
                  {getCrewCollections(c, collections)
                    .map((col) => col.name)
                    .join(', ')}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
        {showPagination && (
          <TableFooter>
            <TableRow>
              <TablePagination
                count={crew.length}
                page={page}
                onPageChange={handlePageChange}
                rowsPerPage={pageSize}
                onRowsPerPageChange={handlePageSizeChange}
                rowsPerPageOptions={PAGE_SIZE_OPTIONS}
                colSpan={showCollectionsNames ? 8 : 7}
              />
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </TableContainer>
  );
}

export default CrewTable;
