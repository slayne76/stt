# Crew Nav Group and Schematics Progress Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group the six crew-related drawer entries under a new "Crew" flyout (reordering the top-level drawer to Overview / Crew / Ships / Collections), and add a thin blue progress bar above the "owned/needed" schematics text on both Ships pages.

**Architecture:** Two small, independent changes, each its own task since a reviewer could accept one while rejecting the other. Task 1 is a pure data restructuring of `AppLayout.tsx`'s `NAV_ITEMS` array — zero new components, since `NavGroupItem` already generically supports this. Task 2 adds one small getter to `ships/getters.ts` and changes one table cell in `ships/ShipsTable.tsx` to render an MUI `LinearProgress` above the existing text.

**Tech Stack:** Same as the existing client workspace — React 19, TypeScript (strict), MUI 6, no new dependencies (`LinearProgress`, `Box`, `Typography` are already part of `@mui/material`, already used elsewhere in this codebase).

## Global Constraints

- **Final top-level drawer order:** Overview / Crew / Ships / Collections. "Overview" and "Collections" stay flat (single items, no reason to group). "Ships" is unchanged from its current shape.
- **"Crew" group contains exactly these 6 children, in this order:** 3/4 Stars crew (`/3-4-stars-crew`), 4/5 Stars crew (`/4-5-stars-crew`), 4/4 Stars crew (ready) (`/4-4-stars-crew-ready`), 4/4 Stars crew (`/4-4-stars-crew`), 4 Stars Duplicates (`/4-stars-duplicates`), 5 Stars Duplicates (`/5-stars-duplicates`) — same relative order as the original flat list, just nested. No label text, path, or page component changes anywhere in this plan — this is purely `NAV_ITEMS` restructuring.
- **No new components for the nav change.** `NavGroupItem` (`client/src/layout/NavGroupItem.tsx`) is reused completely unmodified — do not touch that file.
- **`getShipSchematicsProgress(ship, items)`** (`ships/getters.ts`): returns a number 0-100. `needed = ship.schematic_gain_cost_next_level`; if `needed <= 0` return `100` (already-maxed sentinel guard, unreachable in practice since both Ships pages only render already-filtered incomplete ships, but the function must not divide by a non-positive number); otherwise `Math.min(100, (getShipSchematicsOwned(ship, items) / needed) * 100)`.
- **Schematics cell layout:** a `Box` with `sx={{ display: 'inline-block', minWidth: 100 }}` wrapping an MUI `LinearProgress variant="determinate" color="primary"` (bar) directly above a `Typography variant="body2"` holding the existing `getShipSchematicsDisplay(s, items)` text. The `minWidth: 100` is required — without it the `inline-block` wrapper shrinks to the text's natural width and the bar (which fills 100% of its container by default) would render at an inconsistent width per row.
- **`color="primary"`** is sufficient for "blue" — this app uses MUI's stock default theme with no custom palette (verified: no `createTheme`/`ThemeProvider` anywhere in `client/src/`), so `primary` renders MUI's default blue. Do not add a custom theme or hex color for this.
- **No changes to `#`, `Ship`, or `Level` columns, `ShipsTableProps`, `ShipsPage.tsx`, either wrapper page, routes, or any crew/collections file.**
- TypeScript strict mode stays on; no new dependencies.
- No automated test framework — verification is TypeScript strict mode + ESLint + (for Task 2 only) a throwaway data-driven script against real `example-data.json` + manual dev-server checks.

---

### Task 1: Group crew-related nav entries under "Crew"

**Files:**
- Modify: `client/src/layout/AppLayout.tsx`

**Interfaces:**
- Consumes: `NavLink`, `NavGroup`, `isNavGroup`, `NavGroupItem` — all pre-existing in this file, unchanged.
- Produces: nothing new — this task only changes the `NAV_ITEMS` array's data, not any type or function signature.

- [ ] **Step 1: Replace `NAV_ITEMS` in `client/src/layout/AppLayout.tsx`**

Find this block (currently lines 22-38):

