# Small Cleanup Bundle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three independent, small fixes from `docs/PROJECT_STATE.md`'s deferred-issues backlog: `ErrorBoundary` remounts on `location.key` instead of `location.pathname`, every `TableSearchBar` gets a distinguishing `aria-label`, and `CrewTable`/`MissingCrewTable` compute a crew member's collection membership once per row instead of twice.

**Architecture:** Three self-contained tasks, each touching a different, non-overlapping set of files. No task depends on another — they can be done, reviewed, and committed in any order.

**Tech Stack:** React 19, TypeScript, MUI v6 (`slotProps.htmlInput` for the accessible-name fix), react-router-dom v6 (`useLocation().key`).

## Global Constraints

- No behavior change to what any of the three features *do* — this is fix/refactor only, per the spec's non-goals.
- No change to `TableSearchBar`'s visible `placeholder` text, styling, or its existing clear-button behavior.
- `TableSearchBarProps.ariaLabel` is a **required** `string` prop — every call site must be updated, none may be skipped.
- No change to `getCollectionCount`/`getCrewCollections` themselves (`client/src/collections/getters.ts`) — Task 3 is entirely local to the two table components' per-row rendering.
- Build (`npm run build -w client`) and lint (`npm run lint -w client`) must stay clean after every task: 0 errors, only the 2 pre-existing `react-refresh/only-export-components` warnings.
- Full spec: `docs/superpowers/specs/2026-08-11-small-cleanup-bundle-design.md`.

---

### Task 1: `ErrorBoundary` remounts on `location.key`

**Files:**
- Modify: `client/src/layout/AppLayout.tsx:122`

**Interfaces:**
- No new interfaces. `location` is already available in this file via the existing `const location = useLocation();` (line 55); `location.key` is a standard react-router-dom v6 `Location` field (a fresh string per navigation, including a re-navigation to the same pathname).

- [ ] **Step 1: Change the `ErrorBoundary` key**

In `client/src/layout/AppLayout.tsx`, find:

```tsx
        <ErrorBoundary key={location.pathname}>
```

Replace with:

```tsx
        <ErrorBoundary key={location.key}>
```

This is the only line that changes in this task.

- [ ] **Step 2: Build and lint**

Run: `npm run build -w client` — expect success, 0 errors.
Run: `npm run lint -w client` — expect 0 errors, only the 2 pre-existing warnings.

- [ ] **Step 3: Real-browser verification**

Start the dev server. Using real Playwright navigation/clicking (not code-reading, not assuming):

1. Navigate to a page whose content can be made to throw a render error. If no existing repro is at hand, temporarily add a one-line throw inside a page component during this verification only (e.g. `if (someAlwaysTrueDebugFlag) throw new Error('test');`), confirm the fallback (`Alert` with "Something went wrong on this page." and a "Try again" button) renders, then remove the temporary throw before continuing — do not leave debug code in the diff.
2. **Regression check (must still work):** with the fallback showing, click a *different* page's nav entry. Confirm the new page renders normally (the boundary resets on pathname change, as it already did before this fix).
3. **The actual fix:** reproduce the fallback again on a page, then click that *same* page's own nav entry (same pathname) while the fallback is showing. Confirm the fallback clears and the page's real content renders — this did **not** work before the fix (confirm by checking out the pre-fix version of the line and re-testing if there's any doubt about the baseline, or trust the spec's react-router `location.key` semantics if the two nav clicks visibly differ in outcome).

Record the actual observed behavior (fallback present/absent after each click) in the task report — not the expected values.

- [ ] **Step 4: Commit**

```bash
git add client/src/layout/AppLayout.tsx
git commit -m "Reset the page ErrorBoundary on location.key, not pathname"
```

---

### Task 2: `TableSearchBar` gets a required `aria-label`

**Files:**
- Modify: `client/src/components/TableSearchBar.tsx`
- Modify: `client/src/pages/FiveStarsCrewPage.tsx:36`
- Modify: `client/src/pages/ThreeFourStarsCrewPage.tsx:36`
- Modify: `client/src/pages/FourFiveStarsCrewPage.tsx:36`
- Modify: `client/src/pages/FourFourStarsCrewReadyPage.tsx:43`
- Modify: `client/src/pages/FourFourStarsCrewPage.tsx:39`
- Modify: `client/src/pages/FrozenCrewPage.tsx:40`
- Modify: `client/src/pages/QPsPage.tsx:34`
- Modify: `client/src/pages/CollectionsPage.tsx:41`
- Modify: `client/src/pages/ShipsPage.tsx:43`
- Modify: `client/src/pages/FrozenDuplicatesPage.tsx:44`
- Modify: `client/src/pages/OverviewPage.tsx:121,132`

