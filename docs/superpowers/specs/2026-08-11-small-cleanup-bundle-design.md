# Small Cleanup Bundle — Design Spec

Three independent, small deferred-backlog items from `docs/PROJECT_STATE.md`'s
"Deferred issues / recommendations backlog," bundled into one feature since
each is a one-file (or two-file) fix with no design ambiguity of its own.
None depend on each other; they're grouped for delivery convenience only.

## Goal

1. Fix `ErrorBoundary`'s remount key so re-clicking a crashed page's own nav
   entry actually clears the error.
2. Give every `TableSearchBar` instance a distinguishing accessible name.
3. Stop `CrewTable`/`MissingCrewTable` from computing a crew member's
   collection membership twice per row.

## Non-goals

- No behavior change to what any of the three affected features *do* —
  this is fix/refactor only, not new functionality.
- No change to `TableSearchBar`'s visible `placeholder` text, styling, or
  the clear-button behavior shipped in the prior feature.
- No broader `usePageData`/`DEFAULT_CREW_COMPARATOR` refactor, no
  `TablePaginationFooter` extraction, no touching the Collections
  dual-upgradable-computation item — those are separate, larger backlog
  items intentionally left for a future feature.
- No change to `getCollectionCount`/`getCrewCollections` themselves
  (`client/src/collections/getters.ts`) — fix 3 is entirely local to the
  two table components' per-row rendering.

## Design

### 1. `ErrorBoundary` key (`client/src/layout/AppLayout.tsx`)

```tsx
// before
<ErrorBoundary key={location.pathname}>

// after
<ErrorBoundary key={location.key}>
```

React-router assigns every navigation — including a `navigate()` call to
the *same* pathname — a fresh `location.key`, whereas `location.pathname`
is unchanged in that case. Since a fresh `key` remounts the boundary, this
one-token change is what actually makes "click the crashed page's own nav
entry again" clear the fallback. No other code path touches this line;
`location` is already destructured via the existing `useLocation()` call
in this file.

### 2. `TableSearchBar` `aria-label` (thorough — all 12 call sites)

`TableSearchBarProps` gains a **required** `ariaLabel: string` prop (not
optional — a future 13th call site should be forced to supply one, not
silently ship unlabeled):

```tsx
export interface TableSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
}

function TableSearchBar({ value, onChange, ariaLabel, placeholder = 'Search by name…' }: TableSearchBarProps) {
  return (
    <TextField
      size="small"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      slotProps={{
        input: {
          startAdornment: (/* unchanged */),
          endAdornment: (/* unchanged */),
        },
        htmlInput: {
          'aria-label': ariaLabel,
        },
      }}
      sx={{ width: 260 }}
    />
  );
}
```

**Why `slotProps.htmlInput`, not `slotProps.input`:** in MUI v6,
`slotProps.input` targets the `OutlinedInput`/`InputBase` wrapper (where
`startAdornment`/`endAdornment` already live), but the accessible name
needs to land on the actual `<input>` DOM element — that's
`slotProps.htmlInput`, the direct equivalent of the legacy `inputProps`
that `RefreshControl.tsx` already uses for its `Select`'s
`'aria-label': 'Refresh target'`. Putting `aria-label` on the wrong slot
would silently do nothing.

**Call-site changes** — one new `ariaLabel` prop at each of the 12
existing `<TableSearchBar .../>` usages:

| File | `ariaLabel` |
|---|---|
| `FiveStarsCrewPage.tsx` | `"Search 5 Stars Crew by name"` |
| `ThreeFourStarsCrewPage.tsx` | `"Search 3/4 Stars crew by name"` |
| `FourFiveStarsCrewPage.tsx` | `"Search 4/5 Stars crew by name"` |
| `FourFourStarsCrewReadyPage.tsx` | `"Search 4/4 Stars crew (ready) by name"` |
| `FourFourStarsCrewPage.tsx` | `"Search 4/4 Stars crew by name"` |
| `FrozenCrewPage.tsx` | `"Search 5 & 4 Stars Frozen Crew by name"` |
| `QPsPage.tsx` | `"Search QPs by name"` |
| `CollectionsPage.tsx` | `"Search Collections by name"` |
| `ShipsPage.tsx` | `` ariaLabel={`Search ${title} by name`} `` (covers both `/5-stars-ships` → "5 Stars Ships" and `/4-stars-ships` → "4 Stars Ships" via the existing `title` prop) |
| `FrozenDuplicatesPage.tsx` | `` ariaLabel={`Search ${title} by name`} `` (covers both `/5-stars-duplicates` → "5 Stars Duplicates" and `/4-stars-duplicates` → "4 Stars Duplicates") |
| `OverviewPage.tsx` — In Portal instance | `"Search Missing 4 Stars (In Portal) by name"` |
| `OverviewPage.tsx` — Not in Portal instance | `"Search Missing 4 Stars (Not in Portal) by name"` |

