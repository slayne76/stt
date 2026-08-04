import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import type { Ship } from '../types/ship';
import type { OwnedItem } from '../types/item';
import { getShipDisplayLevel, getShipSchematicsDisplay } from './getters';

export interface ShipsTableProps {
  ships: Ship[];
  items: OwnedItem[];
}

function ShipsTable({ ships, items }: ShipsTableProps) {
  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Ship</TableCell>
            <TableCell align="right">Level</TableCell>
            <TableCell align="right">Schematics</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {ships.map((s, index) => (
            <TableRow key={s.id}>
              <TableCell>{index + 1}</TableCell>
              <TableCell>{s.name}</TableCell>
              <TableCell align="right">{getShipDisplayLevel(s)}</TableCell>
              <TableCell align="right">{getShipSchematicsDisplay(s, items)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default ShipsTable;
