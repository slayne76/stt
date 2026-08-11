# Table Search — Design Spec

## Goal

Add a free-text search box to every list table in the app (the same 6
table components the Table pagination feature covers: `CrewTable`,
`MissingCrewTable`, `FrozenCrewTable`, `QPsTable`, `ShipsTable`,
`CollectionsTable`), positioned in the title row — title on the left,
search input on the right. Typing filters the table's rows live, by
substring match against each row's name field, starting the moment the
query reaches 3 characters. Clearing back below 3 characters restores the
full, unfiltered list. Pagination (already shipped) continues to operate
correctly on whatever array — filtered or not — the table receives.

## Non-goals

- No persistence of the search query across navigation or reload (matches
  the pagination feature's own no-persistence decision — plain `useState`,
  reset on remount).
- No debounce — filtering recalculates synchronously on every keystroke
  once the 3-character threshold is met. The item arrays involved are at
  most ~600 elements and a plain `.filter()` + `.includes()` pass over
  them is well under a frame's budget; no measurement is expected to
  change this decision, but the final review should confirm it once, the
  same way pagination's factory-comparator cost was measured once and
  then trusted.
- No search-term highlighting inside matched rows.
- No changes to any of the 6 table components' own code. Filtering happens
  at the page level, before the (possibly shorter) item array reaches the
  table — the table's existing `usePagination` hook already recalculates
  safely on any array-length change, so it needs nothing new.
- No multi-field search UI yet (e.g. a field picker). The *hook* is built
  to support multiple searchable fields per item from day one (see
  Architecture), but every call site today searches exactly one field:
  the item's `name`.
- `CollectionsTable` search matches collection names only, not the names
  of crew inside each collection's expanded sub-list.

## Architecture

### Shared hook — `client/src/lib/useSearch.ts`

```ts
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
```

- **Versatility comes from `getSearchableText`**, not from the hook's own
  logic — it returns an array of strings to match against, so a future
  field addition (e.g. search by trait as well as name) is a one-line
  change at the call site (`(item) => [item.name, ...item.traits]`), never
  a hook change.
- **Free substring match, not prefix match**, both sides lower-cased —
  `"oim"` matches `"Boimler"`. This is exactly `String.prototype.includes`
  after `.toLowerCase()` on both operands; no special algorithm needed.
- **Threshold is on the raw query length**, not a trimmed one — typing 3
  characters (including if some are spaces) activates filtering. This
  matches the literal request ("search starts after I hit the 3rd
  character") without adding an unrequested trimming rule.
- `active` distinguishes "filtering is on but nothing matched" from
  "filtering is off" — callers need this to choose the right empty-state
  message (see below).

### Shared UI — `client/src/components/TableSearchBar.tsx`

```tsx
import { InputAdornment, TextField } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';

export interface TableSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

function TableSearchBar({ value, onChange, placeholder = 'Search by name…' }: TableSearchBarProps) {
  return (
    <TextField
      size="small"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      slotProps={{ input: { startAdornment: (
        <InputAdornment position="start">
          <SearchIcon fontSize="small" />
        </InputAdornment>
      ) } }}
      sx={{ width: 260 }}
    />
  );
}

export default TableSearchBar;
```

Placed alongside `StatusChip`/`ErrorBoundary` in `client/src/components/` —
generic, cross-domain, presentational, no data logic of its own. (Confirm
MUI v6's exact prop name — `slotProps.input` vs. the older `InputProps` —
against the installed version during planning; both exist in v6 but only
one is the currently-recommended, non-deprecated form.)

### `PageShell` changes

Two new **optional** props, additive only — every existing call site that
doesn't pass them renders exactly as it does today:

```ts
export interface PageShellProps {
  title: string;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  loaded: boolean;
  count: number;
  totalCount?: number;      // NEW — when provided and different from count, shows "(count of totalCount)"
  emptyMessage: string;
  titleActions?: ReactNode; // NEW — rendered right-aligned in the title row
  children: ReactNode;
}
```

Title row becomes a flex row instead of a bare `Typography`:

```tsx
<Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
  <Typography variant="h4">
    {title}
    {loaded ? ` (${count}${totalCount !== undefined && totalCount !== count ? ` of ${totalCount}` : ''})` : ''}
  </Typography>
  {titleActions}
</Stack>
```

`flexWrap`/`gap` guard against narrow viewports wrapping the search box
below the title rather than overlapping it — a plain addition, not a new
responsive-design commitment beyond what `Stack` already gives other
pages.

### Per-page wiring (the 10 real page components using `PageShell`)

`CollectionsPage`, `FiveStarsCrewPage`, `FourFiveStarsCrewPage`,
`FourFourStarsCrewPage`, `FourFourStarsCrewReadyPage`, `FrozenCrewPage`,
`FrozenDuplicatesPage`, `QPsPage`, `ShipsPage`, `ThreeFourStarsCrewPage`.
(`FiveStarsDuplicatesPage`/`FourStarsDuplicatesPage` and
`FiveStarsShipsPage`/`FourStarsShipsPage` are thin parameterized wrappers
around `FrozenDuplicatesPage`/`ShipsPage` — no separate edits needed.)

Each page's existing pattern (compute the page's filtered/sorted item
array, pass to `PageShell` + the table) gains one step, inserted right
before the array reaches the table:

