# Search Clear Button — Design Spec

## Goal

Add a clear ("×") button inside the table search box, on the right side,
that empties the search field on click. Since every page's search box is
just the shared `TableSearchBar` component wired to a `useSearch` hook's
`setQuery`, clicking clear naturally restores the table's full unfiltered
list — no changes needed anywhere outside `TableSearchBar.tsx`.

## Non-goals

- No change to `useSearch`'s logic, threshold, or matching behavior.
- No change to any page (`FiveStarsCrewPage`, `CollectionsPage`,
  `OverviewPage`'s two sections, etc.) — all 13 call sites already pass a
  `value`/`onChange` pair to `TableSearchBar`; the clear button reuses
  that exact same `onChange` prop, calling it with `''`.
- No keyboard shortcut (e.g. Escape-to-clear) — click/tap only, matching
  the literal request.
- No change to the search icon on the left side of the input.

## Design

`TableSearchBar` (`client/src/components/TableSearchBar.tsx`) gains a
conditional `endAdornment`: a small circular `IconButton` containing
MUI's `ClearIcon` (an "×" glyph), rendered only when `value` is
non-empty. Clicking it calls `onChange('')`.

```tsx
import { IconButton, InputAdornment, TextField } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';

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
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
          endAdornment: value ? (
            <InputAdornment position="end">
              <IconButton size="small" aria-label="Clear search" onClick={() => onChange('')} edge="end">
                <ClearIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          ) : undefined,
        },
      }}
      sx={{ width: 260 }}
    />
  );
}
```

**Why `value ? … : undefined` rather than always rendering the button:**
an empty box has nothing to clear — showing a disabled or no-op button
there is worse UX than omitting it, and it matches the standard clearable-
input convention. This is a controlled component throughout; no new state
is introduced in `TableSearchBar` itself.

**Why `IconButton` (not a literal MUI `<Chip>`):** the user's own
description — "a chip on the inner right side of the input with an 'x' in
a circle" — is exactly what MUI's `IconButton` renders by default (a
circular hit target with a centered icon, no visible outline until
hover/focus), which is also the idiomatic pattern for a clearable
text-field endAdornment in MUI. A literal `Chip` component is a labeled,
outlined pill shape with a different visual weight, meant for tags/filters
rather than an inline icon-only action — it would look visually
inconsistent with the plain `SearchIcon` already on the left. Confirmed
this reading matches the user's intent in brainstorming before writing
this spec.

**`aria-label="Clear search"`** closes the accessibility gap flagged as a
deferred Minor in the Table search feature's final review (`TableSearchBar`
previously had no accessible name on any of its controls beyond the
placeholder) — a natural, no-extra-scope place to fix it while touching
this exact file for a directly related reason.

**Interaction with existing behavior:** clicking clear sets `query` to
`''` via the same `setQuery` every page already passes in. Since
`useSearch`'s `active` is `query.length >= 3`, dropping to `''` always
deactivates search regardless of what it was before — the full list
restores exactly as it does today when a user manually deletes back below
3 characters. `usePagination` (inside each table, unchanged) recalculates
on the array-length change exactly as already proven. No new integration
code needed in either hook.

## Testing / verification plan

- Real-browser check on at least 2 pages (one `PageShell`-based, e.g.
  `/5-stars-crew`; and the Overview page, which hand-rolls two independent
  search boxes) confirming:
  - The clear button is absent when the input is empty.
  - It appears the moment any character is typed (1, 2, or 3+).
  - Clicking it empties the input, restores the full unfiltered list, and
    the button itself disappears again (since `value` is now empty).
  - On the Overview page specifically: clicking one section's clear button
    doesn't affect the other section's search state.
- Build (`npm run build -w client`) / lint (`npm run lint -w client`)
  clean, as with every prior feature.