```ts
const NAV_ITEMS: (NavLink | NavGroup)[] = [
  { label: 'Overview', path: '/' },
  { label: '3/4 Stars crew', path: '/3-4-stars-crew' },
  { label: '4/5 Stars crew', path: '/4-5-stars-crew' },
  { label: '4/4 Stars crew (ready)', path: '/4-4-stars-crew-ready' },
  { label: '4/4 Stars crew', path: '/4-4-stars-crew' },
  { label: 'Collections', path: '/collections' },
  { label: '4 Stars Duplicates', path: '/4-stars-duplicates' },
  { label: '5 Stars Duplicates', path: '/5-stars-duplicates' },
  {
    label: 'Ships',
    children: [
      { label: '5 Stars Ships', path: '/5-stars-ships' },
      { label: '4 Stars Ships', path: '/4-stars-ships' },
    ],
  },
];
```

Replace it with:

```ts
const NAV_ITEMS: (NavLink | NavGroup)[] = [
  { label: 'Overview', path: '/' },
  {
    label: 'Crew',
    children: [
      { label: '3/4 Stars crew', path: '/3-4-stars-crew' },
      { label: '4/5 Stars crew', path: '/4-5-stars-crew' },
      { label: '4/4 Stars crew (ready)', path: '/4-4-stars-crew-ready' },
      { label: '4/4 Stars crew', path: '/4-4-stars-crew' },
      { label: '4 Stars Duplicates', path: '/4-stars-duplicates' },
      { label: '5 Stars Duplicates', path: '/5-stars-duplicates' },
    ],
  },
  {
    label: 'Ships',
    children: [
      { label: '5 Stars Ships', path: '/5-stars-ships' },
      { label: '4 Stars Ships', path: '/4-stars-ships' },
    ],
  },
  { label: 'Collections', path: '/collections' },
];
```

Nothing else in the file changes — the `NavLink`/`NavGroup` interfaces, `isNavGroup`, the `AppLayout` component body, and the `.map` rendering logic are all untouched, since they already handle an arbitrary mix of flat items and groups generically.

- [ ] **Step 2: Build and lint check**

Run: `npm run build -w client`
Expected: exits 0.

Run: `npm run lint -w client`
Expected: exits 0, no errors.

- [ ] **Step 3: Manual dev-server check**

With `server/.env` absent, start `npm run dev -w server` and `npm run dev -w client` in the background (use alternate ports if the defaults are occupied by an unrelated process, and fully revert any temporary port edits before committing; if you start any background process for this check, stop it before finishing the task — do not leave stray listeners on the ports you used).