```ts
const { query, setQuery, filteredItems, active } = useSearch(sortedItems, (item) => [item.name]);
```

Then:
- The table component receives `filteredItems` where it previously
  received `sortedItems`.
- `PageShell` receives `count={filteredItems.length}`,
  `totalCount={sortedItems.length}`,
  `titleActions={<TableSearchBar value={query} onChange={setQuery} />}`.
- `emptyMessage` becomes a small conditional:
  `active && filteredItems.length === 0 ? 'No results found for your search.' : '<the page's existing empty message>'`.

No other page logic changes — sorting, filtering-by-rarity, etc. all stay
exactly as they are today, just running before the new search step
instead of feeding the table directly.

### `CollectionsPage` specifics

Same pattern, `getSearchableText = (collection) => [collection.name]`.
Search runs on the already-sorted `collections` array (after
`byUpgradableThenCompletionThenNameAsc`), same point pagination hooks in
today.

### Overview page (`OverviewPage.tsx`) — no `PageShell`

The two Missing-4-Stars sections get the same two building blocks
(`useSearch` + `TableSearchBar`) wired by hand, since this page doesn't
use `PageShell`:

```tsx
const inPortalSearch = useSearch(missingInPortal, (c) => [c.name]);
const notInPortalSearch = useSearch(missingNotInPortal, (c) => [c.name]);
```

```tsx
<Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
  <Typography variant="h5">
    Missing 4 Stars (In Portal) ({inPortalSearch.filteredItems.length} of {missingInPortal.length})
  </Typography>
  <TableSearchBar value={inPortalSearch.query} onChange={inPortalSearch.setQuery} />
</Stack>
{inPortalSearch.active && inPortalSearch.filteredItems.length === 0 ? (
  <Typography color="text.secondary">No results found for your search.</Typography>
) : (
  <MissingCrewTable crew={inPortalSearch.filteredItems} collections={collectionsList} />
)}
```

Same shape, independently, for "Not in Portal". Two independent search
states — searching one section never affects the other. The count
addition to these headings (currently they show no count at all) is a
byproduct of reusing the same "N of M" convention as every other table's
title, not a separate ask — flagged here for the user's review rather
than silently introduced.

## Testing / verification plan

- **Data-driven**, against real `example-data.json` /
  `crew-catalog-cache.json`: for at least one table per searchable domain
  (crew name, ship name, collection name), compute the exact real match
  count for a representative substring independently (e.g. how many
  5★-crew names contain a given 3-letter substring) and confirm the
  shipped filter produces the same count.
- **Real-browser, keystroke-level**, on at least one large table
  (5 Stars Crew, 304 rows) and `CollectionsTable` (structurally distinct):
  - 1 character, 2 characters → full unfiltered list still showing.
  - 3rd character → filtered list appears immediately, title count
    updates to "N of M".
  - Backspacing back to 2 characters → full list restored.
  - A query matching zero rows → the "No results found" message appears,
    the search box remains visible and editable, clearing it restores the
    full list.
  - Pagination footer/page count reflects the filtered count, and
    changing the query while on page 2 of a large filtered result
    doesn't strand the user on an out-of-range page (already covered by
    the existing `usePagination` clamping logic — verify it holds under a
    search-driven array shrink specifically, not just a page-size
    change).
- Build (`npm run build -w client`) and lint (`npm run lint -w client`)
  clean, as with every prior feature.

## Open risk carried into planning

`slotProps.input` vs `InputProps` for the search icon adornment should be
confirmed against the exact installed MUI version (`^6.1.0` per
`client/package.json`, but the installed resolved version may be newer —
the pagination feature's plan dry-run found real behavior differences
worth checking against actual `node_modules` source, not assumed from the
version range) during the implementation plan's own dry-run validation
step.
