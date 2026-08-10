import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import type { CatalogEntry } from '../types/catalogEntry';
import type { Collection } from '../types/collection';
import { getCollectionCount, getCrewCollections } from '../collections/getters';
import Thumbnail from '../assets/Thumbnail';
import { ASSET_BASE_URL } from '../assets/config';

export interface MissingCrewTableProps {
  crew: CatalogEntry[];
  collections: Collection[];
}

function MissingCrewTable({ crew, collections }: MissingCrewTableProps) {
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
          {crew.map((c, index) => (
            <TableRow key={c.archetype_id}>
              <TableCell>{index + 1}</TableCell>
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
      </Table>
    </TableContainer>
  );
}

export default MissingCrewTable;
