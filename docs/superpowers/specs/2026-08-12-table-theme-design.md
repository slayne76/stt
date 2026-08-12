# App-wide Table Theme (Blue Header + Zebra Rows) — Design Spec

Gives every table in the app a blue header (matching the existing AppBar
blue) and alternating white/light-grey row striping, replacing the
current all-white/all-transparent MUI-default look.

## Goal

The app currently runs on pure MUI defaults with **no `ThemeProvider`
anywhere** (confirmed by grep — zero matches for `ThemeProvider`/
`createTheme` in `client/src`). Every table header blends into the body
(white/transparent, same as every row), and every row is plain white with
no visual separation between adjacent rows. The user wants the header
styled with the app's existing blue (the same blue already visible in the
top `AppBar`) and rows alternating white/light-grey for scannability.

## Current state

7 files render a `TableHead`: the app's 6 real list tables
(`crew/CrewTable.tsx`, `catalog/MissingCrewTable.tsx`,
`catalog/FrozenCrewTable.tsx`, `crew/QPsTable.tsx`,
`ships/ShipsTable.tsx`, `collections/CollectionsTable.tsx`) plus
`pages/OverviewPage.tsx`'s three ad-hoc tables (the identity table, Base
Skill Bonus, Proficiency Bonus).

**5 of the 6 real list tables have a simple structure**: one `TableRow`
per record, mapped directly from a `pageItems.map(...)` call, no
`Fragment`, no row grouping. Confirmed via grep (no `Fragment` import in
any of `FrozenCrewTable.tsx`/`MissingCrewTable.tsx`/`CrewTable.tsx`/
`QPsTable.tsx`/`ShipsTable.tsx`).

**`CollectionsTable.tsx` is structurally different**: each collection
renders as a `Fragment` containing **two** `TableRow`s — a summary row
(`#`/Collection/Rewards/Progress/Milestone/Crew) and a detail row (a
single `colSpan={6}` cell holding either "No crew match." or a
`CollectionCrewList`). The detail row already uses
`sx={{ bgcolor: 'action.hover' }}` unconditionally today, as a permanent
visual separator from its own summary row.

`CollectionCrewList` itself (the crew sub-list inside a collection's
detail row) renders no `Table` at all — confirmed via grep, it's
unaffected by any table-wide theming.

No table currently sets the `hover` prop on `TableRow` (confirmed via
grep) — MUI's built-in row-hover highlight is not in use anywhere today,
so there's no existing interaction to reconcile with the new striping.

## Non-goals

- No change to any color, spacing, typography, or component default
  anywhere else in the app — `createTheme()` with no palette overrides
  reproduces MUI's exact built-in defaults, so introducing the theme is
  additive-only. The AppBar's blue, currently rendered via MUI's
  hardcoded internal default (no explicit `color` prop, no theme), stays
  byte-identical once themed, since it already resolves to the same
  `primary.main` token this spec targets for the table header.
- No `hover` prop or interactive row-hover highlight added to any table —
  out of scope, not requested.
- No change to `CollectionCrewList`'s internals — it has no table to
  theme.
- No change to any table's column structure, data, sorting, search, or
  pagination behavior — purely a visual/styling change.

## Design

### `client/src/theme.ts` (new)

```ts
import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  components: {
    MuiTableHead: {
      styleOverrides: {
        root: ({ theme }) => ({
          backgroundColor: theme.palette.primary.main,
          '& .MuiTableCell-root': {
            color: theme.palette.primary.contrastText,
            fontWeight: 600,
          },
        }),
      },
    },
    MuiTableBody: {
      styleOverrides: {
        root: ({ theme }) => ({
          '& .MuiTableRow-root:nth-of-type(even)': {
            backgroundColor: theme.palette.action.hover,
          },
        }),
      },
    },
  },
});

export default theme;
```

**Header color**: `theme.palette.primary.main` — MUI's default primary
blue (`#1976d2`), the same value the `AppBar` in `AppLayout.tsx` already
resolves to (it sets no explicit `color` prop, so it uses MUI's built-in
default, which is exactly `primary.main`). White header text via
`primary.contrastText`.

**Zebra stripe color**: `theme.palette.action.hover` — MUI's own
"subtle highlight" palette token (not an arbitrary custom grey), already
used once in this exact codebase (`CollectionsTable`'s pre-existing
detail-row highlight), so this reuses an established visual language
rather than introducing a new one.

