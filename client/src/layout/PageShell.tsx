import type { ReactNode } from 'react';
import { Alert, Button, CircularProgress, Stack, Typography } from '@mui/material';

export interface PageShellProps {
  title: string;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  loaded: boolean;
  count: number;
  totalCount?: number;
  emptyMessage: string;
  titleActions?: ReactNode;
  children: ReactNode;
}

function PageShell({
  title,
  loading,
  error,
  onRetry,
  loaded,
  count,
  totalCount,
  emptyMessage,
  titleActions,
  children,
}: PageShellProps) {
  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
        <Typography variant="h4">
          {title}
          {loaded ? ` (${count}${totalCount !== undefined && totalCount !== count ? ` of ${totalCount}` : ''})` : ''}
        </Typography>
        {titleActions}
      </Stack>

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
