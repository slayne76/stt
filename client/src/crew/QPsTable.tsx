import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
} from '@mui/material';
import type { CrewMember } from '../types/crew';
import { getQPLevel, getQPProgressDisplay, getQPPointsNeeded, getQPRoundsLeft, QP_MAX_LEVEL } from './getters';
import { PAGE_SIZE_OPTIONS, usePagination } from '../lib/usePagination';
import StarRating from './StarRating';
import Thumbnail from '../assets/Thumbnail';
import StatusChip from '../components/StatusChip';

export interface QPsTableProps {
  crew: CrewMember[];
}

function QPsTable({ crew }: QPsTableProps) {
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
            <TableCell align="right">QL</TableCell>
            <TableCell align="right">QPs</TableCell>
            <TableCell align="right">Points left</TableCell>
            <TableCell align="right">Rounds left</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {pageItems.map((c, index) => {
            const isReady = getQPRoundsLeft(c) <= 1;
            return (
              <TableRow key={c.id}>
                <TableCell>{page * pageSize + index + 1}</TableCell>
                <TableCell>
                  <Thumbnail asset={c.portrait} />
                </TableCell>
                <TableCell>
                  <StarRating rarity={c.rarity} maxRarity={c.max_rarity} />
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: isReady ? 'bold' : 'normal', whiteSpace: 'nowrap' }}
                    >
                      {c.name}
                    </Typography>
                    {isReady && <StatusChip label="Ready" color="success" />}
                  </Box>
                </TableCell>
                <TableCell align="right">{getQPLevel(c)}/{QP_MAX_LEVEL}</TableCell>
                <TableCell align="right">{getQPProgressDisplay(c)}</TableCell>
                <TableCell align="right">-{getQPPointsNeeded(c)}</TableCell>
                <TableCell align="right">-{getQPRoundsLeft(c)}</TableCell>
              </TableRow>
            );
          })}
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
                colSpan={8}
              />
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </TableContainer>
  );
}

export default QPsTable;
