import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import type { CatalogEntry } from '../types/catalogEntry';
import { usePagination } from '../lib/usePagination';
import StarRating from '../crew/StarRating';
import Thumbnail from '../assets/Thumbnail';
import { ASSET_BASE_URL } from '../assets/config';
import TablePaginationFooter from '../components/TablePaginationFooter';

export interface FrozenCrewTableProps {
  crew: CatalogEntry[];
}

function FrozenCrewTable({ crew }: FrozenCrewTableProps) {
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
          </TableRow>
        </TableHead>
        <TableBody>
          {pageItems.map((c, index) => (
            <TableRow key={c.archetype_id}>
              <TableCell>{page * pageSize + index + 1}</TableCell>
              <TableCell>
                <Thumbnail url={`${ASSET_BASE_URL}/${c.imageUrlPortrait}`} />
              </TableCell>
              <TableCell>
                <StarRating rarity={c.max_rarity} maxRarity={c.max_rarity} />
              </TableCell>
              <TableCell>{c.name}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TablePaginationFooter
          show={showPagination}
          count={crew.length}
          page={page}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          colSpan={4}
        />
      </Table>
    </TableContainer>
  );
}

export default FrozenCrewTable;