Each literal mirrors that page's own visible title/heading text, so the
accessible name always matches what's on screen; the two `ShipsPage`/
`FrozenDuplicatesPage` sites derive it from the existing `title` prop
instead of hardcoding two variants, since that component already handles
both routes generically.

### 3. Single `getCrewCollections` call per row (`CrewTable.tsx`, `MissingCrewTable.tsx`)

`getCollectionCount(crew, collections)` is defined as
`getCrewCollections(crew, collections).length` (`collections/getters.ts`),
so a row that renders both the count cell and the names cell currently
filters the full `collections` array twice. Fix, identical in both files:

```tsx
// before, inside pageItems.map((c, index) => ( <TableRow key={c.id}> ... ))
<TableCell align="right">{getCollectionCount(c, collections)}</TableCell>
{showCollectionsNames && (
  <TableCell>
    {getCrewCollections(c, collections).map((col) => col.name).join(', ')}
  </TableCell>
)}

// after — .map's arrow function body becomes a block (`=> { ... return <TableRow>...</TableRow>; }`)
// so a plain const can be declared before the returned JSX:
const crewCollections = getCrewCollections(c, collections);
// ...
<TableCell align="right">{crewCollections.length}</TableCell>
{showCollectionsNames && (
  <TableCell>{crewCollections.map((col) => col.name).join(', ')}</TableCell>
)}
```

`pageItems.map((c, index) => (...))` currently uses an implicit-return
arrow (parens, no `{ }`); this fix converts it to an explicit-return arrow
(`=> { const crewCollections = ...; return (<TableRow>...); }`) in both
files so the binding has somewhere to live. No change to what's returned
per row, just how it's computed.

`MissingCrewTable.tsx` gets the same treatment; it always renders both
cells (no `showCollectionsNames` toggle there), so this fix removes the
duplicate call on every single row, not just conditionally.

`getCollectionCount` becomes an unused import in both files and is
dropped from the `import { ... } from '../collections/getters'` line in
each.

**Why this is provably a no-op behavior change, not just empirically:**
`crewCollections.length` and the old `getCollectionCount(c, collections)`
call are the same expression by definition (one is the other's
implementation), and `crewCollections.map(...)` is the exact array the old
`getCrewCollections(c, collections)` call would have produced — same
`collections` reference, same `c`, same filter, called once instead of
twice. There's no code path where the two cells could see different data
before or after this change.

## Testing / verification plan

- **Fix 1:** real-browser check — trigger a render error on a page (or
  reuse whatever repro the Router-level ErrorBoundary feature used),
  confirm the fallback shows, click that same page's own nav entry again,
  confirm the fallback clears (it currently doesn't). Also confirm
  navigating between two *different* pages still resets the boundary as
  before (no regression on the case that already worked).
- **Fix 2:** real-browser check — `list_pages`/`take_snapshot` (or
  accessibility-tree read) on at least the Overview page (both search
  boxes) and one more `PageShell`-based page, confirming each input's
  accessible name is now the page-specific string, not the shared
  placeholder text. Grep-based check that all 12 call sites compile with
  the new required prop (TypeScript will hard-fail any site that's
  missed, since `ariaLabel` is required — this is largely self-verifying).
- **Fix 3:** data-driven check against `example-data.json` — for a handful
  of real crew rows on a page with `showCollectionsNames={true}` (and on
  `MissingCrewTable`), confirm the rendered count cell and names-cell
  count still agree exactly with pre-change output (no visual diff
  expected, this is a pure refactor). Build (`npm run build -w client`) /
  lint (`npm run lint -w client`) clean, including confirming the now-
  unused `getCollectionCount` import doesn't trip the linter in either
  file.
- All three: whole-branch final review re-derives the "provably a no-op"
  argument for fix 3 from source rather than trusting a report, consistent
  with this project's standing verification-integrity practice.
