# Stronger, Reusable Table Striping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Increase the app-wide table zebra-stripe contrast (currently too subtle — a 4% overlay that's hard to perceive, especially on `CollectionsTable`) to a clearly visible level, and replace the ad-hoc `!important`/theme-callback workaround in `CollectionsTable.tsx` with a small reusable helper so a future multi-row-per-record table doesn't have to re-derive the same CSS-specificity fix.

**Architecture:** Task 1 changes `theme.ts` — new exported color constants, a new `groupStripeBgcolor` helper, and the app-wide stripe rule now using the constant. This alone strengthens all 6 simple tables + Overview immediately. Task 2 updates `CollectionsTable.tsx` to consume the new helper/constants, replacing its previous asymmetric summary-row/detail-row handling with one shared value applied to both rows.

**Tech Stack:** React 19, TypeScript strict mode, MUI.

## Global Constraints

- New contrast values, exactly: `STRIPE_COLOR = 'rgba(0, 0, 0, 0.08)'` (was `action.hover`, 0.04), `ROW_EMPHASIS_COLOR = 'rgba(0, 0, 0, 0.16)'` (was `action.selected`, 0.08) — both user-confirmed via real side-by-side screenshot comparison during brainstorming.
- Both are plain literal `rgba()` strings, not MUI palette-shorthand paths — this is deliberate (per the user's explicit choice of "explicit custom constants" over "override MUI's palette.action values") and it's also what removes the need for the theme-callback form of `sx` that the previous round required.
- `groupStripeBgcolor(recordIndex)` must apply to **every** row of a multi-row record uniformly (not just the one row that structurally needs `!important`) — this is what simplifies `CollectionsTable.tsx` from asymmetric per-row handling to one shared value.
- No dark-mode support, no change to `MuiTableHead`'s styling, no change to any table's data/sorting/search/pagination behavior.
- Build (`npm run build -w client`) and lint (`npm run lint -w client`) must stay clean: 0 errors, same 4 pre-existing/expected-class warnings as before this feature.
- **This entire plan (both tasks' exact code) was already dry-run by the controller against the real repo before being finalized** — build/lint confirmed clean, and a real-browser check against the live dev server (via Vite HMR, no server restart needed) confirmed collection 1's rows both render `rgba(0, 0, 0, 0)` and collection 2's rows both render `rgba(0, 0, 0, 0.08)`, using the actual `groupStripeBgcolor` helper function, not just the target literal values tested in isolation during brainstorming.
- Full spec: `docs/superpowers/specs/2026-08-12-stronger-table-striping-design.md`.

---

### Task 1: Add the new constants, helper, and stronger app-wide stripe

**Files:**
- Modify: `client/src/theme.ts`

**Interfaces:**
- Produces: `STRIPE_COLOR: string`, `ROW_EMPHASIS_COLOR: string`, `groupStripeBgcolor(recordIndex: number): string` — all newly exported from `client/src/theme.ts`, consumed by Task 2.

- [ ] **Step 1: Confirm the current state of `client/src/theme.ts` matches this plan's assumptions**

Run:
```bash
grep -n "STRIPE_COLOR\|groupStripeBgcolor" client/src/theme.ts
```
Expected: no output (neither exists yet). If this prints anything, stop and re-read the actual file before proceeding.

- [ ] **Step 2: Replace the full contents of `client/src/theme.ts`**

```ts
import { createTheme } from '@mui/material/styles';

export const STRIPE_COLOR = 'rgba(0, 0, 0, 0.08)';
export const ROW_EMPHASIS_COLOR = 'rgba(0, 0, 0, 0.16)';

/**
 * For tables that render more than one <TableRow> per logical record —
 * breaking the MuiTableBody rule below's assumption that DOM position
 * lines up 1:1 with record index. Returns the `sx` `bgcolor` value to
 * apply to EVERY row belonging to one record, keyed by that record's own
 * index (not the individual row's DOM position). `!important` is always
 * included: harmless on a row whose DOM position wouldn't have conflicted
 * with the generic rule anyway, necessary on any row that would have
 * (e.g. a table's 2nd, 4th, ... row per record, which is always
 * DOM-even regardless of its record's actual parity). See
 * `collections/CollectionsTable.tsx` for a concrete two-row-per-record
 * example.
 */
export function groupStripeBgcolor(recordIndex: number): string {
  return `${recordIndex % 2 === 1 ? STRIPE_COLOR : 'transparent'} !important`;
}

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
        // Assumes one <TableRow> per record — DOM position and record position line up 1:1,
        // so striping by nth-of-type(even) is equivalent to striping by record index.
        // Tables with more than one <TableRow> per record break that assumption and must
        // opt out with `groupStripeBgcolor(recordIndex)` (above) applied to every row of
        // the record instead. See client/src/collections/CollectionsTable.tsx.
        root: () => ({
          '& .MuiTableRow-root:nth-of-type(even)': {
            backgroundColor: STRIPE_COLOR,
          },
        }),
      },
    },
  },
});

export default theme;
```

**Correction, added after this feature's final review:** the code block
above is the plan's original literal text and is kept as-written for
historical accuracy, but it has two real gaps the final review caught: no
code documented that `STRIPE_COLOR`/`ROW_EMPHASIS_COLOR` must stay
literal `rgba()` strings (not MUI palette-shorthand paths — appending
`!important` to a shorthand string breaks `sx`'s exact-string palette-path
lookup and silently drops the declaration), and `groupStripeBgcolor`'s
doc comment's "2nd, 4th, ... row per record, always DOM-even" claim is
only true when rows-per-record is *even* (a 3-rows-per-record
counter-example disproves it generally — the *code* was always correct,
only this justification was wrong). Both were fixed in a final-review fix
wave, commit `8d3ed77`. See the shipped `client/src/theme.ts` for the
corrected, authoritative comment text rather than this block.

- [ ] **Step 3: Build and lint**

Run: `npm run build -w client` — expect success, 0 errors.
Run: `npm run lint -w client` — expect 0 errors, same 4 pre-existing warnings as before this feature.

- [ ] **Step 4: Real-browser verification**

Start the dev server (`npm run dev`, root) with any seeded data (this task's verification is purely visual, no specific values asserted beyond contrast). Using the `playwright` library directly (or MCP tools if available):

1. Navigate to any simple-structure list table (e.g. `/qps`), wait for the `<table>` element. Confirm rows visibly alternate white/light-grey, clearly more visible than a very faint tint — read the computed `background-color` of an even-indexed row and confirm it's `rgba(0, 0, 0, 0.08)`.
2. Navigate to `/collections`. **Do not expect correct per-collection pairing yet** — Task 2 handles that; `CollectionsTable.tsx` is untouched by this task, so its striping will look exactly as it did before this task (which is fine and expected).
3. Confirm the blue header is unaffected.
4. Confirm no new console errors.

Stop the dev server afterward (kill only the process this step started; if a port is already in use, check ownership before touching anything — do not use a broad process-name kill like `pkill -f vite`, which can affect processes you don't own; prefer stopping only the exact PID your own `npm run dev` invocation printed).

- [ ] **Step 5: Commit**

```bash
git add client/src/theme.ts
git commit -m "Increase table stripe contrast, add reusable groupStripeBgcolor helper"
```

---

### Task 2: Adopt the helper in `CollectionsTable.tsx`

**Files:**
- Modify: `client/src/collections/CollectionsTable.tsx`

**Interfaces:**
- Consumes: `groupStripeBgcolor(recordIndex: number): string`, `ROW_EMPHASIS_COLOR: string` from Task 1 (`../theme`).

- [ ] **Step 1: Confirm the current state of `client/src/collections/CollectionsTable.tsx` matches this plan's assumptions**

Run:
```bash
grep -n "groupStripeBgcolor\|stripeColor" client/src/collections/CollectionsTable.tsx
```
Expected: one match, `const stripeColor = index % 2 === 1 ? 'action.hover' : 'transparent';` (the old variable name/logic). If `groupStripeBgcolor` already appears, or the old line is missing/different, stop and re-read the actual file before proceeding.

- [ ] **Step 2: Add the import**

Replace:

```tsx
import type { CrewMember } from '../types/crew';
import type { Collection } from '../types/collection';
import type { OwnedItem } from '../types/item';
import { getCuratedRewards } from './rewards';
```

with:

```tsx
import type { CrewMember } from '../types/crew';
import type { Collection } from '../types/collection';
import type { OwnedItem } from '../types/item';
import { groupStripeBgcolor, ROW_EMPHASIS_COLOR } from '../theme';
import { getCuratedRewards } from './rewards';
```

- [ ] **Step 3: Replace the per-collection block**

Replace:

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
                {/* Both this row and the summary row above alternate by collection index. This row is
                    always at an even DOM position (detail rows always follow their summary row), so
                    theme.ts's `nth-of-type(even)` rule (specificity (0,3,0)) would otherwise override a
                    plain `sx` background (specificity (0,1,0)) regardless of this collection's actual
                    parity. `!important` is required to make this row's own alternating color win.
                    Do not remove it — that would silently make every detail row the same shade again.
                    We use the theme-callback form of `sx` (not the `'action.hover'` shorthand string)
                    because appending `!important` to that shorthand breaks its palette-path lookup —
                    the callback resolves the token to its real `rgba(...)` value first. */}
                <TableRow
                  sx={{
                    bgcolor: (theme) =>
                      `${index % 2 === 1 ? theme.palette.action.hover : 'transparent'} !important`,
                  }}
                >
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

with:

```tsx
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

Both rows now use the same `stripeBgcolor` value, computed once via the shared helper — the previous asymmetric handling (summary row's own inline ternary with no `!important`; detail row's separate theme-callback expression) collapses into one line. The long explanatory comment is intentionally not carried over here — the CSS-specificity fact it explained now lives in `groupStripeBgcolor`'s own doc comment in `theme.ts` (Task 1), which is the single place future readers should look, rather than being re-explained at every call site.

- [ ] **Step 4: Build and lint**

Run: `npm run build -w client` — expect success, 0 errors.
Run: `npm run lint -w client` — expect 0 errors, same 4 pre-existing warnings as before this feature.

- [ ] **Step 5: Real-browser verification**

Start the dev server (or reuse an already-running one via Vite's hot-reload if one is available — check port 5173/3001 ownership first; do not assume a running server is yours to restart or kill).

1. Navigate to `/collections`, wait for the `<table>` element. Read computed `background-color` for at least the first 4 collections' summary AND detail rows (8 rows total). Confirm: each collection's two rows share one value; collections alternate between `rgba(0, 0, 0, 0)` and `rgba(0, 0, 0, 0.08)`; every detail row's cell additionally shows `rgba(0, 0, 0, 0.16)` (readable via the cell's own computed style, distinct from its row's background).
2. Visually confirm (screenshot) that collections now read as clearly distinct alternating blocks — this was the entire point of the feature; don't accept a report that only checks computed styles without also looking at a rendered screenshot.
3. Confirm no console errors.

Stop the dev server afterward if you started one yourself (same port-ownership caution as Task 1's Step 4).

- [ ] **Step 6: Commit**

```bash
git add client/src/collections/CollectionsTable.tsx
git commit -m "Adopt groupStripeBgcolor helper in CollectionsTable"
```
