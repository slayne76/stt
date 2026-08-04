import {
  Alert,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from '@mui/material';
import { usePlayerData } from '../hooks/usePlayerData';
import { extractPlayerIdentity } from '../lib/extractPlayerIdentity';
import type { PlayerIdentity } from '../types/player';

const FIELD_LABELS: Record<keyof PlayerIdentity, string> = {
  playerId: 'Player ID',
  dbid: 'DBID',
};

function OverviewPage() {
  const { data, loading, error } = usePlayerData();
  const identity = data ? extractPlayerIdentity(data) : null;

  return (
    <Stack spacing={2}>
      <Typography variant="h4">Overview</Typography>

      {loading && <CircularProgress />}
      {error && <Alert severity="error">{error}</Alert>}

      {!loading && !error && identity && (
        <TableContainer component={Paper}>
          <Table>
            <TableBody>
              {(Object.keys(FIELD_LABELS) as (keyof PlayerIdentity)[]).map((field) => (
                <TableRow key={field}>
                  <TableCell component="th" scope="row">
                    {FIELD_LABELS[field]}
                  </TableCell>
                  <TableCell align="right">{identity[field] ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Stack>
  );
}

export default OverviewPage;
