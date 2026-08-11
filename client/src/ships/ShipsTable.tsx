import {
  Box,
  LinearProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type { Ship } from '../types/ship';
import type { OwnedItem } from '../types/item';
import { getShipDisplayLevel, getShipSchematicsDisplay, getShipSchematicsProgress } from './getters';
import { usePagination } from '../lib/usePagination';
import Thumbnail from '../assets/Thumbnail';
import TablePaginationFooter from '../components/TablePaginationFooter';

export interface ShipsTableProps {
  ships: Ship[];
  items: OwnedItem[];
}

function ShipsTable({ ships, items }: ShipsTableProps) {
  const { pageItems, page, pageSize, showPagination, handlePageChange, handlePageSizeChange } = usePagination(ships);

  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Image</TableCell>
            <TableCell>Ship</TableCell>
            <TableCell align="right">Level</TableCell>
            <TableCell align="right">Schematics</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {pageItems.map((s, index) => (
            <TableRow key={s.id}>
              <TableCell>{page * pageSize + index + 1}</TableCell>
              <TableCell>
                <Thumbnail asset={s.icon} />
              </TableCell>
              <TableCell>{s.name}</TableCell>
              <TableCell align="right">{getShipDisplayLevel(s)}</TableCell>
              <TableCell align="right">
                <Box sx={{ display: 'inline-block', minWidth: 100 }}>
                  <LinearProgress variant="determinate" value={getShipSchematicsProgress(s, items)} color="primary" />
                  <Typography variant="body2">{getShipSchematicsDisplay(s, items)}</Typography>
                </Box>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TablePaginationFooter
          show={showPagination}
          count={ships.length}
          page={page}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          colSpan={5}
        />
      </Table>
    </TableContainer>
  );
}

export default ShipsTable;