**Interfaces:**
- Produces: `TableSearchBarProps` gains `ariaLabel: string` (required, no default). Existing `value: string`, `onChange: (value: string) => void`, `placeholder?: string` are unchanged.
- Consumes (in each page file): the same `query`/`setQuery` pair from that page's existing `useSearch(...)` call — no change to `useSearch` or any other hook.

- [ ] **Step 1: Add the `ariaLabel` prop to `TableSearchBar`**

Replace the full contents of `client/src/components/TableSearchBar.tsx` with:

```tsx
import { IconButton, InputAdornment, TextField } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';

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
        htmlInput: {
          'aria-label': ariaLabel,
        },
      }}
      sx={{ width: 260 }}
    />
  );
}

export default TableSearchBar;
```

The only changes from the current file: the new `ariaLabel: string` field in the props interface, the new `ariaLabel` destructured parameter, and the new `htmlInput: { 'aria-label': ariaLabel }` entry inside `slotProps` (added as a sibling of the existing `input` entry, not nested inside it).

- [ ] **Step 2: Update the 8 pages with a literal `title` string**

In each file, change the `titleActions` line from:

```tsx
      titleActions={<TableSearchBar value={query} onChange={setQuery} />}
```

to (substituting the exact string for that file, from the table below):

| File | New `titleActions` line |
|---|---|
| `client/src/pages/FiveStarsCrewPage.tsx:36` | `titleActions={<TableSearchBar value={query} onChange={setQuery} ariaLabel="Search 5 Stars Crew by name" />}` |
| `client/src/pages/ThreeFourStarsCrewPage.tsx:36` | `titleActions={<TableSearchBar value={query} onChange={setQuery} ariaLabel="Search 3/4 Stars crew by name" />}` |
| `client/src/pages/FourFiveStarsCrewPage.tsx:36` | `titleActions={<TableSearchBar value={query} onChange={setQuery} ariaLabel="Search 4/5 Stars crew by name" />}` |
| `client/src/pages/FourFourStarsCrewReadyPage.tsx:43` | `titleActions={<TableSearchBar value={query} onChange={setQuery} ariaLabel="Search 4/4 Stars crew (ready) by name" />}` |
| `client/src/pages/FourFourStarsCrewPage.tsx:39` | `titleActions={<TableSearchBar value={query} onChange={setQuery} ariaLabel="Search 4/4 Stars crew by name" />}` |
| `client/src/pages/FrozenCrewPage.tsx:40` | `titleActions={<TableSearchBar value={query} onChange={setQuery} ariaLabel="Search 5 & 4 Stars Frozen Crew by name" />}` |
| `client/src/pages/QPsPage.tsx:34` | `titleActions={<TableSearchBar value={query} onChange={setQuery} ariaLabel="Search QPs by name" />}` |
| `client/src/pages/CollectionsPage.tsx:41` | `titleActions={<TableSearchBar value={query} onChange={setQuery} ariaLabel="Search Collections by name" />}` |

- [ ] **Step 3: Update `ShipsPage.tsx` and `FrozenDuplicatesPage.tsx` (derive from their `title` prop)**

In `client/src/pages/ShipsPage.tsx:43`, change:

```tsx
      titleActions={<TableSearchBar value={query} onChange={setQuery} />}
```

to:

```tsx
      titleActions={<TableSearchBar value={query} onChange={setQuery} ariaLabel={`Search ${title} by name`} />}
```

In `client/src/pages/FrozenDuplicatesPage.tsx:44`, change the identical line the same way:

```tsx
      titleActions={<TableSearchBar value={query} onChange={setQuery} ariaLabel={`Search ${title} by name`} />}
```

Both files already destructure `title` from their props (`ShipsPageProps`/`FrozenDuplicatesPageProps`) — no new variable needed. This covers all 4 routes that render these two components: `/5-stars-ships` ("5 Stars Ships"), `/4-stars-ships` ("4 Stars Ships"), `/5-stars-duplicates` ("5 Stars Duplicates"), `/4-stars-duplicates` ("4 Stars Duplicates").

- [ ] **Step 4: Update `OverviewPage.tsx`'s two instances**

In `client/src/pages/OverviewPage.tsx:121`, change:

```tsx
            <TableSearchBar value={inPortalSearch.query} onChange={inPortalSearch.setQuery} />
```

to:

```tsx
            <TableSearchBar
              value={inPortalSearch.query}
              onChange={inPortalSearch.setQuery}
              ariaLabel="Search Missing 4 Stars (In Portal) by name"
            />
```

