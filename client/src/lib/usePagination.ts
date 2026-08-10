import { useState, type ChangeEvent, type MouseEvent } from 'react';

export const PAGE_SIZE_OPTIONS = [50, 100, 150, 200];
const DEFAULT_PAGE_SIZE = 50;

export interface UsePaginationResult<T> {
  pageItems: T[];
  page: number;
  pageSize: number;
  showPagination: boolean;
  handlePageChange: (event: MouseEvent<HTMLButtonElement> | null, newPage: number) => void;
  handlePageSizeChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}

export function usePagination<T>(items: T[]): UsePaginationResult<T> {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const maxPage = Math.max(0, Math.ceil(items.length / pageSize) - 1);
  const clampedPage = Math.min(page, maxPage);

  const start = clampedPage * pageSize;
  const pageItems = items.slice(start, start + pageSize);
  const showPagination = items.length > pageSize;

  function handlePageChange(_event: MouseEvent<HTMLButtonElement> | null, newPage: number): void {
    setPage(newPage);
  }

  function handlePageSizeChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    setPageSize(parseInt(event.target.value, 10));
    setPage(0);
  }

  return { pageItems, page: clampedPage, pageSize, showPagination, handlePageChange, handlePageSizeChange };
}
