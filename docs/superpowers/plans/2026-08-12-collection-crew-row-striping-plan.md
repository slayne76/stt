# Per-Member Crew-Row Striping in CollectionsTable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inside `CollectionsTable`, make individual crew-member rows within one collection's detail block alternate shade (zebra striping), remove the previous per-collection block-level alternation/tint entirely, and add a visible divider between one collection's rows and the next so block boundaries stay legible without color alternation.

**Architecture:** Pure presentational change across three already-existing files — `theme.ts` (constants), `CollectionsTable.tsx` (the two `TableRow`s per collection), `CollectionCrewList.tsx` (the per-member `Box` list inside the detail cell). No new components, no new data flow, no routing/state changes.

**Tech Stack:** React + TypeScript, MUI v6 (`sx` prop, `createTheme`), Vite. No automated test framework in this project (deliberate, established choice) — verification is real-browser observation against the dev server seeded from `example-data.json`, plus computed-style/DOM checks, not unit tests.

## Global Constraints

- `STRIPE_COLOR`, `BLOCK_BOUNDARY_COLOR`, and `FORCE_TRANSPARENT_BGCOLOR` (all in `theme.ts`) must stay literal `rgba(...)` / `'transparent !important'` strings — never MUI palette-shorthand paths like `'action.hover'`. Appending `!important` to a palette-shorthand string silently breaks `sx`'s exact-path resolution (confirmed in a prior feature's final review by tracing `@mui/system` source) — this is why `FORCE_TRANSPARENT_BGCOLOR` is a literal, not a theme-callback.
- No dark-mode support — this app has no theme toggle or dark palette today.
- No automated tests to write — this project has none, by repeated deliberate choice. Verification is real-browser observation, described in each task's own steps below.
- If a task needs a real running dev server for browser verification, seed it first: copy `example-data.json` (repo root) to `server/data/player-cache.json` inside the worktree (both gitignored, won't come from `git merge main`). If the worktree doesn't have `server/.env`, that's fine — `/api/player` serves whatever's in the cache file regardless of live session state.
- Dev-server process safety: if port 5173 (client) or 3001 (server) is already in use when starting a verification server, **do not kill whatever is using it** — start on an alternate port instead (Vite does this automatically if you let it pick; don't force `--port 5173`). If you ever do need to stop a server you started yourself, target its exact PID (confirmed via `ss -ltnp` or `ps`, pasted as raw output in your report) — never a name/pattern-based kill like `pkill -f vite`, which has killed the user's own unrelated dev server twice already on this project.

---

### Task 1: Remove block-level striping, add per-member striping and a collection-boundary divider

**Files:**
- Modify: `client/src/theme.ts`
- Modify: `client/src/collections/CollectionsTable.tsx`
- Modify: `client/src/collections/CollectionCrewList.tsx`

**Interfaces:**
- Consumes: nothing new from elsewhere in the codebase.
- Produces: `theme.ts` exports `BLOCK_BOUNDARY_COLOR: string` and `FORCE_TRANSPARENT_BGCOLOR: string` (new), no longer exports `ROW_EMPHASIS_COLOR` (removed — confirm nothing outside this task's own files references it before deleting; a repo-wide grep in Step 1 covers this). `STRIPE_COLOR: string` and `groupStripeBgcolor(recordIndex: number): string` are unchanged and still exported.

This is a single task because all three files must change together — `CollectionsTable.tsx` and `CollectionCrewList.tsx` both import symbols from `theme.ts` that only exist after this task's `theme.ts` edit, so no intermediate commit in between would build.

- [ ] **Step 1: Confirm no other file references the symbols being removed/changed**

Run: `grep -rn "ROW_EMPHASIS_COLOR\|groupStripeBgcolor\|STRIPE_COLOR" client/src --include="*.tsx" --include="*.ts"`

Expected output: matches only in `client/src/theme.ts` and `client/src/collections/CollectionsTable.tsx` (the two files this task modifies). If `ROW_EMPHASIS_COLOR` or `groupStripeBgcolor` show up in any other file, STOP and report — this plan's Step 1 assumption (safe to remove/repurpose) would be wrong and needs re-checking against the current codebase before continuing.

- [ ] **Step 2: Edit `client/src/theme.ts`**

Replace the entire block from the `STRIPE_COLOR`/`ROW_EMPHASIS_COLOR` comment through the end of the `groupStripeBgcolor` function (i.e. everything between the `import` line and the `const theme = createTheme({` line) with:

```ts
// Must stay a literal `rgba(...)` string — never an MUI palette-shorthand
// path like `'action.hover'`. `groupStripeBgcolor` (below) appends
// `!important` to whatever `STRIPE_COLOR` holds, and MUI's `sx` prop
// resolves a palette-shorthand string via an exact dotted-path lookup against
// `theme.palette`; appending anything to that string breaks the lookup, so
// `sx` can no longer resolve it to a real color and silently drops the
// declaration instead — no error, no warning, the row just stops getting a
// stripe. This is the exact trap an earlier version of this feature hit,
// which is why that version reached for a `theme` callback instead — this
// constant lets every call site skip that ceremony, but only as long as it
// stays literal.
export const STRIPE_COLOR = 'rgba(0, 0, 0, 0.08)';

// A third tier in the same flat-alpha family as `STRIPE_COLOR`, for a
// visible-but-not-heavy divider between grouped blocks of rows (e.g. one
// collection's rows vs. the next in `CollectionsTable.tsx`) — distinct from
// the much fainter default `MuiTableCell` border MUI already draws between
// every row.
export const BLOCK_BOUNDARY_COLOR = 'rgba(0, 0, 0, 0.24)';

/**
 * Forces a `TableRow`'s background to transparent regardless of its DOM
 * position, overriding the `MuiTableBody` rule below's generic
 * `nth-of-type(even)` stripe. Needed by any row in a multi-row-per-record
 * table that intentionally does not participate in row-level striping —
 * without this, the generic rule would still tint whichever row happens to
 * land on an even DOM position, independent of which record it actually
 * belongs to (see `groupStripeBgcolor`'s doc comment below for the full
 * DOM-position-vs-record-parity explanation this shares).
 */
export const FORCE_TRANSPARENT_BGCOLOR = 'transparent !important';

/**
 * For tables that render more than one <TableRow> per logical record —
 * breaking the MuiTableBody rule below's assumption that DOM position
 * lines up 1:1 with record index. Returns the `sx` `bgcolor` value to
 * apply to EVERY row belonging to one record, keyed by that record's own
 * index (not the individual row's DOM position).
 *
 * `!important` is always included, and must not be removed. Once a record
 * spans more than one row, DOM position no longer tracks record parity:
 * e.g. with 3 rows per record, record 0's 2nd row lands at DOM position 2
 * (even), but record 1's 2nd row lands at DOM position 5 (odd). Any row
 * that happens to land on an even DOM position — regardless of which
 * record it actually belongs to — gets matched by the generic
 * `nth-of-type(even)` rule below, whose selector has specificity (0,3,0)
 * (MUI's generated class selector plus the `:nth-of-type` pseudo-class,
 * nested under the root selector) and so beats a plain `sx` background
 * declaration's specificity of (0,1,0). `!important` is what makes this
 * row's own record-based color win instead; dropping it would silently let
 * some rows fall back to the generic DOM-position stripe instead of their
 * record's actual color, with no other visible symptom.
 *
 * Not currently called by any table in the app — `CollectionsTable.tsx`
 * (the motivating case this was built for) moved to a flat, non-
 * alternating per-collection background instead (see that file, and
 * `FORCE_TRANSPARENT_BGCOLOR` above) after user feedback that block-level
 * alternation competed visually with per-crew-member striping inside the
 * detail block. Kept as documented infrastructure for the next table that
 * genuinely needs per-record (not per-DOM-row) alternation.
 */
export function groupStripeBgcolor(recordIndex: number): string {
  return `${recordIndex % 2 === 1 ? STRIPE_COLOR : 'transparent'} !important`;
}
```

Then, inside the `MuiTableBody` `styleOverrides.root` comment (still in the same file, a few lines below), replace:

```ts
        // Assumes one <TableRow> per record — DOM position and record position line up 1:1,
        // so striping by nth-of-type(even) is equivalent to striping by record index.
        // Tables with more than one <TableRow> per record break that assumption and must
        // opt out with `groupStripeBgcolor(recordIndex)` (above) applied to every row of
        // the record instead. See client/src/collections/CollectionsTable.tsx.
```

with:

```ts
        // Assumes one <TableRow> per record — DOM position and record position line up 1:1,
        // so striping by nth-of-type(even) is equivalent to striping by record index.
        // Tables with more than one <TableRow> per record break that assumption and must
        // opt out with `groupStripeBgcolor(recordIndex)` or `FORCE_TRANSPARENT_BGCOLOR`
        // (above) applied to every row of the record instead.
```

Nothing else in `theme.ts` changes — the `createTheme({...})` call and its `MuiTableHead`/`MuiTableBody` component overrides stay as-is.

- [ ] **Step 3: Edit `client/src/collections/CollectionsTable.tsx`**

Change the import line:

```tsx
import { groupStripeBgcolor, ROW_EMPHASIS_COLOR } from '../theme';
```

to:

```tsx
import { BLOCK_BOUNDARY_COLOR, FORCE_TRANSPARENT_BGCOLOR } from '../theme';
```

Then replace this block (inside the `pageItems.map` callback):

```tsx
            const progressDisplay = isMaxedOut(collection)
              ? 'MAX'
              : `${collection.progress}/${collection.milestone.goal}`;
            const stripeBgcolor = groupStripeBgcolor(index);
            return (
              <Fragment key={collection.id}>
                <TableRow sx={{ bgcolor: stripeBgcolor }}>
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
                <TableRow sx={{ bgcolor: stripeBgcolor }}>
                  <TableCell sx={{ bgcolor: ROW_EMPHASIS_COLOR }} colSpan={6}>
```

with:

```tsx
            const progressDisplay = isMaxedOut(collection)
              ? 'MAX'
              : `${collection.progress}/${collection.milestone.goal}`;
            return (
              <Fragment key={collection.id}>
                <TableRow sx={{ bgcolor: FORCE_TRANSPARENT_BGCOLOR }}>
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
                <TableRow sx={{ bgcolor: FORCE_TRANSPARENT_BGCOLOR }}>
                  <TableCell
                    colSpan={6}
                    sx={{ borderBottom: `2px solid ${BLOCK_BOUNDARY_COLOR}` }}
                  >
```

The rest of the component (the ternary for `qualifyingCrew.length === 0`, the closing tags, `TablePaginationFooter`, etc.) is unchanged.

- [ ] **Step 4: Edit `client/src/collections/CollectionCrewList.tsx`**

Change the imports from:

```tsx
import { Box, Typography } from '@mui/material';
import type { CrewMember } from '../types/crew';
import type { OwnedItem } from '../types/item';
import { getCrewTier, getEquipmentSlotsRemaining } from '../crew/getters';
import StarRating from '../crew/StarRating';
import StatusChip from '../components/StatusChip';
```

to:

```tsx
import { Box, Typography } from '@mui/material';
import type { CrewMember } from '../types/crew';
import type { OwnedItem } from '../types/item';
import { getCrewTier, getEquipmentSlotsRemaining } from '../crew/getters';
import StarRating from '../crew/StarRating';
import StatusChip from '../components/StatusChip';
import { STRIPE_COLOR } from '../theme';
```

Then replace:

```tsx
      {crew.map((c) => {
        const tier = getCrewTier(c, items);
        const isReady = tier === 'ready';
        const isNeedsWork = tier === 'needsWork';
        return (
          <Box key={c.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
```

with:

```tsx
      {crew.map((c, i) => {
        const tier = getCrewTier(c, items);
        const isReady = tier === 'ready';
        const isNeedsWork = tier === 'needsWork';
        return (
          <Box
            key={c.id}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              py: 0.5,
              px: 2,
              mx: -2,
              bgcolor: i % 2 === 1 ? STRIPE_COLOR : 'transparent',
            }}
          >
```

The rest of the component (the `StarRating`/`Typography`/`StatusChip` children, closing tags) is unchanged.

- [ ] **Step 5: Build and lint**

Run: `npm run build -w client`
Expected: `tsc -b && vite build` completes with `✓ built in ...`, no TypeScript errors.

Run: `npm run lint -w client`
Expected: `0 errors` (pre-existing `react-refresh/only-export-components` warnings in unrelated files are fine and expected — they predate this change).

- [ ] **Step 6: Start a dev server for browser verification**

Seed data first if not already present in this worktree:
```bash
cp example-data.json server/data/player-cache.json
```

Check port 5173 isn't already in use by something else before starting (per the Global Constraints port-safety rule):
```bash
ss -ltnp | grep 5173 || echo "5173 free"
```
If it's free, run `npm run dev` from the repo root (or `npm run dev -w client` — check `package.json` for the actual script name) and let it bind 5173. If it's already in use, do not kill it — just let Vite pick the next free port and use that port in the steps below instead. Paste the raw `ss`/`ps` output (or the dev server's own startup log showing which port it bound) in your report as evidence, not just a summary sentence.

- [ ] **Step 7: Real-browser verification — collection block structure and boundary divider**

Using the `playwright`/`chrome-devtools` MCP tools (or the `playwright` library directly if those aren't loaded — see `CLAUDE.md`), navigate to `/collections` on the dev server from Step 6.

Run this in the page to sample the first 4 rows (2 collections' worth) and report the exact raw output (not a summary):

```js
() => {
  const rows = Array.from(document.querySelectorAll('table tbody tr'));
  const summary = rows.filter((_, i) => i % 2 === 0).slice(0, 4);
  const detail = rows.filter((_, i) => i % 2 === 1).slice(0, 4);
  return {
    summaryRowBgs: summary.map(tr => getComputedStyle(tr).backgroundColor),
    detailRowBgs: detail.map(tr => getComputedStyle(tr).backgroundColor),
    detailCellBorders: detail.map(tr => {
      const cs = getComputedStyle(tr.querySelector('td'));
      return cs.borderBottomColor + ' / ' + cs.borderBottomWidth;
    }),
  };
}
```

Expected: every entry in `summaryRowBgs` and `detailRowBgs` is `"rgba(0, 0, 0, 0)"` (regardless of which DOM position — even or odd — that row landed on; this is the check that `FORCE_TRANSPARENT_BGCOLOR` is actually defeating the generic app-wide stripe rule, not just that the code looks right). Every entry in `detailCellBorders` is `"rgba(0, 0, 0, 0.24) / 2px"`.

Take a full-viewport screenshot of `/collections` and visually confirm: summary rows are plain white, each collection's detail block shows alternating light/darker crew rows, and a visible divider line sits between one collection's detail block and the next collection's summary row.

- [ ] **Step 8: Real-browser verification — per-member striping restarts at each collection**

Run this in the page (same session as Step 7) and report the exact raw output:

```js
() => {
  const rows = Array.from(document.querySelectorAll('table tbody tr'));
  function sample(rowIdx) {
    const boxes = Array.from(rows[rowIdx].querySelectorAll('td > div > div'));
    return boxes.map((b, i) => ({ i, bg: getComputedStyle(b).backgroundColor, text: b.querySelector('p')?.textContent }));
  }
  return { collection0Detail: sample(1), collection1Detail: sample(3) };
}
```

Expected: within each collection's list, index 0 is `rgba(0, 0, 0, 0)` and odd indices are `rgba(0, 0, 0, 0.08)`, alternating correctly, and this restarts at index 0 independently for each collection (don't just check it looks right — confirm the actual first crew member in each of the two sampled collections reads `rgba(0, 0, 0, 0)`, proving the alternation isn't carrying a global counter across collection boundaries).

Also confirm at least one collection with zero qualifying crew (if one exists on this page — search or scroll to check `example-data.json`'s data) still renders its "No crew match." text with the boundary divider present on that row too, same as any other collection.

- [ ] **Step 9: Confirm no console errors**

Check the browser console log captured during Steps 7–8 (or read it directly if using the MCP tools' console-message call). Expected: no new errors introduced by this change (a pre-existing `favicon.ico` 404 is normal and unrelated).

- [ ] **Step 10: Stop the dev server if you started one**

If you started a dev server in Step 6 that wasn't already running before this task, stop it now — target its exact PID (from the `ss`/`ps` output you already captured), not a name-based kill. If you used an already-running server (started by someone else, e.g. the controller), leave it running.

- [ ] **Step 11: Commit**

```bash
git add client/src/theme.ts client/src/collections/CollectionsTable.tsx client/src/collections/CollectionCrewList.tsx
git commit -m "Restrict table striping in CollectionsTable to per-crew rows, add collection-boundary divider"
```
