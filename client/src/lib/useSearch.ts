import { useState } from 'react';

export const MIN_QUERY_LENGTH = 3;

export interface UseSearchResult<T> {
  query: string;
  setQuery: (query: string) => void;
  filteredItems: T[];
  active: boolean;
}

export function useSearch<T>(items: T[], getSearchableText: (item: T) => string[]): UseSearchResult<T> {
  const [query, setQuery] = useState('');
  const active = query.length >= MIN_QUERY_LENGTH;
  const needle = query.toLowerCase();
  const filteredItems = active
    ? items.filter((item) => getSearchableText(item).some((text) => text.toLowerCase().includes(needle)))
    : items;

  return { query, setQuery, filteredItems, active };
}
