# App-wide Table Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every table in the app a blue header (matching the existing `AppBar` blue) and alternating white/light-grey row striping, via a new MUI theme — this app currently has no `ThemeProvider` at all.

**Architecture:** Task 1 introduces the theme itself (`theme.ts` + `main.tsx` wiring), which automatically covers 6 of the app's 7 `TableHead`-using files with zero per-file changes. Task 2 handles `CollectionsTable.tsx`, the one structurally different table (2 rows per record instead of 1), which needs its own per-collection striping logic instead of relying on the generic CSS rule.

**Tech Stack:** React 19, TypeScript strict mode, MUI.

## Global Constraints

- No change to any color, spacing, typography, or component default anywhere else in the app — `createTheme()` with no palette overrides reproduces MUI's exact built-in defaults; only the two additive `MuiTableHead`/`MuiTableBody` component overrides are new.
- **No `CssBaseline`** — this app has no CSS files at all today, so the browser's default `body { margin: 8px }` is currently in effect; adding `CssBaseline` would shift the whole page layout, which is out of scope for this purely table-styling change.
- Header color: `theme.palette.primary.main` background, `theme.palette.primary.contrastText` text, bold. Zebra stripe color: `theme.palette.action.hover`. Both are MUI palette tokens, not custom hex values.
- The `MuiTableBody`-scoped `nth-of-type(even)` rule must never apply to a `TableHead`'s own row — verified structurally safe (a `TableHead`'s row lives in a separate `<thead>` parent, outside `MuiTableBody`'s `<tbody>` scope).
- `CollectionsTable.tsx`'s per-collection stripe must be computed from the existing `pageItems.map((collection, index) => ...)` index, applied via `sx`, sharing one color across both of a collection's rows (summary + detail) — not per-raw-row.
- Build (`npm run build -w client`) and lint (`npm run lint -w client`) must stay clean: 0 errors, same 4 pre-existing/expected-class warnings as before this feature.
- **This entire plan (both tasks' exact code) was already dry-run by the controller against the real repo before being finalized** — build/lint confirmed clean, and real-browser screenshots of `/collections` and `/qps` confirmed a blue header with white bold text and alternating white/light-grey rows. **Correction, added after the final review of this feature:** the dry-run's visual eyeballing did not actually catch that the originally-planned code (Task 2's Step 2 diff, as literally written below) left the detail row's color a flat `action.selected` regardless of collection parity — only the summary row alternated, not "each collection's summary+detail row pair sharing one stripe color" as this line previously and inaccurately claimed. The final reviewer caught this with computed-style measurements; the user was asked and chose to make the detail row alternate too, closed in a final-review fix-wave commit. Left here as a record that a dry-run's visual screenshot check is not a substitute for verifying the *specific claimed property* (pairing, in this case), not just "it looks roughly right."
- Full spec: `docs/superpowers/specs/2026-08-12-table-theme-design.md`.

---

### Task 1: Add the theme and wire it into the app root

**Files:**
- Create: `client/src/theme.ts`
- Modify: `client/src/main.tsx`

**Interfaces:**
- Produces: `theme` (default export from `client/src/theme.ts`, an MUI `Theme` object) — consumed by Task 2 only implicitly (Task 2's `sx` values reference the same `action.hover`/`action.selected` palette tokens this theme's default palette already provides, no direct import needed).

- [ ] **Step 1: Create `client/src/theme.ts`**

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

- [ ] **Step 2: Wire the theme into `client/src/main.tsx`**

Replace:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

with:

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

- [ ] **Step 3: Build and lint**

Run: `npm run build -w client` — expect success, 0 errors.
Run: `npm run lint -w client` — expect 0 errors, same 4 pre-existing warnings as before this feature.

- [ ] **Step 4: Real-browser verification**

Start the dev server (`npm run dev`, root) with the real, live-refreshed `server/data/player-cache.json` seeded (or `example-data.json` copied to it — this task's verification is purely visual, so either dataset works, no specific values are asserted). Using the `playwright` library directly (already an installed root devDependency — write a throwaway script, e.g. `screenshot-theme.js` at the repo root, delete it after) or the MCP tools if available:

1. Navigate to any one of the 5 simple-structure list tables (e.g. `/qps` or `/4-4-stars-crew`) — **wait for the actual `<table>` element to appear** (`page.waitForSelector('table')`), not just `networkidle`, since this is a client-side SPA that fetches data after initial load. Screenshot it. Confirm: header row has a blue background with white, bold text; body rows visibly alternate white/light-grey starting from the first row.
2. Navigate to `/` (Overview). Confirm Base Skill Bonus and Proficiency Bonus show the blue header, and all 3 of its tables — including the identity table, which has no `TableHead` and so correctly never gets the blue banner — show the alternating-row striping, with **zero code changes to `OverviewPage.tsx` in this task** — this is the proof the theme-only approach actually covers files it never touched directly.
3. Navigate to `/collections`. Confirm the header is blue/white like the others. **Do not expect correct per-collection striping yet** — Task 2 handles that; it's fine (and expected) if this task's dry run shows CollectionsTable's rows striped by raw row position rather than by collection pair, since the generic `MuiTableBody` rule applies indiscriminately until Task 2's `sx` override is added.
4. Confirm the `AppBar`'s blue (top bar, "STT Tracker" title) is visually unchanged from before this task — screenshot comparison against memory/expectation, not a pixel diff tool.
5. Confirm no new console errors on any page visited.

Stop the dev server afterward (kill only the process this step started).

- [ ] **Step 5: Commit**

```bash
git add client/src/theme.ts client/src/main.tsx
git commit -m "Add app-wide table theme (blue header + zebra rows)"
```

---

### Task 2: Per-collection striping in `CollectionsTable.tsx`

**Files:**
- Modify: `client/src/collections/CollectionsTable.tsx`

**Interfaces:**
- Consumes: nothing new from Task 1 — this task's `sx={{ bgcolor: 'action.hover' | 'action.selected' | 'transparent' }}` values reference MUI palette token strings directly (MUI resolves `'action.hover'`/`'action.selected'` shorthand strings against the active theme automatically via `sx`'s built-in palette-path resolution — no explicit import of `theme.ts` needed in this file).

- [ ] **Step 1: Confirm the current state of `client/src/collections/CollectionsTable.tsx` matches this plan's assumptions**

Run:
```bash
grep -n "stripeColor\|bgcolor: stripeColor" client/src/collections/CollectionsTable.tsx
```
Expected: no output (this variable doesn't exist yet). If it prints anything, stop and re-read the actual file before proceeding.

- [ ] **Step 2: Replace the `pageItems.map` return block**

Replace:

```tsx
            return (
              <Fragment key={collection.id}>
                <TableRow>
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
                  <TableCell sx={{ bgcolor: 'action.hover' }} colSpan={6}>
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
```

with:

```tsx
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
```

Everything else in the file (imports, props, `usePagination` call, `TableHead`, `TablePaginationFooter`) is untouched.

- [ ] **Step 3: Build and lint**

Run: `npm run build -w client` — expect success, 0 errors.
Run: `npm run lint -w client` — expect 0 errors, same 4 pre-existing warnings as before this feature.

- [ ] **Step 4: Real-browser verification**

Start the dev server (real or example data, purely visual check). Navigate to `/collections`, wait for the `<table>` element, screenshot it (enough of the page to see at least 4 collections' worth of rows). Confirm:

1. Collection 1's summary row and its detail row (crew sublist or "No crew match.") are the same base color (transparent/white).
2. Collection 2's summary row and its detail row are the same base color as each other, and visibly different from collection 1's summary row (light grey, `action.hover`).
3. Collection 2's detail row is visibly a slightly different (stronger) shade than collection 2's own summary row — confirming the `action.selected` layering is distinguishable from a plain `action.hover` base, not just relying on adjacency.
4. This alternates correctly for at least 4 consecutive collections (1=white/white, 2=grey/darker, 3=white/white, 4=grey/darker).
5. No console errors.

Stop the dev server afterward.

- [ ] **Step 5: Commit**

```bash
git add client/src/collections/CollectionsTable.tsx
git commit -m "Stripe CollectionsTable rows per-collection, not per-row"
```