Check if you have a way to actually drive a browser (e.g. a `run` skill, a browser/screenshot tool). If you do, open the client URL and confirm: the drawer shows exactly 4 top-level entries in order (Overview, Crew, Ships, Collections); hovering/focusing "Crew" opens a flyout panel to its right listing the 6 items in the exact order from Step 1; each of the 6 items navigates to its route and closes the panel on click; the pre-existing "Ships" and "Collections" behavior is unaffected. If you do NOT have a way to drive a real browser, say so explicitly in your report, do the best static verification you can (re-read the committed `NAV_ITEMS` array against Step 1's exact text), and report **DONE_WITH_CONCERNS** rather than claiming a visual behavior you didn't observe.

- [ ] **Step 4: Commit**

```bash
git add client/src/layout/AppLayout.tsx
git commit -m "Group crew nav entries under a Crew flyout, reorder top-level drawer"
```

---

### Task 2: Schematics progress bar

**Files:**
- Modify: `client/src/ships/getters.ts`
- Modify: `client/src/ships/ShipsTable.tsx`

**Interfaces:**
- Consumes: `Ship` (`types/ship.ts`), `OwnedItem` (`types/item.ts`), `getShipSchematicsOwned`/`getShipSchematicsDisplay` (`ships/getters.ts`) — all pre-existing, unchanged.
- Produces: `getShipSchematicsProgress(ship: Ship, items: OwnedItem[]): number` — new export from `ships/getters.ts`, consumed only by `ShipsTable.tsx` in this plan.

- [ ] **Step 1: Add `getShipSchematicsProgress` to `client/src/ships/getters.ts`**

Append this function to the end of the file (after `getShipSchematicsDisplay`, keep everything else exactly as-is):

```ts
export function getShipSchematicsProgress(ship: Ship, items: OwnedItem[]): number {
  const needed = ship.schematic_gain_cost_next_level;
  if (needed <= 0) return 100;
  return Math.min(100, (getShipSchematicsOwned(ship, items) / needed) * 100);
}
```

- [ ] **Step 2: Update `client/src/ships/ShipsTable.tsx`**

Replace the file's contents with:

```tsx
import { Box, LinearProgress, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import type { Ship } from '../types/ship';
import type { OwnedItem } from '../types/item';
import { getShipDisplayLevel, getShipSchematicsDisplay, getShipSchematicsProgress } from './getters';

export interface ShipsTableProps {
  ships: Ship[];
  items: OwnedItem[];
}

function ShipsTable({ ships, items }: ShipsTableProps) {
  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Ship</TableCell>
            <TableCell align="right">Level</TableCell>
            <TableCell align="right">Schematics</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {ships.map((s, index) => (
            <TableRow key={s.id}>
              <TableCell>{index + 1}</TableCell>
              <TableCell>{s.name}</TableCell>
              <TableCell align="right">{getShipDisplayLevel(s)}</TableCell>
              <TableCell align="right">
                <Box sx={{ display: 'inline-block', minWidth: 100 }}>
                  <LinearProgress variant="determinate" value={getShipSchematicsProgress(s, items)} color="primary" />
                  <Typography variant="body2">{getShipSchematicsDisplay(s, items)}</Typography>
                </Box>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default ShipsTable;
```

- [ ] **Step 3: Verify against real data**

`example-data.json` (gitignored, real personal game data) is at the repo root. Create a throwaway script at `client/src/ships/__verify.ts` (deleted in Step 5, never committed):

```ts
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { getShipList, getShipSchematicsProgress } from './getters';
import { getOwnedItems } from '../crew/getters';

const raw = JSON.parse(readFileSync('example-data.json', 'utf-8')) as Record<string, unknown>;
const ships = getShipList(raw);
const items = getOwnedItems(raw);

const reliant = ships.find((s) => s.symbol === 'fed_reliant_ship');
assert.ok(reliant, 'U.S.S. Reliant not found');
assert.equal(getShipSchematicsProgress(reliant, items), 97.5);

const exeter = ships.find((s) => s.symbol === 'fed_exeter_ship');
assert.ok(exeter, 'U.S.S. Exeter not found');
assert.equal(getShipSchematicsProgress(exeter, items), 0);

const bounty = ships.find((s) => s.symbol === 'kdf_birdofprey_bounty_ship');
assert.ok(bounty, 'H.M.S. Bounty not found');
assert.equal(getShipSchematicsProgress(bounty, items), 100);

console.log('MATCH: all schematics-progress assertions passed');
```

Run from the **repo root**: `npx tsx client/src/ships/__verify.ts`

Expected output: `MATCH: all schematics-progress assertions passed`, exit code 0. If any assertion throws, do not proceed — re-check `getShipSchematicsProgress` against this plan's Global Constraints before moving on.

- [ ] **Step 4: Build and lint check**

Run: `npm run build -w client`
Expected: exits 0.

Run: `npm run lint -w client`
Expected: exits 0, no errors.

- [ ] **Step 5: Delete the throwaway verification script**

```bash
rm client/src/ships/__verify.ts
```

- [ ] **Step 6: Manual dev-server visual check**

With `server/.env` absent, start `npm run dev -w server` and `npm run dev -w client` in the background (use alternate ports if the defaults are occupied, stop both when finished, revert any temporary port edits before committing).

Check if you have a way to actually drive a browser. If you do, open `/5-stars-ships` or `/4-stars-ships` — since no real `STT_SESSION_COOKIE` is configured, the page will show the `UPSTREAM_AUTH_FAILED` error state rather than real ship rows, so a full visual confirmation of the bar rendering against real data isn't possible in this environment. Instead: confirm the page still renders without a React error (check the browser console), and confirm `npm run build -w client` (Step 4) already proves the JSX compiles and type-checks correctly. Note in your report that full visual confirmation (bar renders blue, fills proportionally, text stays legible) requires the user's real session cookie and is a manual follow-up, same as prior ships-related features.

- [ ] **Step 7: Commit**

```bash
git add client/src/ships/getters.ts client/src/ships/ShipsTable.tsx
git commit -m "Add a blue progress bar to the Schematics column"
```

**Manual follow-up (requires your real credentials, not part of this task):** with a real `STT_SESSION_COOKIE` set, open both `/5-stars-ships` and `/4-stars-ships` and confirm the progress bars render blue, fill proportionally to each ship's real schematics progress, and stay legible against the text below them.
