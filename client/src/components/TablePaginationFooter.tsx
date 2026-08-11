import type { ChangeEvent, MouseEvent } from 'react';
import { TableFooter, TablePagination, TableRow } from '@mui/material';
import { PAGE_SIZE_OPTIONS } from '../lib/usePagination';

export interface TablePaginationFooterProps {
  show: boolean;
  count: number;
  page: number;
  pageSize: number;
  onPageChange: (event: MouseEvent<HTMLButtonElement> | null, newPage: number) => void;
  onPageSizeChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  colSpan: number;
}

function TablePaginationFooter({
  show,
  count,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  colSpan,
}: TablePaginationFooterProps) {
  if (!show) return null;
  return (
    <TableFooter>
      <TableRow>
        <TablePagination
          count={count}
          page={page}
          onPageChange={onPageChange}
          rowsPerPage={pageSize}
          onRowsPerPageChange={onPageSizeChange}
          rowsPerPageOptions={PAGE_SIZE_OPTIONS}
          colSpan={colSpan}
        />
      </TableRow>
    </TableFooter>
  );
}

export default TablePaginationFooter;