In `client/src/pages/OverviewPage.tsx:132`, change:

```tsx
            <TableSearchBar value={notInPortalSearch.query} onChange={notInPortalSearch.setQuery} />
```

to:

```tsx
            <TableSearchBar
              value={notInPortalSearch.query}
              onChange={notInPortalSearch.setQuery}
              ariaLabel="Search Missing 4 Stars (Not in Portal) by name"
            />
```

- [ ] **Step 5: Build and lint**

Run: `npm run build -w client` — expect success, 0 errors. Since `ariaLabel` is a required prop, TypeScript will hard-fail the build if any of the 12 call sites was missed — treat any type error here as a sign a call site was skipped, not a spec problem.
Run: `npm run lint -w client` — expect 0 errors, only the 2 pre-existing warnings.

- [ ] **Step 6: Real-browser verification**

Start the dev server. Using real Playwright/chrome-devtools MCP tools (or the `playwright` library per `CLAUDE.md` if the MCP servers aren't available in this session — see `CLAUDE.md`'s browser-automation section), take an accessibility snapshot and confirm the accessible name (not just the visible placeholder) of:

1. Both search boxes on the Overview page (`/`) — confirm they read as two *different* accessible names, not both "Search by name…".
2. At least one more `PageShell`-based page, e.g. `/5-stars-crew` — confirm its search box's accessible name matches the table above.
3. `/5-stars-ships` and `/4-stars-ships` — confirm the two routes produce two different accessible names (`"Search 5 Stars Ships by name"` / `"Search 4 Stars Ships by name"`), proving the `` `Search ${title} by name` `` derivation works per-route, not just per-component.

Record the actual accessible-name strings observed, not the expected ones.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/TableSearchBar.tsx \
  client/src/pages/FiveStarsCrewPage.tsx \
  client/src/pages/ThreeFourStarsCrewPage.tsx \
  client/src/pages/FourFiveStarsCrewPage.tsx \
  client/src/pages/FourFourStarsCrewReadyPage.tsx \
  client/src/pages/FourFourStarsCrewPage.tsx \
  client/src/pages/FrozenCrewPage.tsx \
  client/src/pages/QPsPage.tsx \
  client/src/pages/CollectionsPage.tsx \
  client/src/pages/ShipsPage.tsx \
  client/src/pages/FrozenDuplicatesPage.tsx \
  client/src/pages/OverviewPage.tsx
