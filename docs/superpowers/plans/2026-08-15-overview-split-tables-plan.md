# Overview Page Split Tables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `OverviewPage.tsx`'s first (headerless) table into two separate, blue-headed tables — "Player Info" and "Missing Crew recap" — and add an owned-vs-total `(±N)` suffix to the two unique-crew row labels.

**Architecture:** Single-file, single-task change — `OverviewPage.tsx` only. A small pure-data helper extraction (`getUniqueCrewStats`) plus a new `uniqueCrewLabel` function, and a JSX split of one `TableContainer` into two.

**Tech Stack:** React 19, TypeScript strict mode, MUI, `tsx` (root devDependency, used for throwaway verification scripts — this project has no automated test framework by deliberate choice).

## Global Constraints

- Table headers hold the table's own *name* (not per-column labels) — one `<TableCell colSpan={2}>` per `TableHead`, `Typography variant="h5"` inside it (matching the exact size already used for "Base Skill Bonus"/"Proficiency Bonus" headings on this same page). Blue background + white text is automatic via the existing global `MuiTableHead` theme override (`client/src/theme.ts`) — no new styling code.
- "Player Info": Player ID, DBID rows, unchanged content, gated by `!loading && !error && identity` (unchanged, independent of catalog state).
- "Missing Crew recap": 5★ row then 4★ row (same order as today), value cells unchanged (`uniqueCrewCell` string, or the existing `CircularProgress`/`"Unavailable"` states while `catalogLoading`/`catalogError`). Label cells get a new `(±N)` suffix, `N = owned - total`, **only when catalog data is loaded** (no suffix during `catalogLoading`/`catalogError` — label renders exactly as today in those states).
- **Real expected values, computed from `server/data/player-cache.json` + `server/data/crew-catalog-cache.json` as of 2026-08-15:**
  - 5★: owned 438 / total 1080 → `uniqueCrewCell(5)` = `"438/1080 (40.56%)"`, `uniqueCrewLabel('5 Stars unique crew', 5)` = `"5 Stars unique crew (-642)"`
  - 4★: owned 684 / total 705 → `uniqueCrewCell(4)` = `"684/705 (97.03%)"`, `uniqueCrewLabel('4 Stars unique crew', 4)` = `"4 Stars unique crew (-21)"`
  - If the live data has changed since this plan was written, re-derive independently (see the verification step) rather than expecting a byte-match.
- Build (`npm run build -w client`) and lint (`npm run lint -w client`) must stay clean: 0 errors, same pre-existing warning count as before this feature.
- Full spec: `docs/superpowers/specs/2026-08-15-overview-split-tables-design.md`.

---

### Task 1: Split `OverviewPage.tsx`'s first table into two, add unique-crew label suffix

**Files:**
- Modify: `client/src/pages/OverviewPage.tsx`

**Interfaces:** None — this is a single self-contained page component, no other file consumes anything from it.

- [ ] **Step 1: Refactor `uniqueCrewCell`, add `getUniqueCrewStats`/`uniqueCrewLabel`**

Replace:

```tsx
  function uniqueCrewCell(maxRarity: number): string {
    if (!catalog) return '—';
    const owned = getOwnedArchetypeIds(crewList, frozenArchetypeIds, catalogMaxRarityById, maxRarity).size;
    const total = getCatalogCount(catalog, maxRarity);
    const pct = total > 0 ? Math.ceil((owned / total) * 10000 - 1e-9) / 100 : 0;
    return `${owned}/${total} (${pct.toFixed(2)}%)`;
  }
```

with:

```tsx
  function getUniqueCrewStats(maxRarity: number): { owned: number; total: number } | null {
    if (!catalog) return null;
    const owned = getOwnedArchetypeIds(crewList, frozenArchetypeIds, catalogMaxRarityById, maxRarity).size;
    const total = getCatalogCount(catalog, maxRarity);
    return { owned, total };
  }

  function uniqueCrewCell(maxRarity: number): string {
    const stats = getUniqueCrewStats(maxRarity);
    if (!stats) return '—';
    const pct = stats.total > 0 ? Math.ceil((stats.owned / stats.total) * 10000 - 1e-9) / 100 : 0;
    return `${stats.owned}/${stats.total} (${pct.toFixed(2)}%)`;
  }

  function uniqueCrewLabel(baseLabel: string, maxRarity: number): string {
    const stats = getUniqueCrewStats(maxRarity);
    return stats ? `${baseLabel} (${stats.owned - stats.total})` : baseLabel;
  }
```

- [ ] **Step 2: Split the single table into two, with in-header titles**

Replace:

```tsx
      {!loading && !error && identity && (
        <TableContainer component={Paper}>
          <Table>
            <TableBody>
              {(Object.keys(FIELD_LABELS) as (keyof PlayerIdentity)[]).map((field) => (
                <TableRow key={field}>
                  <TableCell component="th" scope="row">
                    {FIELD_LABELS[field]}
                  </TableCell>
                  <TableCell align="right">{identity[field] ?? '—'}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell component="th" scope="row">
                  5 Stars unique crew
                </TableCell>
                <TableCell align="right">
                  {catalogLoading ? (
                    <CircularProgress size={16} />
                  ) : catalogError ? (
                    'Unavailable'
                  ) : (
                    uniqueCrewCell(5)
                  )}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell component="th" scope="row">
                  4 Stars unique crew
                </TableCell>
                <TableCell align="right">
                  {catalogLoading ? (
                    <CircularProgress size={16} />
                  ) : catalogError ? (
                    'Unavailable'
                  ) : (
                    uniqueCrewCell(4)
                  )}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      )}
```

with:

