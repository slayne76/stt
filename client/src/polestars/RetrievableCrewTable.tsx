import { Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import type { PolestarCatalogEntry } from '../types/polestarCatalogEntry';
import type { RetrievableCrewRow } from './getters';
import { resolvePolestarSlot, getPolestarTypeColor } from './getters';
import { usePagination } from '../lib/usePagination';
import StarRating from '../crew/StarRating';
import Thumbnail from '../assets/Thumbnail';
import TablePaginationFooter from '../components/TablePaginationFooter';

export interface RetrievableCrewTableProps {
  rows: RetrievableCrewRow[];
  polestarCatalogMap: Map<number, PolestarCatalogEntry>;
}

function EmDash() {
  return <Typography color="text.secondary">&mdash;</Typography>;
}

function PolestarCell({
  id,
  polestarCatalogMap,
}: {
  id: number | null;
  polestarCatalogMap: Map<number, PolestarCatalogEntry>;
}) {
  const entry = resolvePolestarSlot(id, polestarCatalogMap);
  if (entry === null) {
    return <EmDash />;
  }
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 56, gap: '2px' }}>
      <Thumbnail asset={entry.icon} circleBackgroundColor={getPolestarTypeColor(entry.filter.type)} />
      <Typography variant="caption" align="center" sx={{ lineHeight: 1.1 }}>
        {entry.short_name}
      </Typography>
    </Box>
  );
}

function RetrievableCrewTable({ rows, polestarCatalogMap }: RetrievableCrewTableProps) {
  const { pageItems, page, pageSize, showPagination, handlePageChange, handlePageSizeChange } = usePagination(rows);

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
            <TableCell align="right">Total collections</TableCell>
            <TableCell>Polestar #1</TableCell>
            <TableCell>Polestar #2</TableCell>
            <TableCell>Polestar #3</TableCell>
            <TableCell>Polestar #4</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {pageItems.map((row, index) => (
            <TableRow key={row.archetypeId}>
              <TableCell>{page * pageSize + index + 1}</TableCell>
              <TableCell>
                <Thumbnail url={row.portraitUrl} />
              </TableCell>
              <TableCell>
                {row.rarity === null ? <EmDash /> : <StarRating rarity={row.rarity} maxRarity={row.maxRarity} />}
              </TableCell>
              <TableCell>{row.name}</TableCell>
              <TableCell align="right">{row.level === null ? <EmDash /> : row.level}</TableCell>
              <TableCell align="right">{row.itemsToEquip === null ? <EmDash /> : row.itemsToEquip}</TableCell>
              <TableCell align="right">{row.totalCollections}</TableCell>
              {row.polestarIds.map((id, slotIndex) => (
                <TableCell key={slotIndex}>
                  <PolestarCell id={id} polestarCatalogMap={polestarCatalogMap} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
        <TablePaginationFooter
          show={showPagination}
          count={rows.length}
          page={page}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          colSpan={11}
        />
      </Table>
    </TableContainer>
  );
}

export default RetrievableCrewTable;
