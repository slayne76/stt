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
import type { CatalogEntry } from '../types/catalogEntry';
import type { Collection } from '../types/collection';
import { getCollectionCount, getCrewCollections } from '../collections/getters';
import { PAGE_SIZE_OPTIONS, usePagination } from '../lib/usePagination';
import Thumbnail from '../assets/Thumbnail';
import { ASSET_BASE_URL } from '../assets/config';

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
          {pageItems.map((c, index) => (
            <TableRow key={c.archetype_id}>
              <TableCell>{page * pageSize + index + 1}</TableCell>
              <TableCell>
                <Thumbnail url={`${ASSET_BASE_URL}/${c.imageUrlPortrait}`} />
              </TableCell>
              <TableCell>{c.name}</TableCell>
              <TableCell align="right">{c.data_score.toFixed(2)}</TableCell>
              <TableCell align="right">{getCollectionCount(c, collections)}</TableCell>
              <TableCell>
                {getCrewCollections(c, collections)
                  .map((col) => col.name)
                  .join(', ')}
              </TableCell>
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
                colSpan={6}
              />
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </TableContainer>
  );
}

export default MissingCrewTable;
