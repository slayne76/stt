import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import type { CrewMember } from '../types/crew';
import type { Collection } from '../types/collection';
import { getEquipmentSlotsRemaining } from './getters';
import { getCrewCollections } from '../collections/getters';
import { usePagination } from '../lib/usePagination';
import StarRating from './StarRating';
import Thumbnail from '../assets/Thumbnail';
import TablePaginationFooter from '../components/TablePaginationFooter';

export interface CrewTableProps {
  crew: CrewMember[];
  collections: Collection[];
  showCollectionsNames: boolean;
  uniquelyRetrievableArchetypeIds?: Set<number> | null;
  gauntletRankByArchetypeId?: Map<number, number>;
}

function uniquelyRetrievableLabel(archetypeId: number, ids: Set<number> | null): string {
  if (ids === null) return 'Unavailable';
  return ids.has(archetypeId) ? 'Yes' : 'No';
}

function gauntletRankLabel(archetypeId: number, ranks: Map<number, number>): string {
  const rank = ranks.get(archetypeId);
  return rank !== undefined ? `#${rank}` : '—';
}

function CrewTable({
  crew,
  collections,
  showCollectionsNames,
  uniquelyRetrievableArchetypeIds,
  gauntletRankByArchetypeId,
}: CrewTableProps) {
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
            {gauntletRankByArchetypeId !== undefined && <TableCell>Rank</TableCell>}
            <TableCell align="right">Level</TableCell>
            <TableCell align="right">Items to equip</TableCell>
            <TableCell align="right">{showCollectionsNames ? 'Total collections' : 'Collections'}</TableCell>
            {showCollectionsNames && <TableCell>Collections names</TableCell>}
            {uniquelyRetrievableArchetypeIds !== undefined && <TableCell>Uniquely Retrievable</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {pageItems.map((c, index) => {
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
                {gauntletRankByArchetypeId !== undefined && (
                  <TableCell>{gauntletRankLabel(c.archetype_id, gauntletRankByArchetypeId)}</TableCell>
                )}
                <TableCell align="right">{c.level}</TableCell>
                <TableCell align="right">{getEquipmentSlotsRemaining(c)}</TableCell>
                <TableCell align="right">{crewCollections.length}</TableCell>
                {showCollectionsNames && (
                  <TableCell>{crewCollections.map((col) => col.name).join(', ')}</TableCell>
                )}
                {uniquelyRetrievableArchetypeIds !== undefined && (
                  <TableCell>{uniquelyRetrievableLabel(c.archetype_id, uniquelyRetrievableArchetypeIds)}</TableCell>
                )}
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
          colSpan={
            (showCollectionsNames ? 8 : 7) +
            (uniquelyRetrievableArchetypeIds !== undefined ? 1 : 0) +
            (gauntletRankByArchetypeId !== undefined ? 1 : 0)
          }
        />
      </Table>
    </TableContainer>
  );
}

export default CrewTable;
