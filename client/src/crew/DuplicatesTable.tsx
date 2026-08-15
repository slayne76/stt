import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import type { Collection } from '../types/collection';
import { getEquipmentSlotsRemaining, type DuplicateCrewGroup } from './getters';
import { getCrewCollections } from '../collections/getters';
import { usePagination } from '../lib/usePagination';
import StarRating from './StarRating';
import Thumbnail from '../assets/Thumbnail';
import TablePaginationFooter from '../components/TablePaginationFooter';

export interface DuplicatesTableProps {
  groups: DuplicateCrewGroup[];
  collections: Collection[];
}

function DuplicatesTable({ groups, collections }: DuplicatesTableProps) {
  const { pageItems, page, pageSize, showPagination, handlePageChange, handlePageSizeChange } = usePagination(groups);

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
            <TableCell align="right">Collections</TableCell>
            <TableCell align="right">Total Owned</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {pageItems.map((group, index) => {
            const c = group.crew;
            const crewCollections = getCrewCollections(c, collections);
            return (
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
                <TableCell align="right">{crewCollections.length}</TableCell>
                <TableCell align="right">{group.totalOwned}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TablePaginationFooter
          show={showPagination}
          count={groups.length}
          page={page}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          colSpan={8}
        />
      </Table>
    </TableContainer>
  );
}

export default DuplicatesTable;