git commit -m "Give every TableSearchBar a distinguishing aria-label"
```

---

### Task 3: Single `getCrewCollections` call per row

**Files:**
- Modify: `client/src/crew/CrewTable.tsx`
- Modify: `client/src/catalog/MissingCrewTable.tsx`

**Interfaces:**
- No new interfaces or prop changes to either component. `getCrewCollections(crew: CollectionMatchable, collections: Collection[]): Collection[]` (from `client/src/collections/getters.ts`) is the only getter still called per row in either file; `getCollectionCount` is no longer imported by either.

- [ ] **Step 1: Update `CrewTable.tsx`**

In `client/src/crew/CrewTable.tsx`, change the import line:

```tsx
import { getCollectionCount, getCrewCollections } from '../collections/getters';
```

to:

```tsx
import { getCrewCollections } from '../collections/getters';
```

Then change the row-rendering body — currently:

```tsx
        <TableBody>
          {pageItems.map((c, index) => (
            <TableRow key={c.id}>
              <TableCell>{page * pageSize + index + 1}</TableCell>
              <TableCell>
                <Thumbnail asset={c.portrait} />
              </TableCell>
              <TableCell>
                <StarRating rarity={c.rarity} maxRarity={c.max_rarity} />
              </TableCell>
              <TableCell>{c.name}</TableCell>
              <TableCell align="right">{c.level}</TableCell>
              <TableCell align="right">{getEquipmentSlotsRemaining(c)}</TableCell>
              <TableCell align="right">{getCollectionCount(c, collections)}</TableCell>
              {showCollectionsNames && (
                <TableCell>
                  {getCrewCollections(c, collections)
                    .map((col) => col.name)
                    .join(', ')}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
```

to:

```tsx
        <TableBody>
          {pageItems.map((c, index) => {
            const crewCollections = getCrewCollections(c, collections);
            return (
              <TableRow key={c.id}>
                <TableCell>{page * pageSize + index + 1}</TableCell>
                <TableCell>
                  <Thumbnail asset={c.portrait} />
                </TableCell>
                <TableCell>
                  <StarRating rarity={c.rarity} maxRarity={c.max_rarity} />
                </TableCell>
                <TableCell>{c.name}</TableCell>
                <TableCell align="right">{c.level}</TableCell>
                <TableCell align="right">{getEquipmentSlotsRemaining(c)}</TableCell>
                <TableCell align="right">{crewCollections.length}</TableCell>
                {showCollectionsNames && (
                  <TableCell>{crewCollections.map((col) => col.name).join(', ')}</TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
```

(Note the `.map((c, index) => {` arrow now uses an explicit `{ ... return (...); }` body instead of the implicit-return parens, to make room for the `const crewCollections = ...` line.)

- [ ] **Step 2: Update `MissingCrewTable.tsx`**

In `client/src/catalog/MissingCrewTable.tsx`, change the import line:

```tsx
import { getCollectionCount, getCrewCollections } from '../collections/getters';
```

to:

```tsx
import { getCrewCollections } from '../collections/getters';
```

Then change the row-rendering body — currently:

```tsx
        <TableBody>
          {pageItems.map((c, index) => (
            <TableRow key={c.archetype_id}>
              <TableCell>{page * pageSize + index + 1}</TableCell>
              <TableCell>
                <Thumbnail url={`${ASSET_BASE_URL}/${c.imageUrlPortrait}`} />
              </TableCell>
              <TableCell>{c.name}</TableCell>
              <TableCell align="right">{c.data_score.toFixed(2)}</TableCell>
              <TableCell align="right">{getCollectionCount(c, collections)}</TableCell>
              <TableCell>
                {getCrewCollections(c, collections)
                  .map((col) => col.name)
                  .join(', ')}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
```

to:

```tsx
        <TableBody>
          {pageItems.map((c, index) => {
            const crewCollections = getCrewCollections(c, collections);
            return (
              <TableRow key={c.archetype_id}>
                <TableCell>{page * pageSize + index + 1}</TableCell>
                <TableCell>
                  <Thumbnail url={`${ASSET_BASE_URL}/${c.imageUrlPortrait}`} />
                </TableCell>
                <TableCell>{c.name}</TableCell>
                <TableCell align="right">{c.data_score.toFixed(2)}</TableCell>
                <TableCell align="right">{crewCollections.length}</TableCell>
                <TableCell>{crewCollections.map((col) => col.name).join(', ')}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
```

- [ ] **Step 3: Build and lint**

Run: `npm run build -w client` — expect success, 0 errors.
Run: `npm run lint -w client` — expect 0 errors, only the 2 pre-existing warnings.

- [ ] **Step 4: Data-driven verification against real data**

Using a throwaway `client/src/collections/__verify.ts` script run via `npx tsx` (this project's established pattern for data-driven checks — delete the script before committing), or real-browser inspection against the seeded `example-data.json`:

1. Pick 5 real crew members that appear in a page using `CrewTable` with `showCollectionsNames={true}` (e.g. `/5-stars-crew`). For each, confirm the rendered "Collections"/"Total collections" cell number exactly equals the count of collection names listed in the adjacent "Collections names" cell (split on `, `).
2. Pick 5 real entries from a Missing 4 Stars table (Overview page, either section). Confirm the same agreement between the "Total collections" cell and the "Collections names" cell's comma-separated count.
3. This is a pure refactor — if a build was captured before this task's changes (e.g. via `git stash`), a byte-for-byte comparison of both cells' rendered text for the same 10 rows before/after is the strongest form of this check; otherwise, the cross-cell-agreement check in steps 1–2 is sufficient, since `crewCollections.length` and `crewCollections.map(...).join(', ')`'s comma count are structurally guaranteed to agree (same array, same `.length` definition as `getCollectionCount`'s old implementation).

Record the actual crew names and counts observed, not just "they matched."

- [ ] **Step 5: Commit**

```bash
git add client/src/crew/CrewTable.tsx client/src/catalog/MissingCrewTable.tsx
git commit -m "Compute a row's collection membership once instead of twice"
```

---

## Final integration check (after all 3 tasks)

- [ ] Run `npm run build -w client` and `npm run lint -w client` one more time on the fully merged branch — expect the same clean result as after each individual task (0 errors, 2 pre-existing warnings), confirming the three independent changes don't interact badly.
- [ ] Update `docs/PROJECT_STATE.md`: strike through (in the established "resolved, kept as a pointer" style used throughout that document) the three now-closed deferred-issues entries — `TableSearchBar` has no accessible name, the `ErrorBoundary`-keys-on-pathname entry, and the `CrewTable`/`MissingCrewTable` double-traversal entry — and add a short feature-history entry plus bump the "Last updated" line, matching every prior feature's documentation pattern.
