# Stars column + reusable CrewTable — Design

Date: 2026-08-03

## Purpose

Add a "Stars" column (visual rarity/max_rarity indicator) to the "3/4
Stars crew" page, positioned between `#` and `Name`. At the same time,
extract the table-rendering logic into a reusable `CrewTable` component so
future rarity-based pages (e.g. a hypothetical "4/5 Stars crew" page) can
reuse the same row rendering instead of each page re-implementing its own
copy of the table JSX with hardcoded values.

## Non-goals

- No new filter/sort factors in this spec (those are separate, future
  requests).
- No configurable-columns API on `CrewTable` — the column set (`#`,
  `Stars`, `Name`, `Level`, `Items to equip`) is fixed for now. If a future
  page needs a genuinely different column set, that's a new spec, not
  something to speculatively build support for today.
- No changes to `getCrewList`, `filterByRarity`, or the sorters.
- No new dependencies — `@mui/icons-material` is already installed.

## Design

### `StarRating` component

New file `client/src/crew/StarRating.tsx`:

```tsx
import { Star } from '@mui/icons-material';
import { Box } from '@mui/material';

export interface StarRatingProps {
  rarity: number;
  maxRarity: number;
}

function StarRating({ rarity, maxRarity }: StarRatingProps) {
  return (
    <Box sx={{ display: 'inline-flex' }}>
      {Array.from({ length: maxRarity }, (_, i) => (
        <Star key={i} fontSize="small" sx={{ color: '#FFD700', opacity: i < rarity ? 1 : 0.3 }} />
      ))}
    </Box>
  );
}

export default StarRating;
```

Driven entirely by its `rarity`/`maxRarity` props (i.e. each row's own
`c.rarity`/`c.max_rarity`) — nothing hardcodes "4 stars." The same
component renders correctly for a 3/4 row (4 stars, 3 lit), a hypothetical
4/5 row (5 stars, 4 lit), etc.

### `CrewTable` component

New file `client/src/crew/CrewTable.tsx`:

```tsx
import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import type { CrewMember } from '../types/crew';
import { getEquipmentSlotsRemaining } from './getters';
import StarRating from './StarRating';

export interface CrewTableProps {
  crew: CrewMember[];
}

function CrewTable({ crew }: CrewTableProps) {
  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Stars</TableCell>
            <TableCell>Name</TableCell>
            <TableCell align="right">Level</TableCell>
            <TableCell align="right">Items to equip</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {crew.map((c, index) => (
            <TableRow key={c.id}>
              <TableCell>{index + 1}</TableCell>
              <TableCell>
                <StarRating rarity={c.rarity} maxRarity={c.max_rarity} />
              </TableCell>
              <TableCell>{c.name}</TableCell>
              <TableCell align="right">{c.level}</TableCell>
              <TableCell align="right">{getEquipmentSlotsRemaining(c)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default CrewTable;
```

`CrewTable` takes an already filtered-and-sorted `crew` array — it owns no
data-fetching, filtering, or sorting concerns, only rendering. This is the
"crew rows are globally rendered by a function" piece: any future page
that wants this same table shape reuses `CrewTable` unmodified.

### `ThreeFourStarsCrewPage` update

The page keeps everything it currently owns — `usePlayerData()`, the
`filterByRarity`/`sortCrew`/`combineComparators` pipeline, the
title-with-count, the loading spinner, the error `Alert` with Retry, and
the empty-state message — and replaces its inline
`<TableContainer>...</TableContainer>` JSX with `<CrewTable crew={crew} />`.

## What a future rarity-based page looks like after this refactor

A hypothetical "4/5 Stars crew" page would be a small, mostly-independent
file: its own `usePlayerData()` call, its own `filterByRarity(crew, {
rarity: 4, maxRarity: 5 })`, its own title, its own loading/error/empty
handling — then `<CrewTable crew={crew} />` for the table. It would NOT
need to reimplement the Stars column, the row-number column, or any other
column rendering — that's the point of this refactor.

## Open questions

None — fully scoped by the user's request.