```tsx
      {!loading && !error && identity && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell colSpan={2}>
                  <Typography variant="h5" component="span">
                    Player Info
                  </Typography>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(Object.keys(FIELD_LABELS) as (keyof PlayerIdentity)[]).map((field) => (
                <TableRow key={field}>
                  <TableCell component="th" scope="row">
                    {FIELD_LABELS[field]}
                  </TableCell>
                  <TableCell align="right">{identity[field] ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {!loading && !error && identity && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell colSpan={2}>
                  <Typography variant="h5" component="span">
                    Missing Crew recap
                  </Typography>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                <TableCell component="th" scope="row">
                  {uniqueCrewLabel('5 Stars unique crew', 5)}
                </TableCell>
                <TableCell align="right">
                  {catalogLoading ? (
                    <CircularProgress size={16} />
                  ) : catalogError ? (
                    'Unavailable'
                  ) : (
                    uniqueCrewCell(5)
                  )}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell component="th" scope="row">
                  {uniqueCrewLabel('4 Stars unique crew', 4)}
                </TableCell>
                <TableCell align="right">
                  {catalogLoading ? (
                    <CircularProgress size={16} />
                  ) : catalogError ? (
                    'Unavailable'
                  ) : (
                    uniqueCrewCell(4)
                  )}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      )}
```

No import changes needed — `TableHead` is already imported (used by the "Base Skill Bonus"/"Proficiency Bonus" tables further down this same file), and `Typography` is already imported.

- [ ] **Step 3: Build and lint**

Run: `npm run build -w client` — expect success, 0 errors.
Run: `npm run lint -w client` — expect 0 errors, same pre-existing warning count as before this feature.

- [ ] **Step 4: Data-driven verification against the real, live-refreshed data files**

Write a throwaway script at the repo root, `verify-overview-labels.ts` (not committed — delete it after capturing output), using `tsx` (already a root devDependency):

```ts
import { readFileSync } from 'node:fs';
import { getCrewList, getFrozenCrewArchetypeIds, getOwnedArchetypeIds } from './client/src/crew/getters';
import { getArchetypeMaxRarityMap, getCatalogCount } from './client/src/catalog/getters';

const playerData = JSON.parse(readFileSync('server/data/player-cache.json', 'utf-8'));
const catalog = JSON.parse(readFileSync('server/data/crew-catalog-cache.json', 'utf-8'));

const crewList = getCrewList(playerData);
const frozenArchetypeIds = getFrozenCrewArchetypeIds(playerData);
const catalogMaxRarityById = getArchetypeMaxRarityMap(catalog);

for (const maxRarity of [5, 4]) {
  const owned = getOwnedArchetypeIds(crewList, frozenArchetypeIds, catalogMaxRarityById, maxRarity).size;
  const total = getCatalogCount(catalog, maxRarity);
  console.log(`${maxRarity}★: owned=${owned} total=${total} diff=${owned - total}`);
}
```

Run: `npx tsx verify-overview-labels.ts` (from the repo root — both the import paths and the `server/data/*.json` read paths are relative to this file's location at the repo root; note `crew-catalog-cache.json`, not `player-cache.json`, backs the catalog side).

**Expected output, computed from the real files as of 2026-08-15 — confirm your run matches exactly:**

```
5★: owned=438 total=1080 diff=-642
4★: owned=684 total=705 diff=-21
```

If your run's data files have since changed (the user may have refreshed with newer live data), the important thing is that the diff values genuinely match `getUniqueCrewStats`' computation against the real files, not that they byte-match the numbers above. State explicitly in your report whether your run matched exactly or differed (and why, if you can tell).

Delete the throwaway script once you've captured its output in your report.

- [ ] **Step 5: Real-browser verification**

The real, live-refreshed `server/data/player-cache.json` and `server/data/crew-catalog-cache.json` should already be seeded in this worktree (per this project's established worktree-setup convention). If either is missing, copy both from the main checkout before proceeding.

Start the dev server: `npm run dev` (root). Using the `playwright` library directly (or the `mcp__playwright__*`/`mcp__chrome-devtools__*` MCP tools if available — see `CLAUDE.md`), navigate to `/` (Overview) and:

1. Confirm there are now two separate tables where the single Player Info/unique-crew table used to be, each with a blue header bar.
2. Read the actual rendered text inside each header bar (per-cell read, not inferred) and confirm the first reads exactly `"Player Info"` and the second reads exactly `"Missing Crew recap"`.
3. Confirm the first table's body has exactly 2 rows (Player ID, DBID) with their existing values, and the second table's body has exactly 2 rows, in order: 5★ row then 4★ row.
4. Read the second table's row labels (per-cell reads) and confirm they read exactly `"5 Stars unique crew (-642)"` and `"4 Stars unique crew (-21)"` (or, if live data has changed, whatever the real current owned/total diff computes to — cross-check against a manual read of `server/data/player-cache.json`/`server/data/crew-catalog-cache.json` in that case, and state which case applied in your report).
5. Confirm the value cells (right column) of the second table are unaffected — still read as `"438/1080 (40.56%)"` / `"684/705 (97.03%)"` (or whatever the live data computes to, matching Step 4's script output).
6. Confirm the rest of the page — "Missing 4 Stars (In Portal)"/"Missing 4 Stars (Not in Portal)" tables, "Base Skill Bonus", "Proficiency Bonus" — still renders correctly below, unaffected.

Stop the dev server afterward (kill only the process this step started — confirm ownership via the working-directory/port before killing anything if a port conflict comes up; if the port is already occupied by the user's own separately-running dev server, do not kill it — run on an alternate port instead, same as established practice on this project).

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/OverviewPage.tsx
git commit -m "Split Overview page's first table into Player Info / Missing Crew recap"
```
