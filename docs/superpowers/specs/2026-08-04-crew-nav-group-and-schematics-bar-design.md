# Crew Nav Group and Schematics Progress Bar — Design

## What this is

Two small, unrelated UI polish features requested together:

1. **Nav restructure:** the six existing crew-related drawer entries (four
   crew pages plus the two frozen-duplicate pages) move into a new "Crew"
   flyout group, using the exact same `NavGroupItem` mechanism the "Ships"
   group already established. Final top-level drawer order: **Overview /
   Crew / Ships / Collections**.
2. **Schematics progress bar:** the Ships pages' "Schematics" column gets a
   thin blue progress bar showing `owned / schematic_gain_cost_next_level`
   as a percentage, stacked above the existing `"owned/needed"` text.

## Nav restructure

`client/src/layout/AppLayout.tsx`'s `NAV_ITEMS` changes from:

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
  { label: 'Ships', children: [
    { label: '5 Stars Ships', path: '/5-stars-ships' },
    { label: '4 Stars Ships', path: '/4-stars-ships' },
  ] },
];
```

to:

```ts
const NAV_ITEMS: (NavLink | NavGroup)[] = [
  { label: 'Overview', path: '/' },
  { label: 'Crew', children: [
    { label: '3/4 Stars crew', path: '/3-4-stars-crew' },
    { label: '4/5 Stars crew', path: '/4-5-stars-crew' },
    { label: '4/4 Stars crew (ready)', path: '/4-4-stars-crew-ready' },
    { label: '4/4 Stars crew', path: '/4-4-stars-crew' },
    { label: '4 Stars Duplicates', path: '/4-stars-duplicates' },
    { label: '5 Stars Duplicates', path: '/5-stars-duplicates' },
  ] },
  { label: 'Ships', children: [
    { label: '5 Stars Ships', path: '/5-stars-ships' },
    { label: '4 Stars Ships', path: '/4-stars-ships' },
  ] },
  { label: 'Collections', path: '/collections' },
];
```

**Decisions, confirmed with the user:**
- The two frozen-duplicate pages ("4 Stars Duplicates," "5 Stars
  Duplicates") move into "Crew" — they're crew data (frozen-archetype
  duplicates), the same category as the four pages literally named
  "...crew."
- "Overview" stays a flat top-level entry (it's player identity, not crew
  data) and moves to the front of the list — it was already first, so this
  is really "stays first," not a move.
- "Collections" stays flat — one page, no reason to group it, and grouping
  a single-child menu would be pure overhead.
- Within "Crew," item order is unchanged from the original flat list (same
  relative order, just now nested).

**Zero new components.** `NavGroupItem` (`layout/NavGroupItem.tsx`) is
already generic — built with exactly this kind of reuse in mind, and
already handles the hover/focus/keyboard flyout mechanics, the portal
positioning, and the `isNavGroup` discriminated-union dispatch in
`AppLayout.tsx`. This change is a pure data restructuring of `NAV_ITEMS`:
no route, page component, or label text changes; no new files.

## Schematics progress bar

New getter in `client/src/ships/getters.ts`:

```ts
export function getShipSchematicsProgress(ship: Ship, items: OwnedItem[]): number {
  const needed = ship.schematic_gain_cost_next_level;
  if (needed <= 0) return 100;
  return Math.min(100, (getShipSchematicsOwned(ship, items) / needed) * 100);
}
```

The `needed <= 0` guard handles the already-maxed sentinel (`-1`)
defensively — unreachable today since both Ships pages only ever render
`filterIncompleteShipsByRarity`'s output (real ships always have a
positive `schematic_gain_cost_next_level` once filtered), same category as
the already-documented `getShipSchematicsDisplay` `"0/-1"` gap in
`docs/PROJECT_STATE.md`. `Math.min(100, …)` clamps against a live,
changing data source (unlike the frozen `example-data.json` sample used
during development, a real session could see `owned` briefly exceed
`needed` between an in-game purchase and the next level-up tick) —
cheap insurance for a value that will be rendered as a percentage.

`client/src/ships/ShipsTable.tsx`'s Schematics cell changes from a single
text node to a small stacked block — MUI `LinearProgress
variant="determinate" color="primary"` (this app uses MUI's stock theme
with no custom palette, so `color="primary"` renders MUI's default blue,
matching the request without any theme changes) directly above the
existing `getShipSchematicsDisplay(s, items)` text, both inside the same
table cell:

```tsx
<TableCell align="right">
  <Box sx={{ display: 'inline-block', minWidth: 100 }}>
    <LinearProgress variant="determinate" value={getShipSchematicsProgress(s, items)} color="primary" />
    <Typography variant="body2">{getShipSchematicsDisplay(s, items)}</Typography>
  </Box>
</TableCell>
```

`minWidth: 100` keeps the bar a consistent, readable width regardless of
row content — without it, an `inline-block` wrapper would shrink to fit
just the text's natural width, and MUI's `LinearProgress` fills 100% of
its container by default, so an unconstrained wrapper would produce
inconsistent bar widths per row.

**No other columns or pages change.** The `#`, `Ship`, and `Level` columns
are untouched; the `ShipsTableProps` interface (`{ ships: Ship[]; items:
OwnedItem[] }`) is unchanged, since `items` was already threaded through
for `getShipSchematicsDisplay`.

## Testing / verification

Same as every prior feature — no automated test framework. The nav
restructure is pure data (no new logic to verify against real data, just
a visual/structural check via manual dev-server browsing). The progress
bar's percentage math is simple enough to verify with a throwaway
`client/src/ships/__verify.ts` script asserting `getShipSchematicsProgress`
against a few real ships from `example-data.json` (e.g. U.S.S. Reliant:
1755/1800 → ~97.5%), deleted before committing, plus a manual dev-server
visual check that the bar renders, fills proportionally, and is blue.
