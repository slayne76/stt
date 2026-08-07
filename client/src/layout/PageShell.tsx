import type { ReactNode } from 'react';
import { Alert, Button, CircularProgress, Stack, Typography } from '@mui/material';

export interface PageShellProps {
  title: string;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  loaded: boolean;
  count: number;
  emptyMessage: string;
  children: ReactNode;
}

function PageShell({ title, loading, error, onRetry, loaded, count, emptyMessage, children }: PageShellProps) {
  return (
    <Stack spacing={2}>
      <Typography variant="h4">
        {title}
        {loaded ? ` (${count})` : ''}
      </Typography>

      {loading && <CircularProgress />}
      {error && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={onRetry}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {loaded && (count === 0 ? <Typography color="text.secondary">{emptyMessage}</Typography> : children)}
    </Stack>
  );
}

export default PageShell;