**Scoped to `MuiTableBody`, not a blanket `MuiTableRow` override** — the
`:nth-of-type(even)` selector is nested under `MuiTableBody`'s
`styleOverrides.root`, so it only ever matches rows that are children of
a `<tbody>` (i.e. `MuiTableBody`'s rendered root element). A `TableHead`'s
own `TableRow` lives inside a separate `<thead>` parent and is styled by
the `MuiTableHead` override above instead — the two rules can never
collide or double-apply to the same row.

This one file covers all 6 real list tables plus Overview's 3 ad-hoc
tables automatically — no per-table edits needed for 6 of the 7 files
using `TableHead` today.

### `client/src/main.tsx` (changed)

Wraps the existing app root in the new theme:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@mui/material/styles';
import App from './App';
import theme from './theme';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <App />
    </ThemeProvider>
  </StrictMode>
);
```

**Deliberately excludes MUI's `CssBaseline`** — it's the standard
companion to `ThemeProvider` in a from-scratch MUI setup, but this app
has no CSS files at all today (confirmed via `find` — zero `.css`
matches under `client/`), meaning the browser's default `body { margin:
8px }` is currently in effect. `CssBaseline` resets that to `margin: 0`,
which would be a real, visible layout shift (the whole app moving flush
to the viewport edge) — not the no-op it might look like at first
glance, and not something this spec's "no other visual change" Non-goal
can honestly promise if included. Left out entirely; not needed for the
table-styling goal.

### `client/src/collections/CollectionsTable.tsx` (changed — the one exception)

Per brainstorming: since each collection is 2 rows, not 1, a plain
`nth-of-type(even)` CSS rule would color a collection's summary and
detail rows *differently* from each other rather than as a matched pair.
Instead, the stripe is computed per-collection in JS and applied via
`sx` (which naturally wins over the theme's CSS rule on specificity, so
no exclusion logic is needed — the two never conflict):

```tsx
{pageItems.map((collection, index) => {
  const qualifyingCrew = qualifyingCrewByCollection.get(collection.id) ?? [];
  const upgradable = upgradableIds.has(collection.id);
  const rewards = getCuratedRewards(collection);
  const progressDisplay = isMaxedOut(collection)
    ? 'MAX'
    : `${collection.progress}/${collection.milestone.goal}`;
  const stripeColor = index % 2 === 1 ? 'action.hover' : 'transparent';
  return (
    <Fragment key={collection.id}>
      <TableRow sx={{ bgcolor: stripeColor }}>
        <TableCell>{page * pageSize + index + 1}</TableCell>
        <TableCell>
          {collection.name}
          {upgradable && <Chip label="Upgradable" size="small" color="info" sx={{ ml: 1 }} />}
        </TableCell>
        <TableCell>{rewards.join(', ')}</TableCell>
        <TableCell align="right">{progressDisplay}</TableCell>
        <TableCell align="right">{collection.claimable_milestone_index}</TableCell>
        <TableCell align="right">{qualifyingCrew.length}</TableCell>
      </TableRow>
      <TableRow>
        <TableCell sx={{ bgcolor: 'action.selected' }} colSpan={6}>
          {qualifyingCrew.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 1 }}>
              No crew match.
            </Typography>
          ) : (
            <CollectionCrewList crew={qualifyingCrew} items={items} />
          )}
        </TableCell>
      </TableRow>
    </Fragment>
  );
})}
```

Both rows of a collection now share the same alternating base
(`action.hover` on odd-indexed collections, `transparent`/white on
even-indexed ones — `index` is the existing `pageItems.map` index, already
in scope), and the detail row keeps a distinguishable shade layered on
top in both cases: `action.selected` (MUI's next palette tier up from
`action.hover`, a bit stronger) replaces the previous unconditional
`action.hover`, so the detail row is always visually distinct from its
own summary row regardless of which stripe color that summary row has.
`page`/`pageSize`/`qualifyingCrewByCollection`/`upgradableIds`/`items`/
`getCuratedRewards`/`isMaxedOut`/`Chip`/`Typography`/`CollectionCrewList`
usage is otherwise unchanged from the current file — only `stripeColor`
is newly introduced, and the two `sx={{ bgcolor: ... }}` values change.

## Error handling

None new — this is a pure styling change with no new data flow, no new
conditional logic beyond the existing `index % 2` pattern already used
elsewhere in this codebase's table components (e.g. row-number display).

## Testing / verification plan

No automated test framework exists in this project (deliberate, repeated
choice). This is a purely visual change, so verification is real-browser
observation, not data-driven:

- Build (`npm run build -w client`) / lint (`npm run lint -w client`)
  clean.
- Real-browser check, screenshots for each: at least one of the 5
  simple-structure tables (confirm blue header with white text, rows
  alternating white/light-grey starting from the first row), the
  Overview page (confirm all 3 of its tables — identity, Base Skill
  Bonus, Proficiency Bonus — get the same header/striping treatment with
  zero code changes to `OverviewPage.tsx` itself, proving the theme-only
  approach actually covers it), and `CollectionsTable` specifically
  (confirm each collection's summary+detail row pair share one stripe
  color, alternating per collection not per raw row, and that the detail
  row is still visually distinguishable from its own summary row via the
  `action.selected` shade).
- Confirm the `AppBar`'s blue is visually unchanged before/after
  (screenshot comparison) — proving the theme introduction didn't
  accidentally alter it.
- Confirm no console errors on any page after the `ThemeProvider`
  addition, and confirm the page's overall layout/margins are otherwise
  unchanged (no `CssBaseline`, so no body-margin shift).
