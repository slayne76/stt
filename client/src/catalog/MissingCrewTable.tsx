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
import type { Collection } from '../types/collection';
import { getCrewCollections } from '../collections/getters';
import { usePagination } from '../lib/usePagination';
import Thumbnail from '../assets/Thumbnail';
import { ASSET_BASE_URL } from '../assets/config';
import TablePaginationFooter from '../components/TablePaginationFooter';

export interface MissingCrewTableProps {
  crew: CatalogEntry[];
  collections: Collection[];
}

function MissingCrewTable({ crew, collections }: MissingCrewTableProps) {
  const { pageItems, page, pageSize, showPagination, handlePageChange, handlePageSizeChange } = usePagination(crew);

  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Image</TableCell>
            <TableCell>Name</TableCell>
            <TableCell align="right">DataScore</TableCell>
            <TableCell align="right">Total collections</TableCell>
            <TableCell>Collections names</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {pageItems.map((c, index) => {
            const crewCollections = getCrewCollections(c, collections);
            return (
              <TableRow key={c.archetype_id}>
                <TableCell>{page * pageSize + index + 1}</TableCell>
                <TableCell>
                  <Thumbnail url={`${ASSET_BASE_URL}/${c.imageUrlPortrait}`} />
                </TableCell>
                <TableCell>{c.name}</TableCell>
                <TableCell align="right">{c.data_score.toFixed(2)}</TableCell>
                <TableCell align="right">{crewCollections.length}</TableCell>
                <TableCell>{crewCollections.map((col) => col.name).join(', ')}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TablePaginationFooter
          show={showPagination}
          count={crew.length}
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

export default MissingCrewTable;
