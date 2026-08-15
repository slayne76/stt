# Overview page: split first table into 2, with in-header titles — Design

**Date:** 2026-08-15
**Status:** Approved

## Problem

`OverviewPage.tsx`'s first table is a single, headerless `TableBody` with 4
rows: Player ID, DBID, "5 Stars unique crew", "4 Stars unique crew". The
user wants it split into two separate tables — "Player Info" (the first 2
rows) and "Missing Crew recap" (the other 2 rows) — each with a blue
`TableHead`, matching the rest of the page's/app's tables. Additionally,
the two "unique crew" rows should show the owned-vs-total gap directly in
their label, e.g. `"4 Stars unique crew (-21)"`.

## Real-data verification

Confirmed live against the real `server/data/player-cache.json` +
`server/data/crew-catalog-cache.json`: 4★ owned 684 / total 705 → **-21**;
5★ owned 438 / total 1080 → **-642** — exactly the user's own worked
example, both numbers.

## Design

### 1. Table headers hold the table's *name*, not column labels

During brainstorming, the natural first idea (a generic "Field"/"Value"
column-header row) was explicitly rejected by the user in favor of a
different mechanic: **the blue header bar's single cell holds the table's
own title**, in the same `Typography variant="h5"` size already used for
this page's other table titles ("Base Skill Bonus", "Proficiency Bonus") —
replacing the separate `<Typography variant="h5">Table Name</Typography>`
heading that currently sits *above* those other tables. Each new table is:

```tsx
<TableContainer component={Paper}>
  <Table>
    <TableHead>
      <TableRow>
        <TableCell colSpan={2}>
          <Typography variant="h5" component="span">Player Info</Typography>
        </TableCell>
      </TableRow>
    </TableHead>
    <TableBody>
      {/* ...rows... */}
    </TableBody>
  </Table>
</TableContainer>
```

The blue background + white text is entirely automatic — the app's global
`MuiTableHead` `styleOverrides` (`client/src/theme.ts`) already colors
*any* `TableHead`'s cells, regardless of content; no new styling is
needed. `colSpan={2}` makes the single title cell span both of the body's
columns.

### 2. "Player Info" table

Body: the same 2 rows as today, unchanged — Player ID, DBID (`identity[field] ?? '—'`
in the value cell, `FIELD_LABELS[field]` in the label cell).

### 3. "Missing Crew recap" table

Body: the same 2 rows as today, same order (5★ first, then 4★), values
unchanged (`uniqueCrewCell(maxRarity)` → `"owned/total (pct%)"`, or the
existing `CircularProgress`/`"Unavailable"` states while
`catalogLoading`/`catalogError`). **New:** the label cell gets a `(±N)`
suffix, where `N = owned - total` (naturally negative — no explicit
minus-sign handling needed, JS renders a negative number's sign on its
own) — but **only once catalog data is actually available**, matching the
value cell's own loading/error gating. While `catalogLoading` or
`catalogError`, the label renders exactly as it does today, with no
suffix (a half-computed "(-21)" appearing next to a spinner would be
misleading).

### 4. Implementation

`OverviewPage.tsx`'s existing `uniqueCrewCell(maxRarity): string` helper
(computes `owned`/`total`/`pct` and formats the value-cell string) gets a
small shared extraction underneath it:

```ts
function getUniqueCrewStats(maxRarity: number): { owned: number; total: number } | null {
  if (!catalog) return null;
  const owned = getOwnedArchetypeIds(crewList, frozenArchetypeIds, catalogMaxRarityById, maxRarity).size;
  const total = getCatalogCount(catalog, maxRarity);
  return { owned, total };
}
```

`uniqueCrewCell` is refactored to call this (behavior-preserving — same
`owned`/`total`/`pct` computation, just no longer duplicated inline). A new
sibling function builds the label suffix:

```ts
function uniqueCrewLabel(baseLabel: string, maxRarity: number): string {
  const stats = getUniqueCrewStats(maxRarity);
  return stats ? `${baseLabel} (${stats.owned - stats.total})` : baseLabel;
}
```

The two "unique crew" rows' label cells call `uniqueCrewLabel('5 Stars unique crew', 5)`
/ `uniqueCrewLabel('4 Stars unique crew', 4)` instead of the current
literal `"5 Stars unique crew"` / `"4 Stars unique crew"` strings.

## Non-goals

- No change to the Player ID/DBID rows' content or the unique-crew rows'
  value-cell content (percentage string, loading spinner, error text) —
  only the table structure (split, headers) and the label-cell suffix.
- No new divider or spacing changes beyond what naturally falls out of
  having two `TableContainer` siblings inside the page's existing
  `<Stack spacing={2}>` (already provides consistent vertical spacing
  between the two new tables, same as every other spacing gap on this
  page).
- No change to the "Missing 4 Stars" tables, "Base Skill Bonus"/
  "Proficiency Bonus" tables, or anything else on the page.

## Verification plan

- A throwaway script against the real `server/data/player-cache.json` +
  `server/data/crew-catalog-cache.json` independently re-derives
  `uniqueCrewLabel`'s output for both rarities and confirms the exact
  strings match the "Real-data verification" section above.
- Real-browser check against the running dev server: `/` (Overview)
  renders two visually distinct blue-headed tables in place of the old
  single table ("Player Info" then "Missing Crew recap", titles inside
  the blue bars, `Typography variant="h5"` sized), the label suffixes
  read correctly, and the rest of the page (Missing 4 Stars tables, Base
  Skill Bonus, Proficiency Bonus) is unaffected.
