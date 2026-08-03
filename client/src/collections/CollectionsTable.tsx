import { Fragment, useState } from 'react';
import {
  Collapse,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { KeyboardArrowDown, KeyboardArrowUp } from '@mui/icons-material';
import type { CrewMember } from '../types/crew';
import type { Collection } from '../types/collection';
import type { OwnedItem } from '../types/item';
import { getCollectionCrew } from './getters';
import {
  byEquipmentSlotsRemainingDesc,
  byLevelDesc,
  byMaxRarityDesc,
  byNameAsc,
  byTierAsc,
  combineComparators,
  sortCrew,
} from '../crew/sorters';
import CollectionCrewList from './CollectionCrewList';

export interface CollectionsTableProps {
  collections: Collection[];
  crew: CrewMember[];
  items: OwnedItem[];
}

function CollectionsTable({ collections, crew, items }: CollectionsTableProps) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(
    () => new Set(collections.map((c) => c.id))
  );

  const toggle = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell />
            <TableCell>Collection</TableCell>
            <TableCell align="right">Crew</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {collections.map((collection) => {
            const qualifyingCrew = sortCrew(
              getCollectionCrew(collection, crew, items),
              combineComparators(
                byTierAsc(items),
                byMaxRarityDesc,
                byLevelDesc,
                byEquipmentSlotsRemainingDesc,
                byNameAsc
              )
            );
            const expanded = expandedIds.has(collection.id);
            return (
              <Fragment key={collection.id}>
                <TableRow>
                  <TableCell>
                    <IconButton size="small" onClick={() => toggle(collection.id)}>
                      {expanded ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                    </IconButton>
                  </TableCell>
                  <TableCell>{collection.name}</TableCell>
                  <TableCell align="right">{qualifyingCrew.length}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={3}>
                    <Collapse in={expanded} timeout="auto" unmountOnExit>
                      {qualifyingCrew.length === 0 ? (
                        <Typography color="text.secondary" sx={{ py: 1 }}>
                          No crew match.
                        </Typography>
                      ) : (
                        <CollectionCrewList crew={qualifyingCrew} items={items} />
                      )}
                    </Collapse>
                  </TableCell>
                </TableRow>
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default CollectionsTable;
